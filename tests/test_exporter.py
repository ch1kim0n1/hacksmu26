from __future__ import annotations

from pathlib import Path

from echofield.research.exporter import export_csv, export_json, export_pdf, export_zip


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

