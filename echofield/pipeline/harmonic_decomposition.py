"""Harmonic decomposition — analyze per-harmonic energy and SNR."""

from __future__ import annotations

import base64
import io
import logging
from typing import Any

import librosa
import librosa.display
import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.signal import butter, sosfiltfilt

from echofield.pipeline.quality_check import compute_snr

logger = logging.getLogger(__name__)

# Minimum audio length (in samples) required for meaningful analysis.
_MIN_SAMPLES = 64


def decompose_harmonics(
    y_original: np.ndarray,
    y_cleaned: np.ndarray,
    sr: int,
    fundamental_hz: float,
    max_harmonics: int = 8,
    bandwidth_fraction: float = 0.15,
) -> dict[str, Any]:
    """Decompose a call into harmonic bands and compute per-band metrics.

    Args:
        y_original: Original (noisy) audio signal.
        y_cleaned: Cleaned (denoised) audio signal.
        sr: Sample rate in Hz.
        fundamental_hz: Detected fundamental frequency in Hz.
        max_harmonics: Maximum number of harmonics to analyze (1 = fundamental only).
        bandwidth_fraction: Width of each bandpass filter as a fraction of the
            harmonic centre frequency (applied symmetrically: centre +/- fraction * centre).

    Returns:
        Dictionary with keys ``fundamental_hz``, ``harmonics`` (list of per-band
        dicts), and ``total_harmonics_detected``.
    """
    nyquist = sr / 2.0
    harmonics: list[dict[str, Any]] = []

    # Guard: nonsensical fundamental or degenerate inputs.
    if (
        fundamental_hz <= 0.0
        or sr <= 0
        or y_original.size < _MIN_SAMPLES
        or y_cleaned.size < _MIN_SAMPLES
    ):
        logger.warning(
            "decompose_harmonics: skipping — fundamental_hz=%.1f, sr=%d, "
            "len(original)=%d, len(cleaned)=%d",
            fundamental_hz,
            sr,
            y_original.size,
            y_cleaned.size,
        )
        return {
            "fundamental_hz": float(fundamental_hz),
            "harmonics": [],
            "total_harmonics_detected": 0,
        }

    # Ensure both signals have the same length for fair comparison.
    min_len = min(y_original.size, y_cleaned.size)
    y_orig = y_original[:min_len].astype(np.float32)
    y_clean = y_cleaned[:min_len].astype(np.float32)

    for n in range(1, max_harmonics + 1):
        freq = fundamental_hz * n
        if freq >= nyquist:
            break

        half_bw = bandwidth_fraction * freq
        low_hz = max(freq - half_bw, 1.0)
        high_hz = min(freq + half_bw, nyquist - 1.0)

        if low_hz >= high_hz:
            continue

        band_orig = _bandpass_filter(y_orig, sr, low_hz, high_hz)
        band_clean = _bandpass_filter(y_clean, sr, low_hz, high_hz)

        energy_before = float(np.sum(band_orig ** 2))
        energy_after = float(np.sum(band_clean ** 2))

        snr_before = round(compute_snr(band_orig, sr), 2)
        snr_after = round(compute_snr(band_clean, sr), 2)

        if energy_before > 0.0:
            preserved_pct = round(min(energy_after / energy_before, 1.0) * 100.0, 2)
        else:
            preserved_pct = 0.0

        spec_b64 = _generate_band_spectrogram(band_clean, sr, freq, half_bw)

        harmonics.append(
            {
                "order": n,
                "frequency_hz": round(freq, 2),
                "band_low_hz": round(low_hz, 2),
                "band_high_hz": round(high_hz, 2),
                "energy_before": round(energy_before, 6),
                "energy_after": round(energy_after, 6),
                "snr_before_db": snr_before,
                "snr_after_db": snr_after,
                "energy_preserved_pct": preserved_pct,
                "spectrogram_slice_b64": spec_b64,
            }
        )

    return {
        "fundamental_hz": round(float(fundamental_hz), 2),
        "harmonics": harmonics,
        "total_harmonics_detected": len(harmonics),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _bandpass_filter(
    y: np.ndarray, sr: int, low_hz: float, high_hz: float
) -> np.ndarray:
    """Apply a 4th-order Butterworth bandpass filter.

    Returns a copy of *y* when the requested band is invalid or collapses.
    """
    nyquist = sr / 2.0
    low = max(low_hz / nyquist, 1e-6)
    high = min(high_hz / nyquist, 1.0 - 1e-6)
    if low >= high:
        return y.copy()
    sos = butter(4, [low, high], btype="band", output="sos")
    return sosfiltfilt(sos, y).astype(np.float32)


def _generate_band_spectrogram(
    y: np.ndarray, sr: int, freq_center: float, bandwidth: float
) -> str:
    """Generate a small spectrogram PNG for a harmonic band and return base64.

    Produces a compact, axis-free image suitable for embedding in JSON
    responses or rendered inline in a research UI.
    """
    if y.size < _MIN_SAMPLES:
        return ""

    fig, ax = plt.subplots(figsize=(3, 0.8), dpi=80)
    # Choose n_fft that is a power of two and fits within the signal length.
    n_fft = int(2 ** np.floor(np.log2(max(256, min(4096, len(y))))))
    hop_length = max(n_fft // 4, 1)

    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length))
    S_db = librosa.amplitude_to_db(S, ref=np.max)

    librosa.display.specshow(
        S_db,
        sr=sr,
        hop_length=hop_length,
        ax=ax,
        cmap="magma",
        y_axis=None,
        x_axis=None,
    )
    ax.axis("off")
    plt.tight_layout(pad=0)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")
