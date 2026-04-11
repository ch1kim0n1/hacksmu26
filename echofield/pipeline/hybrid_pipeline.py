"""
Pipeline orchestrator for the EchoField audio processing pipeline.

Coordinates ingestion, spectrogram generation, noise removal, quality
assessment, and caching.  CPU-bound work is dispatched to threads via
``asyncio.to_thread`` so the event loop remains responsive.
"""

import asyncio
import os
import time
from typing import Callable, Optional

import numpy as np
import soundfile as sf

from echofield.pipeline.ingestion import (
    validate_audio_file,
    load_audio,
    extract_metadata,
)
from echofield.pipeline.spectrogram import (
    compute_stft,
    generate_spectrogram_png,
)
from echofield.pipeline.spectral_gate import denoise_recording
from echofield.pipeline.quality_check import assess_quality
from echofield.pipeline.cache_manager import CacheManager


class ProcessingPipeline:
    """
    Async orchestrator that drives a recording through the full
    EchoField processing pipeline.
    """

    def __init__(self, settings: dict, cache_manager: CacheManager) -> None:
        """
        Args:
            settings: Application-level configuration dict.
                      Recognised keys (all optional):
                        target_sr        (int)   -- target sample rate
                        n_fft            (int)   -- STFT window size
                        hop_length       (int)   -- STFT hop length
                        aggressiveness   (float) -- noise-removal strength
                        freq_max         (float) -- max display frequency
            cache_manager: CacheManager instance for caching artefacts.
        """
        self.settings = settings
        self.cache = cache_manager

    # ------------------------------------------------------------------
    # Internal sync helpers (run inside threads)
    # ------------------------------------------------------------------

    @staticmethod
    def _load_and_validate(
        audio_path: str, target_sr: int
    ) -> tuple[np.ndarray, int, dict]:
        """Validate, load, and extract metadata."""
        valid, err = validate_audio_file(audio_path)
        if not valid:
            raise ValueError(f"Audio validation failed: {err}")

        y, sr = load_audio(audio_path, target_sr=target_sr)
        metadata = extract_metadata(audio_path, y, sr)
        return y, sr, metadata

    @staticmethod
    def _generate_spectrogram(
        y: np.ndarray,
        sr: int,
        n_fft: int,
        hop_length: int,
        output_path: str,
        title: str,
        freq_max: float,
    ) -> np.ndarray:
        """Compute STFT and save spectrogram PNG.  Returns magnitude_db."""
        stft_data = compute_stft(y, n_fft=n_fft, hop_length=hop_length)
        generate_spectrogram_png(
            stft_data["magnitude_db"],
            sr,
            hop_length,
            output_path,
            title=title,
            freq_max=freq_max,
        )
        return stft_data["magnitude_db"]

    @staticmethod
    def _denoise(y: np.ndarray, sr: int, aggressiveness: float) -> np.ndarray:
        return denoise_recording(y, sr, aggressiveness=aggressiveness)

    @staticmethod
    def _assess(y_orig: np.ndarray, y_clean: np.ndarray, sr: int) -> dict:
        return assess_quality(y_orig, y_clean, sr)

    @staticmethod
    def _save_audio(y: np.ndarray, sr: int, output_path: str) -> None:
        sf.write(output_path, y, sr)

    # ------------------------------------------------------------------
    # Public async API
    # ------------------------------------------------------------------

    async def process_recording(
        self,
        recording_id: str,
        audio_path: str,
        output_dir: str,
        spectrogram_dir: str,
        progress_callback: Optional[Callable] = None,
    ) -> dict:
        """
        Process a single recording end-to-end.

        Args:
            recording_id:   Unique ID for the recording.
            audio_path:     Path to the source audio file.
            output_dir:     Directory for the cleaned audio WAV.
            spectrogram_dir:Directory for spectrogram PNGs.
            progress_callback:
                Optional ``(stage: str, percent: int) -> None`` callable
                invoked to report pipeline progress.

        Returns:
            Dict with recording_id, status, noise_types, quality metrics,
            calls, processing_time_s, output_audio_path,
            spectrogram_before_path, spectrogram_after_path.
        """
        start_time = time.monotonic()

        # Ensure output directories exist
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(spectrogram_dir, exist_ok=True)

        # Resolve settings with defaults
        target_sr = self.settings.get("target_sr", 44100)
        n_fft = self.settings.get("n_fft", 2048)
        hop_length = self.settings.get("hop_length", 512)
        aggressiveness = self.settings.get("aggressiveness", 1.5)
        freq_max = self.settings.get("freq_max", 2000)

        def _progress(stage: str, pct: int) -> None:
            if progress_callback is not None:
                progress_callback(stage, pct)

        # ----------------------------------------------------------
        # Stage 1 -- Ingestion
        # ----------------------------------------------------------
        _progress("ingestion", 0)

        y, sr, metadata = await asyncio.to_thread(
            self._load_and_validate, audio_path, target_sr
        )

        # ----------------------------------------------------------
        # Stage 2 -- Original spectrogram
        # ----------------------------------------------------------
        _progress("spectrogram", 20)

        spec_before_path = os.path.join(
            spectrogram_dir, f"{recording_id}_before.png"
        )
        mag_before = await asyncio.to_thread(
            self._generate_spectrogram,
            y, sr, n_fft, hop_length,
            spec_before_path,
            "Original Recording",
            freq_max,
        )

        # ----------------------------------------------------------
        # Stage 3 -- Noise removal
        # ----------------------------------------------------------
        _progress("noise_removal", 40)

        y_cleaned = await asyncio.to_thread(
            self._denoise, y, sr, aggressiveness
        )

        # ----------------------------------------------------------
        # Stage 4 -- Cleaned spectrogram
        # ----------------------------------------------------------
        _progress("spectrogram", 60)

        spec_after_path = os.path.join(
            spectrogram_dir, f"{recording_id}_after.png"
        )
        mag_after = await asyncio.to_thread(
            self._generate_spectrogram,
            y_cleaned, sr, n_fft, hop_length,
            spec_after_path,
            "After Noise Removal",
            freq_max,
        )

        # ----------------------------------------------------------
        # Stage 5 -- Quality assessment
        # ----------------------------------------------------------
        _progress("quality_assessment", 80)

        quality_metrics = await asyncio.to_thread(
            self._assess, y, y_cleaned, sr
        )

        # ----------------------------------------------------------
        # Stage 6 -- Persist results
        # ----------------------------------------------------------
        _progress("complete", 100)

        output_audio_path = os.path.join(
            output_dir, f"{recording_id}_cleaned.wav"
        )
        await asyncio.to_thread(
            self._save_audio, y_cleaned, sr, output_audio_path
        )

        # Cache metrics
        self.cache.save_metrics(recording_id, quality_metrics)

        elapsed = round(time.monotonic() - start_time, 2)

        return {
            "recording_id": recording_id,
            "status": "complete",
            "noise_types": ["ambient", "wind"],  # placeholder
            "quality_metrics": quality_metrics,
            "calls": [],  # placeholder -- populated by downstream detector
            "processing_time_s": elapsed,
            "output_audio_path": output_audio_path,
            "spectrogram_before_path": spec_before_path,
            "spectrogram_after_path": spec_after_path,
            "metadata": metadata,
        }
