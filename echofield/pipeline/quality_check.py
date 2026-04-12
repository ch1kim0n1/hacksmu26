"""Quality assessment for denoised audio."""

from __future__ import annotations

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
    if y.size == 0:
        return 0.0
    frame = max(int(sr * 0.025), 8)
    hop = max(int(sr * 0.01), 4)
    n_frames = 1 + max((len(y) - frame) // hop, 0)
    if n_frames <= 1:
        return 0.0
    windows = np.stack([y[i * hop : i * hop + frame] for i in range(n_frames)], axis=0)
    rms = np.sqrt(np.mean(np.square(windows), axis=1))
    if np.allclose(rms, 0.0):
        return 0.0
    median = float(np.median(rms))
    signal = rms[rms > median]
    noise = rms[rms <= median]
    if signal.size == 0 or noise.size == 0:
        return 0.0
    noise_power = float(np.mean(noise ** 2))
    signal_power = float(np.mean(signal ** 2))
    if noise_power <= 1e-12:
        return 60.0
    return float(10.0 * np.log10(signal_power / noise_power))


def _dominant_frequency(y: np.ndarray, sr: int) -> float:
    stft = compute_stft(y, sr)
    magnitude = np.abs(stft["stft"])
    if magnitude.size == 0:
        return 0.0
    mean_spectrum = np.mean(magnitude, axis=1)
    index = int(np.argmax(mean_spectrum))
    return float(stft["frequencies"][index])


def compute_spectral_distortion(y_original: np.ndarray, y_cleaned: np.ndarray, sr: int) -> float:
    min_len = min(len(y_original), len(y_cleaned))
    if min_len == 0:
        return 0.0
    original = compute_stft(y_original[:min_len], sr)["magnitude_db"]
    cleaned = compute_stft(y_cleaned[:min_len], sr)["magnitude_db"]
    diff = original - cleaned
    dynamic_range = max(float(np.max(original) - np.min(original)), 1e-6)
    return float(np.sqrt(np.mean(diff ** 2)) / dynamic_range)


def _compute_pesq(y_original: np.ndarray, y_cleaned: np.ndarray, sr: int) -> float | None:
    """Compute PESQ score between original and cleaned signals.

    Resamples to 16 kHz and uses wideband mode.
    Returns None if pesq is unavailable or computation fails.
    """
    if not _PESQ_AVAILABLE:
        return None
    try:
        import librosa
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


def assess_quality(y_original: np.ndarray, y_cleaned: np.ndarray, sr: int) -> dict[str, float | bool | str | None]:
    snr_before = round(compute_snr(y_original, sr), 2)
    snr_after = round(compute_snr(y_cleaned, sr), 2)
    snr_improvement = round(snr_after - snr_before, 2)
    spectral_distortion = round(compute_spectral_distortion(y_original, y_cleaned, sr), 4)
    energy_preservation = round(compute_energy_preservation(y_original, y_cleaned, sr), 4)
    peak_before = round(_dominant_frequency(y_original, sr), 1)
    peak_after = round(_dominant_frequency(y_cleaned, sr), 1)
    pesq_score = _compute_pesq(y_original, y_cleaned, sr)

    # Scoring: 50 pts SNR improvement, 25 pts low distortion, 15 pts energy
    # preservation, 10 pts PESQ bonus.  Energy preservation is weighted
    # lightly because noisy field recordings legitimately lose 90%+ of
    # in-band energy when the noise is removed.
    # Tuned thresholds for realistic field recording scenarios:
    # - SNR: full marks at 8 dB improvement (was 15 dB - too strict for field recordings)
    # - Distortion: tolerates up to 0.25 distortion for full marks (field recordings inherently noisy)
    # - Preservation: full marks at 15% energy (was 30% - elephant vocalizations are sparse)
    snr_component = np.clip(max(snr_improvement, 0.0) / 8.0, 0.0, 1.0) * 50.0
    distortion_component = max(1.0 - spectral_distortion / 0.25, 0.0) * 25.0
    preservation_component = min(energy_preservation / 0.15, 1.0) * 15.0  # full marks at >= 15%
    pesq_component = (min(max((pesq_score or 0.0) - 1.0, 0.0) / 3.5, 1.0)) * 10.0
    quality_score = round(float(np.clip(
        snr_component + distortion_component + preservation_component + pesq_component,
        0.0, 100.0,
    )), 1)

    if quality_score >= 85:
        rating = "excellent"
    elif quality_score >= 70:
        rating = "good"
    elif quality_score >= 55:
        rating = "fair"
    else:
        rating = "poor"

    return {
        "snr_before_db": snr_before,
        "snr_after_db": snr_after,
        "snr_improvement_db": snr_improvement,
        "pesq": pesq_score,
        "peak_frequency_before_hz": peak_before,
        "peak_frequency_after_hz": peak_after,
        "spectral_distortion": spectral_distortion,
        "energy_preservation": energy_preservation,
        "quality_score": quality_score,
        "quality_rating": rating,
        "flagged_for_review": snr_improvement < 2.0 or spectral_distortion > 0.3,
    }
