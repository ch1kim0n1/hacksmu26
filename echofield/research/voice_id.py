"""Individual elephant voice clustering from call fingerprints."""

from __future__ import annotations

import hashlib
from collections import Counter
from typing import Any

import numpy as np

from echofield.research.call_fingerprint import cosine_similarity, ensure_call_fingerprint


def _cluster_id(centroid: np.ndarray) -> str:
    rounded = ",".join(f"{value:.4f}" for value in centroid.tolist())
    digest = hashlib.sha1(rounded.encode("utf-8")).hexdigest()[:8]
    return f"ind-{digest}"


def _profile(group: list[dict[str, Any]]) -> dict[str, Any]:
    features = [call.get("acoustic_features") or {} for call in group]
    keys = ("fundamental_frequency_hz", "harmonicity", "spectral_centroid_hz", "bandwidth_hz")
    return {
        key: round(float(np.mean([float(item.get(key) or 0.0) for item in features])), 4)
        for key in keys
    }


def cluster_individuals(
    calls: list[dict[str, Any]],
    fingerprints: np.ndarray | None = None,
    *,
    method: str = "agglomerative",
    distance_threshold: float = 0.3,
) -> list[dict[str, Any]]:
    if not calls:
        return []
    enriched = [ensure_call_fingerprint(dict(call)) for call in calls]
    matrix = fingerprints if fingerprints is not None else np.asarray([call["fingerprint"] for call in enriched], dtype=np.float32)
    if len(enriched) == 1:
        labels = np.array([0], dtype=int)
    else:
        try:
            from sklearn.cluster import AgglomerativeClustering

            try:
                model = AgglomerativeClustering(
                    n_clusters=None,
                    metric="cosine",
                    linkage="average",
                    distance_threshold=distance_threshold,
                )
            except TypeError:
                model = AgglomerativeClustering(
                    n_clusters=None,
                    affinity="cosine",
                    linkage="average",
                    distance_threshold=distance_threshold,
                )
            labels = model.fit_predict(matrix)
        except Exception:
            labels = np.arange(len(enriched), dtype=int)

    clusters = []
    for label in sorted(set(int(value) for value in labels)):
        indices = np.where(labels == label)[0]
        group = [enriched[index] for index in indices]
        centroid = np.mean(matrix[indices], axis=0)
        centroid_list = centroid.astype(np.float32).tolist()
        intra_scores = [
            cosine_similarity(group[i]["fingerprint"], group[j]["fingerprint"])
            for i in range(len(group))
            for j in range(i + 1, len(group))
        ]
        intra = float(np.mean(intra_scores)) if intra_scores else 1.0
        other_indices = [index for index in range(len(enriched)) if index not in indices]
        if other_indices:
            nearest_other = max(
                cosine_similarity(centroid_list, matrix[index].astype(np.float32).tolist())
                for index in other_indices
            )
            confidence = max(min(intra * (1.0 - max(nearest_other, 0.0) * 0.5), 1.0), 0.0)
        else:
            confidence = intra
        cluster_id = _cluster_id(centroid)
        for call in group:
            call["cluster_id"] = cluster_id
            call["individual_id"] = call.get("individual_id") or cluster_id
        clusters.append({
            "cluster_id": cluster_id,
            "suggested_label": f"Individual {len(clusters) + 1}",
            "call_ids": [str(call.get("id")) for call in group],
            "recording_ids": sorted({str(call.get("recording_id")) for call in group if call.get("recording_id")}),
            "centroid": [round(float(value), 6) for value in centroid_list],
            "confidence": round(float(confidence), 3),
            "acoustic_profile": _profile(group),
            "call_type_distribution": dict(Counter(str(call.get("call_type") or "unknown") for call in group)),
        })
    clusters.sort(key=lambda item: (item["confidence"], len(item["call_ids"])), reverse=True)
    return clusters


def match_across_recordings(
    clusters_by_recording: dict[str, list[dict[str, Any]]],
    *,
    min_similarity: float = 0.85,
) -> list[dict[str, Any]]:
    flattened = [
        (recording_id, cluster)
        for recording_id, clusters in clusters_by_recording.items()
        for cluster in clusters
    ]
    matches = []
    for index, (recording_a, cluster_a) in enumerate(flattened):
        for recording_b, cluster_b in flattened[index + 1 :]:
            if recording_a == recording_b:
                continue
            similarity = cosine_similarity(cluster_a.get("centroid") or [], cluster_b.get("centroid") or [])
            if similarity >= min_similarity:
                matches.append({
                    "individual_a": cluster_a["cluster_id"],
                    "individual_b": cluster_b["cluster_id"],
                    "similarity": round(similarity, 4),
                    "recording_a": recording_a,
                    "recording_b": recording_b,
                })
    matches.sort(key=lambda item: item["similarity"], reverse=True)
    return matches
