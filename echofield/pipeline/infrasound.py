"""Infrasound detection and pitch-shift reveal helpers."""

from __future__ import annotations

from typing import Any

import librosa
import numpy as np
from scipy import signal


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if np.isfinite(result) else default


def _lowpass(y: np.ndarray, sr: int, cutoff_hz: float) -> np.ndarray:
    signal_in = np.asarray(y, dtype=np.float32)
    if signal_in.size == 0 or sr <= 0:
        return signal_in
    cutoff = min(max(cutoff_hz, 1.0), sr / 2 * 0.95)
    sos = signal.butter(4, cutoff, btype="lowpass", fs=sr, output="sos")
    return signal.sosfiltfilt(sos, signal_in).astype(np.float32)


def _highpass(y: np.ndarray, sr: int, cutoff_hz: float) -> np.ndarray:
    signal_in = np.asarray(y, dtype=np.float32)
    if signal_in.size == 0 or sr <= 0:
        return signal_in
    cutoff = min(max(cutoff_hz, 1.0), sr / 2 * 0.95)
    sos = signal.butter(4, cutoff, btype="highpass", fs=sr, output="sos")
    return signal.sosfiltfilt(sos, signal_in).astype(np.float32)


def _merge_regions(frames: list[tuple[int, int]], sr: int, hop: int) -> list[tuple[int, int]]:
    if not frames:
        return []
    merged = [frames[0]]
    max_gap = int(0.25 * sr)
    for start_frame, end_frame in frames[1:]:
        start = start_frame * hop
        end = end_frame * hop
        prev_start, prev_end = merged[-1]
        prev_end_sample = prev_end * hop
        if start - prev_end_sample <= max_gap:
            merged[-1] = (prev_start, end_frame)
        else:
            merged.append((start_frame, end_frame))
    return merged


def detect_infrasound_regions(
    y: np.ndarray,
    sr: int,
    *,
    upper_bound_hz: float = 20.0,
    min_energy_db: float = -40.0,
) -> list[dict[str, Any]]:
    """Detect time regions with meaningful sub-20Hz energy."""
    signal_in = np.asarray(y, dtype=np.float32)
    if signal_in.size == 0 or sr <= 0:
        return []
    infra = _lowpass(signal_in, sr, upper_bound_hz)
    hop = max(int(0.05 * sr), 1)
    frame = max(int(0.25 * sr), hop * 2)
    rms = librosa.feature.rms(y=infra, frame_length=frame, hop_length=hop, center=True)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=max(float(np.max(rms)), 1e-8))
    active = np.where(rms_db >= min_energy_db)[0].tolist()
    if not active:
        return []

    spans: list[tuple[int, int]] = []
    start = active[0]
    prev = active[0]
    for index in active[1:]:
        if index == prev + 1:
            prev = index
            continue
        spans.append((start, prev + 1))
        start = index
        prev = index
    spans.append((start, prev + 1))

    regions = []
    for start_frame, end_frame in _merge_regions(spans, sr, hop):
        start_sample = max(start_frame * hop - frame // 2, 0)
        end_sample = min(end_frame * hop + frame // 2, signal_in.size)
        duration_ms = (end_sample - start_sample) / sr * 1000.0
        if duration_ms < 150:
            continue
        segment = infra[start_sample:end_sample]
        try:
            f0 = librosa.yin(segment, fmin=8.0, fmax=min(upper_bound_hz, sr / 2 - 1), sr=sr)
            valid = f0[np.isfinite(f0)]
            estimated_f0 = float(np.median(valid)) if valid.size else 0.0
        except Exception:
            estimated_f0 = 0.0
        energy = float(np.mean(librosa.amplitude_to_db(np.abs(segment) + 1e-8, ref=np.max)))
        regions.append({
            "start_ms": round(start_sample / sr * 1000.0, 2),
            "end_ms": round(end_sample / sr * 1000.0, 2),
            "estimated_f0_hz": round(estimated_f0, 2),
            "energy_db": round(energy, 2),
        })
    return regions


def pitch_shift_infrasound(
    y: np.ndarray,
    sr: int,
    *,
    shift_octaves: int = 3,
    method: str = "phase_vocoder",
    preserve_duration: bool = True,
) -> tuple[np.ndarray, int]:
    """Pitch-shift infrasonic content into the audible range."""
    signal_in = np.asarray(y, dtype=np.float32)
    if signal_in.size == 0:
        return signal_in, sr
    if method == "resample" or not preserve_duration:
        factor = 2 ** int(shift_octaves)
        shifted = librosa.resample(signal_in, orig_sr=sr, target_sr=sr * factor)
        return shifted.astype(np.float32), sr
    shifted = librosa.effects.pitch_shift(signal_in, sr=sr, n_steps=int(shift_octaves) * 12)
    return shifted.astype(np.float32), sr


def create_infrasound_reveal(
    y: np.ndarray,
    sr: int,
    *,
    shift_octaves: int = 3,
    method: str = "phase_vocoder",
    mix_mode: str = "shifted_only",
) -> dict[str, Any]:
    signal_in = np.asarray(y, dtype=np.float32)
    infra = _lowpass(signal_in, sr, 20.0)
    audible = _highpass(signal_in, sr, 20.0)
    shifted, out_sr = pitch_shift_infrasound(infra, sr, shift_octaves=shift_octaves, method=method)
    if mix_mode == "blended":
        if shifted.size != audible.size:
            shifted = librosa.util.fix_length(shifted, size=audible.size)
        audio = (audible + shifted).astype(np.float32)
    elif mix_mode == "side_by_side":
        audio = np.concatenate([signal_in, shifted]).astype(np.float32)
    else:
        audio = shifted.astype(np.float32)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1e-8:
        audio = (audio / peak * 0.9).astype(np.float32)
    total = max(float(np.sum(signal_in ** 2)), 1e-8)
    infra_pct = float(np.sum(infra ** 2) / total * 100.0)
    regions = detect_infrasound_regions(signal_in, sr)
    return {
        "audio": audio,
        "sr": out_sr,
        "regions": regions,
        "infrasound_detected": bool(regions),
        "infrasound_energy_pct": round(infra_pct, 2),
        "frequency_range_original_hz": (8.0, 20.0),
        "frequency_range_shifted_hz": (8.0 * (2 ** shift_octaves), 20.0 * (2 ** shift_octaves)),
    }
