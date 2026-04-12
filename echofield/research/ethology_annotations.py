"""Ethology annotation layer — maps call types to behavioral context."""

from __future__ import annotations
import json
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "reference" / "ethology.json"
_ethology_data: dict[str, Any] | None = None


def _load() -> dict[str, Any]:
    global _ethology_data
    if _ethology_data is None:
        if _DATA_PATH.exists():
            _ethology_data = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
        else:
            _ethology_data = {}
    return _ethology_data


def get_annotation(call_type: str) -> dict[str, Any] | None:
    """Return ethology annotation for a call type, or None."""
    data = _load()
    # Normalize: "contact call" -> "contact_call"
    normalized = call_type.lower().replace(" ", "_")
    return data.get(normalized) or data.get(call_type.lower())


def get_all_annotations() -> dict[str, Any]:
    """Return all ethology annotations."""
    return dict(_load())


def annotate_call(call: dict[str, Any]) -> dict[str, Any]:
    """Add ethology annotation to a call dict, returns enriched copy."""
    enriched = dict(call)
    annotation = get_annotation(str(call.get("call_type", "")))
    if annotation:
        enriched["ethology"] = annotation
    return enriched
