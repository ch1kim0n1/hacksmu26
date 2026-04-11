"""
Audio ingestion module for the EchoField processing pipeline.

Handles file validation, audio loading, segmentation, and metadata extraction.
"""

import os
import numpy as np
import librosa


SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".flac"}
MAX_FILE_SIZE_MB = 500


def validate_audio_file(file_path: str) -> tuple[bool, str]:
    """
    Validate that the given file path points to a supported audio file.

    Checks:
    - File exists on disk.
    - Extension is one of .wav, .mp3, .flac.
    - File size is under 500 MB.

    Returns:
        (True, "") if valid, (False, error_message) otherwise.
    """
    if not os.path.exists(file_path):
        return False, f"File not found: {file_path}"

    _, ext = os.path.splitext(file_path)
    if ext.lower() not in SUPPORTED_EXTENSIONS:
        return False, (
            f"Unsupported file extension '{ext}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        return False, (
            f"File too large ({file_size_mb:.1f} MB). "
            f"Maximum allowed: {MAX_FILE_SIZE_MB} MB."
        )

    return True, ""


def load_audio(file_path: str, target_sr: int = 44100) -> tuple[np.ndarray, int]:
    """
    Load an audio file, force mono, and resample to the target sample rate.

    Args:
        file_path: Path to the audio file.
        target_sr: Target sample rate in Hz (default 44100).

    Returns:
        Tuple of (audio_samples as np.ndarray, sample_rate as int).
    """
    y, sr = librosa.load(file_path, sr=target_sr, mono=True)
    return y, sr


def segment_audio(
    y: np.ndarray,
    sr: int,
    max_duration_s: float = 120,
    overlap_ratio: float = 0.5,
) -> list[dict]:
    """
    Split audio into overlapping segments if it exceeds max_duration_s.

    If the audio is shorter than max_duration_s, a single segment covering
    the full duration is returned.

    Args:
        y: Audio samples (1-D array).
        sr: Sample rate in Hz.
        max_duration_s: Maximum segment duration in seconds.
        overlap_ratio: Fraction of overlap between consecutive segments (0-1).

    Returns:
        List of dicts, each with keys:
            data      - np.ndarray of audio samples for the segment
            start_s   - start time in seconds
            end_s     - end time in seconds
            index     - zero-based segment index
    """
    total_samples = len(y)
    total_duration_s = total_samples / sr

    if total_duration_s <= max_duration_s:
        return [
            {
                "data": y,
                "start_s": 0.0,
                "end_s": total_duration_s,
                "index": 0,
            }
        ]

    segment_samples = int(max_duration_s * sr)
    hop_samples = int(segment_samples * (1.0 - overlap_ratio))

    segments: list[dict] = []
    index = 0
    start = 0

    while start < total_samples:
        end = min(start + segment_samples, total_samples)
        segment_data = y[start:end]

        segments.append(
            {
                "data": segment_data,
                "start_s": start / sr,
                "end_s": end / sr,
                "index": index,
            }
        )

        index += 1
        start += hop_samples

        # Avoid a tiny trailing segment
        if total_samples - start < segment_samples * 0.25:
            # Extend the last segment to the end instead
            if start < total_samples and segments:
                last = segments[-1]
                last["data"] = y[int(last["start_s"] * sr) :]
                last["end_s"] = total_duration_s
            break

    return segments


def extract_metadata(
    file_path: str, y: np.ndarray, sr: int
) -> dict:
    """
    Extract basic metadata from a loaded audio file.

    Args:
        file_path: Original file path on disk.
        y: Loaded audio samples.
        sr: Sample rate in Hz.

    Returns:
        Dict with keys: filename, duration_s, sample_rate, file_size_mb.
    """
    file_size_bytes = os.path.getsize(file_path)
    duration_s = len(y) / sr

    return {
        "filename": os.path.basename(file_path),
        "duration_s": round(duration_s, 3),
        "sample_rate": sr,
        "file_size_mb": round(file_size_bytes / (1024 * 1024), 3),
    }
