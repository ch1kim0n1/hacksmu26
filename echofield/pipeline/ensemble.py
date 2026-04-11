"""Hybrid ensemble scoring for EchoField denoising pipeline.

Generates multiple denoised candidates (spectral gating, U-Net, Demucs),
scores each on harmonic preservation, SNR improvement, artifact level,
and energy preservation, then selects and returns the best output.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from echofield.pipeline.quality_check import (
    compute_energy_preservation,
    compute_snr,
    compute_spectral_distortion,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _estimate_harmonic_preservation(
    y_original: np.ndarray,
    y_candidate: np.ndarray,
    sr: int,
) -> float:
    """Score how well harmonic structure is preserved (0–1).

    Uses harmonic-percussive separation energy ratio as a proxy.
    Higher means more of the original harmonic content is retained.
    """
    try:
        import librosa

        min_len = min(len(y_original), len(y_candidate))
        if min_len < 512:
            return 0.5

        yo = y_original[:min_len].astype(np.float32)
        yc = y_candidate[:min_len].astype(np.float32)

        harm_orig, _ = librosa.effects.hpss(yo)
        harm_cand, _ = librosa.effects.hpss(yc)

        energy_orig = float(np.sum(harm_orig ** 2))
        energy_cand = float(np.sum(harm_cand ** 2))

        if energy_orig < 1e-12:
            return 1.0

        ratio = energy_cand / energy_orig
        # Ideal is ratio close to 1. Score drops off for both over- and under-
        # preservation (over-preservation can mean noise kept as "harmonics").
        return float(min(ratio, 1.0))
    except Exception:
        return 0.5


def _estimate_artifact_level(y_candidate: np.ndarray, sr: int) -> float:
    """Estimate musical noise / artifact level (0=clean, 1=heavy artifacts).

    Detects unnatural high-frequency bursts introduced by over-aggressive
    spectral processing, measured via variance of short-time spectral flux.
    """
    try:
        import librosa

        if len(y_candidate) < 1024:
            return 0.0

        S = np.abs(librosa.stft(y_candidate.astype(np.float32), n_fft=512, hop_length=128))
        # Spectral flux: frame-to-frame spectral change
        flux = np.diff(S, axis=1)
        flux_energy = np.mean(flux ** 2, axis=0)

        if len(flux_energy) < 2:
            return 0.0

        # High variance in flux indicates artifact bursts
        artifact_score = float(np.std(flux_energy) / (np.mean(flux_energy) + 1e-12))
        # Clamp to [0, 1]; values > 5 are definitely artifact-heavy
        return float(min(artifact_score / 5.0, 1.0))
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class CandidateResult:
    method: str
    audio: np.ndarray
    scores: dict[str, float] = field(default_factory=dict)
    composite_score: float = 0.0
    available: bool = True


# ---------------------------------------------------------------------------
# Candidate generators
# ---------------------------------------------------------------------------

def _run_spectral(y: np.ndarray, sr: int, aggressiveness: float) -> np.ndarray:
    from echofield.pipeline.spectral_gate import spectral_gate_denoise
    result = spectral_gate_denoise(y, sr, aggressiveness=aggressiveness)
    return result["cleaned_audio"]


def _run_unet(y: np.ndarray, sr: int, model_path: str | None) -> np.ndarray | None:
    """Run U-Net denoiser. Returns None if unavailable."""
    from echofield.pipeline.deep_denoise import _run_tiny_unet_with_torch
    refined = _run_tiny_unet_with_torch(y, model_path)
    return refined


def _run_demucs(y: np.ndarray, sr: int) -> np.ndarray | None:
    """Run Demucs vocal separation as a denoiser. Returns None if unavailable."""
    try:
        import torch
        from demucs.pretrained import get_model
        from demucs.apply import apply_model

        model = get_model("htdemucs")
        model.eval()

        # Demucs expects stereo float32 at model's sample rate
        target_sr = getattr(model, "samplerate", 44100)
        if sr != target_sr:
            import librosa
            y_resampled = librosa.resample(y.astype(np.float32), orig_sr=sr, target_sr=target_sr)
        else:
            y_resampled = y.astype(np.float32)

        # Make stereo tensor [1, 2, T]
        stereo = np.stack([y_resampled, y_resampled], axis=0)
        wav = torch.from_numpy(stereo).unsqueeze(0)

        with torch.no_grad():
            sources = apply_model(model, wav, device="cpu", progress=False)

        # Extract vocals stem (index 3 for htdemucs: drums/bass/other/vocals)
        vocals = sources[0, 3].mean(dim=0).numpy().astype(np.float32)

        # Resample back if needed
        if sr != target_sr:
            import librosa
            vocals = librosa.resample(vocals, orig_sr=target_sr, target_sr=sr)

        # Match length
        min_len = min(len(y), len(vocals))
        return vocals[:min_len]

    except Exception:
        return None


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def score_candidate(
    y_original: np.ndarray,
    y_candidate: np.ndarray,
    sr: int,
) -> dict[str, float]:
    """Compute per-dimension scores for a denoised candidate.

    Returns a dict with individual scores and a composite (0–100).
    """
    snr_before = compute_snr(y_original, sr)
    snr_after = compute_snr(y_candidate, sr)
    snr_improvement = snr_after - snr_before  # dB

    energy_pres = compute_energy_preservation(y_original, y_candidate, sr)
    spec_distortion = compute_spectral_distortion(y_original, y_candidate, sr)
    harmonic_pres = _estimate_harmonic_preservation(y_original, y_candidate, sr)
    artifact_level = _estimate_artifact_level(y_candidate, sr)

    # Composite (0–100)
    snr_score = min(max(snr_improvement, 0.0) / 20.0 * 35.0, 35.0)       # 0–35 pts
    energy_score = energy_pres * 25.0                                        # 0–25 pts
    harmonic_score = harmonic_pres * 20.0                                    # 0–20 pts
    distortion_score = max(1.0 - spec_distortion, 0.0) * 12.0               # 0–12 pts
    artifact_score = max(1.0 - artifact_level, 0.0) * 8.0                   # 0–8  pts

    composite = snr_score + energy_score + harmonic_score + distortion_score + artifact_score
    composite = round(min(max(composite, 0.0), 100.0), 2)

    return {
        "snr_before_db": round(snr_before, 2),
        "snr_after_db": round(snr_after, 2),
        "snr_improvement_db": round(snr_improvement, 2),
        "energy_preservation": round(energy_pres, 4),
        "spectral_distortion": round(spec_distortion, 4),
        "harmonic_preservation": round(harmonic_pres, 4),
        "artifact_level": round(artifact_level, 4),
        "composite": composite,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_ensemble(
    y: np.ndarray,
    sr: int,
    *,
    model_path: str | None = None,
    aggressiveness: float = 1.5,
) -> dict[str, Any]:
    """Generate candidates from all available backends, score, and select best.

    Args:
        y: Original audio samples (1-D float32).
        sr: Sample rate in Hz.
        model_path: Optional path to U-Net checkpoint (.pt file).
        aggressiveness: Spectral gate aggressiveness (0.5–3.0).

    Returns:
        Dict with keys:
          - ``audio``: Best denoised audio (np.ndarray).
          - ``method``: Name of the winning method.
          - ``composite_score``: 0–100 quality score of winning output.
          - ``confidence``: Normalised margin over runner-up (0–1).
          - ``per_method_scores``: Dict mapping method name → score dict.
          - ``candidates_evaluated``: Number of candidates compared.
    """
    candidates: list[CandidateResult] = []

    # --- Candidate 1: Spectral gating (always available) ---
    try:
        spectral_audio = _run_spectral(y, sr, aggressiveness)
        candidates.append(CandidateResult(method="spectral", audio=spectral_audio))
        logger.debug("ensemble: spectral candidate generated")
    except Exception as exc:
        logger.warning("ensemble: spectral gating failed: %s", exc)

    # --- Candidate 2: U-Net (optional, requires torch) ---
    try:
        unet_audio = _run_unet(y, sr, model_path)
        if unet_audio is not None:
            candidates.append(CandidateResult(method="unet", audio=unet_audio))
            logger.debug("ensemble: U-Net candidate generated")
        else:
            logger.debug("ensemble: U-Net unavailable, skipping")
    except Exception as exc:
        logger.warning("ensemble: U-Net candidate failed: %s", exc)

    # --- Candidate 3: Demucs (optional, requires demucs package) ---
    try:
        demucs_audio = _run_demucs(y, sr)
        if demucs_audio is not None:
            candidates.append(CandidateResult(method="demucs", audio=demucs_audio))
            logger.debug("ensemble: Demucs candidate generated")
        else:
            logger.debug("ensemble: Demucs unavailable, skipping")
    except Exception as exc:
        logger.warning("ensemble: Demucs candidate failed: %s", exc)

    # Fallback: if no candidates were generated, return original
    if not candidates:
        logger.warning("ensemble: no candidates available, returning original audio")
        return {
            "audio": y.astype(np.float32),
            "method": "passthrough",
            "composite_score": 0.0,
            "confidence": 0.0,
            "per_method_scores": {},
            "candidates_evaluated": 0,
        }

    # --- Score all candidates ---
    for candidate in candidates:
        candidate.scores = score_candidate(y, candidate.audio, sr)
        candidate.composite_score = candidate.scores["composite"]

    # --- Select best ---
    candidates.sort(key=lambda c: c.composite_score, reverse=True)
    winner = candidates[0]

    # Confidence: normalised margin over runner-up
    if len(candidates) > 1:
        margin = winner.composite_score - candidates[1].composite_score
        confidence = float(min(margin / 20.0, 1.0))  # 20pt margin = full confidence
    else:
        confidence = 1.0

    per_method_scores = {c.method: c.scores for c in candidates}

    logger.info(
        "ensemble: selected '%s' (score=%.1f, confidence=%.2f, candidates=%d)",
        winner.method,
        winner.composite_score,
        confidence,
        len(candidates),
    )

    return {
        "audio": winner.audio,
        "method": winner.method,
        "composite_score": winner.composite_score,
        "confidence": round(confidence, 3),
        "per_method_scores": per_method_scores,
        "candidates_evaluated": len(candidates),
    }
