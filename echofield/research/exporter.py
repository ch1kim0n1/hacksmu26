"""Research export helpers for CSV, JSON, ZIP, and PDF outputs."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages


def _flatten_calls(recordings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for recording in recordings:
        metadata = recording.get("metadata") or {}
        result = recording.get("result") or {}
        for call in result.get("calls", []):
            features = call.get("acoustic_features") or {}
            rows.append(
                {
                    "call_id": call.get("id"),
                    "recording_id": recording.get("id"),
                    "call_type": call.get("call_type"),
                    "confidence": call.get("confidence"),
                    "start_ms": call.get("start_ms"),
                    "duration_ms": call.get("duration_ms"),
                    "frequency_min_hz": call.get("frequency_min_hz"),
                    "frequency_max_hz": call.get("frequency_max_hz"),
                    "fundamental_frequency_hz": features.get("fundamental_frequency_hz"),
                    "harmonicity": features.get("harmonicity"),
                    "harmonic_count": features.get("harmonic_count"),
                    "bandwidth_hz": features.get("bandwidth_hz"),
                    "spectral_centroid_hz": features.get("spectral_centroid_hz"),
                    "spectral_rolloff_hz": features.get("spectral_rolloff_hz"),
                    "mfcc": json.dumps(features.get("mfcc", [])),
                    "zero_crossing_rate": features.get("zero_crossing_rate"),
                    "snr_db": features.get("snr_db"),
                    "location": metadata.get("location"),
                    "date": metadata.get("date"),
                    "species": metadata.get("species"),
                }
            )
    return rows


def export_csv(recordings: list[dict[str, Any]]) -> str:
    rows = _flatten_calls(recordings)
    fieldnames = [
        "call_id",
        "recording_id",
        "call_type",
        "confidence",
        "start_ms",
        "duration_ms",
        "frequency_min_hz",
        "frequency_max_hz",
        "fundamental_frequency_hz",
        "harmonicity",
        "harmonic_count",
        "bandwidth_hz",
        "spectral_centroid_hz",
        "spectral_rolloff_hz",
        "mfcc",
        "zero_crossing_rate",
        "snr_db",
        "location",
        "date",
        "species",
    ]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


def export_json(recordings: list[dict[str, Any]]) -> str:
    payload = {
        "export_metadata": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "recording_count": len(recordings),
            "call_count": len(_flatten_calls(recordings)),
            "format_version": "1.0",
        },
        "recordings": recordings,
    }
    return json.dumps(payload, indent=2, default=str)


def export_pdf(recordings: list[dict[str, Any]], destination: str | Path) -> Path:
    destination_path = Path(destination)
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    rows = _flatten_calls(recordings)
    with PdfPages(destination_path) as pdf:
        fig, ax = plt.subplots(figsize=(11.69, 8.27))
        ax.axis("off")
        lines = [
            "EchoField Research Export",
            f"Generated: {datetime.now(timezone.utc).isoformat()}",
            f"Recordings: {len(recordings)}",
            f"Calls: {len(rows)}",
            "",
        ]
        for row in rows[:20]:
            lines.append(
                f"{row['recording_id']} | {row['call_type']} | "
                f"F0={row['fundamental_frequency_hz']} Hz | "
                f"SNR={row['snr_db']} dB"
            )
        ax.text(0.02, 0.98, "\n".join(lines), va="top", family="monospace")
        pdf.savefig(fig)
        plt.close(fig)
    return destination_path


def export_zip(
    recordings: list[dict[str, Any]],
    *,
    processed_dir: str | Path | None = None,
    spectrogram_dir: str | Path | None = None,
    include_audio: bool = True,
    include_spectrograms: bool = True,
) -> io.BytesIO:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("calls.csv", export_csv(recordings))
        archive.writestr("recordings.json", export_json(recordings))
        archive.writestr(
            "metadata.json",
            json.dumps(
                {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "recordings": len(recordings),
                    "calls": len(_flatten_calls(recordings)),
                },
                indent=2,
            ),
        )

        if include_audio and processed_dir:
            for path in Path(processed_dir).glob("*"):
                if path.suffix.lower() in {".wav", ".mp3", ".flac"}:
                    archive.write(path, f"audio/{path.name}")

        if include_spectrograms and spectrogram_dir:
            for path in Path(spectrogram_dir).glob("*"):
                if path.suffix.lower() == ".png":
                    archive.write(path, f"spectrograms/{path.name}")

    buffer.seek(0)
    return buffer
