"""Infrasound detection and pitch-shifting for elephant vocalizations."""
from __future__ import annotations

import logging

import numpy as np
import librosa
from scipy.signal import butter, sosfilt
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class InfrasoundRegion:
    start_ms: float
    end_ms: float
    estimated_f0_hz: float
    energy_db: float


def detect_infrasound_regions(
    y: np.ndarray,
    sr: int,
    upper_bound_hz: float = 20.0,
    min_energy_db: float = -40.0,
    min_duration_ms: float = 200.0,
) -> list[InfrasoundRegion]:
    """Detect time regions with significant infrasonic content (<20Hz)."""
    # Low-pass filter at upper_bound_hz
    sos = butter(4, upper_bound_hz, btype="low", fs=sr, output="sos")
    y_infra = sosfilt(sos, y)

    # Frame-wise RMS energy
    frame_length = 2048
    hop_length = 512
    rms = librosa.feature.rms(
        y=y_infra, frame_length=frame_length, hop_length=hop_length
    )[0]
    rms_db = librosa.amplitude_to_db(
        rms, ref=np.max(rms) if np.max(rms) > 0 else 1.0
    )

    # Find regions above threshold
    active = rms_db > min_energy_db
    regions: list[InfrasoundRegion] = []
    in_region = False
    start_frame = 0

    for i, is_active in enumerate(active):
        if is_active and not in_region:
            start_frame = i
            in_region = True
        elif not is_active and in_region:
            start_ms = (start_frame * hop_length / sr) * 1000
            end_ms = (i * hop_length / sr) * 1000
            if end_ms - start_ms >= min_duration_ms:
                start_sample = start_frame * hop_length
                end_sample = min(i * hop_length, len(y_infra))
                segment = y_infra[start_sample:end_sample]
                if len(segment) > 0:
                    # Use a frame_length large enough for low fmin
                    yin_fmin = max(5.0, sr / 8191)
                    yin_frame = int(np.ceil(sr / yin_fmin)) + 1
                    f0 = librosa.yin(
                        segment,
                        fmin=yin_fmin,
                        fmax=upper_bound_hz,
                        sr=sr,
                        frame_length=yin_frame,
                    )
                    valid_f0 = f0[(f0 > 0) & np.isfinite(f0)]
                    est_f0 = (
                        float(np.median(valid_f0)) if len(valid_f0) > 0 else 0.0
                    )
                    energy = float(np.mean(rms_db[start_frame:i]))
                    regions.append(
                        InfrasoundRegion(
                            start_ms=round(start_ms, 1),
                            end_ms=round(end_ms, 1),
                            estimated_f0_hz=round(est_f0, 1),
                            energy_db=round(energy, 1),
                        )
                    )
            in_region = False

    # Handle region extending to end
    if in_region:
        start_ms = (start_frame * hop_length / sr) * 1000
        end_ms = (len(active) * hop_length / sr) * 1000
        if end_ms - start_ms >= min_duration_ms:
            start_sample = start_frame * hop_length
            segment = y_infra[start_sample:]
            if len(segment) > 0:
                yin_fmin = max(5.0, sr / 8191)
                yin_frame = int(np.ceil(sr / yin_fmin)) + 1
                f0 = librosa.yin(
                    segment,
                    fmin=yin_fmin,
                    fmax=upper_bound_hz,
                    sr=sr,
                    frame_length=yin_frame,
                )
                valid_f0 = f0[(f0 > 0) & np.isfinite(f0)]
                est_f0 = (
                    float(np.median(valid_f0)) if len(valid_f0) > 0 else 0.0
                )
                energy = float(np.mean(rms_db[start_frame:]))
                regions.append(
                    InfrasoundRegion(
                        start_ms=round(start_ms, 1),
                        end_ms=round(end_ms, 1),
                        estimated_f0_hz=round(est_f0, 1),
                        energy_db=round(energy, 1),
                    )
                )

    return regions


def pitch_shift_infrasound(
    y: np.ndarray,
    sr: int,
    shift_octaves: int = 3,
    preserve_duration: bool = True,
) -> np.ndarray:
    """Pitch-shift infrasonic content into audible range."""
    if preserve_duration:
        return librosa.effects.pitch_shift(y, sr=sr, n_steps=shift_octaves * 12)
    else:
        # Resample method — faster, no artifacts, but changes duration
        factor = 2**shift_octaves
        return librosa.resample(y, orig_sr=sr, target_sr=sr * factor)


def create_infrasound_reveal(
    y: np.ndarray,
    sr: int,
    shift_octaves: int = 3,
    mix_mode: str = "shifted_only",
) -> dict:
    """Create the reveal audio for infrasound playback.

    mix_mode: 'shifted_only', 'blended', or 'side_by_side'
    """
    # Split into infrasound and audible bands
    crossover_hz = 25.0
    sos_low = butter(4, crossover_hz, btype="low", fs=sr, output="sos")
    sos_high = butter(4, crossover_hz, btype="high", fs=sr, output="sos")

    y_infra = sosfilt(sos_low, y)
    y_audible = sosfilt(sos_high, y)

    # Check if there's meaningful infrasound energy
    infra_energy = float(np.sum(y_infra**2))
    total_energy = float(np.sum(y**2))
    infra_pct = (infra_energy / total_energy * 100) if total_energy > 0 else 0.0

    # Pitch-shift the infrasound band
    y_shifted = pitch_shift_infrasound(
        y_infra, sr, shift_octaves=shift_octaves
    )

    # Normalize shifted audio
    max_val = np.max(np.abs(y_shifted))
    if max_val > 0:
        y_shifted = y_shifted * (0.8 / max_val)

    if mix_mode == "blended":
        # Mix shifted infrasound with original audible content
        min_len = min(len(y_shifted), len(y_audible))
        output = y_audible[:min_len] + y_shifted[:min_len] * 0.7
        max_val = np.max(np.abs(output))
        if max_val > 0:
            output = output * (0.9 / max_val)
    elif mix_mode == "side_by_side":
        output = y_shifted  # Return just shifted; frontend handles side-by-side
    else:
        output = y_shifted

    return {
        "audio": output,
        "infrasound_energy_pct": round(infra_pct, 1),
        "shift_octaves": shift_octaves,
        "original_range_hz": [5, crossover_hz],
        "shifted_range_hz": [
            5 * (2**shift_octaves),
            crossover_hz * (2**shift_octaves),
        ],
    }
