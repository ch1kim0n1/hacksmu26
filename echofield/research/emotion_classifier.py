"""Rule-based elephant call emotion estimates."""

from __future__ import annotations

from collections import Counter
from typing import Any


STATE_COLORS = {
    "calm": "#10B981",
    "social": "#14B8A6",
    "alert": "#F59E0B",
    "aggressive": "#F97316",
    "distressed": "#EF4444",
    "neutral": "#4B5563",
}


def _safe_float(value: Any) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return 0.0
    return result if result == result else 0.0


def compute_arousal(features: dict[str, Any]) -> float:
    centroid = min(_safe_float(features.get("spectral_centroid_hz")) / 3000.0, 1.0)
    bandwidth = min(_safe_float(features.get("bandwidth_hz")) / 5000.0, 1.0)
    zcr = min(_safe_float(features.get("zero_crossing_rate")) / 0.1, 1.0)
    snr = max(min(_safe_float(features.get("snr_db")) / 20.0, 1.0), 0.0)
    return round(max(min(centroid * 0.3 + bandwidth * 0.3 + zcr * 0.2 + snr * 0.2, 1.0), 0.0), 3)


def compute_valence(features: dict[str, Any], call_type: str) -> float:
    harmonicity = max(min(_safe_float(features.get("harmonicity")), 1.0), 0.0)
    type_valence = {
        "rumble": 0.72,
        "trumpet": 0.5,
        "bark": 0.35,
        "cry": 0.15,
        "roar": 0.1,
        "unknown": 0.5,
    }
    value = harmonicity * 0.6 + type_valence.get(call_type.lower(), 0.5) * 0.4
    return round(max(min(value, 1.0), 0.0), 3)


def _state(arousal: float, valence: float, call_type: str) -> str:
    normalized = call_type.lower()
    if normalized in {"cry"} or (arousal >= 0.65 and valence <= 0.25):
        return "distressed"
    if normalized in {"roar"} or (arousal >= 0.65 and valence <= 0.45):
        return "aggressive"
    if arousal >= 0.45:
        return "alert"
    if valence >= 0.65:
        return "calm"
    if valence >= 0.45:
        return "social"
    return "neutral"


def classify_emotion(features: dict[str, Any], call_type: str, confidence: float) -> dict[str, Any]:
    arousal = compute_arousal(features)
    valence = compute_valence(features, call_type)
    state = _state(arousal, valence, call_type)
    certainty = round(max(min((confidence * 0.65) + (abs(valence - 0.5) * 0.35), 1.0), 0.0), 3)
    descriptions = {
        "calm": "Low-arousal contact call estimate.",
        "social": "Moderate-valence social/contact estimate.",
        "alert": "Elevated arousal estimate from brighter or broader-band acoustics.",
        "aggressive": "High-arousal, lower-valence alarm/aggression estimate.",
        "distressed": "High-arousal distress estimate.",
        "neutral": "No strong emotional estimate.",
    }
    return {
        "state": state,
        "arousal": arousal,
        "valence": valence,
        "confidence": certainty,
        "color": STATE_COLORS[state],
        "description": descriptions[state],
    }


def build_emotion_timeline(
    calls: list[dict[str, Any]],
    recording_duration_ms: float,
    *,
    resolution_ms: float = 500.0,
) -> dict[str, Any]:
    duration = max(float(recording_duration_ms or 0.0), resolution_ms)
    resolution = max(float(resolution_ms), 100.0)
    estimates = []
    for call in calls:
        estimate = classify_emotion(
            call.get("acoustic_features") or {},
            str(call.get("call_type") or "unknown"),
            _safe_float(call.get("confidence")),
        )
        estimates.append({
            "call_id": call.get("id"),
            "call_type": call.get("call_type"),
            "start_ms": _safe_float(call.get("start_ms")),
            "end_ms": _safe_float(call.get("start_ms")) + _safe_float(call.get("duration_ms")),
            **estimate,
        })

    timeline = []
    time_ms = 0.0
    while time_ms <= duration:
        active = next((item for item in estimates if item["start_ms"] <= time_ms <= item["end_ms"]), None)
        if active:
            timeline.append({
                "time_ms": round(time_ms, 2),
                "state": active["state"],
                "arousal": active["arousal"],
                "valence": active["valence"],
                "color": active["color"],
                "call_id": active["call_id"],
            })
        else:
            timeline.append({
                "time_ms": round(time_ms, 2),
                "state": "neutral",
                "arousal": 0.0,
                "valence": 0.5,
                "color": STATE_COLORS["neutral"],
                "call_id": None,
            })
        time_ms += resolution

    state_counts = Counter(item["state"] for item in timeline)
    total = max(len(timeline), 1)
    arousal_avg = sum(float(item["arousal"]) for item in timeline) / total
    valence_avg = sum(float(item["valence"]) for item in timeline) / total
    dominant = state_counts.most_common(1)[0][0] if state_counts else "neutral"
    return {
        "duration_ms": duration,
        "resolution_ms": resolution,
        "timeline": timeline,
        "call_emotions": estimates,
        "recording_summary": {
            "dominant_state": dominant,
            "arousal_avg": round(arousal_avg, 3),
            "valence_avg": round(valence_avg, 3),
            "state_distribution": {state: round(count / total, 3) for state, count in state_counts.items()},
        },
    }
