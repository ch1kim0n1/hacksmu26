"""Hybrid processing pipeline for EchoField."""

from __future__ import annotations

import asyncio
import inspect
import json
import os
import time
from enum import Enum
from pathlib import Path
from typing import Any, Awaitable, Callable

import librosa
import numpy as np

from echofield.metrics import metrics
from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.call_detector import CallDetector
from echofield.pipeline.deep_denoise import deep_denoise
from echofield.pipeline.ensemble import run_ensemble
from echofield.pipeline.feature_extract import classify_call_type, extract_acoustic_features
from echofield.pipeline.ingestion import IngestionResult, ingest_audio_file
from echofield.pipeline.noise_classifier import classify_noise
from echofield.pipeline.quality_check import assess_quality
from echofield.pipeline.speaker_separation import get_speaker_metadata, separate_speakers
from echofield.pipeline.spectral_gate import adaptive_gate_denoise, spectral_gate_denoise, wiener_filter_denoise
from echofield.pipeline.spectrogram import (
    build_spectrogram_artifacts,
    compute_stft,
    generate_comparison_png,
)
from echofield.research.call_fingerprint import FINGERPRINT_DIM, ensure_call_fingerprint
from echofield.research.sequence_analyzer import extract_sequences, find_recurring_patterns
from echofield.utils.audio_utils import save_audio
from echofield.utils.logging_config import get_logger

logger = get_logger(__name__)


