"""Acoustic fingerprinting for individual elephant identification."""

from __future__ import annotations

import hashlib
from typing import Any

import numpy as np


def voice_signature(call: dict[str, Any]) -> list[float]:
    features = call.get("acoustic_features") or {}
    mfcc = list(features.get("mfcc", []))[:12]
    mfcc.extend([0.0] * (12 - len(mfcc)))
    f0 = float(features.get("fundamental_frequency_hz") or 0.0)
    centroid = float(features.get("spectral_centroid_hz") or 0.0)
    bandwidth = float(features.get("bandwidth_hz") or 0.0)
    harmonicity = float(features.get("harmonicity") or 0.0)
    return [float(value) for value in [*mfcc, centroid, f0, bandwidth, harmonicity]]


def _stable_individual_id(centroid: np.ndarray) -> str:
    rounded = ",".join(f"{value:.3f}" for value in centroid.tolist())
    digest = hashlib.sha1(rounded.encode("utf-8")).hexdigest()[:8].upper()
    return f"EL-{digest}"


class IndividualIdentifier:
    def __init__(self, eps: float = 0.35, min_samples: int = 1) -> None:
        self.eps = eps
        self.min_samples = min_samples

    def cluster(self, calls: list[dict[str, Any]]) -> dict[str, str]:
        if not calls:
            return {}
        signatures = np.asarray([voice_signature(call) for call in calls], dtype=np.float32)
        std = np.std(signatures, axis=0)
        normalized = (signatures - np.mean(signatures, axis=0)) / np.maximum(std, 1e-6)
        try:
            from sklearn.cluster import DBSCAN

            labels = DBSCAN(eps=self.eps, min_samples=self.min_samples).fit_predict(normalized)
        except Exception:
            labels = np.zeros(len(calls), dtype=int)
        assignments: dict[str, str] = {}
        for label in sorted(set(int(value) for value in labels)):
            indices = np.where(labels == label)[0]
            if label < 0:
                for index in indices:
                    assignments[str(calls[index].get("id", ""))] = _stable_individual_id(normalized[index])
                continue
            centroid = np.mean(normalized[indices], axis=0)
            individual_id = _stable_individual_id(centroid)
            for index in indices:
                assignments[str(calls[index].get("id", ""))] = individual_id
        return assignments

    def profiles(self, calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
        assignments = self.cluster(calls)
        grouped: dict[str, list[dict[str, Any]]] = {}
        for call in calls:
            individual_id = assignments.get(str(call.get("id", "")))
            if not individual_id:
                continue
            grouped.setdefault(individual_id, []).append(call)
        profiles = []
        for individual_id, group in sorted(grouped.items()):
            signatures = np.asarray([voice_signature(call) for call in group], dtype=np.float32)
            dates = sorted({str(call.get("date")) for call in group if call.get("date")})
            recording_ids = sorted({str(call.get("recording_id")) for call in group if call.get("recording_id")})
            profiles.append({
                "individual_id": individual_id,
                "call_count": len(group),
                "call_ids": [str(call.get("id")) for call in group],
                "recording_ids": recording_ids,
                "dates": dates,
                "signature_mean": [round(float(value), 6) for value in np.mean(signatures, axis=0).tolist()],
                "signature_std": [round(float(value), 6) for value in np.std(signatures, axis=0).tolist()],
            })
        return profiles
