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
import numpy as np
import soundfile as sf
from matplotlib.backends.backend_pdf import PdfPages


def _flatten_calls(recordings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for recording in recordings:
        metadata = recording.get("metadata") or {}
        result = recording.get("result") or {}
        for call in result.get("calls", []):
            features = call.get("acoustic_features") or {}
            annotations = call.get("annotations") or []
            tags = sorted({
                str(tag)
                for annotation in annotations
                for tag in annotation.get("tags", [])
                if str(tag).strip()
            })
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
                    "individual_id": call.get("individual_id"),
                    "review_label": call.get("review_label"),
                    "tags": json.dumps(tags),
                    "annotations": json.dumps(annotations),
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
        "individual_id",
        "review_label",
        "tags",
        "annotations",
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

        if len(rows) >= 3:
            for recording in recordings:
                result = recording.get("result") or {}
                comparison_path = result.get("comparison_spectrogram_path")
                before_path = result.get("spectrogram_before_path")
                after_path = result.get("spectrogram_after_path")
                try:
                    if comparison_path and Path(comparison_path).exists():
                        image = plt.imread(comparison_path)
                        fig, ax = plt.subplots(figsize=(11.69, 8.27), dpi=300)
                        ax.imshow(image)
                        ax.axis("off")
                        ax.set_title(f"Before/After Spectrogram: {recording.get('filename') or recording.get('id')}")
                        fig.tight_layout()
                        pdf.savefig(fig)
                        plt.close(fig)
                        break
                    if before_path and after_path and Path(before_path).exists() and Path(after_path).exists():
                        fig, axes = plt.subplots(1, 2, figsize=(11.69, 8.27), dpi=300)
                        for axis, path, title in (
                            (axes[0], before_path, "Before"),
                            (axes[1], after_path, "After"),
                        ):
                            axis.imshow(plt.imread(path))
                            axis.axis("off")
                            axis.set_title(title)
                        fig.suptitle(f"Before/After Spectrogram: {recording.get('filename') or recording.get('id')}")
                        fig.tight_layout()
                        pdf.savefig(fig)
                        plt.close(fig)
                        break
                except Exception:
                    continue

            f0_values = [float(row["fundamental_frequency_hz"]) for row in rows if row.get("fundamental_frequency_hz") not in {None, ""}]
            if f0_values:
                fig, ax = plt.subplots(figsize=(11.69, 8.27), dpi=300)
                ax.hist(f0_values, bins=min(20, max(len(f0_values) // 2, 3)), color="#2A7A78", edgecolor="black")
                ax.set_title("Fundamental Frequency Distribution")
                ax.set_xlabel("Fundamental frequency (Hz)")
                ax.set_ylabel("Call count")
                fig.tight_layout()
                pdf.savefig(fig)
                plt.close(fig)

            type_counts: dict[str, int] = {}
            for row in rows:
                call_type = str(row.get("call_type") or "unknown")
                type_counts[call_type] = type_counts.get(call_type, 0) + 1
            if type_counts:
                fig, ax = plt.subplots(figsize=(11.69, 8.27), dpi=300)
                ax.pie(type_counts.values(), labels=type_counts.keys(), autopct="%1.1f%%")
                ax.set_title("Call Type Distribution")
                fig.tight_layout()
                pdf.savefig(fig)
                plt.close(fig)

            snr_by_recording: dict[str, list[float]] = {}
            for row in rows:
                try:
                    snr_by_recording.setdefault(str(row["recording_id"]), []).append(float(row["snr_db"]))
                except (TypeError, ValueError):
                    continue
            if snr_by_recording:
                labels = list(snr_by_recording)
                values = [float(np.mean(snr_by_recording[label])) for label in labels]
                fig, ax = plt.subplots(figsize=(11.69, 8.27), dpi=300)
                ax.bar(labels, values, color="#7A4E9D")
                ax.set_title("Mean SNR by Recording")
                ax.set_xlabel("Recording")
                ax.set_ylabel("SNR (dB)")
                ax.tick_params(axis="x", rotation=45)
                fig.tight_layout()
                pdf.savefig(fig)
                plt.close(fig)

            durations = [float(row["duration_ms"]) / 1000.0 for row in rows if row.get("duration_ms") not in {None, ""}]
            confidences = [float(row["confidence"]) for row in rows if row.get("confidence") not in {None, ""}]
            if durations and confidences:
                min_len = min(len(durations), len(confidences))
                fig, ax = plt.subplots(figsize=(11.69, 8.27), dpi=300)
                ax.scatter(durations[:min_len], confidences[:min_len], color="#CF5C36", alpha=0.75)
                ax.set_title("Call Duration vs Classifier Confidence")
                ax.set_xlabel("Duration (s)")
                ax.set_ylabel("Confidence")
                ax.set_ylim(0, 1)
                fig.tight_layout()
                pdf.savefig(fig)
                plt.close(fig)

            waveform_figures = 0
            for recording in recordings:
                result = recording.get("result") or {}
                audio_path = result.get("output_audio_path")
                if not audio_path or not Path(audio_path).exists():
                    continue
                try:
                    y, sr = sf.read(audio_path)
                    if getattr(y, "ndim", 1) > 1:
                        y = np.mean(y, axis=1)
                    seconds = np.arange(len(y)) / sr
                    fig, ax = plt.subplots(figsize=(11.69, 3.2), dpi=300)
                    ax.plot(seconds, y, color="#1F2937", linewidth=0.5)
                    ax.set_title(f"Waveform Thumbnail: {recording.get('filename') or recording.get('id')}")
                    ax.set_xlabel("Time (s)")
                    ax.set_ylabel("Amplitude")
                    fig.tight_layout()
                    pdf.savefig(fig)
                    plt.close(fig)
                    waveform_figures += 1
                except Exception:
                    continue
                if waveform_figures >= 10:
                    break
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
