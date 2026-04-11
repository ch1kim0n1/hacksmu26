"""Hybrid processing pipeline for EchoField."""

from __future__ import annotations

import asyncio
import inspect
import time
from enum import Enum
from pathlib import Path
from typing import Any, Awaitable, Callable

import numpy as np

from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.deep_denoise import deep_denoise
from echofield.pipeline.feature_extract import classify_call_type, extract_acoustic_features
from echofield.pipeline.ingestion import IngestionResult, ingest_audio_file
from echofield.pipeline.noise_classifier import classify_noise
from echofield.pipeline.quality_check import assess_quality
from echofield.pipeline.spectral_gate import spectral_gate_denoise
from echofield.pipeline.spectrogram import (
    build_spectrogram_artifacts,
    compute_stft,
    generate_comparison_png,
)
from echofield.utils.audio_utils import save_audio


class PipelineStage(str, Enum):
    INGESTION = "ingestion"
    SPECTROGRAM = "spectrogram"
    CLASSIFICATION = "noise_classification"
    DENOISING = "noise_removal"
    FEATURE_EXTRACTION = "feature_extraction"
    QUALITY_CHECK = "quality_assessment"
    COMPLETE = "complete"


ProgressCallback = Callable[[str, str, int, dict[str, Any] | None], Awaitable[None] | None]


