"""Recording-site noise profile aggregation."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from typing import Any

import numpy as np


def _parse_hour(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).hour
    except ValueError:
        return None


def _recording_time(recording: dict[str, Any]) -> str | None:
    metadata = recording.get("metadata") or {}
    return metadata.get("recorded_at") or metadata.get("date") or recording.get("uploaded_at")


def list_sites(recordings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    for recording in recordings:
        location = (recording.get("metadata") or {}).get("location")
        if location:
            counts[str(location)] += 1
    return [{"location": location, "recording_count": count} for location, count in sorted(counts.items())]


def build_site_profile(recordings: list[dict[str, Any]], location: str) -> dict[str, Any]:
    selected = [
        recording
        for recording in recordings
        if str((recording.get("metadata") or {}).get("location") or "").lower() == location.lower()
    ]
    noise_counts: Counter[str] = Counter()
    ranges: dict[str, list[tuple[float, float]]] = defaultdict(list)
    energies: dict[str, list[float]] = defaultdict(list)
    temporal: dict[str, Counter[int]] = defaultdict(Counter)
    dates: list[str] = []
    floor_values: list[float] = []

    for recording in selected:
        result = recording.get("result") or {}
        quality = result.get("quality") or {}
        if quality.get("snr_before_db") is not None:
            floor_values.append(float(quality["snr_before_db"]))
        recorded_at = _recording_time(recording)
        if recorded_at:
            dates.append(str(recorded_at)[:10])
        hour = _parse_hour(recorded_at)
        for noise in result.get("noise_types") or []:
            noise_type = str(noise.get("type") or "other")
            noise_counts[noise_type] += 1
            frequency_range = noise.get("frequency_range") or noise.get("frequency_range_hz") or [0.0, 0.0]
            if len(frequency_range) >= 2:
                ranges[noise_type].append((float(frequency_range[0]), float(frequency_range[1])))
            energies[noise_type].append(float(noise.get("percentage") or 0.0))
            if hour is not None:
                temporal[noise_type][hour] += 1

    noise_sources = []
    denominator = max(len(selected), 1)
    for noise_type, count in noise_counts.most_common():
        freq_ranges = ranges.get(noise_type) or [(0.0, 0.0)]
        noise_sources.append({
            "noise_type": noise_type,
            "occurrence_rate": round(count / denominator, 3),
            "avg_frequency_range_hz": (
                round(float(np.mean([low for low, _ in freq_ranges])), 2),
                round(float(np.mean([high for _, high in freq_ranges])), 2),
            ),
            "avg_energy_db": round(float(np.mean(energies.get(noise_type) or [0.0])), 2),
            "temporal_pattern": {str(hour): value for hour, value in sorted(temporal.get(noise_type, {}).items())} or None,
        })

    hourly_noise = Counter()
    for source in noise_sources:
        for hour, count in (source.get("temporal_pattern") or {}).items():
            hourly_noise[int(hour)] += int(count)
    quiet_hours = [hour for hour in range(24) if hourly_noise.get(hour, 0) == min([*hourly_noise.values(), 0])]
    optimal_windows = [
        {
            "start_hour": hour,
            "end_hour": min(hour + 1, 24),
            "avg_noise_db": round(float(np.mean(floor_values)) if floor_values else 0.0, 2),
            "dominant_noise": None,
        }
        for hour in quiet_hours[:3]
    ]

    recommendations = generate_recommendations({
        "location": location,
        "noise_sources": noise_sources,
        "optimal_windows": optimal_windows,
    })
    return {
        "location": location,
        "recordings_analyzed": len(selected),
        "date_range": (min(dates) if dates else None, max(dates) if dates else None),
        "noise_sources": noise_sources,
        "noise_floor_db": round(float(np.mean(floor_values)) if floor_values else 0.0, 2),
        "optimal_windows": optimal_windows,
        "recommendations": recommendations,
    }


def generate_recommendations(profile: dict[str, Any]) -> list[str]:
    recommendations = []
    for source in profile.get("noise_sources") or []:
        if source["occurrence_rate"] >= 0.5:
            recommendations.append(
                f"{source['noise_type']} noise recurs in {int(source['occurrence_rate'] * 100)}% of recordings at this site."
            )
    if profile.get("optimal_windows"):
        first = profile["optimal_windows"][0]
        recommendations.append(f"Best observed recording window: {first['start_hour']:02d}:00-{first['end_hour']:02d}:00.")
    if not recommendations:
        recommendations.append("Not enough recurring noise data yet; collect more recordings from this site.")
    return recommendations


def build_activity_heatmap(
    calls: list[dict[str, Any]],
    *,
    location: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    filtered = []
    for call in calls:
        if location and location.lower() not in str(call.get("location") or "").lower():
            continue
        date_value = str(call.get("date") or "")
        if date_from and date_value and date_value < date_from:
            continue
        if date_to and date_value and date_value > date_to:
            continue
        recorded_at = (call.get("metadata") or {}).get("recorded_at") or date_value
        hour = _parse_hour(recorded_at)
        if hour is None:
            continue
        filtered.append((call, hour))

    call_types = sorted({str(call.get("call_type") or "unknown") for call, _ in filtered}) or ["unknown"]
    matrix = [[0 for _ in range(24)] for _ in call_types]
    index = {call_type: idx for idx, call_type in enumerate(call_types)}
    for call, hour in filtered:
        matrix[index[str(call.get("call_type") or "unknown")]][hour] += 1
    recordings = sorted({str(call.get("recording_id")) for call, _ in filtered if call.get("recording_id")})
    dates = sorted({str(call.get("date")) for call, _ in filtered if call.get("date")})
    return {
        "heatmap": {"hours": list(range(24)), "call_types": call_types, "matrix": matrix},
        "total_calls": len(filtered),
        "recordings_analyzed": len(recordings),
        "date_range": {"from": dates[0] if dates else None, "to": dates[-1] if dates else None},
    }
