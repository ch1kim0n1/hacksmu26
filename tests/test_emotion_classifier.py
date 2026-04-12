"""Tests for emotion_classifier module."""
from __future__ import annotations

from echofield.research.emotion_classifier import (
    STATE_COLORS,
    classify_emotion,
    compute_arousal,
    compute_valence,
    build_emotion_timeline,
)


def _calm_features() -> dict:
    return {
        "spectral_centroid_hz": 80,
        "bandwidth_hz": 120,
        "zero_crossing_rate": 0.01,
        "snr_db": 5,
        "harmonicity": 0.8,
    }


def _agitated_features() -> dict:
    return {
        "spectral_centroid_hz": 2800,
        "bandwidth_hz": 4500,
        "zero_crossing_rate": 0.09,
        "snr_db": 28,
        "harmonicity": 0.1,
    }


# --- compute_arousal ---

def test_arousal_low_for_calm_features():
    arousal = compute_arousal(_calm_features())
    assert 0.0 <= arousal < 0.3, f"Expected low arousal, got {arousal}"


def test_arousal_high_for_agitated_features():
    arousal = compute_arousal(_agitated_features())
    assert arousal > 0.7, f"Expected high arousal, got {arousal}"


def test_arousal_clamps_to_unit():
    huge = {
        "spectral_centroid_hz": 99999,
        "bandwidth_hz": 99999,
        "zero_crossing_rate": 99,
        "snr_db": 9999,
    }
    assert compute_arousal(huge) <= 1.0


def test_arousal_empty_features():
    assert compute_arousal({}) == 0.0


# --- compute_valence ---

def test_valence_high_for_harmonic_rumble():
    val = compute_valence(_calm_features(), "rumble")
    assert val > 0.5, f"Expected positive valence, got {val}"


def test_valence_low_for_roar():
    val = compute_valence({"harmonicity": 0.1}, "roar")
    assert val < 0.3, f"Expected negative valence, got {val}"


# --- classify_emotion ---

def test_classify_calm():
    est = classify_emotion(_calm_features(), "rumble", 0.85)
    assert isinstance(est, dict)
    assert est["state"] == "calm"
    assert est["color"] == STATE_COLORS["calm"]
    assert 0.0 <= est["arousal"] <= 1.0
    assert 0.0 <= est["valence"] <= 1.0
    assert 0.3 <= est["confidence"] <= 1.0


def test_classify_distressed():
    est = classify_emotion(_agitated_features(), "cry", 0.7)
    assert est["state"] in ("distressed", "aggressive"), f"Expected distressed/aggressive, got {est['state']}"
    assert est["arousal"] > 0.5


def test_classify_unknown_call_type():
    est = classify_emotion({}, "unknown", 0.5)
    assert est["state"] in STATE_COLORS


# --- build_emotion_timeline ---

def _make_calls() -> list[dict]:
    return [
        {
            "id": "c1",
            "call_type": "rumble",
            "confidence": 0.85,
            "start_ms": 200,
            "duration_ms": 800,
            "acoustic_features": _calm_features(),
        },
        {
            "id": "c2",
            "call_type": "cry",
            "confidence": 0.7,
            "start_ms": 1500,
            "duration_ms": 600,
            "acoustic_features": _agitated_features(),
        },
    ]


def test_timeline_structure():
    result = build_emotion_timeline(_make_calls(), 3000, resolution_ms=500)
    assert "timeline" in result
    assert "call_emotions" in result
    assert "recording_summary" in result
    assert result["duration_ms"] == 3000
    assert result["resolution_ms"] == 500
    # 0, 500, 1000, 1500, 2000, 2500, 3000 = 7 bins (inclusive of endpoint)
    assert len(result["timeline"]) == 7


def test_timeline_bins_have_required_keys():
    result = build_emotion_timeline(_make_calls(), 3000, resolution_ms=500)
    for b in result["timeline"]:
        assert "time_ms" in b
        assert "state" in b
        assert "arousal" in b
        assert "valence" in b
        assert "color" in b


def test_call_emotions_match_calls():
    calls = _make_calls()
    result = build_emotion_timeline(calls, 3000)
    assert len(result["call_emotions"]) == len(calls)
    assert result["call_emotions"][0]["call_id"] == "c1"
    assert result["call_emotions"][1]["call_id"] == "c2"


def test_timeline_neutral_bins():
    """Bins with no overlapping calls should be neutral."""
    result = build_emotion_timeline(_make_calls(), 5000, resolution_ms=500)
    # Bin at time_ms=3000 (index 6) has no calls
    bin_6 = result["timeline"][6]
    assert bin_6["state"] == "neutral"
    assert bin_6["color"] == STATE_COLORS["neutral"]


def test_summary_dominant_state():
    result = build_emotion_timeline(_make_calls(), 3000)
    summary = result["recording_summary"]
    assert "dominant_state" in summary
    assert "arousal_avg" in summary
    assert "valence_avg" in summary
    assert "state_distribution" in summary


def test_empty_calls_timeline():
    result = build_emotion_timeline([], 2000, resolution_ms=500)
    # 0, 500, 1000, 1500, 2000 = 5 bins
    assert len(result["timeline"]) == 5
    assert all(b["state"] == "neutral" for b in result["timeline"])
    assert result["recording_summary"]["dominant_state"] == "neutral"


def test_single_bin_minimum():
    # duration=100 with min resolution=100 gives bins at 0 and 100
    result = build_emotion_timeline([], 100, resolution_ms=500)
    assert len(result["timeline"]) == 2
