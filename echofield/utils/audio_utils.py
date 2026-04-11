"""
EchoField audio utility functions.

Thin wrappers around *librosa* and *soundfile* that standardize audio I/O
and common transformations used throughout the processing pipeline.
"""

from __future__ import annotations

from pathlib import Path
from typing import Union

import librosa
import numpy as np
import soundfile as sf


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

def normalize_audio(
    y: np.ndarray,
    target_db: float = -20.0,
) -> np.ndarray:
    """Peak-normalize *y* so that its maximum amplitude matches *target_db*.

    Parameters
    ----------
    y:
        Audio signal as a 1-D float array.
    target_db:
        Target peak level in dBFS (e.g. ``-20.0``).

    Returns
    -------
    np.ndarray
        Normalized audio signal.
    """
    peak = np.max(np.abs(y))
    if peak == 0:
        return y
    target_amplitude = 10.0 ** (target_db / 20.0)
    return y * (target_amplitude / peak)


# ---------------------------------------------------------------------------
# Sample-rate conversion
# ---------------------------------------------------------------------------

def convert_sample_rate(
    y: np.ndarray,
    sr_orig: int,
    sr_target: int,
) -> tuple[np.ndarray, int]:
    """Resample *y* from *sr_orig* to *sr_target*.

    If the two rates are identical the input is returned unchanged.

    Returns
    -------
    tuple[np.ndarray, int]
        ``(resampled_audio, sr_target)``
    """
    if sr_orig == sr_target:
        return y, sr_orig
    y_resampled = librosa.resample(y, orig_sr=sr_orig, target_sr=sr_target)
    return y_resampled, sr_target


# ---------------------------------------------------------------------------
# Channel conversion
# ---------------------------------------------------------------------------

def stereo_to_mono(y: np.ndarray) -> np.ndarray:
    """Convert a stereo (or multi-channel) signal to mono by averaging channels.

    If *y* is already 1-D it is returned as-is.

    Parameters
    ----------
    y:
        Audio array.  For multi-channel audio the expected shape is
        ``(channels, samples)`` (librosa convention).

    Returns
    -------
    np.ndarray
        Mono audio signal (1-D).
    """
    if y.ndim == 1:
        return y
    return np.mean(y, axis=0)


# ---------------------------------------------------------------------------
# Duration
# ---------------------------------------------------------------------------

def get_duration(y: np.ndarray, sr: int) -> float:
    """Return the duration of *y* in seconds.

    Parameters
    ----------
    y:
        Audio signal (1-D or multi-channel).
    sr:
        Sample rate in Hz.

    Returns
    -------
    float
        Duration in seconds.
    """
    n_samples = y.shape[-1]  # works for both 1-D and (channels, samples)
    return float(n_samples) / sr


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------

def save_audio(
    y: np.ndarray,
    sr: int,
    path: Union[str, Path],
    format: str = "wav",
) -> Path:
    """Write an audio signal to disk via *soundfile*.

    Parameters
    ----------
    y:
        Audio signal (1-D float array).
    sr:
        Sample rate in Hz.
    path:
        Destination file path.  Parent directories are created automatically.
    format:
        Audio container format (e.g. ``"wav"``, ``"flac"``).

    Returns
    -------
    Path
        The resolved path that was written.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), y, sr, format=format)
    return path


def load_audio(
    path: Union[str, Path],
    sr: int = 44100,
) -> tuple[np.ndarray, int]:
    """Load an audio file as a mono float32 array.

    This is a thin convenience wrapper around :func:`librosa.load` that
    enforces mono conversion and a default sample rate.

    Parameters
    ----------
    path:
        Path to the audio file.
    sr:
        Target sample rate.  Pass ``None`` to keep the native rate.

    Returns
    -------
    tuple[np.ndarray, int]
        ``(audio_array, sample_rate)``
    """
    y, sr_out = librosa.load(str(path), sr=sr, mono=True)
    return y, sr_out