class ProcessingPipeline:
    def __init__(self, settings: Any, cache_manager: CacheManager) -> None:
        self.settings = settings
        self.cache = cache_manager

    async def _notify(
        self,
        callback: ProgressCallback | None,
        stage: str,
        status: str,
        progress: int,
        data: dict[str, Any] | None = None,
    ) -> None:
        if callback is None:
            return
        result = callback(stage, status, progress, data)
        if inspect.isawaitable(result):
            await result

    def _cache_params(self, method: str, aggressiveness: float) -> dict[str, Any]:
        return {
            "method": method,
            "aggressiveness": aggressiveness,
            "sample_rate": getattr(self.settings, "SAMPLE_RATE", 44100),
            "n_fft": getattr(self.settings, "SPECTROGRAM_N_FFT", 2048),
            "hop_length": getattr(self.settings, "SPECTROGRAM_HOP_LENGTH", 512),
        }

    def _detect_calls(
        self,
        recording_id: str,
        y: np.ndarray,
        sr: int,
        metadata: dict[str, Any],
    ) -> list[dict[str, Any]]:
        if y.size == 0:
            return []

        frame = max(int(0.25 * sr), 1)
        hop = max(int(0.1 * sr), 1)
        energies = []
        starts = []
        for start in range(0, max(len(y) - frame, 0) + 1, hop):
            chunk = y[start : start + frame]
            energies.append(float(np.sqrt(np.mean(chunk ** 2))))
            starts.append(start)
        if not energies:
            features = extract_acoustic_features(y, sr)
            classification = classify_call_type(features)
            return [
                {
                    "id": f"{recording_id}-call-0",
                    "recording_id": recording_id,
                    "start_ms": 0.0,
                    "duration_ms": round(len(y) / sr * 1000.0, 2),
                    "frequency_min_hz": 8.0,
                    "frequency_max_hz": 1200.0,
                    "call_type": classification["call_type"],
                    "confidence": classification["confidence"],
                    "acoustic_features": features,
                    "location": metadata.get("location"),
                    "date": metadata.get("date"),
                }
            ]

        threshold = max(float(np.percentile(energies, 75)), 1e-6)
        active_ranges: list[tuple[int, int]] = []
        current_start = None
        for index, energy in enumerate(energies):
            if energy >= threshold and current_start is None:
                current_start = index
            elif energy < threshold and current_start is not None:
                active_ranges.append((current_start, index))
                current_start = None
        if current_start is not None:
            active_ranges.append((current_start, len(energies)))
        if not active_ranges:
            active_ranges = [(0, len(energies))]

        calls = []
        for call_index, (frame_start, frame_end) in enumerate(active_ranges):
            start_sample = starts[frame_start]
            end_sample = min(len(y), starts[min(frame_end - 1, len(starts) - 1)] + frame)
            snippet = y[start_sample:end_sample]
            features = extract_acoustic_features(snippet, sr)
            classification = classify_call_type(features)
            calls.append(
                {
                    "id": f"{recording_id}-call-{call_index}",
                    "recording_id": recording_id,
                    "start_ms": round(start_sample / sr * 1000.0, 2),
                    "duration_ms": round((end_sample - start_sample) / sr * 1000.0, 2),
                    "frequency_min_hz": 8.0,
                    "frequency_max_hz": 1200.0,
                    "call_type": classification["call_type"],
                    "confidence": classification["confidence"],
                    "acoustic_features": features,
                    "location": metadata.get("location"),
                    "date": metadata.get("date"),
                }
            )
        return calls

    async def process_recording(
        self,
        recording_id: str,
        audio_path: str,
        output_dir: str,
        spectrogram_dir: str,
        *,
        method: str | None = None,
        aggressiveness: float = 1.5,
        progress_callback: ProgressCallback | None = None,
    ) -> dict[str, Any]:
        method = (method or getattr(self.settings, "DENOISE_METHOD", "hybrid")).lower()
        params = self._cache_params(method, aggressiveness)
        start_time = time.perf_counter()

        cached_audio = self.cache.get_processed_audio(recording_id, params=params)
        cached_metrics = self.cache.get_metrics(recording_id, params=params)
        cached_before = self.cache.get_spectrogram(
            f"{recording_id}-before",
            params=params,
        )
        cached_after = self.cache.get_spectrogram(
            f"{recording_id}-after",
            params=params,
        )
        if cached_audio and cached_metrics and cached_before and cached_after:
            await self._notify(progress_callback, PipelineStage.COMPLETE.value, "complete", 100)
            return {
                "recording_id": recording_id,
                "status": "complete",
                "stages_completed": [stage.value for stage in PipelineStage],
                "noise_types": [],
                "quality": cached_metrics,
                "calls": [],
                "processing_time_s": 0.0,
                "output_audio_path": cached_audio,
                "spectrogram_before_path": cached_before,
                "spectrogram_after_path": cached_after,
            }

        await self._notify(progress_callback, PipelineStage.INGESTION.value, "active", 5)
        ingestion: IngestionResult = await asyncio.to_thread(
            ingest_audio_file,
            audio_path,
            target_sr=getattr(self.settings, "SAMPLE_RATE", 44100),
            segment_length_s=getattr(self.settings, "SEGMENT_SECONDS", 60),
            overlap_ratio=getattr(self.settings, "SEGMENT_OVERLAP_RATIO", 0.5),
        )
        y = np.concatenate([segment.data for segment in ingestion.segments], axis=0)
        sr = ingestion.sample_rate

        await self._notify(progress_callback, PipelineStage.SPECTROGRAM.value, "active", 20)
        before_spec, before_viz = await asyncio.to_thread(
            build_spectrogram_artifacts,
            f"{recording_id}_before",
            y,
            sr,
            spectrogram_dir,
            n_fft=getattr(self.settings, "SPECTROGRAM_N_FFT", 2048),
            hop_length=getattr(self.settings, "SPECTROGRAM_HOP_LENGTH", 512),
            freq_max=getattr(self.settings, "SPECTROGRAM_FREQ_MAX", 1000),
        )
        await self._notify(
            progress_callback,
            PipelineStage.SPECTROGRAM.value,
            "active",
            30,
            {"spectrogram_url": before_viz.url, "variant": "before"},
        )

        await self._notify(progress_callback, PipelineStage.CLASSIFICATION.value, "active", 35)
        noise_info = await asyncio.to_thread(classify_noise, y, sr)
        primary_range = noise_info["noise_types"][0]["frequency_range_hz"] if noise_info["noise_types"] else [0.0, 0.0]
        await self._notify(
            progress_callback,
            PipelineStage.CLASSIFICATION.value,
            "complete",
            45,
            {
                "noise_type": noise_info["primary_type"],
                "confidence": noise_info["confidence"],
                "frequency_range": primary_range,
            },
        )

        await self._notify(progress_callback, PipelineStage.DENOISING.value, "active", 50)
        spectral = await asyncio.to_thread(
            spectral_gate_denoise,
            y,
            sr,
            aggressiveness=aggressiveness,
        )
        cleaned_audio = spectral["cleaned_audio"]
        if method in {"deep", "hybrid"}:
            cleaned_audio = await asyncio.to_thread(
                deep_denoise,
                cleaned_audio,
                sr,
                model_path=getattr(self.settings, "MODEL_PATH", None),
            )

        await self._notify(progress_callback, PipelineStage.SPECTROGRAM.value, "active", 65)
        after_spec, after_viz = await asyncio.to_thread(
            build_spectrogram_artifacts,
            f"{recording_id}_after",
            cleaned_audio,
            sr,
            spectrogram_dir,
            n_fft=getattr(self.settings, "SPECTROGRAM_N_FFT", 2048),
            hop_length=getattr(self.settings, "SPECTROGRAM_HOP_LENGTH", 512),
            freq_max=getattr(self.settings, "SPECTROGRAM_FREQ_MAX", 1000),
        )
        await self._notify(
            progress_callback,
            PipelineStage.SPECTROGRAM.value,
            "complete",
            70,
            {"spectrogram_url": after_viz.url, "variant": "after"},
        )

        await self._notify(progress_callback, PipelineStage.FEATURE_EXTRACTION.value, "active", 80)
        calls = await asyncio.to_thread(
            self._detect_calls,
            recording_id,
            cleaned_audio,
            sr,
            ingestion.metadata,
        )

        await self._notify(progress_callback, PipelineStage.QUALITY_CHECK.value, "active", 90)
        quality = await asyncio.to_thread(assess_quality, y, cleaned_audio, sr)
        await self._notify(
            progress_callback,
            PipelineStage.QUALITY_CHECK.value,
            "complete",
            95,
            {"quality": quality},
        )

        output_root = Path(output_dir)
        output_root.mkdir(parents=True, exist_ok=True)
        cleaned_audio_path = output_root / f"{recording_id}_cleaned.wav"
        await asyncio.to_thread(
            save_audio,
            cleaned_audio,
            sr,
            cleaned_audio_path,
            metadata={
                "recording_id": recording_id,
                "noise_type": noise_info["primary_type"],
                "quality_score": quality["quality_score"],
            },
        )

        comparison_path = output_root / f"{recording_id}_comparison.png"
        await asyncio.to_thread(
            generate_comparison_png,
            before_spec.magnitude_db,
            after_spec.magnitude_db,
            sr,
            getattr(self.settings, "SPECTROGRAM_HOP_LENGTH", 512),
            comparison_path,
            freq_max=getattr(self.settings, "SPECTROGRAM_FREQ_MAX", 1000),
        )

        self.cache.store_file(
            recording_id,
            "processed_audio",
            cleaned_audio_path,
            params=params,
        )
        self.cache.store_file(
            f"{recording_id}-before",
            "spectrogram",
            before_viz.url,
            params=params,
        )
        self.cache.store_file(
            f"{recording_id}-after",
            "spectrogram",
            after_viz.url,
            params=params,
        )
        self.cache.save_metrics(recording_id, quality, params=params)

        elapsed = round(time.perf_counter() - start_time, 2)
        result = {
            "recording_id": recording_id,
            "status": "complete",
            "stages_completed": [
                PipelineStage.INGESTION.value,
                PipelineStage.SPECTROGRAM.value,
                PipelineStage.CLASSIFICATION.value,
                PipelineStage.DENOISING.value,
                PipelineStage.FEATURE_EXTRACTION.value,
                PipelineStage.QUALITY_CHECK.value,
                PipelineStage.COMPLETE.value,
            ],
            "noise_types": [
                {
                    "type": item["type"],
                    "percentage": item["percentage"],
                    "frequency_range": tuple(item["frequency_range_hz"]),
                }
                for item in noise_info["noise_types"]
            ],
            "quality": quality,
            "calls": calls,
            "processing_time_s": elapsed,
            "output_audio_path": str(cleaned_audio_path),
            "spectrogram_before_path": before_viz.url,
            "spectrogram_after_path": after_viz.url,
            "comparison_spectrogram_path": str(comparison_path),
            "noise_summary": noise_info,
            "ai_enhanced": method in {"deep", "hybrid"},
        }
        await self._notify(
            progress_callback,
            PipelineStage.COMPLETE.value,
            "complete",
            100,
            {"quality": quality, "noise_type": noise_info["primary_type"]},
        )
        return result

    async def process_batch(
        self,
        recordings: list[tuple[str, str]],
        output_dir: str,
        spectrogram_dir: str,
        *,
        method: str | None = None,
        aggressiveness: float = 1.5,
        progress_callback: ProgressCallback | None = None,
    ) -> list[dict[str, Any]]:
        results = []
        for recording_id, audio_path in recordings:
            try:
                result = await self.process_recording(
                    recording_id,
                    audio_path,
                    output_dir,
                    spectrogram_dir,
                    method=method,
                    aggressiveness=aggressiveness,
                    progress_callback=progress_callback,
                )
            except Exception as exc:
                await self._notify(
                    progress_callback,
                    PipelineStage.COMPLETE.value,
                    "failed",
                    100,
                    {"error": str(exc)},
                )
                result = {
                    "recording_id": recording_id,
                    "status": "failed",
                    "error": str(exc),
                }
            results.append(result)
        return results
