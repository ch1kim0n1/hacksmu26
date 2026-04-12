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

import numpy as np

from echofield.metrics import metrics
from echofield.pipeline.cache_manager import CacheManager
from echofield.pipeline.call_detector import CallDetector
from echofield.pipeline.call_gate import apply_time_gate, build_smooth_envelope, calls_to_sample_regions
from echofield.pipeline.deep_denoise import deep_denoise
from echofield.pipeline.ensemble import run_ensemble
from echofield.pipeline.feature_extract import classify_call_type, extract_acoustic_features
from echofield.pipeline.ingestion import IngestionResult, ingest_audio_file
from echofield.pipeline.noise_classifier import classify_noise
from echofield.pipeline.quality_check import assess_quality
from echofield.pipeline.spectral_gate import (
    adaptive_gate_denoise,
    apply_bandpass_filter,
    spectral_gate_denoise,
    wiener_filter_denoise,
)
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

    def _call_gate_enabled(self, demo_preset: bool, isolate_preset: bool = False) -> bool:
        return bool(getattr(self.settings, "CALL_AWARE_GATE", False)) or demo_preset or isolate_preset

    def _cache_params(
        self,
        method: str,
        aggressiveness: float,
        *,
        demo_preset: bool = False,
        isolate_preset: bool = False,
    ) -> dict[str, Any]:
        gw = self._call_gate_enabled(demo_preset, isolate_preset)
        return {
            "method": method,
            "aggressiveness": aggressiveness,
            "sample_rate": getattr(self.settings, "SAMPLE_RATE", 44100),
            "n_fft": getattr(self.settings, "SPECTROGRAM_N_FFT", 2048),
            "hop_length": getattr(self.settings, "SPECTROGRAM_HOP_LENGTH", 512),
            "spectrogram_type": getattr(self.settings, "SPECTROGRAM_TYPE", "stft"),
            "post_process": bool(getattr(self.settings, "DENOISE_POST_PROCESS", False)),
            "preserve_harmonics": bool(getattr(self.settings, "DENOISE_PRESERVE_HARMONICS", False)),
            "demo_preset": demo_preset,
            "isolate_preset": isolate_preset,
            "call_aware_gate": gw,
            "call_gate_min_confidence": float(getattr(self.settings, "CALL_GATE_MIN_CONFIDENCE", 0.45)),
            "call_gate_pad_ms": float(getattr(self.settings, "CALL_GATE_PAD_MS", 250.0)),
            "call_gate_merge_gap_ms": float(getattr(self.settings, "CALL_GATE_MERGE_GAP_MS", 100.0)),
            "call_gate_fade_ms": float(getattr(self.settings, "CALL_GATE_FADE_MS", 40.0)),
            "call_gate_floor_linear": float(getattr(self.settings, "CALL_GATE_FLOOR_LINEAR", 0.0)),
        }

    def _region_coverage_ratio(self, regions: list[tuple[int, int]], num_samples: int) -> float:
        if num_samples <= 0 or not regions:
            return 0.0
        covered = 0
        for start, end in regions:
            s = max(0, min(int(start), num_samples))
            e = max(0, min(int(end), num_samples))
            if e > s:
                covered += e - s
        return float(min(max(covered / float(num_samples), 0.0), 1.0))

    def _call_confidence_values(self, calls: list[dict[str, Any]]) -> list[float]:
        values: list[float] = []
        for call in calls:
            if str(call.get("confidence_tier") or "") == "below_threshold":
                continue
            confidence = float(call.get("confidence") or 0.0)
            if np.isfinite(confidence):
                values.append(confidence)
        return values

    def _isolate_band_limits(self, calls: list[dict[str, Any]]) -> tuple[float, float]:
        """Choose a bandpass range that keeps diverse elephant vocalizations."""
        low_hz = 8.0
        high_hz = 1200.0
        if not calls:
            return low_hz, high_hz

        high_freq_types = {"trumpet", "roar", "bark", "cry"}
        call_types = {
            str(call.get("call_type") or "").strip().lower()
            for call in calls
            if call.get("call_type")
        }

        max_f0 = 0.0
        max_centroid = 0.0
        for call in calls:
            features = call.get("acoustic_features") or {}
            max_f0 = max(max_f0, float(features.get("fundamental_frequency_hz") or 0.0))
            max_centroid = max(max_centroid, float(features.get("spectral_centroid_hz") or 0.0))

        if call_types & high_freq_types or max_f0 >= 120.0 or max_centroid >= 900.0:
            high_hz = 1800.0
        if max_centroid >= 1600.0:
            high_hz = 2400.0

        return low_hz, high_hz

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
            "contact call": "#6366F1",
            "contact-rumble": "#6366F1",
            "greeting": "#22C55E",
            "greeting-rumble": "#22C55E",
            "lets-go-rumble": "#0EA5E9",
            "musth-rumble": "#F97316",
            "play": "#14B8A6",
            "play-rumble": "#14B8A6",
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
        isolate_preset = method == "isolate"
        if demo_preset:
            method = "spectral"
            aggressiveness = min(aggressiveness, 1.0)
        elif isolate_preset:
            method = "adaptive"
            aggressiveness = max(aggressiveness, 2.2)

        params = self._cache_params(
            method,
            aggressiveness,
            demo_preset=demo_preset,
            isolate_preset=isolate_preset,
        )
        if demo_preset:
            params["preset"] = "demo"
        if isolate_preset:
            params["preset"] = "isolate"
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
                "call_gate": {"enabled": None, "from_cache": True},
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

        gate_enabled = self._call_gate_enabled(demo_preset, isolate_preset)
        gate_min_confidence = float(getattr(self.settings, "CALL_GATE_MIN_CONFIDENCE", 0.45))
        gate_pad_ms = float(getattr(self.settings, "CALL_GATE_PAD_MS", 250.0))
        gate_merge_gap_ms = float(getattr(self.settings, "CALL_GATE_MERGE_GAP_MS", 100.0))
        gate_fade_ms = float(getattr(self.settings, "CALL_GATE_FADE_MS", 40.0))
        gate_floor_linear = float(getattr(self.settings, "CALL_GATE_FLOOR_LINEAR", 0.0))
        if isolate_preset:
            gate_min_confidence = max(gate_min_confidence, 0.55)
            gate_pad_ms = min(gate_pad_ms, 160.0)
            gate_merge_gap_ms = min(gate_merge_gap_ms, 80.0)
            gate_fade_ms = min(gate_fade_ms, 20.0)
            gate_floor_linear = 0.0

        pre_detection_calls: list[dict[str, Any]] = []
        gate_regions: list[tuple[int, int]] = []
        if gate_enabled:
            await self._notify(progress_callback, "calls:pre_detect", "active", 12)
            pre_detection_calls = await asyncio.to_thread(
                self._detect_calls,
                recording_id,
                y,
                sr,
                ingestion.metadata,
            )
            gate_regions = calls_to_sample_regions(
                pre_detection_calls,
                sr,
                min_confidence=gate_min_confidence,
                pad_ms=gate_pad_ms,
                merge_gap_ms=gate_merge_gap_ms,
                num_samples=len(y),
            )

            if isolate_preset and pre_detection_calls:
                confidence_values = self._call_confidence_values(pre_detection_calls)
                base_coverage = self._region_coverage_ratio(gate_regions, len(y))

                if confidence_values and base_coverage > 0.65:
                    dynamic_confidence = max(
                        gate_min_confidence,
                        float(np.quantile(np.asarray(confidence_values, dtype=np.float32), 0.75)),
                    )
                    strict_regions = calls_to_sample_regions(
                        pre_detection_calls,
                        sr,
                        min_confidence=dynamic_confidence,
                        pad_ms=gate_pad_ms,
                        merge_gap_ms=gate_merge_gap_ms,
                        num_samples=len(y),
                    )
                    strict_coverage = self._region_coverage_ratio(strict_regions, len(y))
                    if strict_regions and strict_coverage < base_coverage:
                        gate_regions = strict_regions
                        gate_min_confidence = dynamic_confidence
                        base_coverage = strict_coverage

                if confidence_values and base_coverage > 0.65:
                    very_strict_confidence = max(
                        gate_min_confidence,
                        float(np.quantile(np.asarray(confidence_values, dtype=np.float32), 0.9)),
                    )
                    very_strict_regions = calls_to_sample_regions(
                        pre_detection_calls,
                        sr,
                        min_confidence=very_strict_confidence,
                        pad_ms=max(gate_pad_ms - 30.0, 40.0),
                        merge_gap_ms=gate_merge_gap_ms,
                        num_samples=len(y),
                    )
                    very_strict_coverage = self._region_coverage_ratio(very_strict_regions, len(y))
                    if very_strict_regions and very_strict_coverage < base_coverage:
                        gate_regions = very_strict_regions
                        gate_min_confidence = very_strict_confidence

                # If isolate gets overly sparse, reopen to moderate-confidence calls.
                coverage_after_strict = self._region_coverage_ratio(gate_regions, len(y))
                if confidence_values and coverage_after_strict < 0.03:
                    relaxed_confidence = min(max(gate_min_confidence - 0.1, 0.45), gate_min_confidence)
                    relaxed_regions = calls_to_sample_regions(
                        pre_detection_calls,
                        sr,
                        min_confidence=relaxed_confidence,
                        pad_ms=max(gate_pad_ms, 180.0),
                        merge_gap_ms=max(gate_merge_gap_ms, 120.0),
                        num_samples=len(y),
                    )
                    relaxed_coverage = self._region_coverage_ratio(relaxed_regions, len(y))
                    if relaxed_regions and relaxed_coverage > coverage_after_strict:
                        gate_regions = relaxed_regions
                        gate_min_confidence = relaxed_confidence
                        gate_pad_ms = max(gate_pad_ms, 180.0)
                        gate_merge_gap_ms = max(gate_merge_gap_ms, 120.0)

            if not gate_regions:
                logger.warning(
                    "call_gate: no regions after filter; passing through full denoised audio",
                    extra={"recording_id": recording_id, "pre_calls": len(pre_detection_calls)},
                )

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

        if isolate_preset:
            # Trim remaining non-elephant high-frequency noise for call-isolated output.
            low_hz, high_hz = self._isolate_band_limits(pre_detection_calls)
            cleaned_audio = await asyncio.to_thread(
                apply_bandpass_filter,
                cleaned_audio,
                sr,
                low_hz=low_hz,
                high_hz=high_hz,
            )

        await self._notify(progress_callback, "denoising:complete", "complete", 62)
        self._record_stage_duration(recording_id, PipelineStage.DENOISING, stage_start)

        gate_meta: dict[str, Any] = {
            "enabled": False,
            "skipped_reason": None,
            "pre_detection_call_count": len(pre_detection_calls),
            "regions_sample_index_pairs": [],
        }
        quality_reference_audio = y
        quality_mode = "standard"
        if gate_enabled and gate_regions:
            fade_samples = max(0, int(round(gate_fade_ms / 1000.0 * sr)))
            envelope = build_smooth_envelope(len(cleaned_audio), gate_regions, fade_samples, gate_floor_linear)
            cleaned_audio = apply_time_gate(cleaned_audio, envelope)
            if isolate_preset:
                # For call-isolated output, quality should compare against call windows,
                # not the full recording timeline including intentionally muted regions.
                quality_reference_audio = apply_time_gate(y, envelope)
                quality_mode = "call_isolation"
            gate_meta = {
                "enabled": True,
                "skipped_reason": None,
                "pre_detection_call_count": len(pre_detection_calls),
                "regions_sample_index_pairs": [[int(a), int(b)] for a, b in gate_regions],
                "fade_ms": gate_fade_ms,
                "floor_linear": gate_floor_linear,
                "min_confidence": gate_min_confidence,
                "pad_ms": gate_pad_ms,
                "merge_gap_ms": gate_merge_gap_ms,
                "coverage_ratio": round(self._region_coverage_ratio(gate_regions, len(cleaned_audio)), 4),
                "mode": "isolate" if isolate_preset else "standard",
                "bandpass_low_hz": low_hz if isolate_preset else None,
                "bandpass_high_hz": high_hz if isolate_preset else None,
                "quality_mode": quality_mode,
            }
        elif gate_enabled:
            gate_meta["skipped_reason"] = "no_regions_passed_filter"

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

        await self._notify(progress_callback, PipelineStage.FEATURE_EXTRACTION.value, "active", 80)
        await self._notify(progress_callback, "calls:detecting", "active", 80)
        stage_start = time.perf_counter()
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
        quality = await asyncio.to_thread(
            assess_quality,
            quality_reference_audio,
            cleaned_audio,
            sr,
            mode=quality_mode,
        )
        self._record_stage_duration(recording_id, PipelineStage.QUALITY_CHECK, stage_start)
        await self._notify(
            progress_callback,
            PipelineStage.QUALITY_CHECK.value,
            "complete",
            95,
            {"quality": quality},
        )

        # RMS-normalise in the elephant vocalization band (8-1200 Hz) so that
        # playback loudness matches the original without re-amplifying residual
        # broadband noise.  If the elephant-band energy is negligible in the
        # cleaned output (fully gated silence, for instance) we fall back to a
        # conservative whole-signal RMS match at 80% of original level.
        from scipy.signal import butter, sosfiltfilt

        def _band_rms(signal: np.ndarray, sample_rate: int, low: float = 8.0, high: float = 1200.0) -> float:
            nyq = sample_rate / 2.0
            lo = max(low / nyq, 1e-6)
            hi = min(high / nyq, 1.0 - 1e-6)
            if lo >= hi or signal.size == 0:
                return float(np.sqrt(np.mean(signal ** 2))) if signal.size else 0.0
            sos = butter(4, [lo, hi], btype="band", output="sos")
            filtered = sosfiltfilt(sos, signal)
            return float(np.sqrt(np.mean(filtered ** 2)))

        orig_rms = _band_rms(y, sr)
        clean_rms = _band_rms(cleaned_audio, sr)

        if clean_rms > 1e-10 and orig_rms > 1e-10:
            gain = orig_rms / clean_rms
            # Clamp gain to prevent excessive amplification (max 6 dB boost)
            gain = min(gain, 2.0)
            cleaned_audio = cleaned_audio * np.float32(gain)
        elif cleaned_audio.size > 0:
            # Fallback: conservative whole-signal RMS match
            full_orig_rms = float(np.sqrt(np.mean(y ** 2)))
            full_clean_rms = float(np.sqrt(np.mean(cleaned_audio ** 2)))
            if full_clean_rms > 1e-10 and full_orig_rms > 1e-10:
                gain = min(full_orig_rms / full_clean_rms * 0.8, 2.0)
                cleaned_audio = cleaned_audio * np.float32(gain)

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
            "isolate_preset": isolate_preset,
            "call_gate": gate_meta,
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
