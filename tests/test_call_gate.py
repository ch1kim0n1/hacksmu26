"""Tests for call-aware time gating."""

from __future__ import annotations

import numpy as np

from echofield.pipeline.call_gate import (
    apply_time_gate,
    build_smooth_envelope,
    calls_to_sample_regions,
)


def test_calls_to_sample_regions_filters_and_merges() -> None:
    sr = 8000
    n = sr * 2  # 2 seconds
    calls = [
        {"start_ms": 0.0, "duration_ms": 500.0, "confidence": 0.9, "confidence_tier": "high"},
        {"start_ms": 400.0, "duration_ms": 200.0, "confidence": 0.8, "confidence_tier": "high"},
        {"start_ms": 1000.0, "duration_ms": 100.0, "confidence": 0.2, "confidence_tier": "below_threshold"},
    ]
    regions = calls_to_sample_regions(
        calls,
        sr,
        min_confidence=0.5,
        pad_ms=100.0,
        merge_gap_ms=50.0,
        num_samples=n,
    )
    assert len(regions) >= 1
    # First two overlap after merge — should be one region
    assert regions[0][0] == 0
    assert regions[0][1] <= n


def test_build_smooth_envelope_floor_outside() -> None:
    n = 10_000
    floor = 0.05
    regions = [(2000, 3000)]
    env = build_smooth_envelope(n, regions, fade_samples=200, floor=floor)
    assert env.shape == (n,)
    assert np.all(env[:1500] <= floor + 1e-5)
    assert float(np.max(env[2200:2800])) >= 0.99


def test_apply_time_gate_reduces_rms_outside() -> None:
    sr = 1000
    n = sr
    t = np.linspace(0, 1, n, endpoint=False, dtype=np.float32)
    y = 0.5 * np.sin(2 * np.pi * 40 * t).astype(np.float32)
    regions = [(int(0.2 * sr), int(0.4 * sr))]
    env = build_smooth_envelope(n, regions, fade_samples=50, floor=0.0)
    gated = apply_time_gate(y, env)
    rms_out = float(np.sqrt(np.mean(gated[: int(0.15 * sr)] ** 2)))
    rms_in = float(np.sqrt(np.mean(gated[int(0.25 * sr) : int(0.35 * sr)] ** 2)))
    assert rms_out < rms_in * 0.2


def test_below_threshold_excluded() -> None:
    sr = 1000
    calls = [
        {"start_ms": 0.0, "duration_ms": 100.0, "confidence": 0.99, "confidence_tier": "below_threshold"},
    ]
    r = calls_to_sample_regions(calls, sr, min_confidence=0.0, pad_ms=0.0, merge_gap_ms=0.0, num_samples=sr)
    assert r == []
