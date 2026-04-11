"""
Spectral-gating noise removal module for the EchoField processing pipeline.

Uses noisereduce for spectral gating and scipy for bandpass filtering,
tuned for elephant vocalisation frequencies (8 -- 1200 Hz).
"""

import numpy as np
import librosa
import noisereduce as nr
from scipy.signal import butter, sosfiltfilt


def estimate_noise_profile(
    y: np.ndarray,
    sr: int,
    noise_duration_s: float = 0.5,
) -> np.ndarray:
    """
    Extract an initial segment of the recording as a noise reference.

    Assumes the first *noise_duration_s* seconds are ambient noise without
    the target signal (common in wildlife field recordings).

    Args:
        y: Full audio signal (1-D).
        sr: Sample rate in Hz.
        noise_duration_s: Duration (seconds) of the noise reference.

    Returns:
        1-D np.ndarray containing the noise clip.
    """
    n_samples = int(noise_duration_s * sr)
    n_samples = min(n_samples, len(y))
    return y[:n_samples]


def apply_spectral_gate(
    y: np.ndarray,
    sr: int,
    noise_clip: np.ndarray | None = None,
    prop_decrease: float = 1.0,
    stationary: bool = False,
) -> np.ndarray:
    """
    Apply spectral gating via *noisereduce*.

    If *noise_clip* is None the algorithm falls back to stationary noise
    estimation (the entire signal is used to estimate the noise profile
    automatically).

    Args:
        y: Input audio signal (1-D).
        sr: Sample rate in Hz.
        noise_clip: Optional noise reference clip.
        prop_decrease: Amount of noise reduction (0.0 -- 1.0).
        stationary: Use stationary noise reduction when True.

    Returns:
        Denoised audio signal (1-D np.ndarray).
    """
    if noise_clip is None:
        return nr.reduce_noise(
            y=y,
            sr=sr,
            stationary=True,
            prop_decrease=prop_decrease,
        )

    return nr.reduce_noise(
        y=y,
        sr=sr,
        y_noise=noise_clip,
        stationary=stationary,
        prop_decrease=prop_decrease,
    )


def apply_bandpass_filter(
    y: np.ndarray,
    sr: int,
    low_hz: float = 8,
    high_hz: float = 1200,
) -> np.ndarray:
    """
    Apply a Butterworth bandpass filter to keep elephant-frequency content.

    Uses a 5th-order Butterworth filter applied forward-backward
    (``sosfiltfilt``) for zero-phase distortion.

    Args:
        y: Input audio signal (1-D).
        sr: Sample rate in Hz.
        low_hz: Lower cutoff frequency in Hz.
        high_hz: Upper cutoff frequency in Hz.

    Returns:
        Bandpass-filtered audio signal (1-D np.ndarray).
    """
    nyquist = sr / 2.0
    low = low_hz / nyquist
    high = high_hz / nyquist

    # Clamp to valid range (0, 1) exclusive
    low = max(low, 1e-6)
    high = min(high, 1.0 - 1e-6)

    sos = butter(N=5, Wn=[low, high], btype="band", output="sos")
    return sosfiltfilt(sos, y).astype(np.float32)


def denoise_recording(
    y: np.ndarray,
    sr: int,
    aggressiveness: float = 1.5,
) -> np.ndarray:
    """
    Full denoising pipeline: noise estimation, spectral gate, mild bandpass.

    Steps:
        1. Estimate a noise profile from the first 0.5 s.
        2. Apply spectral gating with *prop_decrease* clamped to [0, 1].
        3. Apply a mild bandpass filter (8 -- 1200 Hz) to suppress
           out-of-band residual noise.

    Args:
        y: Raw audio signal (1-D).
        sr: Sample rate in Hz.
        aggressiveness: Controls how much noise to remove.
            Values > 1.0 are clamped to 1.0 for spectral gating,
            but the higher value is used to compute a secondary
            stationary pass when aggressiveness > 1.0.

    Returns:
        Cleaned audio signal (1-D np.ndarray).
    """
    # Step 1 -- noise profile
    noise_clip = estimate_noise_profile(y, sr, noise_duration_s=0.5)

    # Step 2 -- spectral gating (primary)
    prop_decrease = min(aggressiveness, 1.0)
    cleaned = apply_spectral_gate(
        y, sr, noise_clip=noise_clip, prop_decrease=prop_decrease
    )

    # Optional second pass for aggressive settings
    if aggressiveness > 1.0:
        extra = min(aggressiveness - 1.0, 1.0)
        cleaned = apply_spectral_gate(
            cleaned, sr, noise_clip=None, prop_decrease=extra, stationary=True
        )

    # Step 3 -- mild bandpass
    cleaned = apply_bandpass_filter(cleaned, sr, low_hz=8, high_hz=1200)

    return cleaned
