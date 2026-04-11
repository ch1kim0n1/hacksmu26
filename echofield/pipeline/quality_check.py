"""
Quality assessment module for the EchoField processing pipeline.

Computes SNR, energy preservation, spectral distortion, and an overall
quality score for denoised audio.
"""

import numpy as np
import librosa
from scipy.signal import butter, sosfiltfilt


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bandpass_energy(
    y: np.ndarray,
    sr: int,
    low_hz: float,
    high_hz: float,
) -> float:
    """Return total energy of *y* within the given frequency band."""
    nyquist = sr / 2.0
    low = max(low_hz / nyquist, 1e-6)
    high = min(high_hz / nyquist, 1.0 - 1e-6)

    sos = butter(N=5, Wn=[low, high], btype="band", output="sos")
    filtered = sosfiltfilt(sos, y)
    return float(np.sum(filtered ** 2))


def _rms(y: np.ndarray) -> float:
    """Root-mean-square of a signal."""
    return float(np.sqrt(np.mean(y ** 2)))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_snr(y: np.ndarray, sr: int) -> float:
    """
    Estimate Signal-to-Noise Ratio (dB) of a single recording.

    Heuristic: frames whose RMS exceeds the median RMS are classified as
    *signal*; the rest are *noise*.

    Args:
        y: Audio samples (1-D).
        sr: Sample rate in Hz.

    Returns:
        Estimated SNR in dB.
    """
    frame_length = int(0.025 * sr)  # 25 ms frames
    hop_length = int(0.010 * sr)    # 10 ms hop

    frames = librosa.util.frame(y, frame_length=frame_length, hop_length=hop_length)
    rms_per_frame = np.sqrt(np.mean(frames ** 2, axis=0))

    median_rms = np.median(rms_per_frame)

    signal_mask = rms_per_frame > median_rms
    noise_mask = ~signal_mask

    if not np.any(signal_mask) or not np.any(noise_mask):
        return 0.0

    signal_energy = np.mean(rms_per_frame[signal_mask] ** 2)
    noise_energy = np.mean(rms_per_frame[noise_mask] ** 2)

    if noise_energy < 1e-12:
        return 60.0  # effectively silent noise floor

    snr = 10.0 * np.log10(signal_energy / noise_energy)
    return float(snr)


def compute_snr_improvement(
    y_original: np.ndarray,
    y_cleaned: np.ndarray,
    sr: int,
) -> dict:
    """
    Compare SNR before and after processing.

    Returns:
        Dict with snr_before, snr_after, improvement_db.
    """
    snr_before = compute_snr(y_original, sr)
    snr_after = compute_snr(y_cleaned, sr)
    return {
        "snr_before": round(snr_before, 2),
        "snr_after": round(snr_after, 2),
        "improvement_db": round(snr_after - snr_before, 2),
    }


def compute_energy_preservation(
    y_original: np.ndarray,
    y_cleaned: np.ndarray,
    sr: int,
    low_hz: float = 8,
    high_hz: float = 1200,
) -> float:
    """
    Ratio of energy preserved in the elephant frequency band (0--1).

    A value of 1.0 means all in-band energy was retained; values < 1
    indicate some signal loss.

    Args:
        y_original: Original audio.
        y_cleaned: Cleaned audio.
        sr: Sample rate in Hz.
        low_hz: Lower bound of the target band.
        high_hz: Upper bound of the target band.

    Returns:
        Energy preservation ratio (clamped to [0, 1]).
    """
    energy_orig = _bandpass_energy(y_original, sr, low_hz, high_hz)
    energy_clean = _bandpass_energy(y_cleaned, sr, low_hz, high_hz)

    if energy_orig < 1e-12:
        return 1.0  # nothing to preserve

    ratio = energy_clean / energy_orig
    return float(min(ratio, 1.0))


def compute_spectral_distortion(
    y_original: np.ndarray,
    y_cleaned: np.ndarray,
    sr: int,
) -> float:
    """
    Normalised L2 distance in the log-mel spectrogram domain.

    Lower values indicate less distortion.

    Args:
        y_original: Original audio.
        y_cleaned: Cleaned audio.
        sr: Sample rate in Hz.

    Returns:
        Normalised spectral distortion (>= 0).
    """
    # Make sure both signals have the same length
    min_len = min(len(y_original), len(y_cleaned))
    y_original = y_original[:min_len]
    y_cleaned = y_cleaned[:min_len]

    mel_orig = librosa.feature.melspectrogram(y=y_original, sr=sr, n_mels=128)
    mel_clean = librosa.feature.melspectrogram(y=y_cleaned, sr=sr, n_mels=128)

    log_orig = librosa.power_to_db(mel_orig, ref=np.max)
    log_clean = librosa.power_to_db(mel_clean, ref=np.max)

    l2 = np.sqrt(np.mean((log_orig - log_clean) ** 2))

    # Normalise by the dynamic range of the original
    dyn_range = float(np.max(log_orig) - np.min(log_orig))
    if dyn_range < 1e-6:
        return 0.0

    return float(l2 / dyn_range)


def assess_quality(
    y_original: np.ndarray,
    y_cleaned: np.ndarray,
    sr: int,
) -> dict:
    """
    Compute all quality metrics and a composite quality score.

    The quality_score (0--100) is a weighted blend of:
        - SNR improvement (higher is better)
        - Energy preservation (closer to 1.0 is better)
        - Spectral distortion (lower is better)

    Returns:
        Dict with snr_before, snr_after, snr_improvement, energy_preservation,
        spectral_distortion, quality_score.
    """
    snr_info = compute_snr_improvement(y_original, y_cleaned, sr)
    energy_pres = compute_energy_preservation(y_original, y_cleaned, sr)
    spec_dist = compute_spectral_distortion(y_original, y_cleaned, sr)

    # --- Composite score ---
    # SNR improvement component (0--40 points)
    # Expect 0--20 dB improvement maps to 0--40 points
    snr_score = min(max(snr_info["improvement_db"], 0) / 20.0 * 40, 40)

    # Energy preservation component (0--35 points)
    energy_score = energy_pres * 35

    # Spectral distortion component (0--25 points)
    # distortion of 0 => 25 pts; distortion of 1.0 => 0 pts
    distortion_score = max(1.0 - spec_dist, 0) * 25

    quality_score = snr_score + energy_score + distortion_score
    quality_score = round(min(max(quality_score, 0), 100), 1)

    return {
        "snr_before": snr_info["snr_before"],
        "snr_after": snr_info["snr_after"],
        "snr_improvement": snr_info["improvement_db"],
        "energy_preservation": round(energy_pres, 4),
        "spectral_distortion": round(spec_dist, 4),
        "quality_score": quality_score,
    }
