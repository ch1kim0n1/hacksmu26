"""Emotional state estimation from elephant acoustic features."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class EmotionEstimate:
    state: str
    arousal: float  # 0 = calm, 1 = agitated
    valence: float  # 0 = negative/distress, 1 = positive/social
    confidence: float
    color: str
    description: str


EMOTION_COLORS = {
    "calm": "#10B981",
    "social": "#14B8A6",
    "alert": "#F59E0B",
    "aggressive": "#F97316",
    "distressed": "#EF4444",
    "neutral": "#4B5563",
}

EMOTION_DESCRIPTIONS = {
    "calm": "Calm, content — low-energy contact vocalization",
    "social": "Social bonding — rhythmic, harmonic communication",
    "alert": "Alert, excited — elevated energy and pitch",
    "aggressive": "Aggressive, alarm — high-energy broad-spectrum call",
    "distressed": "Distressed — high arousal, negative valence",
    "neutral": "Ambient — no active vocalization",
}


def compute_arousal(features: dict[str, Any]) -> float:
    """0 = calm, 1 = highly agitated."""
    centroid = float(features.get("spectral_centroid_hz", 0))
    bandwidth = float(features.get("bandwidth_hz", 0))
    zcr = float(features.get("zero_crossing_rate", 0))
    snr = float(features.get("snr_db", 0))

    centroid_norm = min(centroid / 3000, 1.0)
    bandwidth_norm = min(bandwidth / 5000, 1.0)
    zcr_norm = min(zcr / 0.1, 1.0)
    energy_factor = min(snr / 30, 1.0) if snr > 0 else 0.0

    arousal = centroid_norm * 0.3 + bandwidth_norm * 0.3 + zcr_norm * 0.2 + energy_factor * 0.2
    return round(max(0.0, min(1.0, arousal)), 3)


def compute_valence(features: dict[str, Any], call_type: str) -> float:
    """0 = distress/negative, 1 = positive/social."""
    harmonicity = float(features.get("harmonicity", 0))
    type_valence = {
        "rumble": 0.7,
        "trumpet": 0.5,
        "bark": 0.3,
        "cry": 0.15,
        "roar": 0.1,
        "unknown": 0.5,
    }
    score = harmonicity * 0.6 + type_valence.get(call_type, 0.5) * 0.4
    return round(max(0.0, min(1.0, score)), 3)


def classify_emotion(
    features: dict[str, Any],
    call_type: str,
    confidence: float = 1.0,
) -> EmotionEstimate:
    """Estimate emotional/behavioral state from acoustic features."""
    arousal = compute_arousal(features)
    valence = compute_valence(features, call_type)

    # Map arousal + valence to discrete states
    if arousal < 0.3 and valence > 0.5:
        state = "calm"
    elif arousal < 0.4 and valence > 0.3:
        state = "social"
    elif arousal > 0.7 and valence < 0.3:
        state = "distressed"
    elif arousal > 0.6 and valence < 0.5:
        state = "aggressive"
    elif arousal > 0.4:
        state = "alert"
    else:
        state = "calm"

    # Confidence is lower when arousal and valence are in ambiguous ranges
    ambiguity = 1.0 - abs(arousal - 0.5) * 2
    est_confidence = round(max(0.3, confidence * (1.0 - ambiguity * 0.4)), 3)

    return EmotionEstimate(
        state=state,
        arousal=arousal,
        valence=valence,
        confidence=est_confidence,
        color=EMOTION_COLORS.get(state, EMOTION_COLORS["neutral"]),
        description=EMOTION_DESCRIPTIONS.get(state, ""),
    )


def build_emotion_timeline(
    calls: list[dict[str, Any]],
    recording_duration_ms: float,
    resolution_ms: float = 500,
) -> dict[str, Any]:
    """Build a time-series of emotional state estimates across a recording.

    Returns timeline bins + per-call emotion data + summary.
    """
    num_bins = max(1, int(recording_duration_ms / resolution_ms))
    timeline = []

    # Pre-compute per-call emotions
    call_emotions = []
    for call in calls:
        features = call.get("acoustic_features") or {}
        call_type = call.get("call_type", "unknown")
        confidence = float(call.get("confidence", 0.5))
        emotion = classify_emotion(features, call_type, confidence)
        call_emotions.append({
            "call_id": call.get("id", ""),
            "call_type": call_type,
            "state": emotion.state,
            "arousal": emotion.arousal,
            "valence": emotion.valence,
            "confidence": emotion.confidence,
            "color": emotion.color,
            "description": emotion.description,
        })

    # Build timeline bins
    for bin_idx in range(num_bins):
        bin_start_ms = bin_idx * resolution_ms
        bin_end_ms = bin_start_ms + resolution_ms

        # Find calls overlapping this bin
        overlapping = []
        for i, call in enumerate(calls):
            call_start = float(call.get("start_ms", 0))
            call_end = call_start + float(call.get("duration_ms", 0))
            if call_start < bin_end_ms and call_end > bin_start_ms:
                overlapping.append(call_emotions[i])

        if overlapping:
            # Average the emotions of overlapping calls
            avg_arousal = sum(e["arousal"] for e in overlapping) / len(overlapping)
            avg_valence = sum(e["valence"] for e in overlapping) / len(overlapping)
            # Use the dominant state
            state = overlapping[0]["state"]
            color = overlapping[0]["color"]
        else:
            avg_arousal = 0.0
            avg_valence = 0.5
            state = "neutral"
            color = EMOTION_COLORS["neutral"]

        timeline.append({
            "time_ms": round(bin_start_ms, 1),
            "state": state,
            "arousal": round(avg_arousal, 3),
            "valence": round(avg_valence, 3),
            "color": color,
        })

    # Summary
    state_counts: dict[str, int] = {}
    for ce in call_emotions:
        state_counts[ce["state"]] = state_counts.get(ce["state"], 0) + 1
    total_emotions = len(call_emotions)
    state_distribution = {
        state: round(count / total_emotions, 3)
        for state, count in state_counts.items()
    } if total_emotions > 0 else {}

    dominant_state = max(state_counts, key=state_counts.get) if state_counts else "neutral"
    avg_arousal = sum(ce["arousal"] for ce in call_emotions) / total_emotions if total_emotions else 0.0
    avg_valence = sum(ce["valence"] for ce in call_emotions) / total_emotions if total_emotions else 0.5

    return {
        "duration_ms": recording_duration_ms,
        "resolution_ms": resolution_ms,
        "timeline": timeline,
        "call_emotions": call_emotions,
        "summary": {
            "dominant_state": dominant_state,
            "arousal_avg": round(avg_arousal, 3),
            "valence_avg": round(avg_valence, 3),
            "state_distribution": state_distribution,
        },
    }
