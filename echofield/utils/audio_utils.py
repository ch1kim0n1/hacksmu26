"""Shared audio utility functions for EchoField."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import soundfile as sf


def normalize_audio(y: np.ndarray, target_db: float = -20.0) -> np.ndarray:
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    if peak == 0.0:
        return y.astype(np.float32, copy=False)
    target_amplitude = 10.0 ** (target_db / 20.0)
    normalized = y * (target_amplitude / peak)
    return normalized.astype(np.float32)


def convert_sample_rate(
    y: np.ndarray,
    sr_orig: int,
    sr_target: int,
) -> tuple[np.ndarray, int]:
    if sr_orig == sr_target:
        return y.astype(np.float32, copy=False), sr_orig
    converted = librosa.resample(y.astype(np.float32), orig_sr=sr_orig, target_sr=sr_target)
    return converted.astype(np.float32), sr_target


def stereo_to_mono(y: np.ndarray) -> np.ndarray:
    if y.ndim == 1:
        return y.astype(np.float32, copy=False)
    return np.mean(y, axis=0).astype(np.float32)


def get_duration(y: np.ndarray, sr: int) -> float:
    return 0.0 if sr <= 0 else float(y.shape[-1]) / float(sr)


def save_audio(
    y: np.ndarray,
    sr: int,
    path: str | Path,
    format: str = "wav",
    metadata: dict[str, Any] | None = None,
) -> Path:
    """Write an audio file and optionally persist a JSON sidecar metadata file."""
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), y.astype(np.float32), sr, format=format.upper())
    if metadata:
        sidecar = output_path.with_suffix(output_path.suffix + ".json")
        sidecar.write_text(json.dumps(metadata, indent=2, default=str), encoding="utf-8")
    return output_path


def load_audio(
    path: str | Path,
    sr: int | None = 44100,
    mono: bool = True,
) -> tuple[np.ndarray, int]:
    y, sr_out = librosa.load(str(path), sr=sr, mono=mono)
    return y.astype(np.float32), int(sr_out)
