"""Quality assessment for denoised audio."""

from __future__ import annotations

import librosa
import numpy as np
from scipy.signal import butter, sosfiltfilt

try:
    from pesq import pesq as _pesq_fn
    _PESQ_AVAILABLE = True
except ImportError:
    _PESQ_AVAILABLE = False

from echofield.pipeline.spectrogram import compute_stft


def _bandpass_energy(y: np.ndarray, sr: int, low_hz: float, high_hz: float) -> float:
    if y.size == 0:
        return 0.0
    nyquist = sr / 2.0
    low = max(low_hz / nyquist, 1e-6)
    high = min(high_hz / nyquist, 1.0 - 1e-6)
    if low >= high:
        return float(np.sum(y ** 2))
    sos = butter(5, [low, high], btype="band", output="sos")
    filtered = sosfiltfilt(sos, y)
    return float(np.sum(filtered ** 2))


def compute_snr(y: np.ndarray, sr: int) -> float:
    """Estimate SNR using minimum statistics noise floor estimation.

    Divides the signal into overlapping frames, computes RMS per frame,
    then estimates the noise floor as the minimum RMS over sliding windows.
    This works even when signal is present in most frames.
    """
    if y.size == 0:
        return 0.0
    frame_length = max(int(sr * 0.025), 8)  # 25ms frames
    hop_length = max(int(sr * 0.01), 4)     # 10ms hop

    # Compute frame-wise RMS
    n_frames = 1 + max((len(y) - frame_length) // hop_length, 0)
    if n_frames <= 1:
        return 0.0
    rms = np.array([
        np.sqrt(np.mean(y[i*hop_length : i*hop_length+frame_length]**2))
        for i in range(n_frames)
    ], dtype=np.float64)

    if np.allclose(rms, 0.0):
        return 0.0

    # Minimum statistics: estimate noise floor from sliding window minimums
    # Window size = ~0.5 seconds of frames
    window_frames = max(int(0.5 * sr / hop_length), 3)

    # Compute running minimum over windows
    noise_floor_estimates = []
    for i in range(0, len(rms) - window_frames + 1, max(window_frames // 2, 1)):
        window = rms[i:i + window_frames]
        # Use the 10th percentile within each window (more robust than strict minimum)
        noise_floor_estimates.append(float(np.percentile(window, 10)))

    if not noise_floor_estimates:
        return 0.0

    # The noise floor is the median of the per-window minimums
    noise_rms = float(np.median(noise_floor_estimates))

    if noise_rms <= 1e-12:
        return 60.0

    # Signal level: use the 90th percentile of RMS (robust to outliers)
    signal_rms = float(np.percentile(rms, 90))

    if signal_rms <= noise_rms:
        return 0.0

    return float(10.0 * np.log10(signal_rms**2 / noise_rms**2))


def _dominant_frequency(y: np.ndarray, sr: int) -> float:
    stft = compute_stft(y, sr)
    magnitude = np.abs(stft["stft"])
    if magnitude.size == 0:
        return 0.0
    mean_spectrum = np.mean(magnitude, axis=1)
    index = int(np.argmax(mean_spectrum))
    return float(stft["frequencies"][index])


def compute_spectral_distortion(y_original: np.ndarray, y_cleaned: np.ndarray, sr: int) -> float:
    """Compute mel-weighted spectral distortion between original and cleaned audio."""
    min_len = min(len(y_original), len(y_cleaned))
    if min_len == 0:
        return 0.0

    # Use mel spectrogram for perceptual weighting
    n_fft = 2048
    hop_length = 512
    n_mels = 128

    orig_mel = librosa.feature.melspectrogram(
        y=y_original[:min_len], sr=sr, n_fft=n_fft, hop_length=hop_length, n_mels=n_mels
    )
    clean_mel = librosa.feature.melspectrogram(
        y=y_cleaned[:min_len], sr=sr, n_fft=n_fft, hop_length=hop_length, n_mels=n_mels
    )

    # Convert to dB
    orig_db = librosa.power_to_db(orig_mel, ref=np.max)
    clean_db = librosa.power_to_db(clean_mel, ref=np.max)

    diff = orig_db - clean_db
    dynamic_range = max(float(np.max(orig_db) - np.min(orig_db)), 1e-6)

    return float(np.sqrt(np.mean(diff ** 2)) / dynamic_range)


def _compute_pesq(y_original: np.ndarray, y_cleaned: np.ndarray, sr: int) -> float | None:
    """Compute PESQ score between original and cleaned signals.

    Resamples to 16 kHz and uses wideband mode.
    Returns None if pesq is unavailable or computation fails.
    """
    if not _PESQ_AVAILABLE:
        return None
    try:
        target_sr = 16000
        # Cap at 10s: PESQ is a speech metric designed for short segments;
        # running it on 100+ second recordings hangs indefinitely.
        max_samples_orig = int(sr * 10)
        ref_src = y_original[:max_samples_orig].astype(np.float64)
        deg_src = y_cleaned[:max_samples_orig].astype(np.float64)
        ref = librosa.resample(ref_src, orig_sr=sr, target_sr=target_sr)
        deg = librosa.resample(deg_src, orig_sr=sr, target_sr=target_sr)
        min_len = min(len(ref), len(deg))
        if min_len < target_sr * 0.1:
            return None
        score = _pesq_fn(target_sr, ref[:min_len].astype(np.float32), deg[:min_len].astype(np.float32), "wb")
        return round(float(score), 3)
    except Exception:
        return None


def compute_energy_preservation(
    y_original: np.ndarray,
    y_cleaned: np.ndarray,
    sr: int,
    low_hz: float = 8.0,
    high_hz: float = 1200.0,
) -> float:
    original = _bandpass_energy(y_original, sr, low_hz, high_hz)
    if original <= 1e-12:
        return 1.0
    cleaned = _bandpass_energy(y_cleaned, sr, low_hz, high_hz)
    return float(np.clip(cleaned / original, 0.0, 1.0))


def _compute_harmonic_preservation(y_original: np.ndarray, y_cleaned: np.ndarray, sr: int) -> float:
    """Measure how well harmonics are preserved after denoising.

    More appropriate than PESQ for animal vocalizations.
    Returns a score from 0 (harmonics destroyed) to 1 (perfectly preserved).
    """
    try:
        n_fft = 4096
        hop_length = 512

        # Get harmonic components via HPSS
        orig_harmonic = librosa.effects.hpss(y_original[:min(len(y_original), len(y_cleaned))])[0]
        clean_harmonic = librosa.effects.hpss(y_cleaned[:min(len(y_original), len(y_cleaned))])[0]

        # Compare harmonic energy in the elephant vocalization band (8-1200 Hz)
        nyquist = sr / 2.0
        low = max(8.0 / nyquist, 1e-6)
        high = min(1200.0 / nyquist, 1.0 - 1e-6)
        if low >= high:
            return 1.0
        sos = butter(5, [low, high], btype="band", output="sos")

        orig_bp = sosfiltfilt(sos, orig_harmonic)
        clean_bp = sosfiltfilt(sos, clean_harmonic)

        orig_energy = float(np.sum(orig_bp ** 2))
        if orig_energy <= 1e-12:
            return 1.0

        clean_energy = float(np.sum(clean_bp ** 2))

        # Correlation between harmonic spectral envelopes
        orig_spec = np.abs(librosa.stft(orig_bp, n_fft=n_fft))
        clean_spec = np.abs(librosa.stft(clean_bp, n_fft=n_fft))

        min_frames = min(orig_spec.shape[1], clean_spec.shape[1])
        if min_frames == 0:
            return float(np.clip(clean_energy / orig_energy, 0, 1))

        orig_env = np.mean(orig_spec[:, :min_frames], axis=1)
        clean_env = np.mean(clean_spec[:, :min_frames], axis=1)

        # Normalized cross-correlation
        if np.linalg.norm(orig_env) < 1e-12:
            return 1.0
        correlation = float(np.dot(orig_env, clean_env) / (np.linalg.norm(orig_env) * np.linalg.norm(clean_env) + 1e-12))

        # Combine energy preservation and spectral shape preservation
        energy_ratio = float(np.clip(clean_energy / orig_energy, 0, 1))
        score = 0.4 * energy_ratio + 0.6 * max(correlation, 0)

        return float(np.clip(score, 0, 1))
    except Exception:
        return 0.5  # Unknown quality


def assess_quality(
    y_original: np.ndarray,
    y_cleaned: np.ndarray,
    sr: int,
    *,
    mode: str = "standard",
) -> dict[str, float | bool | str | None]:
    snr_before = round(compute_snr(y_original, sr), 2)
    snr_after = round(compute_snr(y_cleaned, sr), 2)
    snr_improvement = round(snr_after - snr_before, 2)
    spectral_distortion = round(compute_spectral_distortion(y_original, y_cleaned, sr), 4)
    energy_preservation = round(compute_energy_preservation(y_original, y_cleaned, sr), 4)
    harmonic_preservation = round(_compute_harmonic_preservation(y_original, y_cleaned, sr), 4)
    peak_before = round(_dominant_frequency(y_original, sr), 1)
    peak_after = round(_dominant_frequency(y_cleaned, sr), 1)

    # Keep PESQ as optional but don't weight it heavily
    pesq_score = _compute_pesq(y_original, y_cleaned, sr)

    if mode == "call_isolation":
        # For call isolation: prioritize absolute SNR and harmonic preservation
        snr_component = np.clip(max(snr_after, 0.0) / 25.0, 0.0, 1.0) * 35.0
        distortion_component = max(1.0 - spectral_distortion / 0.4, 0.0) * 20.0
        preservation_component = min(energy_preservation / 0.1, 1.0) * 15.0
        harmonic_component = harmonic_preservation * 30.0
    else:
        # Standard mode: prioritize improvement + harmonic preservation
        snr_component = np.clip(max(snr_improvement, 0.0) / 10.0, 0.0, 1.0) * 30.0
        distortion_component = max(1.0 - spectral_distortion / 0.3, 0.0) * 20.0
        preservation_component = min(energy_preservation / 0.2, 1.0) * 15.0
        harmonic_component = harmonic_preservation * 35.0

    quality_score = round(float(np.clip(
        snr_component + distortion_component + preservation_component + harmonic_component,
        0.0, 100.0,
    )), 1)

    # Rating thresholds
    if quality_score >= 80:
        rating = "excellent"
    elif quality_score >= 60:
        rating = "good"
    elif quality_score >= 40:
        rating = "fair"
    else:
        rating = "poor"

    return {
        "snr_before_db": snr_before,
        "snr_after_db": snr_after,
        "snr_improvement_db": snr_improvement,
        "pesq": pesq_score,
        "harmonic_preservation": harmonic_preservation,
        "peak_frequency_before_hz": peak_before,
        "peak_frequency_after_hz": peak_after,
        "spectral_distortion": spectral_distortion,
        "energy_preservation": energy_preservation,
        "quality_score": quality_score,
        "quality_rating": rating,
        "quality_mode": mode,
        "flagged_for_review": (
            (snr_after < 6.0 or spectral_distortion > 0.4 or harmonic_preservation < 0.3)
            if mode == "call_isolation"
            else (snr_improvement < 1.0 or spectral_distortion > 0.35 or harmonic_preservation < 0.3)
        ),
    }
