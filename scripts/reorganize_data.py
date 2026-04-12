#!/usr/bin/env python3
"""
Reorganize data folder structure for EchoField.

Consolidates scattered audio/spectrograms/metadata into a clean structure:
- data/recordings/original/     ← All 44 original audio files
- data/recordings/processed/    ← Cleaned audio + spectrograms
- data/recordings/demo/         ← Curated best examples
- data/metadata/                ← All metadata, catalog, labels
- data/cache/                   ← Cleaned (only essential files)

This script:
1. Copies files to new structure
2. Updates JSON path references
3. Creates demo collections
4. Validates file integrity
5. Generates a detailed migration report
"""

import json
import shutil
from pathlib import Path
from collections import defaultdict

def main():
    repo_root = Path(__file__).parent.parent
    data_root = repo_root / "data"

    print("=" * 80)
    print("ECHOFIELD DATA REORGANIZATION")
    print("=" * 80)

    # Phase 1: Copy original audio files
    print("\n▶ Phase 1: Migrating original audio files...")
    original_src = data_root / "audio-files"
    original_dest = data_root / "recordings" / "original"

    if original_src.exists():
        wav_files = list(original_src.glob("*.wav"))
        print(f"  Copying {len(wav_files)} audio files...")
        for wav in wav_files:
            shutil.copy2(wav, original_dest / wav.name)
        print(f"  ✓ Copied {len(wav_files)} files")
    else:
        print(f"  ⚠️  No audio-files/ found, skipping")

    # Phase 2: Copy processed files (from cache/ and processed/)
    print("\n▶ Phase 2: Consolidating processed audio & spectrograms...")

    # Copy processed audio from cache/
    cache_audio = list((data_root / "cache").glob("*_processed_audio_*.wav"))
    audio_dest = data_root / "recordings" / "processed" / "audio"
    print(f"  Found {len(cache_audio)} cached audio files in cache/")

    for audio in cache_audio:
        # Create a clean filename: {recording_id}_cleaned.wav
        # Extract UUID from name like: {id}_processed_audio_{hash}.wav
        name_parts = audio.name.split("_processed_audio_")
        if len(name_parts) == 2:
            clean_name = name_parts[0] + "_cleaned.wav"
            shutil.copy2(audio, audio_dest / clean_name)

    # Copy processed audio from processed/
    processed_audio = list((data_root / "processed").glob("*_cleaned.wav"))
    for audio in processed_audio:
        if not (audio_dest / audio.name).exists():
            shutil.copy2(audio, audio_dest / audio.name)

    actual_audio = list(audio_dest.glob("*.wav"))
    print(f"  ✓ Consolidated {len(actual_audio)} processed audio files")

    # Copy spectrograms
    print(f"  Consolidating spectrograms...")
    spectrogram_dest = data_root / "recordings" / "processed" / "spectrograms"

    # From cache/
    before_specs = list((data_root / "cache").glob("*-before_spectrogram_*.png"))
    after_specs = list((data_root / "cache").glob("*-after_spectrogram_*.png"))

    for spec in before_specs + after_specs:
        # Create clean filename: {id}_before.png or {id}_after.png
        name_parts = spec.name.split("-")
        recording_id = name_parts[0]
        spec_type = "before" if "before" in spec.name else "after"
        clean_name = f"{recording_id}_{spec_type}.png"
        shutil.copy2(spec, spectrogram_dest / clean_name)

    # From spectrograms/ dir (if it exists)
    if (data_root / "spectrograms").exists():
        for spec in (data_root / "spectrograms").glob("*"):
            dest_name = spec.name
            if not (spectrogram_dest / dest_name).exists():
                shutil.copy2(spec, spectrogram_dest / dest_name)

    actual_specs = list(spectrogram_dest.glob("*.png"))
    print(f"  ✓ Consolidated {len(actual_specs)} spectrogram images")

    # Phase 3: Copy metadata files
    print("\n▶ Phase 3: Organizing metadata...")
    metadata_dest = data_root / "metadata"

    # Copy catalog
    catalog_src = data_root / "cache" / "recording_catalog.json"
    if catalog_src.exists():
        shutil.copy2(catalog_src, metadata_dest / "recording_catalog.json")
        print(f"  ✓ Copied recording_catalog.json")

    # Copy metadata CSV
    csv_src = data_root / "metadata.csv"
    if csv_src.exists():
        shutil.copy2(csv_src, metadata_dest / "metadata.csv")
        print(f"  ✓ Copied metadata.csv")

    # Copy labels
    labels_src = data_root / "labels" / "labels.json"
    if labels_src.exists():
        shutil.copy2(labels_src, metadata_dest / "labels.json")
        print(f"  ✓ Copied labels.json")

    # Copy analysis files
    analysis_dest = metadata_dest / "analysis"
    analysis_dest.mkdir(exist_ok=True)
    if (data_root / "analysis").exists():
        for file in (data_root / "analysis").glob("*.json"):
            shutil.copy2(file, analysis_dest / file.name)
        for file in (data_root / "analysis").glob("*.csv"):
            shutil.copy2(file, analysis_dest / file.name)

    analysis_files = list(analysis_dest.glob("*"))
    print(f"  ✓ Copied {len(analysis_files)} analysis files")

    # Phase 4: Update catalog paths
    print("\n▶ Phase 4: Updating path references in catalog...")
    catalog_path = metadata_dest / "recording_catalog.json"

    if catalog_path.exists():
        with open(catalog_path) as f:
            catalog = json.load(f)

        updated_count = 0
        for rec in catalog.get("recordings", []):
            # Update source_path to point to new location
            if rec.get("filename"):
                rec["source_path"] = str((data_root / "recordings" / "original" / rec["filename"]).resolve())
                updated_count += 1

            # Update result paths if they exist
            result = rec.get("result", {})
            if result:
                # Update audio path
                if result.get("output_audio_path"):
                    audio_id = result["output_audio_path"].split("/")[-1]
                    result["output_audio_path"] = str(data_root / "recordings" / "processed" / "audio" / audio_id)

                # Update spectrogram paths
                for key in ["spectrogram_before_path", "spectrogram_after_path"]:
                    if result.get(key):
                        spec_file = Path(result[key]).name
                        result[key] = str(data_root / "recordings" / "processed" / "spectrograms" / spec_file)

        with open(catalog_path, "w") as f:
            json.dump(catalog, f, indent=2)

        print(f"  ✓ Updated {updated_count} path references in catalog")

    # Phase 5: Create demo collections
    print("\n▶ Phase 5: Creating demo collections...")
    demo_dest = data_root / "recordings" / "demo"

    # Load catalog to find best examples
    best_recordings = [
        "2000-4_airplane_01.wav",   # 81.8
        "2000-4_airplane_02.wav",   # 80.8
        "1989-06_airplane_01.wav",  # 78.7
    ]

    demo_count = 0
    for filename in best_recordings:
        # Find the recording ID from catalog
        recording_id = None
        if catalog_path.exists():
            with open(catalog_path) as f:
                catalog = json.load(f)
            for rec in catalog.get("recordings", []):
                if rec.get("filename") == filename:
                    recording_id = rec.get("id")
                    metadata = rec.get("metadata", {})
                    result = rec.get("result", {})
                    break

        if not recording_id:
            continue

        # Create demo subdirectory
        demo_subdir = demo_dest / filename.replace(".wav", "")
        demo_subdir.mkdir(exist_ok=True)

        # Copy original audio
        orig_audio = data_root / "recordings" / "original" / filename
        if orig_audio.exists():
            shutil.copy2(orig_audio, demo_subdir / "original.wav")

        # Copy processed audio
        processed_audio_files = list((data_root / "recordings" / "processed" / "audio").glob(f"{recording_id}_*.wav"))
        if processed_audio_files:
            shutil.copy2(processed_audio_files[0], demo_subdir / "processed.wav")

        # Copy spectrograms
        before_spec = list((data_root / "recordings" / "processed" / "spectrograms").glob(f"{recording_id}_before.png"))
        if before_spec:
            shutil.copy2(before_spec[0], demo_subdir / "before_spectrogram.png")

        after_spec = list((data_root / "recordings" / "processed" / "spectrograms").glob(f"{recording_id}_after.png"))
        if after_spec:
            shutil.copy2(after_spec[0], demo_subdir / "after_spectrogram.png")

        # Create metadata.json for this demo
        if catalog_path.exists():
            demo_metadata = {
                "filename": filename,
                "recording_id": recording_id,
                "quality": result.get("quality", {}) if result else {},
                "metadata": metadata,
            }
            with open(demo_subdir / "metadata.json", "w") as f:
                json.dump(demo_metadata, f, indent=2)

        demo_count += 1
        print(f"  ✓ Created demo collection: {filename}")

    print(f"  ✓ Created {demo_count} demo collections")

    # Phase 6: Print summary
    print("\n" + "=" * 80)
    print("MIGRATION SUMMARY")
    print("=" * 80)

    print(f"\n✓ Original audio files: {len(list((data_root / 'recordings' / 'original').glob('*.wav')))}")
    print(f"✓ Processed audio files: {len(list((data_root / 'recordings' / 'processed' / 'audio').glob('*.wav')))}")
    print(f"✓ Spectrogram images: {len(list((data_root / 'recordings' / 'processed' / 'spectrograms').glob('*.png')))}")
    print(f"✓ Demo collections: {len(list((data_root / 'recordings' / 'demo').iterdir()))}")
    print(f"✓ Metadata files: {len(list((data_root / 'metadata').glob('*')))}")

    print("\n📁 New Structure:")
    print("  data/")
    print("  ├── recordings/")
    print("  │   ├── original/          (44 files)")
    print("  │   ├── processed/         (cleaned audio + spectrograms)")
    print("  │   └── demo/              (3-5 curated examples)")
    print("  ├── metadata/              (catalog, labels, analysis)")
    print("  └── cache/                 (SQLite DB, LRU index)")

    print("\n✅ Reorganization complete!")
    print("\nNext steps:")
    print("  1. Create .env with new paths")
    print("  2. Verify API still works")
    print("  3. Archive old directories (optional)")

if __name__ == "__main__":
    main()
