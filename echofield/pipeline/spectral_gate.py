"""Baseline spectral-gating denoiser."""

from __future__ import annotations

import numpy as np
import noisereduce as nr
from scipy.signal import butter, sosfiltfilt

from echofield.pipeline.spectrogram import compute_stft


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
) -> dict[str, np.ndarray]:
    if y.size == 0:
        empty = y.astype(np.float32)
        return {
            "cleaned_audio": empty,
            "cleaned_spectrogram": np.zeros((0, 0), dtype=np.float32),
            "bin_snr_db": np.zeros((0, 0), dtype=np.float32),
        }

    noise_clip = estimate_noise_profile(y, sr)
    bin_snr = compute_bin_snr(y, sr, noise_clip)
    cleaned = apply_spectral_gate(
        y,
        sr,
        noise_clip=noise_clip,
        prop_decrease=min(max(aggressiveness / 2.0, 0.1), 1.0),
    )
    if aggressiveness > 2.0:
        cleaned = apply_spectral_gate(
            cleaned,
            sr,
            prop_decrease=min((aggressiveness - 1.0) / 3.0, 1.0),
        )
    cleaned = apply_bandpass_filter(cleaned, sr)
    cleaned_spec = compute_stft(cleaned, sr)["magnitude_db"]
    return {
        "cleaned_audio": cleaned.astype(np.float32),
        "cleaned_spectrogram": cleaned_spec.astype(np.float32),
        "bin_snr_db": bin_snr,
    }


def denoise_recording(y: np.ndarray, sr: int, aggressiveness: float = 1.5) -> np.ndarray:
    return spectral_gate_denoise(y, sr, aggressiveness=aggressiveness)["cleaned_audio"]
