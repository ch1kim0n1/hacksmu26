"""Advanced acoustic analysis utilities."""

from __future__ import annotations

import math
from typing import Any

import librosa
import numpy as np

from echofield.pipeline.feature_extract import classify_call_type, extract_acoustic_features


def track_frequency_contour(y: np.ndarray, sr: int) -> list[float]:
    if y.size == 0:
        return []
    contour = librosa.yin(y, fmin=8, fmax=300, sr=sr)
    contour = np.nan_to_num(contour, nan=0.0, posinf=0.0, neginf=0.0)
    return [round(float(value), 2) for value in contour.tolist()]


def harmonic_to_noise_ratio(y: np.ndarray) -> float:
    if y.size == 0:
        return 0.0
    harmonic, noise = librosa.effects.hpss(y)
    harmonic_energy = float(np.sum(harmonic ** 2))
    noise_energy = max(float(np.sum(noise ** 2)), 1e-8)
    return round(10.0 * math.log10(harmonic_energy / noise_energy), 2)


def build_identity_signature(features: dict[str, Any]) -> list[float]:
    formants = list(features.get("formant_peaks_hz", []))[:3]
    formants += [0.0] * (3 - len(formants))
    return [
        float(features.get("fundamental_frequency_hz", 0.0)),
        float(features.get("harmonicity", 0.0)),
        float(features.get("spectral_centroid_hz", 0.0)),
        *[float(value) for value in formants],
    ]


def acoustic_similarity(signature_a: list[float], signature_b: list[float]) -> float:
    a = np.asarray(signature_a, dtype=np.float32)
    b = np.asarray(signature_b, dtype=np.float32)
    if a.size == 0 or b.size == 0:
        return 0.0
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denominator <= 1e-8:
        return 0.0
    return round(float(np.dot(a, b) / denominator), 3)


def analyze_recording(y: np.ndarray, sr: int, call_id: str) -> dict[str, Any]:
    features = extract_acoustic_features(y, sr)
    call_type = classify_call_type(features)
    contour = track_frequency_contour(y, sr)
    hnr = harmonic_to_noise_ratio(y)
    signature = build_identity_signature(features)
    return {
        "call_id": call_id,
        "features": features,
        "call_type": call_type["call_type"],
        "confidence": call_type["confidence"],
        "frequency_contour_hz": contour,
        "harmonic_to_noise_ratio_db": hnr,
        "identity_signature": signature,
    }


def build_similarity_graph(analyses: list[dict[str, Any]], threshold: float = 0.75) -> dict[str, Any]:
    nodes = [{"id": item["call_id"], "label": item["call_type"]} for item in analyses]
    edges = []
    for index, source in enumerate(analyses):
        for target in analyses[index + 1 :]:
            similarity = acoustic_similarity(
                source["identity_signature"],
                target["identity_signature"],
            )
            if similarity >= threshold:
                edges.append(
                    {
                        "source": source["call_id"],
                        "target": target["call_id"],
                        "weight": similarity,
                    }
                )
    return {"nodes": nodes, "edges": edges}
