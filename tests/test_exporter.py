from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path

import pytest

from echofield.research.exporter import export_csv, export_json, export_pdf, export_raven, export_zip


def _recordings_fixture() -> list[dict]:
    return [
        {
            "id": "rec-1",
            "filename": "rec-1.wav",
            "metadata": {"location": "Amboseli", "date": "2026-04-11", "species": "African bush elephant"},
            "result": {
                "calls": [
                    {
                        "id": "call-1",
                        "recording_id": "rec-1",
                        "call_type": "rumble",
                        "confidence": 0.9,
                        "start_ms": 0,
                        "duration_ms": 1200,
                        "frequency_min_hz": 8,
                        "frequency_max_hz": 200,
                        "acoustic_features": {
                            "fundamental_frequency_hz": 18.2,
                            "harmonicity": 0.72,
                            "harmonic_count": 3,
                            "bandwidth_hz": 120.5,
                            "spectral_centroid_hz": 82.0,
                            "spectral_rolloff_hz": 140.0,
                            "mfcc": [0.1] * 13,
                            "zero_crossing_rate": 0.02,
                            "snr_db": 14.5,
                        },
                    }
                ]
            },
        }
    ]


def test_export_raven_produces_tsv_with_required_columns() -> None:
    recordings = _recordings_fixture()
    tsv_content = export_raven(recordings)

    reader = csv.DictReader(io.StringIO(tsv_content), delimiter="\t")
    rows = list(reader)

    assert len(rows) == 1
    row = rows[0]
    assert "Selection" in row
    assert "Begin Time (s)" in row
    assert "End Time (s)" in row
    assert "Low Freq (Hz)" in row
    assert "High Freq (Hz)" in row
    assert "Begin File" in row


def test_export_raven_maps_call_timing_correctly() -> None:
    recordings = _recordings_fixture()
    tsv_content = export_raven(recordings)

    reader = csv.DictReader(io.StringIO(tsv_content), delimiter="\t")
    rows = list(reader)
    row = rows[0]

    # call starts at 0ms, duration 1200ms → end at 1.2s
    assert float(row["Begin Time (s)"]) == 0.0
    assert float(row["End Time (s)"]) == pytest.approx(1.2, abs=0.01)


def test_export_raven_maps_frequency_range() -> None:
    recordings = _recordings_fixture()
    tsv_content = export_raven(recordings)

    reader = csv.DictReader(io.StringIO(tsv_content), delimiter="\t")
    row = next(reader)

    assert float(row["Low Freq (Hz)"]) == 8.0
    assert float(row["High Freq (Hz)"]) == 200.0


def test_export_raven_includes_call_type_and_confidence() -> None:
    recordings = _recordings_fixture()
    tsv_content = export_raven(recordings)

    reader = csv.DictReader(io.StringIO(tsv_content), delimiter="\t")
    row = next(reader)

    assert row["Tags"] == "rumble"
    assert float(row["Score"]) == pytest.approx(0.9, abs=0.001)


def test_export_raven_includes_begin_file() -> None:
    recordings = _recordings_fixture()
    tsv_content = export_raven(recordings)

    reader = csv.DictReader(io.StringIO(tsv_content), delimiter="\t")
    row = next(reader)

    assert row["Begin File"] == "rec-1.wav"


def test_export_raven_multiple_calls_are_numbered_sequentially() -> None:
    recordings = [
        {
            "id": "rec-2",
            "filename": "rec-2.wav",
            "metadata": {},
            "result": {
                "calls": [
                    {"id": "c1", "start_ms": 0, "duration_ms": 500, "frequency_min_hz": 10, "frequency_max_hz": 80, "call_type": "rumble", "confidence": 0.8},
                    {"id": "c2", "start_ms": 1000, "duration_ms": 300, "frequency_min_hz": 20, "frequency_max_hz": 100, "call_type": "bark", "confidence": 0.6},
                ]
            },
        }
    ]
    tsv_content = export_raven(recordings)
    reader = csv.DictReader(io.StringIO(tsv_content), delimiter="\t")
    rows = list(reader)

    assert len(rows) == 2
    assert rows[0]["Selection"] == "1"
    assert rows[1]["Selection"] == "2"


def test_export_raven_empty_recordings_returns_header_only() -> None:
    tsv_content = export_raven([])
    reader = csv.DictReader(io.StringIO(tsv_content), delimiter="\t")
    rows = list(reader)
    assert rows == []
    assert "Selection" in (reader.fieldnames or [])


def test_export_zip_includes_raven_file() -> None:
    recordings = _recordings_fixture()
    buf = export_zip(recordings)
    with zipfile.ZipFile(buf) as zf:
        names = zf.namelist()
    assert "selections.txt" in names


def test_exporter_outputs_all_formats(tmp_path: Path) -> None:
    recordings = _recordings_fixture()
    csv_content = export_csv(recordings)
    json_content = export_json(recordings)
    pdf_path = export_pdf(recordings, tmp_path / "report.pdf")
    zip_buffer = export_zip(recordings)

    assert "call_id" in csv_content
    assert '"recordings"' in json_content
    assert pdf_path.exists()
    assert len(zip_buffer.getvalue()) > 0