class PipelineStage(str, Enum):
    INGESTION = "ingestion"
    SPECTROGRAM = "spectrogram"
    CLASSIFICATION = "noise_classification"
    DENOISING = "noise_removal"
    SPEAKER_SEPARATION = "speaker_separation"
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
            "spectrogram_type": getattr(self.settings, "SPECTROGRAM_TYPE", "stft"),
            "post_process": bool(getattr(self.settings, "DENOISE_POST_PROCESS", False)),
            "preserve_harmonics": bool(getattr(self.settings, "DENOISE_PRESERVE_HARMONICS", False)),
        }

    def _record_stage_duration(self, recording_id: str, stage: PipelineStage, started_at: float) -> None:
        duration_s = time.perf_counter() - started_at
        duration_ms = round(duration_s * 1000.0, 3)
        metrics.observe("echofield_pipeline_stage_duration_seconds", duration_s, {"stage": stage.value})
        logger.info(
            "pipeline stage complete",
            extra={
                "recording_id": recording_id,
                "stage": stage.value,
                "duration_ms": duration_ms,
            },
        )

    def _detect_calls(
        self,
        recording_id: str,
        y: np.ndarray,
        sr: int,
        metadata: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Detect and classify calls via CallDetector (model-backed or energy fallback)."""
        detector = CallDetector(
            detector_model_path=os.getenv("ECHOFIELD_DETECTOR_MODEL_PATH"),
            classifier_model_path=os.getenv("ECHOFIELD_CLASSIFIER_MODEL_PATH"),
        )
        return detector.detect(recording_id, y, sr, metadata)

    def _annotate_calls(self, calls: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
        threshold = float(os.getenv("ECHOFIELD_REVIEW_THRESHOLD", "0.5"))
        colors = {
            "rumble": "#8B5CF6",
            "trumpet": "#F59E0B",
            "roar": "#EF4444",
            "bark": "#10B981",
            "cry": "#3B82F6",
            "unknown": "#6B7280",
            "novel": "#6B7280",
        }
        annotated = []
        for call in calls:
            item = ensure_call_fingerprint(dict(call))
            item.setdefault("original_call_type", item.get("call_type"))
            item.setdefault("review_status", "pending" if float(item.get("confidence") or 0.0) < threshold else "confirmed")
            item.setdefault("color", colors.get(str(item.get("call_type") or "unknown").lower(), "#6B7280"))
            item["end_ms"] = round(float(item.get("start_ms") or 0.0) + float(item.get("duration_ms") or 0.0), 2)
            annotated.append(item)
        sequences = extract_sequences(annotated)
        patterns = find_recurring_patterns(sequences)
        return annotated, sequences, patterns

    def _detect_calls_from_speakers(
        self,
        recording_id: str,
        speaker_separation: dict[str, Any],
        sr: int,
        metadata: dict[str, Any],
    ) -> list[dict[str, Any]]:
        if int(speaker_separation.get("speaker_count") or 1) <= 1:
            return []

        calls: list[dict[str, Any]] = []
        for speaker in list(speaker_separation.get("speakers") or []):
            speaker_id = str(speaker.get("id") or "speaker")
            speaker_audio = np.asarray(speaker.get("audio"), dtype=np.float32)
            if speaker_audio.size == 0:
                continue
            speaker_calls = self._detect_calls(recording_id, speaker_audio, sr, metadata)
            for call in speaker_calls:
                item = dict(call)
                item["id"] = f"{item.get('id')}-{speaker_id}"
                item["speaker_id"] = speaker_id
                item["speaker_fundamental_hz"] = speaker.get("fundamental_hz")
                item["speaker_energy_ratio"] = speaker.get("energy_ratio")
                calls.append(item)
        calls.sort(key=lambda item: (float(item.get("start_ms") or 0.0), str(item.get("speaker_id") or "")))
        return calls

    async def process_recording(
        self,
        recording_id: str,
        audio_path: str,
        output_dir: str,
        spectrogram_dir: str,
        *,
        method: str | None = None,
        aggressiveness: float = 1.0,
        progress_callback: ProgressCallback | None = None,
    ) -> dict[str, Any]:
        method = (method or getattr(self.settings, "DENOISE_METHOD", "hybrid")).lower()
        demo_preset = method == "demo"
        if demo_preset:
            method = "spectral"
            aggressiveness = min(aggressiveness, 1.0)
        params = self._cache_params(method, aggressiveness)
        if demo_preset:
            params["preset"] = "demo"
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
            metrics.inc("echofield_cache_hits_total")
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
        metrics.inc("echofield_cache_misses_total")

        await self._notify(progress_callback, PipelineStage.INGESTION.value, "active", 5)
        stage_start = time.perf_counter()
        ingestion: IngestionResult = await asyncio.to_thread(
            ingest_audio_file,
            audio_path,
            target_sr=getattr(self.settings, "SAMPLE_RATE", 44100),
            segment_length_s=getattr(self.settings, "SEGMENT_SECONDS", 60),
            overlap_ratio=getattr(self.settings, "SEGMENT_OVERLAP_RATIO", 0.5),
        )
        self._record_stage_duration(recording_id, PipelineStage.INGESTION, stage_start)
        y = np.concatenate([segment.data for segment in ingestion.segments], axis=0)
        sr = ingestion.sample_rate

        await self._notify(progress_callback, PipelineStage.SPECTROGRAM.value, "active", 20)
        await self._notify(progress_callback, "spectrogram:rendering", "active", 22)
        stage_start = time.perf_counter()
        before_spec, before_viz = await asyncio.to_thread(
            build_spectrogram_artifacts,
            f"{recording_id}_before",
            y,
            sr,
            spectrogram_dir,
            n_fft=getattr(self.settings, "SPECTROGRAM_N_FFT", 2048),
            hop_length=getattr(self.settings, "SPECTROGRAM_HOP_LENGTH", 512),
            freq_max=getattr(self.settings, "SPECTROGRAM_FREQ_MAX", 1000),
            spectrogram_type=getattr(self.settings, "SPECTROGRAM_TYPE", "stft"),
        )
        self._record_stage_duration(recording_id, PipelineStage.SPECTROGRAM, stage_start)
        await self._notify(
            progress_callback,
            "spectrogram:before_complete",
            "active",
            30,
            {"spectrogram_url": before_viz.url, "variant": "before"},
        )

        await self._notify(progress_callback, PipelineStage.CLASSIFICATION.value, "active", 35)
        stage_start = time.perf_counter()
        noise_info = await asyncio.to_thread(classify_noise, y, sr)
        self._record_stage_duration(recording_id, PipelineStage.CLASSIFICATION, stage_start)
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
        await self._notify(progress_callback, "denoising:started", "active", 50)
        model_path = getattr(self.settings, "MODEL_PATH", None)
        ensemble_meta: dict[str, Any] = {}
        post_process = bool(getattr(self.settings, "DENOISE_POST_PROCESS", False))
        preserve_harmonics = bool(getattr(self.settings, "DENOISE_PRESERVE_HARMONICS", False))
        spectrogram_type = getattr(self.settings, "SPECTROGRAM_TYPE", "stft")

        stage_start = time.perf_counter()
        if method == "hybrid":
            ensemble_result = await asyncio.to_thread(
                run_ensemble,
                y,
                sr,
                model_path=model_path,
                aggressiveness=aggressiveness,
                post_process=post_process,
            )
            cleaned_audio = ensemble_result["audio"]
            ensemble_meta = {
                "denoising_method_selected": ensemble_result["method"],
                "ensemble_score": ensemble_result["composite_score"],
                "ensemble_confidence": ensemble_result["confidence"],
                "candidates_evaluated": ensemble_result["candidates_evaluated"],
                "per_method_scores": ensemble_result["per_method_scores"],
                "score_variance": ensemble_result.get("score_variance", {}),
            }
        elif method == "adaptive":
            adaptive_result = await asyncio.to_thread(
                adaptive_gate_denoise,
                y,
                sr,
                chunk_s=float(getattr(self.settings, "DENOISE_CHUNK_S", 10.0)),
                base_aggressiveness=aggressiveness,
                noise_type=noise_info["primary_type"],
                preserve_harmonics=preserve_harmonics,
                post_process=post_process,
            )
            cleaned_audio = adaptive_result["cleaned_audio"]
            ensemble_meta = {"chunk_aggressiveness": adaptive_result["chunk_aggressiveness"]}
        elif method == "wiener":
            wiener = await asyncio.to_thread(wiener_filter_denoise, y, sr)
            cleaned_audio = wiener["cleaned_audio"]
        elif method == "deep":
            spectral = await asyncio.to_thread(
                spectral_gate_denoise,
                y,
                sr,
                aggressiveness=aggressiveness,
                noise_type=noise_info["primary_type"],
                preserve_harmonics=preserve_harmonics,
                post_process=post_process,
                spectrogram_type=spectrogram_type,
            )
            cleaned_audio = await asyncio.to_thread(
                deep_denoise,
                spectral["cleaned_audio"],
                sr,
                model_path=model_path,
            )
        else:
            spectral = await asyncio.to_thread(
                spectral_gate_denoise,
                y,
                sr,
                aggressiveness=aggressiveness,
                noise_type=noise_info["primary_type"],
                preserve_harmonics=preserve_harmonics,
                post_process=post_process,
                spectrogram_type=spectrogram_type,
            )
            cleaned_audio = spectral["cleaned_audio"]
        await self._notify(progress_callback, "denoising:complete", "complete", 62)
        self._record_stage_duration(recording_id, PipelineStage.DENOISING, stage_start)

        await self._notify(progress_callback, PipelineStage.SPECTROGRAM.value, "active", 65)
        stage_start = time.perf_counter()
        after_spec, after_viz = await asyncio.to_thread(
            build_spectrogram_artifacts,
            f"{recording_id}_after",
            cleaned_audio,
            sr,
            spectrogram_dir,
            n_fft=getattr(self.settings, "SPECTROGRAM_N_FFT", 2048),
            hop_length=getattr(self.settings, "SPECTROGRAM_HOP_LENGTH", 512),
            freq_max=getattr(self.settings, "SPECTROGRAM_FREQ_MAX", 1000),
            spectrogram_type=spectrogram_type,
        )
        self._record_stage_duration(recording_id, PipelineStage.SPECTROGRAM, stage_start)
        await self._notify(
            progress_callback,
            "spectrogram:after_complete",
            "complete",
            70,
            {"spectrogram_url": after_viz.url, "variant": "after"},
        )

        await self._notify(progress_callback, PipelineStage.SPEAKER_SEPARATION.value, "active", 74)
        stage_start = time.perf_counter()
        speaker_separation = await asyncio.to_thread(separate_speakers, cleaned_audio, sr)
        speaker_metadata = [
            get_speaker_metadata(speaker, sr)
            for speaker in speaker_separation.get("speakers", [])
        ]
        speaker_result = {
            "speaker_count": int(speaker_separation.get("speaker_count") or len(speaker_metadata) or 1),
            "speakers": speaker_metadata,
            "original_length": int(speaker_separation.get("original_length") or len(cleaned_audio)),
        }
        self._record_stage_duration(recording_id, PipelineStage.SPEAKER_SEPARATION, stage_start)
        await self._notify(
            progress_callback,
            PipelineStage.SPEAKER_SEPARATION.value,
            "complete",
            78,
            {"speaker_count": speaker_result["speaker_count"], "speakers": speaker_metadata},
        )

        await self._notify(progress_callback, PipelineStage.FEATURE_EXTRACTION.value, "active", 80)
        await self._notify(progress_callback, "calls:detecting", "active", 80)
        stage_start = time.perf_counter()
        calls = await asyncio.to_thread(
            self._detect_calls_from_speakers,
            recording_id,
            speaker_separation,
            sr,
            ingestion.metadata,
        )
        if not calls:
            calls = await asyncio.to_thread(
                self._detect_calls,
                recording_id,
                cleaned_audio,
                sr,
                ingestion.metadata,
            )
        calls, sequences, recurring_patterns = self._annotate_calls(calls)
        self._record_stage_duration(recording_id, PipelineStage.FEATURE_EXTRACTION, stage_start)
        metrics.inc("echofield_calls_detected_total", len(calls))
        await self._notify(progress_callback, "calls:detected", "complete", 88, {"call_count": len(calls)})

        await self._notify(progress_callback, PipelineStage.QUALITY_CHECK.value, "active", 90)
        stage_start = time.perf_counter()
        quality = await asyncio.to_thread(assess_quality, y, cleaned_audio, sr)
        self._record_stage_duration(recording_id, PipelineStage.QUALITY_CHECK, stage_start)
        await self._notify(
            progress_callback,
            PipelineStage.QUALITY_CHECK.value,
            "complete",
            95,
            {"quality": quality},
        )

        # Peak-normalise to match original loudness (denoised audio is often
        # much quieter, which is correct metrically but unusable for playback).
        peak_cleaned = float(np.max(np.abs(cleaned_audio))) if cleaned_audio.size else 0.0
        if peak_cleaned > 1e-8:
            target_peak = float(np.max(np.abs(y))) if y.size else 1.0
            cleaned_audio = cleaned_audio * (target_peak / peak_cleaned) * 0.9

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
        markers_path = output_root / f"{recording_id}_markers.json"
        sequences_path = output_root / f"{recording_id}_sequences.json"
        fingerprints_path = output_root / f"{recording_id}_fingerprints.npy"
        fingerprint_ids_path = output_root / f"{recording_id}_fingerprint_ids.json"
        fingerprint_matrix = np.asarray(
            [call.get("fingerprint") or [0.0] * FINGERPRINT_DIM for call in calls],
            dtype=np.float32,
        ).reshape((len(calls), FINGERPRINT_DIM))
        await asyncio.to_thread(
            markers_path.write_text,
            json.dumps(calls, indent=2, default=str),
            "utf-8",
        )
        await asyncio.to_thread(
            sequences_path.write_text,
            json.dumps(
                {
                    "sequences": sequences,
                    "recurring_patterns": recurring_patterns,
                },
                indent=2,
                default=str,
            ),
            "utf-8",
        )
        await asyncio.to_thread(np.save, fingerprints_path, fingerprint_matrix)
        await asyncio.to_thread(
            fingerprint_ids_path.write_text,
            json.dumps([call.get("id") for call in calls], indent=2, default=str),
            "utf-8",
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
                PipelineStage.SPEAKER_SEPARATION.value,
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
            "markers": calls,
            "sequences": sequences,
            "recurring_patterns": recurring_patterns,
            "speaker_separation": speaker_result,
            "processing_time_s": elapsed,
            "output_audio_path": str(cleaned_audio_path),
            "spectrogram_before_path": before_viz.url,
            "spectrogram_after_path": after_viz.url,
            "comparison_spectrogram_path": str(comparison_path),
            "export_metadata": {
                "markers_path": str(markers_path),
                "sequences_path": str(sequences_path),
                "fingerprints_path": str(fingerprints_path),
                "fingerprint_ids_path": str(fingerprint_ids_path),
            },
            "validation_warnings": ingestion.validation_warnings,
            "noise_summary": noise_info,
            "ai_enhanced": method in {"deep", "hybrid"},
            "demo_preset": demo_preset,
            **ensemble_meta,
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
        aggressiveness: float = 1.0,
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
