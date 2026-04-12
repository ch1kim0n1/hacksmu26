"""Call sequence and recurring motif analysis."""

from __future__ import annotations

import hashlib
from collections import Counter, defaultdict
from typing import Any


def _pattern_id(motif: list[str]) -> str:
    digest = hashlib.sha1("|".join(motif).encode("utf-8")).hexdigest()[:10]
    return f"pat-{digest}"


def extract_sequences(calls: list[dict[str, Any]], *, max_gap_ms: float = 5000.0) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for call in calls:
        grouped[str(call.get("recording_id") or "unknown")].append(call)

    sequences: list[dict[str, Any]] = []
    for recording_id, recording_calls in grouped.items():
        ordered = sorted(recording_calls, key=lambda call: float(call.get("start_ms") or 0.0))
        current: list[dict[str, Any]] = []
        for call in ordered:
            if current:
                prev = current[-1]
                prev_end = float(prev.get("start_ms") or 0.0) + float(prev.get("duration_ms") or 0.0)
                gap = float(call.get("start_ms") or 0.0) - prev_end
                if gap > max_gap_ms:
                    sequences.append(_build_sequence(recording_id, current, len(sequences)))
                    current = []
            current.append(call)
        if current:
            sequences.append(_build_sequence(recording_id, current, len(sequences)))
    return sequences


def _build_sequence(recording_id: str, calls: list[dict[str, Any]], index: int) -> dict[str, Any]:
    call_ids = [str(call.get("id")) for call in calls]
    motif = [str(call.get("call_type") or "unknown") for call in calls]
    gaps = []
    for left, right in zip(calls, calls[1:]):
        left_end = float(left.get("start_ms") or 0.0) + float(left.get("duration_ms") or 0.0)
        gaps.append(round(max(float(right.get("start_ms") or 0.0) - left_end, 0.0), 2))
    start = float(calls[0].get("start_ms") or 0.0)
    end = float(calls[-1].get("start_ms") or 0.0) + float(calls[-1].get("duration_ms") or 0.0)
    sequence_id = f"{recording_id}-seq-{index}"
    for position, call in enumerate(calls):
        call["sequence_id"] = sequence_id
        call["sequence_position"] = position
    return {
        "id": sequence_id,
        "recording_id": recording_id,
        "calls": call_ids,
        "pattern": " -> ".join(motif),
        "motif": motif,
        "total_duration_ms": round(max(end - start, 0.0), 2),
        "inter_call_gaps_ms": gaps,
    }


def find_recurring_patterns(
    sequences: list[dict[str, Any]],
    *,
    min_occurrences: int = 2,
    min_length: int = 2,
    max_length: int = 4,
) -> list[dict[str, Any]]:
    instances: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for sequence in sequences:
        motif = list(sequence.get("motif") or [])
        for size in range(min_length, min(max_length, len(motif)) + 1):
            for start in range(0, len(motif) - size + 1):
                key = tuple(motif[start : start + size])
                instances[key].append(sequence)

    patterns = []
    for motif, occurrences in instances.items():
        if len(occurrences) < min_occurrences:
            continue
        gaps = [
            gap
            for sequence in occurrences
            for gap in sequence.get("inter_call_gaps_ms", [])
        ]
        patterns.append({
            "pattern_id": _pattern_id(list(motif)),
            "motif": list(motif),
            "pattern": " -> ".join(motif),
            "occurrences": len(occurrences),
            "recordings": sorted({str(sequence.get("recording_id")) for sequence in occurrences}),
            "avg_gap_ms": round(sum(gaps) / len(gaps), 2) if gaps else 0.0,
            "contexts": Counter(sequence.get("pattern", "") for sequence in occurrences).most_common(3),
        })
    patterns.sort(key=lambda item: (item["occurrences"], len(item["motif"])), reverse=True)
    return patterns
