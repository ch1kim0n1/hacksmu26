"""Audio ingestion for EchoField."""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np

from echofield.utils.audio_utils import convert_sample_rate, get_duration, load_audio, stereo_to_mono

SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".flac"}
MAX_FILE_SIZE_MB = 500
MIN_SAMPLE_RATE = 16_000


@dataclass
class AudioSegment:
    audio_id: str
    index: int
    data: np.ndarray
    start_s: float
    end_s: float
    sample_rate: int


@dataclass
class IngestionResult:
    audio_id: str
    filename: str
    duration_s: float
    sample_rate: int
    channels: int
    file_size_mb: float
    segments: list[AudioSegment] = field(default_factory=list)
    metadata: dict[str, float | int | str] = field(default_factory=dict)


def validate_audio_file(file_path: str) -> tuple[bool, str]:
    path = Path(file_path)
    if not path.exists():
        return False, f"File not found: {file_path}"
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        return False, f"Unsupported file extension: {path.suffix}"
    size_mb = path.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        return False, f"File exceeds {MAX_FILE_SIZE_MB} MB"
    return True, ""


def segment_audio(
    y: np.ndarray,
    sr: int,
    segment_length_s: float = 60.0,
    overlap_ratio: float = 0.5,
) -> list[dict[str, np.ndarray | float | int]]:
    if len(y) == 0:
        return [{"data": y, "start_s": 0.0, "end_s": 0.0, "index": 0}]

    total_duration_s = len(y) / sr
    if total_duration_s <= 120.0:
        return [{"data": y, "start_s": 0.0, "end_s": total_duration_s, "index": 0}]

    segment_samples = int(segment_length_s * sr)
    hop_samples = max(int(segment_samples * (1.0 - overlap_ratio)), 1)
    segments: list[dict[str, np.ndarray | float | int]] = []
    start = 0
    index = 0
    while start < len(y):
        end = min(start + segment_samples, len(y))
        segments.append(
            {
                "data": y[start:end],
                "start_s": start / sr,
                "end_s": end / sr,
                "index": index,
            }
        )
        if end >= len(y):
            break
        start += hop_samples
        index += 1
    return segments


def extract_metadata(file_path: str, y: np.ndarray, sr: int) -> dict[str, float | int | str]:
    path = Path(file_path)
    return {
        "filename": path.name,
        "duration_s": round(get_duration(y, sr), 3),
        "sample_rate": int(sr),
        "channels": 1,
        "file_size_mb": round(path.stat().st_size / (1024 * 1024), 3),
    }


def ingest_audio_file(
    file_path: str,
    *,
    target_sr: int = 44_100,
    segment_length_s: float = 60.0,
    overlap_ratio: float = 0.5,
    progress_callback: Callable[[str, int], None] | None = None,
) -> IngestionResult:
    valid, error = validate_audio_file(file_path)
    if not valid:
        raise ValueError(error)

    if progress_callback:
        progress_callback("INGESTION_STARTED", 0)

    audio_id = uuid.uuid4().hex
    y, sr = load_audio(file_path, sr=None, mono=False)
    channels = 1 if y.ndim == 1 else int(y.shape[0])
    y = stereo_to_mono(y)
    if sr < MIN_SAMPLE_RATE:
        y, sr = convert_sample_rate(y, sr, target_sr)
    elif sr != target_sr:
        y, sr = convert_sample_rate(y, sr, target_sr)

    metadata = extract_metadata(file_path, y, sr)
    raw_segments = segment_audio(
        y,
        sr,
        segment_length_s=segment_length_s,
        overlap_ratio=overlap_ratio,
    )
    segments = [
        AudioSegment(
            audio_id=audio_id,
            index=int(segment["index"]),
            data=np.asarray(segment["data"], dtype=np.float32),
            start_s=float(segment["start_s"]),
            end_s=float(segment["end_s"]),
            sample_rate=sr,
        )
        for segment in raw_segments
    ]

    if progress_callback:
        progress_callback("INGESTION_COMPLETE", 100)

    return IngestionResult(
        audio_id=audio_id,
        filename=os.path.basename(file_path),
        duration_s=round(get_duration(y, sr), 3),
        sample_rate=sr,
        channels=channels,
        file_size_mb=round(Path(file_path).stat().st_size / (1024 * 1024), 3),
        segments=segments,
        metadata=metadata,
    )
