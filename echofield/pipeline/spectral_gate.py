"""Baseline spectral-gating denoiser."""

from __future__ import annotations

from typing import Any

import librosa
import numpy as np
import noisereduce as nr
from scipy.ndimage import median_filter
from scipy.signal import butter, iirnotch, sosfiltfilt

from echofield.pipeline.quality_check import compute_snr
from echofield.pipeline.spectrogram import compute_stft


_NOISE_ADAPTIVE_PROFILES: dict[str, dict[str, Any]] = {
    "airplane": {"aggressiveness_mult": 1.3, "low_hz": 15.0, "high_hz": 800.0, "multi_pass": True, "notch_freqs": None},
    "car": {"aggressiveness_mult": 1.1, "low_hz": 12.0, "high_hz": 1000.0, "multi_pass": False, "notch_freqs": None},
    "generator": {"aggressiveness_mult": 1.0, "low_hz": 8.0, "high_hz": 1200.0, "multi_pass": False, "notch_freqs": [50.0, 100.0, 150.0, 200.0]},
    "wind": {"aggressiveness_mult": 0.8, "low_hz": 8.0, "high_hz": 600.0, "multi_pass": False, "notch_freqs": None},
}


def get_noise_adaptive_params(noise_type: str, base_aggressiveness: float = 1.5) -> dict[str, Any]:
    """Return denoising parameters adapted to the detected noise type."""
    profile = _NOISE_ADAPTIVE_PROFILES.get(noise_type)
    if profile is None:
        return {
            "aggressiveness": base_aggressiveness,
            "low_hz": 8.0,
            "high_hz": 1200.0,
            "multi_pass": base_aggressiveness > 2.0,
            "notch_freqs": None,
        }
    return {
        "aggressiveness": base_aggressiveness * profile["aggressiveness_mult"],
        "low_hz": profile["low_hz"],
        "high_hz": profile["high_hz"],
        "multi_pass": profile["multi_pass"],
        "notch_freqs": profile["notch_freqs"],
    }


def apply_notch_filter(
    y: np.ndarray,
    sr: int,
    freqs: list[float],
    quality_factor: float = 30.0,
) -> np.ndarray:
    """Apply narrow band-stop (notch) filters at specified frequencies."""
    if y.size == 0 or not freqs:
        return y.astype(np.float32)
    result = y.astype(np.float64)
    nyquist = sr / 2.0
    for freq in freqs:
        if freq <= 0 or freq >= nyquist:
            continue
        b, a = iirnotch(freq, quality_factor, sr)
        result = sosfiltfilt(
            np.array([[b[0], b[1], b[2], a[0], a[1], a[2]]]),
            result,
        )
    return result.astype(np.float32)


def estimate_noise_profile(y: np.ndarray, sr: int, noise_duration_s: float = 0.5) -> np.ndarray:
    if y.size == 0:
        return y.astype(np.float32)
    n_samples = max(1, min(int(noise_duration_s * sr), len(y)))
    return y[:n_samples].astype(np.float32)


def compute_bin_snr(y: np.ndarray, sr: int, noise_clip: np.ndarray) -> np.ndarray:
    if y.size == 0:
        return np.array([], dtype=np.float32)
    signal_spec = np.abs(compute_stft(y, sr)["stft"])
    noise_spec = np.abs(compute_stft(noise_clip, sr)["stft"])
    noise_floor = np.maximum(np.mean(noise_spec, axis=1, keepdims=True), 1e-8)
    snr = 20.0 * np.log10(np.maximum(signal_spec, 1e-8) / noise_floor)
    return snr.astype(np.float32)


def apply_spectral_gate(
    y: np.ndarray,
    sr: int,
    *,
    noise_clip: np.ndarray | None = None,
    prop_decrease: float = 1.0,
) -> np.ndarray:
    if y.size == 0:
        return y.astype(np.float32)
    kwargs = {
        "y": y.astype(np.float32),
        "sr": sr,
        "prop_decrease": float(np.clip(prop_decrease, 0.0, 1.0)),
    }
    if noise_clip is not None and noise_clip.size:
        kwargs["y_noise"] = noise_clip.astype(np.float32)
    else:
        kwargs["stationary"] = True
    cleaned = nr.reduce_noise(**kwargs)
    return np.asarray(cleaned, dtype=np.float32)


def _build_harmonic_mask(
    S_mag: np.ndarray,
    f0_frames: np.ndarray,
    sr: int,
    n_fft: int,
    *,
    tolerance: float = 0.05,
    max_hz: float = 1200.0,
) -> np.ndarray:
    if S_mag.size == 0:
        return np.zeros_like(S_mag, dtype=bool)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    mask = np.zeros_like(S_mag, dtype=bool)
    frame_count = min(S_mag.shape[1], len(f0_frames))
    for frame_index in range(frame_count):
        f0 = float(f0_frames[frame_index])
        if not np.isfinite(f0) or f0 <= 0:
            continue
        harmonic = 1
        while harmonic * f0 <= max_hz:
            target = harmonic * f0
            band = max(target * tolerance, 1.0)
            mask[:, frame_index] |= np.abs(freqs - target) <= band
            harmonic += 1
    return mask


