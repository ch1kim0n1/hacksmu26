"""Time-domain gating: keep audio only during detected elephant-call regions."""

from __future__ import annotations

from typing import Any

import numpy as np

def calls_to_sample_regions(
    calls: list[dict[str, Any]],
    sr: int,
    *,
    min_confidence: float,
    pad_ms: float,
    merge_gap_ms: float,
    num_samples: int,
) -> list[tuple[int, int]]:
    """Convert detector calls to padded, merged half-open sample ranges [start, end).

    Drops calls below ``min_confidence`` and those with ``confidence_tier`` ==
    ``below_threshold``.
    """
    if not calls or sr <= 0 or num_samples <= 0:
        return []

    pad_s = max(pad_ms, 0.0) / 1000.0
    merge_gap = max(merge_gap_ms, 0.0) / 1000.0
    pad_samples = int(round(pad_s * sr))

    raw: list[tuple[int, int]] = []
    for call in calls:
        tier = str(call.get("confidence_tier") or "")
        if tier == "below_threshold":
            continue
        conf = float(call.get("confidence") or 0.0)
        if conf < min_confidence:
            continue
        start_ms = float(call.get("start_ms") or 0.0)
        dur_ms = float(call.get("duration_ms") or 0.0)
        s = int(round((start_ms / 1000.0) * sr)) - pad_samples
        e = int(round(((start_ms + dur_ms) / 1000.0) * sr)) + pad_samples
        s = max(0, s)
        e = min(num_samples, e)
        if e > s:
            raw.append((s, e))

    if not raw:
        return []

    raw.sort(key=lambda x: x[0])
    merged: list[tuple[int, int]] = []
    gap_samples = int(round(merge_gap * sr))
    cur_s, cur_e = raw[0]
    for s, e in raw[1:]:
        if s <= cur_e + gap_samples:
            cur_e = max(cur_e, e)
        else:
            merged.append((cur_s, cur_e))
            cur_s, cur_e = s, e
    merged.append((cur_s, cur_e))
    return merged


def _cosine_ramp(n: int, floor: float, ascending: bool) -> np.ndarray:
    """Return length-n values from floor→1 (ascending) or 1→floor (descending)."""
    if n <= 0:
        return np.array([], dtype=np.float32)
    t = (np.arange(n, dtype=np.float32) + 0.5) / max(n, 1)
    # Raised cosine edge: smooth 0..1
    w = 0.5 * (1.0 - np.cos(np.pi * t))
    if ascending:
        return (floor + (1.0 - floor) * w).astype(np.float32)
    return (floor + (1.0 - floor) * (1.0 - w)).astype(np.float32)


def build_smooth_envelope(
    num_samples: int,
    regions: list[tuple[int, int]],
    fade_samples: int,
    floor: float,
) -> np.ndarray:
    """Per-sample gain in [floor, 1]; unity inside regions with cosine fades at edges."""
    floor = float(np.clip(floor, 0.0, 1.0))
    g = np.full(max(num_samples, 0), floor, dtype=np.float32)
    if num_samples <= 0 or not regions:
        return g

    fs = max(0, min(fade_samples, num_samples // 2))

    for s, e in regions:
        s = max(0, min(s, num_samples))
        e = max(0, min(e, num_samples))
        if e <= s:
            continue

        seg_len = e - s
        if seg_len <= 0:
            continue

        if fs == 0:
            g[s:e] = np.maximum(g[s:e], 1.0)
            continue

        f = min(fs, seg_len // 2)
        if f == 0:
            g[s:e] = np.maximum(g[s:e], 1.0)
            continue

        mid_start = s + f
        mid_end = e - f
        if mid_start >= mid_end:
            # Short region: Hann-like bump (0 at edges, peak in middle)
            t = np.linspace(0.0, 1.0, seg_len, dtype=np.float32)
            bump = 0.5 * (1.0 - np.cos(2.0 * np.pi * t))
            g[s:e] = np.maximum(g[s:e], floor + (1.0 - floor) * bump)
            continue

        left = _cosine_ramp(f, floor, ascending=True)
        right = _cosine_ramp(f, floor, ascending=False)
        g[s : s + f] = np.maximum(g[s : s + f], left)
        g[mid_start:mid_end] = np.maximum(g[mid_start:mid_end], 1.0)
        g[e - f : e] = np.maximum(g[e - f : e], right)

    return g


def apply_time_gate(y: np.ndarray, envelope: np.ndarray) -> np.ndarray:
    """Multiply waveform by envelope (same length)."""
    if y.size == 0:
        return y.astype(np.float32)
    n = min(len(y), len(envelope))
    if n == 0:
        return y.astype(np.float32)
    out = y[:n].astype(np.float32) * envelope[:n].astype(np.float32)
    if len(y) > n:
        out = np.concatenate([out, np.zeros(len(y) - n, dtype=np.float32)])
    return out.astype(np.float32)
