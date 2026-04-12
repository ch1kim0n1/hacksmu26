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
    matched = next(item for item in combined if item["filename"] == "call_001.wav")
    assert matched["metadata"]["call_id"] == "call_001"
    assert matched["metadata"]["animal_id"] == "E-1"
    assert matched["metadata"]["noise_type_ref"] == "wind"
    assert any(item["filename"] == "orphan.wav" for item in combined)


def test_data_loader_generates_stable_ids(tmp_path: Path) -> None:
    recordings_dir = tmp_path / "recordings"
    recordings_dir.mkdir()
    audio = recordings_dir / "call_001.wav"

    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    sf.write(audio, 0.1 * np.sin(2 * np.pi * 20 * t), sr)

    metadata_csv = tmp_path / "metadata.csv"
    metadata_csv.write_text(
        "call_id,filename,animal_id,location,date,start_sec,end_sec,noise_type_ref,species\n"
        "call_001,call_001.wav,E-1,Amboseli,2026-04-11,0,1,wind,African bush elephant\n",
        encoding="utf-8",
    )

    rows = load_metadata_csv(metadata_csv)
    audio_files = discover_audio_files(recordings_dir)
    first = match_metadata_to_audio(rows, audio_files)
    second = match_metadata_to_audio(rows, audio_files)

    first_id = next(item["id"] for item in first if item["filename"] == "call_001.wav")
    second_id = next(item["id"] for item in second if item["filename"] == "call_001.wav")
    assert first_id == second_id


def test_discover_audio_files_skips_generated_subdirectories(tmp_path: Path) -> None:
    recordings_dir = tmp_path / "recordings"
    original_dir = recordings_dir / "original"
    processed_dir = recordings_dir / "processed"
    demo_dir = recordings_dir / "demo"
    original_dir.mkdir(parents=True)
    processed_dir.mkdir(parents=True)
    demo_dir.mkdir(parents=True)

    sr = 44_100
    t = np.linspace(0, 1, sr, endpoint=False)
    sf.write(original_dir / "source.wav", 0.1 * np.sin(2 * np.pi * 20 * t), sr)
    sf.write(processed_dir / "processed.wav", 0.1 * np.sin(2 * np.pi * 30 * t), sr)
    sf.write(demo_dir / "demo.wav", 0.1 * np.sin(2 * np.pi * 40 * t), sr)

    discovered = discover_audio_files(recordings_dir)

    assert len(discovered) == 1
    assert Path(discovered[0]).name == "source.wav"