def _apply_harmonic_protection(
    original: np.ndarray,
    cleaned: np.ndarray,
    sr: int,
    *,
    n_fft: int = 2048,
    hop_length: int = 512,
    gating_floor: float = 0.6,
) -> np.ndarray:
    if original.size == 0 or cleaned.size == 0:
        return cleaned.astype(np.float32)
    min_len = min(len(original), len(cleaned))
    original = original[:min_len].astype(np.float32)
    cleaned = cleaned[:min_len].astype(np.float32)
    try:
        f0 = librosa.yin(original, fmin=8, fmax=200, sr=sr, frame_length=max(n_fft, int(sr / 8) + 2), hop_length=hop_length)
        orig_stft = librosa.stft(original, n_fft=n_fft, hop_length=hop_length)
        clean_stft = librosa.stft(cleaned, n_fft=n_fft, hop_length=hop_length)
        orig_mag = np.abs(orig_stft)
        clean_mag = np.abs(clean_stft)
        mask = _build_harmonic_mask(clean_mag, f0, sr, n_fft)
        phase = np.exp(1j * np.angle(clean_stft))
        protected_mag = np.where(mask, np.maximum(clean_mag, orig_mag * gating_floor), clean_mag)
        protected = librosa.istft(protected_mag * phase, hop_length=hop_length, length=min_len)
        return protected.astype(np.float32)
    except Exception:
        return cleaned.astype(np.float32)


def _remove_musical_noise(S_mag: np.ndarray, threshold_percentile: float = 90) -> np.ndarray:
    """Smooth transient high-flux STFT magnitude bursts."""
    if S_mag.size == 0:
        return S_mag
    smoothed = median_filter(S_mag, size=(3, 3))
    if S_mag.shape[1] < 3:
        return smoothed.astype(np.float32)
    flux = np.mean(np.diff(S_mag, axis=1) ** 2, axis=0)
    threshold = np.percentile(flux, threshold_percentile)
    burst_frames = np.pad(flux >= threshold, (1, 0), constant_values=False)
    result = S_mag.copy()
    result[:, burst_frames] = 0.7 * smoothed[:, burst_frames] + 0.3 * result[:, burst_frames]
    return result.astype(np.float32)


def _post_process_musical_noise(y: np.ndarray, sr: int) -> np.ndarray:
    if y.size == 0:
        return y.astype(np.float32)
    try:
        n_fft = 1024
        hop_length = 256
        stft = librosa.stft(y.astype(np.float32), n_fft=n_fft, hop_length=hop_length)
        mag = np.abs(stft)
        phase = np.exp(1j * np.angle(stft))
        cleaned_mag = _remove_musical_noise(mag)
        result = librosa.istft(cleaned_mag * phase, hop_length=hop_length, length=len(y))
        return result.astype(np.float32)
    except Exception:
        return y.astype(np.float32)


def _apply_cqt_gate(
    y: np.ndarray,
    sr: int,
    *,
    prop_decrease: float,
    fmin: float = 8.0,
    bins_per_octave: int = 24,
) -> np.ndarray:
    if y.size == 0:
        return y.astype(np.float32)
    try:
        n_bins = min(168, int(bins_per_octave * np.log2((sr / 2.0) / fmin)))
        cqt = librosa.cqt(y.astype(np.float32), sr=sr, fmin=fmin, n_bins=n_bins, bins_per_octave=bins_per_octave)
        mag = np.abs(cqt)
        phase = np.exp(1j * np.angle(cqt))
        noise_frames = max(1, min(int(0.5 * sr / 512), mag.shape[1]))
        noise_floor = np.median(mag[:, :noise_frames], axis=1, keepdims=True)
        threshold = noise_floor * (1.0 + prop_decrease)
        attenuation = np.clip(1.0 - prop_decrease * 0.6, 0.25, 1.0)
        gated_mag = np.where(mag >= threshold, mag, mag * attenuation)
        result = librosa.icqt(gated_mag * phase, sr=sr, fmin=fmin, bins_per_octave=bins_per_octave, length=len(y))
        return result.astype(np.float32)
    except Exception:
        return y.astype(np.float32)


def apply_bandpass_filter(
    y: np.ndarray,
    sr: int,
    *,
    low_hz: float = 8.0,
    high_hz: float = 1200.0,
) -> np.ndarray:
    if y.size == 0 or sr <= 0:
        return y.astype(np.float32)
    nyquist = sr / 2.0
    low = max(low_hz / nyquist, 1e-6)
    high = min(high_hz / nyquist, 1.0 - 1e-6)
    if low >= high:
        return y.astype(np.float32)
    sos = butter(5, [low, high], btype="band", output="sos")
    return sosfiltfilt(sos, y).astype(np.float32)


