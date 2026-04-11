"""Baseline spectral-gating denoiser."""

from __future__ import annotations

from typing import Any

import numpy as np
import noisereduce as nr
from scipy.signal import butter, iirnotch, sosfiltfilt

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
    cleaned_spec = compute_stft(cleaned, sr)["magnitude_db"]
    return {
        "cleaned_audio": cleaned.astype(np.float32),
        "cleaned_spectrogram": cleaned_spec.astype(np.float32),
        "bin_snr_db": bin_snr,
    }


def denoise_recording(y: np.ndarray, sr: int, aggressiveness: float = 1.5) -> np.ndarray:
    return spectral_gate_denoise(y, sr, aggressiveness=aggressiveness)["cleaned_audio"]
