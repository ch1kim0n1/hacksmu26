"""Reference rumble library — match calls against ElephantVoices' verified rumbles."""

from __future__ import annotations
import json
import numpy as np
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "reference" / "reference_rumbles.json"
_reference_data: list[dict[str, Any]] | None = None


def _load() -> list[dict[str, Any]]:
    global _reference_data
    if _reference_data is None:
        if _DATA_PATH.exists():
            _reference_data = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
        else:
            _reference_data = []
    return _reference_data


def get_all_references() -> list[dict[str, Any]]:
    """Return all reference rumbles (without fingerprint vectors for API)."""
    refs = []
    for r in _load():
        entry = {k: v for k, v in r.items() if k != "fingerprint"}
        refs.append(entry)
    return refs


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    va = np.asarray(a, dtype=np.float64)
    vb = np.asarray(b, dtype=np.float64)
    norm_a = np.linalg.norm(va)
    norm_b = np.linalg.norm(vb)
    if norm_a < 1e-12 or norm_b < 1e-12:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


def match_against_references(call_fingerprint: list[float], top_k: int = 3) -> list[dict[str, Any]]:
    """Match a call fingerprint against all reference rumbles. Returns top-k matches."""
    references = _load()
    if not references or not call_fingerprint:
        return []

    matches = []
    for ref in references:
        ref_fp = ref.get("fingerprint", [])
        if not ref_fp:
            continue
        # Pad or truncate to match lengths
        min_len = min(len(call_fingerprint), len(ref_fp))
        if min_len < 5:
            continue
        similarity = _cosine_similarity(call_fingerprint[:min_len], ref_fp[:min_len])
        matches.append({
            "rumble_id": ref["id"],
            "label": ref["label"],
            "behavioral_context": ref["behavioral_context"],
            "similarity_score": round(max(similarity, 0.0), 4),
            "fundamental_hz": ref.get("fundamental_hz"),
        })

    matches.sort(key=lambda m: m["similarity_score"], reverse=True)
    return matches[:top_k]


def get_reference_by_id(rumble_id: str) -> dict[str, Any] | None:
    for ref in _load():
        if ref["id"] == rumble_id:
            return {k: v for k, v in ref.items() if k != "fingerprint"}
    return None
