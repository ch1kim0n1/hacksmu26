"""Social network analysis from elephant call co-occurrence data."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Safely convert a value to float."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _speaker_id(call: dict[str, Any]) -> str | None:
    """Return the best available stable speaker identifier for a call."""
    for key in ("individual_id", "speaker_id", "cluster_id", "animal_id"):
        value = call.get(key)
        if value and str(value).strip():
            return str(value).strip()

    features = call.get("acoustic_features") or {}
    f0 = call.get("speaker_fundamental_hz") or features.get("fundamental_frequency_hz")
    f0_value = _safe_float(f0, default=0.0)
    if f0_value > 0.0:
        bucket_hz = int(round(f0_value / 5.0) * 5)
        return f"voice_{bucket_hz}hz"

    return "unknown_speaker"


def build_social_network(
    calls: list[dict[str, Any]],
    response_window_ms: float = 10000.0,
) -> dict[str, Any]:
    """Build a social network graph from call data.

    Two individuals are connected if they appear in the same recording.
    Edge weight is based on number of co-occurrences + detected call-response
    pairs.

    Args:
        calls: List of call dicts from CallDatabase.
        response_window_ms: Max gap between calls to count as a call-response
            pair.

    Returns:
        Dictionary with ``nodes``, ``edges``, and ``stats`` keys describing
        the social network.
    """
    if not calls:
        return {
            "nodes": [],
            "edges": [],
            "stats": {
                "total_individuals": 0,
                "total_connections": 0,
                "most_connected": None,
                "avg_connections": 0.0,
            },
        }

    # ------------------------------------------------------------------
    # Step 1: Group calls by individual_id, skipping None / empty
    # ------------------------------------------------------------------
    calls_by_individual: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for call in calls:
        ind_id = _speaker_id(call)
        if not ind_id:
            continue
        calls_by_individual[ind_id].append(call)

    if not calls_by_individual:
        return {
            "nodes": [],
            "edges": [],
            "stats": {
                "total_individuals": 0,
                "total_connections": 0,
                "most_connected": None,
                "avg_connections": 0.0,
            },
        }

    # ------------------------------------------------------------------
    # Step 2: Build node list with per-individual stats
    # ------------------------------------------------------------------
    nodes: list[dict[str, Any]] = []
    for ind_id, ind_calls in sorted(calls_by_individual.items()):
        type_counter: Counter[str] = Counter()
        recordings: set[str] = set()
        locations: set[str] = set()
        dates: set[str] = set()

        for call in ind_calls:
            call_type = call.get("call_type")
            if call_type:
                type_counter[str(call_type)] += 1

            rec_id = call.get("recording_id")
            if rec_id:
                recordings.add(str(rec_id))

            loc = call.get("location")
            if loc:
                locations.add(str(loc))

            date = call.get("date")
            if date:
                dates.add(str(date))

        most_common_type = type_counter.most_common(1)[0][0] if type_counter else "unknown"

        nodes.append({
            "id": ind_id,
            "call_count": len(ind_calls),
            "most_common_type": most_common_type,
            "recordings": sorted(recordings),
            "locations": sorted(locations),
            "dates": sorted(dates),
        })

    # ------------------------------------------------------------------
    # Step 3: For each recording, find co-occurring individuals -> edges
    # ------------------------------------------------------------------
    calls_by_recording: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for call in calls:
        rec_id = call.get("recording_id")
        if _speaker_id(call) and rec_id:
            calls_by_recording[str(rec_id)].append(call)

    # Shared recording counts between pairs
    shared_recordings: dict[tuple[str, str], set[str]] = defaultdict(set)
    for rec_id, rec_calls in calls_by_recording.items():
        individuals_in_recording: set[str] = set()
        for call in rec_calls:
            ind_id = _speaker_id(call)
            if ind_id:
                individuals_in_recording.add(ind_id)

        sorted_individuals = sorted(individuals_in_recording)
        for i in range(len(sorted_individuals)):
            for j in range(i + 1, len(sorted_individuals)):
                pair = (sorted_individuals[i], sorted_individuals[j])
                shared_recordings[pair].add(rec_id)

    # ------------------------------------------------------------------
    # Step 4: Count call-response pairs within each recording
    # ------------------------------------------------------------------
    call_response_counts: dict[tuple[str, str], int] = defaultdict(int)

    for rec_id, rec_calls in calls_by_recording.items():
        # Only consider calls with valid individual_id and timing
        timed_calls = []
        for call in rec_calls:
            ind_id = _speaker_id(call)
            if not ind_id:
                continue
            start = _safe_float(call.get("start_ms"))
            duration = _safe_float(call.get("duration_ms"))
            timed_calls.append({
                "individual_id": ind_id,
                "start_ms": start,
                "end_ms": start + duration,
            })

        # Sort by start time
        timed_calls.sort(key=lambda c: c["start_ms"])

        # For each consecutive pair of calls from different individuals,
        # check if the gap is within the response window.
        for i in range(len(timed_calls) - 1):
            call_a = timed_calls[i]
            # Look forward for potential responses
            for j in range(i + 1, len(timed_calls)):
                call_b = timed_calls[j]
                if call_b["individual_id"] == call_a["individual_id"]:
                    continue
                gap = call_b["start_ms"] - call_a["end_ms"]
                if gap < 0:
                    # Overlapping calls -- still a co-occurrence but not a
                    # call-response pair in the sequential sense.
                    continue
                if gap > response_window_ms:
                    # Past the window; no point checking further calls since
                    # they are sorted by start time.
                    break
                # Valid call-response pair
                pair = tuple(sorted([call_a["individual_id"], call_b["individual_id"]]))
                call_response_counts[pair] += 1

    # ------------------------------------------------------------------
    # Step 5: Build edge list with raw weights
    # ------------------------------------------------------------------
    all_pairs = set(shared_recordings.keys()) | set(call_response_counts.keys())

    raw_edges: list[dict[str, Any]] = []
    max_raw_weight = 0.0

    for pair in sorted(all_pairs):
        source, target = pair
        sr_count = len(shared_recordings.get(pair, set()))
        cr_count = call_response_counts.get(pair, 0)
        raw_weight = float(sr_count) + float(cr_count) * 0.5
        if raw_weight > max_raw_weight:
            max_raw_weight = raw_weight
        raw_edges.append({
            "source": source,
            "target": target,
            "shared_recordings": sr_count,
            "call_response_pairs": cr_count,
            "raw_weight": raw_weight,
        })

    # ------------------------------------------------------------------
    # Step 6: Normalize weights to 0-1
    # ------------------------------------------------------------------
    edges: list[dict[str, Any]] = []
    for edge in raw_edges:
        weight = edge["raw_weight"] / max_raw_weight if max_raw_weight > 0 else 0.0
        edges.append({
            "source": edge["source"],
            "target": edge["target"],
            "shared_recordings": edge["shared_recordings"],
            "call_response_pairs": edge["call_response_pairs"],
            "weight": round(weight, 4),
        })

    # ------------------------------------------------------------------
    # Step 7: Compute stats
    # ------------------------------------------------------------------
    connection_counts: Counter[str] = Counter()
    for edge in edges:
        connection_counts[edge["source"]] += 1
        connection_counts[edge["target"]] += 1

    total_individuals = len(nodes)
    total_connections = len(edges)

    if connection_counts:
        most_connected = connection_counts.most_common(1)[0][0]
    else:
        # No connections -- pick the individual with the most calls
        most_connected = nodes[0]["id"] if nodes else None

    # Average connections per individual (only over individuals that exist)
    avg_connections = (
        sum(connection_counts.values()) / total_individuals
        if total_individuals > 0
        else 0.0
    )

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "total_individuals": total_individuals,
            "total_connections": total_connections,
            "most_connected": most_connected,
            "avg_connections": round(avg_connections, 2),
        },
    }


def get_conversation_data(
    calls: list[dict[str, Any]],
    recording_id: str,
    response_window_ms: float = 10000.0,
) -> dict[str, Any]:
    """Get conversation-style data for a specific recording.

    Filters the call list to a single recording, identifies speakers,
    sorts vocalizations chronologically, and detects call-response pairs.

    Args:
        calls: List of call dicts from CallDatabase.
        recording_id: The recording to extract conversation data for.
        response_window_ms: Max gap between calls to count as a response.

    Returns:
        Dictionary with ``recording_id``, ``speakers``, ``calls``,
        ``response_pairs``, ``total_exchanges``, and
        ``longest_sequence_length``.
    """
    empty_result: dict[str, Any] = {
        "recording_id": recording_id,
        "speakers": [],
        "calls": [],
        "response_pairs": [],
        "total_exchanges": 0,
        "longest_sequence_length": 0,
    }

    # ------------------------------------------------------------------
    # Filter calls to this recording
    # ------------------------------------------------------------------
    rec_calls = [
        c for c in calls
        if c.get("recording_id") == recording_id
    ]
    if not rec_calls:
        return empty_result

    # ------------------------------------------------------------------
    # Group by speaker (individual_id) -- skip unknown/empty
    # ------------------------------------------------------------------
    speaker_calls: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for call in rec_calls:
        ind_id = _speaker_id(call)
        if ind_id:
            speaker_calls[ind_id].append(call)

    speakers: list[dict[str, Any]] = []
    for speaker_id, sp_calls in sorted(speaker_calls.items()):
        type_counter: Counter[str] = Counter()
        for call in sp_calls:
            ct = call.get("call_type")
            if ct:
                type_counter[str(ct)] += 1
        dominant_type = type_counter.most_common(1)[0][0] if type_counter else "unknown"
        speakers.append({
            "id": speaker_id,
            "call_count": len(sp_calls),
            "dominant_type": dominant_type,
        })

    # ------------------------------------------------------------------
    # Build sorted call list (only calls with known speakers)
    # ------------------------------------------------------------------
    identified_calls = [
        c for c in rec_calls
        if _speaker_id(c)
    ]
    identified_calls.sort(key=lambda c: _safe_float(c.get("start_ms")))

    sorted_calls: list[dict[str, Any]] = []
    for call in identified_calls:
        sorted_calls.append({
            "call_id": call.get("id", ""),
            "speaker_id": _speaker_id(call) or "unknown_speaker",
            "start_ms": _safe_float(call.get("start_ms")),
            "duration_ms": _safe_float(call.get("duration_ms")),
            "call_type": str(call.get("call_type") or "unknown"),
            "confidence": _safe_float(call.get("confidence")),
        })

    if not sorted_calls:
        return empty_result

    # ------------------------------------------------------------------
    # Detect response pairs: sequential calls from different individuals
    # within the response window
    # ------------------------------------------------------------------
    response_pairs: list[dict[str, Any]] = []

    for i in range(len(sorted_calls) - 1):
        call_a = sorted_calls[i]
        end_a = call_a["start_ms"] + call_a["duration_ms"]

        for j in range(i + 1, len(sorted_calls)):
            call_b = sorted_calls[j]
            if call_b["speaker_id"] == call_a["speaker_id"]:
                continue
            gap = call_b["start_ms"] - end_a
            if gap < 0:
                # Overlapping -- skip for response-pair detection
                continue
            if gap > response_window_ms:
                break
            response_pairs.append({
                "call_id": call_a["call_id"],
                "response_id": call_b["call_id"],
                "gap_ms": round(gap, 2),
                "speaker_a": call_a["speaker_id"],
                "speaker_b": call_b["speaker_id"],
            })
            # Only count the first valid response for each initiating call
            break

    # ------------------------------------------------------------------
    # Compute longest back-and-forth sequence length
    # ------------------------------------------------------------------
    longest_sequence = 0
    if response_pairs:
        # Build a chain: starting from each response pair, follow
        # response_id -> next pair's call_id links.
        response_map: dict[str, dict[str, Any]] = {}
        for pair in response_pairs:
            response_map[pair["call_id"]] = pair

        # Find all chain starts (call_ids that are not themselves responses)
        response_ids = {p["response_id"] for p in response_pairs}
        chain_starts = [
            p["call_id"] for p in response_pairs
            if p["call_id"] not in response_ids
        ]
        # If every call is a response to something, start from each pair
        if not chain_starts:
            chain_starts = [p["call_id"] for p in response_pairs]

        for start_id in chain_starts:
            length = 1  # The initiating call
            current_id = start_id
            while current_id in response_map:
                length += 1  # Count the response
                current_id = response_map[current_id]["response_id"]
            if length > longest_sequence:
                longest_sequence = length

    return {
        "recording_id": recording_id,
        "speakers": speakers,
        "calls": sorted_calls,
        "response_pairs": response_pairs,
        "total_exchanges": len(response_pairs),
        "longest_sequence_length": longest_sequence,
    }
