from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

from echofield.data_loader import discover_audio_files, load_metadata_csv, match_metadata_to_audio


def test_data_loader_matches_metadata_and_audio(tmp_path: Path) -> None:
    recordings_dir = tmp_path / "recordings"
    recordings_dir.mkdir()
    matched_audio = recordings_dir / "call_001.wav"
    unmatched_audio = recordings_dir / "orphan.wav"

    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    sf.write(matched_audio, 0.1 * np.sin(2 * np.pi * 20 * t), sr)
    sf.write(unmatched_audio, 0.1 * np.sin(2 * np.pi * 30 * t), sr)

    metadata_csv = tmp_path / "metadata.csv"
    metadata_csv.write_text(
        "call_id,animal_id,location,date,start_sec,end_sec,noise_type_ref,species\n"
        "call_001,E-1,Amboseli,2026-04-11,0,1,wind,African bush elephant\n",
        encoding="utf-8",
    )

    rows = load_metadata_csv(metadata_csv)
    audio_files = discover_audio_files(recordings_dir)
    combined = match_metadata_to_audio(rows, audio_files)

    assert len(rows) == 1
    assert len(audio_files) == 2
    assert len(combined) == 2
    assert any(item["filename"] == "call_001.wav" for item in combined)
    assert any(item["filename"] == "orphan.wav" for item in combined)

