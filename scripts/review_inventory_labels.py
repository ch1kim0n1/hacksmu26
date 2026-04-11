"""Review inventory labels and generate trusted/inferred status artifacts.

Outputs:
- data/analysis/audio_inventory_review.csv
- data/analysis/audio_inventory_review.json
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
INVENTORY_PATH = PROJECT_ROOT / "data" / "analysis" / "audio_inventory.csv"
REVIEW_CSV = PROJECT_ROOT / "data" / "analysis" / "audio_inventory_review.csv"
REVIEW_JSON = PROJECT_ROOT / "data" / "analysis" / "audio_inventory_review.json"

TRUSTED_FIELDS = [
    "call_id",
    "filename",
    "animal_id",
    "duration_s",
    "sample_rate",
    "channels",
    "noise_type_ref",
]

INFERRED_FIELDS = [
    "classifier_primary_noise",
    "classifier_confidence",
    "call_type",
    "call_type_confidence",
    "fundamental_frequency_hz",
    "harmonicity",
    "harmonic_count",
    "bandwidth_hz",
    "spectral_centroid_hz",
    "snr_db",
]


def _split_noise_labels(label: str) -> set[str]:
    parts = [item.strip().lower() for item in label.replace("_", "+").split("+")]
    return {item for item in parts if item}


def _review_row(row: dict[str, str]) -> dict[str, Any]:
    reference_label = (row.get("noise_type_ref") or "").strip().lower()
    classifier_label = (row.get("classifier_primary_noise") or "").strip().lower()
    reference_parts = _split_noise_labels(reference_label)
    mixed_reference = len(reference_parts) > 1
    classifier_matches = classifier_label in reference_parts if classifier_label else False

    if not reference_label:
        status = "manual_review"
        note = "Missing reference noise label"
    elif classifier_matches:
        status = "trusted"
        note = "Classifier agrees with reference"
    elif mixed_reference:
        status = "review_mixed"
        note = "Mixed reference label; classifier captured one component or disagreed"
    else:
        status = "review_classifier_mismatch"
        note = "Classifier disagrees with filename-derived reference"

    metadata_update_required = False
    suggested_noise_type = reference_label

    return {
        "call_id": row.get("call_id", ""),
        "filename": row.get("filename", ""),
        "animal_id": row.get("animal_id", ""),
        "noise_type_ref": row.get("noise_type_ref", ""),
        "classifier_primary_noise": row.get("classifier_primary_noise", ""),
        "call_type": row.get("call_type", ""),
        "label_status": status,
        "mixed_reference_label": str(mixed_reference).lower(),
        "classifier_matches_reference": str(classifier_matches).lower(),
        "suggested_noise_type": suggested_noise_type,
        "metadata_update_required": str(metadata_update_required).lower(),
        "review_note": note,
    }


def main() -> None:
    if not INVENTORY_PATH.exists():
        raise SystemExit(f"Inventory CSV not found: {INVENTORY_PATH}")

    with INVENTORY_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)

    reviewed = [_review_row(row) for row in rows]

    REVIEW_CSV.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "call_id",
        "filename",
        "animal_id",
        "noise_type_ref",
        "classifier_primary_noise",
        "call_type",
        "label_status",
        "mixed_reference_label",
        "classifier_matches_reference",
        "suggested_noise_type",
        "metadata_update_required",
        "review_note",
    ]
    with REVIEW_CSV.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(reviewed)

    summary_counts: dict[str, int] = {}
    for row in reviewed:
        status = row["label_status"]
        summary_counts[status] = summary_counts.get(status, 0) + 1

    review_report = {
        "inventory_file": str(INVENTORY_PATH.relative_to(PROJECT_ROOT)),
        "review_file": str(REVIEW_CSV.relative_to(PROJECT_ROOT)),
        "total_rows": len(reviewed),
        "status_counts": summary_counts,
        "trusted_fields": TRUSTED_FIELDS,
        "inferred_fields": INFERRED_FIELDS,
        "metadata_corrections_required": [
            row
            for row in reviewed
            if row["metadata_update_required"] == "true"
        ],
        "notes": "Filename-derived reference labels are kept as canonical; classifier disagreement is flagged for manual review.",
    }

    REVIEW_JSON.write_text(json.dumps(review_report, indent=2), encoding="utf-8")

    print(f"Wrote {REVIEW_CSV}")
    print(f"Wrote {REVIEW_JSON}")
    print(json.dumps(summary_counts, indent=2))


if __name__ == "__main__":
    main()
