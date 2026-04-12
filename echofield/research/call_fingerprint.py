"""Dense acoustic fingerprints for call similarity search."""

from __future__ import annotations

import hashlib
from typing import Any

import numpy as np

FINGERPRINT_VERSION = "v1"
FINGERPRINT_DIM = 75


def _safe_float(value: Any) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return 0.0
    return result if np.isfinite(result) else 0.0


def _pad(values: list[float], size: int) -> list[float]:
    return [*values[:size], *([0.0] * max(size - len(values), 0))]


def _normalize(values: list[float]) -> list[float]:
    vector = np.asarray(_pad(values, FINGERPRINT_DIM), dtype=np.float32)
    norm = float(np.linalg.norm(vector))
    if norm <= 1e-8:
        return vector.tolist()
    return (vector / norm).astype(np.float32).tolist()


def fingerprint_id(vector: list[float]) -> str:
    rounded = ",".join(f"{value:.5f}" for value in vector)
    return hashlib.sha1(rounded.encode("utf-8")).hexdigest()[:12]


def fingerprint_from_features(features: dict[str, Any]) -> list[float]:
    mfcc = [_safe_float(value) for value in (features.get("mfcc") or [])]
    mfcc_delta = [_safe_float(value) for value in (features.get("mfcc_delta") or [])]
    mfcc_delta2 = [_safe_float(value) for value in (features.get("mfcc_delta2") or [])]
    formants = [_safe_float(value) for value in (features.get("formants_hz") or [])]
    contour = [_safe_float(value) for value in (features.get("frequency_contour_hz") or [])]
    if contour:
        x = np.arange(len(contour), dtype=np.float32)
        slope = float(np.polyfit(x, np.asarray(contour, dtype=np.float32), 1)[0]) if len(contour) > 1 else 0.0
        contour_stats = [
            float(np.mean(contour)),
            float(np.std(contour)),
            slope,
            float(np.max(contour) - np.min(contour)),
            float(np.median(contour)),
        ]
    else:
        contour_stats = [0.0] * 5

    base_metrics = [
        "fundamental_frequency_hz",
        "harmonicity",
        "harmonic_count",
        "bandwidth_hz",
        "spectral_centroid_hz",
        "spectral_rolloff_hz",
        "zero_crossing_rate",
        "snr_db",
        "duration_s",
        "below_100hz",
        "above_100hz",
        "spectral_entropy",
    ]
    values = [
        *_pad(mfcc, 13),
        *([0.0] * 13),
        *_pad(mfcc_delta, 13),
        *_pad(mfcc_delta2, 13),
        *_pad(formants, 6),
        *contour_stats,
        *[_safe_float(features.get(key)) for key in base_metrics],
        *_pad([_safe_float(value) for value in (features.get("spectral_contrast") or [])], 5),
    ]
    return _normalize(values)


def compute_fingerprint(y: np.ndarray, sr: int) -> dict[str, Any]:
    import librosa

    if y.size == 0 or sr <= 0:
        vector = [0.0] * FINGERPRINT_DIM
        return {"fingerprint": vector, "version": FINGERPRINT_VERSION, "id": fingerprint_id(vector)}

    signal = np.asarray(y, dtype=np.float32)
    mfcc = librosa.feature.mfcc(y=signal, sr=sr, n_mfcc=13)
    delta = librosa.feature.delta(mfcc)
    contrast = librosa.feature.spectral_contrast(y=signal, sr=sr)
    features = {
        "mfcc": np.mean(mfcc, axis=1).tolist(),
        "mfcc_delta": np.mean(delta, axis=1).tolist(),
        "spectral_contrast": np.mean(contrast, axis=1).tolist(),
        "spectral_centroid_hz": float(np.mean(librosa.feature.spectral_centroid(y=signal, sr=sr))),
        "spectral_rolloff_hz": float(np.mean(librosa.feature.spectral_rolloff(y=signal, sr=sr))),
        "zero_crossing_rate": float(np.mean(librosa.feature.zero_crossing_rate(signal))),
        "duration_s": float(len(signal) / sr),
    }
    vector = fingerprint_from_features(features)
    return {"fingerprint": vector, "version": FINGERPRINT_VERSION, "id": fingerprint_id(vector)}


def ensure_call_fingerprint(call: dict[str, Any]) -> dict[str, Any]:
    if call.get("fingerprint"):
        call.setdefault("fingerprint_version", FINGERPRINT_VERSION)
        return call
    vector = fingerprint_from_features(call.get("acoustic_features") or {})
    call["fingerprint"] = vector
    call["fingerprint_version"] = FINGERPRINT_VERSION
    return call


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denom <= 1e-8:
        return 0.0
    return float(np.dot(va, vb) / denom)


def top_k_similar(calls: list[dict[str, Any]], call_id: str, *, k: int = 10) -> list[dict[str, Any]]:
    enriched = [ensure_call_fingerprint(dict(call)) for call in calls]
    target = next((call for call in enriched if call.get("id") == call_id), None)
    if target is None:
        return []
    matches = []
    for call in enriched:
        if call.get("id") == call_id:
            continue
        matches.append({
            "call_id": call.get("id"),
            "recording_id": call.get("recording_id"),
            "call_type": call.get("call_type", "unknown"),
            "similarity": round(cosine_similarity(target["fingerprint"], call["fingerprint"]), 4),
        })
    matches.sort(key=lambda item: item["similarity"], reverse=True)
    return matches[:k]