def spectral_gate_denoise(
    y: np.ndarray,
    sr: int,
    *,
    aggressiveness: float = 1.5,
    noise_type: str | None = None,
    preserve_harmonics: bool = False,
    post_process: bool = False,
    spectrogram_type: str = "stft",
) -> dict[str, np.ndarray]:
    if y.size == 0:
        empty = y.astype(np.float32)
        return {
            "cleaned_audio": empty,
            "cleaned_spectrogram": np.zeros((0, 0), dtype=np.float32),
            "bin_snr_db": np.zeros((0, 0), dtype=np.float32),
        }

    params = get_noise_adaptive_params(noise_type, aggressiveness) if noise_type else {
        "aggressiveness": aggressiveness,
        "low_hz": 8.0,
        "high_hz": 1200.0,
        "multi_pass": aggressiveness > 2.0,
        "notch_freqs": None,
    }
    effective_aggressiveness = params["aggressiveness"]

    noise_clip = estimate_noise_profile(y, sr)
    bin_snr = compute_bin_snr(y, sr, noise_clip)

    if params["notch_freqs"]:
        y = apply_notch_filter(y, sr, params["notch_freqs"])

    cleaned = apply_spectral_gate(
        y,
        sr,
        noise_clip=noise_clip,
        prop_decrease=min(max(effective_aggressiveness / 2.0, 0.1), 1.0),
    )
    if params["multi_pass"]:
        cleaned = apply_spectral_gate(
            cleaned,
            sr,
            prop_decrease=min((effective_aggressiveness - 1.0) / 3.0, 1.0),
        )
    cleaned = apply_bandpass_filter(cleaned, sr, low_hz=params["low_hz"], high_hz=params["high_hz"])
    if spectrogram_type.lower() == "cqt":
        cleaned = _apply_cqt_gate(
            cleaned,
            sr,
            prop_decrease=min(max(effective_aggressiveness / 2.0, 0.1), 1.0),
        )
    if preserve_harmonics:
        cleaned = _apply_harmonic_protection(y, cleaned, sr)
    if post_process:
        cleaned = _post_process_musical_noise(cleaned, sr)
    if spectrogram_type.lower() == "cqt":
        from echofield.pipeline.spectrogram import compute_cqt

        cleaned_spec = compute_cqt(cleaned, sr)["magnitude_db"]
    else:
        cleaned_spec = compute_stft(cleaned, sr)["magnitude_db"]
    return {
        "cleaned_audio": cleaned.astype(np.float32),
        "cleaned_spectrogram": cleaned_spec.astype(np.float32),
        "bin_snr_db": bin_snr,
    }


def adaptive_gate_denoise(
    y: np.ndarray,
    sr: int,
    *,
    chunk_s: float = 10.0,
    base_aggressiveness: float = 1.5,
    crossfade_ms: float = 100.0,
    noise_type: str | None = None,
    preserve_harmonics: bool = False,
    post_process: bool = False,
) -> dict[str, Any]:
    if y.size == 0:
        return {"cleaned_audio": y.astype(np.float32), "chunk_aggressiveness": []}
    chunk_samples = max(int(chunk_s * sr), 1)
    fade_samples = min(max(int(crossfade_ms / 1000.0 * sr), 1), chunk_samples // 2)
    output = np.zeros_like(y, dtype=np.float32)
    weights = np.zeros_like(y, dtype=np.float32)
    chunk_aggressiveness: list[dict[str, float]] = []
    for start in range(0, len(y), chunk_samples):
        end = min(start + chunk_samples, len(y))
        chunk = y[start:end]
        snr = compute_snr(chunk, sr)
        if snr >= 20:
            aggressiveness = max(base_aggressiveness * 0.65, 0.5)
        elif snr >= 10:
            aggressiveness = base_aggressiveness
        elif snr >= 3:
            aggressiveness = base_aggressiveness * 1.25
        else:
            aggressiveness = base_aggressiveness * 1.5
        cleaned = spectral_gate_denoise(
            chunk,
            sr,
            aggressiveness=aggressiveness,
            noise_type=noise_type,
            preserve_harmonics=preserve_harmonics,
            post_process=post_process,
        )["cleaned_audio"]
        weight = np.ones(len(cleaned), dtype=np.float32)
        local_fade = min(fade_samples, max(len(cleaned) // 2, 1))
        if local_fade > 1 and start > 0:
            weight[:local_fade] = np.linspace(0.0, 1.0, local_fade, dtype=np.float32)
        if local_fade > 1 and end < len(y):
            weight[-local_fade:] = np.linspace(1.0, 0.0, local_fade, dtype=np.float32)
        output[start : start + len(cleaned)] += cleaned * weight
        weights[start : start + len(cleaned)] += weight
        chunk_aggressiveness.append({
            "start_s": round(start / sr, 3),
            "end_s": round(end / sr, 3),
            "snr_db": round(float(snr), 2),
            "aggressiveness": round(float(aggressiveness), 3),
        })
    weights = np.maximum(weights, 1e-6)
    return {
        "cleaned_audio": (output / weights).astype(np.float32),
        "chunk_aggressiveness": chunk_aggressiveness,
    }


def denoise_recording(y: np.ndarray, sr: int, aggressiveness: float = 1.5) -> np.ndarray:
    return spectral_gate_denoise(y, sr, aggressiveness=aggressiveness)["cleaned_audio"]
