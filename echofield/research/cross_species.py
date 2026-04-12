"""Cross-species acoustic comparison helpers."""

from __future__ import annotations

from typing import Any

import numpy as np

REFERENCE_CALLS: dict[str, dict[str, Any]] = {
    "blue_whale_call": {
        "id": "blue_whale_call",
        "species": "Blue whale (Balaenoptera musculus)",
        "call_type": "D-call",
        "description": "Synthetic infrasonic pulse approximation, 10-40Hz, long-distance communication.",
        "frequency_range_hz": (10.0, 40.0),
        "synthetic": True,
    },
    "humpback_whale_song": {
        "id": "humpback_whale_song",
        "species": "Humpback whale (Megaptera novaeangliae)",
        "call_type": "Song unit",
        "description": "Synthetic tonal song unit approximation, 80-4000Hz.",
        "frequency_range_hz": (80.0, 4000.0),
        "synthetic": True,
    },
    "lion_roar": {
        "id": "lion_roar",
        "species": "African lion (Panthera leo)",
        "call_type": "Roar",
        "description": "Synthetic low-frequency territorial roar approximation.",
        "frequency_range_hz": (40.0, 200.0),
        "synthetic": True,
    },
    "human_speech": {
        "id": "human_speech",
        "species": "Human (Homo sapiens)",
        "call_type": "Voiced speech",
        "description": "Synthetic voiced speech reference for harmonic/formant comparison.",
        "frequency_range_hz": (85.0, 300.0),
        "synthetic": True,
    },
}


def _safe_float(value: Any) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return 0.0
    return result if np.isfinite(result) else 0.0


def _range_overlap(left: tuple[float, float], right: tuple[float, float]) -> tuple[float, tuple[float, float]]:
    low = max(left[0], right[0])
    high = min(left[1], right[1])
    if high <= low:
        return 0.0, (0.0, 0.0)
    union = max(max(left[1], right[1]) - min(left[0], right[0]), 1e-8)
    return round((high - low) / union * 100.0, 2), (round(low, 2), round(high, 2))


def _call_range(call: dict[str, Any]) -> tuple[float, float]:
    features = call.get("acoustic_features") or {}
    low = _safe_float(call.get("frequency_min_hz") or features.get("frequency_min_hz"))
    high = _safe_float(call.get("frequency_max_hz") or features.get("frequency_max_hz"))
    f0 = _safe_float(features.get("fundamental_frequency_hz"))
    if low <= 0 and f0 > 0:
        low = max(f0 * 0.75, 1.0)
    if high <= low:
        high = max(f0 * 2.5, low + 1.0)
    return (low, high)


def generate_insight(reference: dict[str, Any], overlap_pct: float, harmonic_similarity: float) -> str:
    if overlap_pct >= 60:
        return (
            f"Strong frequency overlap with {reference['species']}: both signals use similar bands, "
            "a useful clue for convergent long-distance communication strategies."
        )
    if harmonic_similarity >= 0.7:
        return (
            f"Shared harmonic structure with {reference['species']} suggests a useful comparative case "
            "for vocal identity or arousal studies."
        )
    return (
        f"{reference['species']} differs acoustically from this elephant call, but the contrast is useful "
        "for separating species-specific communication strategies."
    )


def compare_call_to_reference(call: dict[str, Any], reference_id: str) -> dict[str, Any]:
    if reference_id not in REFERENCE_CALLS:
        raise KeyError(reference_id)
    reference = REFERENCE_CALLS[reference_id]
    elephant_range = _call_range(call)
    reference_range = tuple(float(value) for value in reference["frequency_range_hz"])
    overlap_pct, shared = _range_overlap(elephant_range, reference_range)
    features = call.get("acoustic_features") or {}
    f0 = _safe_float(features.get("fundamental_frequency_hz"))
    reference_mid = (reference_range[0] + reference_range[1]) / 2.0
    spectral_similarity = round(1.0 / (1.0 + abs((f0 or elephant_range[0]) - reference_mid) / max(reference_mid, 1.0)), 3)
    harmonicity = max(min(_safe_float(features.get("harmonicity")), 1.0), 0.0)
    harmonic_similarity = round(0.5 + harmonicity * 0.5 if overlap_pct > 0 else harmonicity * 0.5, 3)
    duration_ms = _safe_float(call.get("duration_ms"))
    temporal_similarity = round(min(duration_ms / 5000.0, 1.0), 3)
    return {
        "elephant_call": {
            "call_id": call.get("id"),
            "call_type": call.get("call_type"),
            "species": "African elephant",
        },
        "reference": reference,
        "comparison": {
            "frequency_overlap_pct": overlap_pct,
            "spectral_similarity": spectral_similarity,
            "harmonic_similarity": harmonic_similarity,
            "temporal_similarity": temporal_similarity,
            "shared_frequency_range_hz": shared,
            "insight": generate_insight(reference, overlap_pct, harmonic_similarity),
        },
        "visualizations": {
            "side_by_side_url": f"/api/compare/viz/{call.get('id')}/{reference_id}.png?type=side_by_side",
            "overlay_url": f"/api/compare/viz/{call.get('id')}/{reference_id}.png?type=overlay",
        },
        "feature_comparison": {
            "fundamental_frequency_hz": {
                "elephant": round(f0, 2),
                "reference": round(reference_mid, 2),
                "difference_pct": round(abs((f0 or 0.0) - reference_mid) / max(reference_mid, 1.0) * 100.0, 2),
            },
            "harmonicity": {
                "elephant": round(harmonicity, 3),
                "reference": 0.6,
                "difference_pct": round(abs(harmonicity - 0.6) / 0.6 * 100.0, 2),
            },
        },
    }
