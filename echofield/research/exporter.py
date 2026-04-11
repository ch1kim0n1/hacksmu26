"""Research data export in multiple formats.

Supports exporting elephant call data and recording metadata to CSV,
JSON, and ZIP bundle formats for use in external analysis tools and
research workflows.
"""

import csv
import json
import io
import zipfile
from pathlib import Path
from datetime import datetime, timezone


# Standard CSV column order for call exports
CSV_COLUMNS = [
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
    "spectral_centroid_hz",
    "snr_db",
    "location",
    "date",
]


def _extract_csv_row(call: dict) -> dict[str, str]:
    """Extract a flat row dict from a call record for CSV export.

    Maps nested acoustic_features fields to top-level CSV columns.

    Args:
        call: A call record dictionary.

    Returns:
        Flat dictionary with string values keyed by CSV column names.
    """
    features = call.get("acoustic_features", {})
    return {
        "call_id": str(call.get("id", "")),
        "recording_id": str(call.get("recording_id", "")),
        "call_type": str(call.get("call_type", "")),
        "confidence": str(call.get("confidence", "")),
        "start_ms": str(call.get("start_ms", "")),
        "duration_ms": str(call.get("duration_ms", "")),
        "frequency_min_hz": str(call.get("frequency_min_hz", "")),
        "frequency_max_hz": str(call.get("frequency_max_hz", "")),
        "fundamental_frequency_hz": str(
            features.get("fundamental_frequency_hz", "")
        ),
        "harmonicity": str(features.get("harmonicity", "")),
        "spectral_centroid_hz": str(features.get("spectral_centroid_hz", "")),
        "snr_db": str(features.get("snr_db", "")),
        "location": str(call.get("location", "") or ""),
        "date": str(call.get("date", "") or ""),
    }


def export_csv(calls: list[dict], output: io.StringIO | str | None = None) -> str:
    """Export call records to CSV format.

    Args:
        calls: List of call record dictionaries.
        output: Destination for the CSV data. Can be:
            - io.StringIO: CSV is written to the buffer.
            - str: Treated as a file path; CSV is written to the file.
            - None: CSV is returned as a string only.

    Returns:
        The CSV content as a string.
    """
    string_buffer = io.StringIO()
    writer = csv.DictWriter(string_buffer, fieldnames=CSV_COLUMNS)
    writer.writeheader()

    for call in calls:
        row = _extract_csv_row(call)
        writer.writerow(row)

    csv_content = string_buffer.getvalue()
    string_buffer.close()

    # Write to file if path is provided
    if isinstance(output, str):
        path = Path(output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(csv_content, encoding="utf-8")
    elif isinstance(output, io.StringIO):
        output.write(csv_content)

    return csv_content


def export_json(
    calls: list[dict],
    recordings: list[dict] | None = None,
) -> str:
    """Export call records and optional recording metadata to JSON.

    The output JSON has the structure:
        {
            "export_metadata": {...},
            "calls": [...],
            "recordings": [...]  // only if provided
        }

    Args:
        calls: List of call record dictionaries.
        recordings: Optional list of recording metadata dictionaries.

    Returns:
        JSON string with export data.
    """
    export_data: dict = {
        "export_metadata": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "total_calls": len(calls),
            "format_version": "1.0",
        },
        "calls": calls,
    }

    if recordings is not None:
        export_data["export_metadata"]["total_recordings"] = len(recordings)
        export_data["recordings"] = recordings

    return json.dumps(export_data, indent=2, default=str)


def export_zip(
    calls: list[dict],
    recordings: list[dict],
    audio_dir: str | None = None,
    spectrogram_dir: str | None = None,
    include_audio: bool = True,
    include_spectrograms: bool = True,
) -> io.BytesIO:
    """Create a ZIP bundle with call data, recording metadata, and media files.

    The ZIP archive contains:
        - calls.csv: All call records in CSV format.
        - recordings.json: Recording metadata in JSON format.
        - metadata.json: Export metadata summary.
        - audio/: Directory of audio files (if include_audio and audio_dir).
        - spectrograms/: Directory of spectrogram images (if include_spectrograms
          and spectrogram_dir).

    Args:
        calls: List of call record dictionaries.
        recordings: List of recording metadata dictionaries.
        audio_dir: Path to directory containing audio files.
            Files are matched to recordings by filename.
        spectrogram_dir: Path to directory containing spectrogram images.
            Files are matched to recordings by filename.
        include_audio: Whether to include audio files in the ZIP.
        include_spectrograms: Whether to include spectrogram images in the ZIP.

    Returns:
        io.BytesIO buffer containing the ZIP archive.
    """
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add calls CSV
        csv_content = export_csv(calls)
        zf.writestr("calls.csv", csv_content)

        # Add recordings JSON
        recordings_json = json.dumps(recordings, indent=2, default=str)
        zf.writestr("recordings.json", recordings_json)

        # Add export metadata
        metadata = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "total_calls": len(calls),
            "total_recordings": len(recordings),
            "includes_audio": include_audio and audio_dir is not None,
            "includes_spectrograms": (
                include_spectrograms and spectrogram_dir is not None
            ),
            "format_version": "1.0",
        }
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        # Add audio files
        if include_audio and audio_dir is not None:
            audio_path = Path(audio_dir)
            if audio_path.is_dir():
                for audio_file in audio_path.iterdir():
                    if audio_file.is_file() and audio_file.suffix.lower() in (
                        ".wav", ".mp3", ".flac", ".ogg", ".m4a",
                    ):
                        arcname = f"audio/{audio_file.name}"
                        zf.write(str(audio_file), arcname)

        # Add spectrogram files
        if include_spectrograms and spectrogram_dir is not None:
            spec_path = Path(spectrogram_dir)
            if spec_path.is_dir():
                for spec_file in spec_path.iterdir():
                    if spec_file.is_file() and spec_file.suffix.lower() in (
                        ".png", ".jpg", ".jpeg", ".svg", ".webp",
                    ):
                        arcname = f"spectrograms/{spec_file.name}"
                        zf.write(str(spec_file), arcname)

    buffer.seek(0)
    return buffer
