"""Research summary generation and publishability scoring."""

from __future__ import annotations

import math
from collections import Counter
from datetime import datetime, timezone
from typing import Any


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Safely convert a value to float, returning default on failure."""
    if value is None:
        return default
    try:
        result = float(value)
        if not math.isfinite(result):
            return default
        return result
    except (TypeError, ValueError):
        return default


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    """Clamp a value between lo and hi."""
    return max(lo, min(hi, value))


def compute_publishability_score(
    snr_after_db: float,
    energy_preservation: float,
    spectral_distortion: float,
    confidence: float,
) -> dict[str, Any]:
    """Compute publishability score mapping technical quality to academic standards.

    Returns:
        {
            "score": float (0-100),
            "tier": str ("publishable" | "research_grade" | "reference_only" | "insufficient"),
            "tier_label": str (human-readable),
            "components": {
                "snr": {"value": float, "weight": 0.35, "contribution": float},
                "energy_preservation": {"value": float, "weight": 0.25, "contribution": float},
                "spectral_fidelity": {"value": float, "weight": 0.20, "contribution": float},
                "classification_confidence": {"value": float, "weight": 0.20, "contribution": float}
            }
        }

    Tier thresholds:
        85-100: "publishable" -- peer-review ready
        70-84: "research_grade" -- usable for analysis
        50-69: "reference_only" -- patterns visible, metrics unreliable
        <50: "insufficient" -- do not use for research
    """
    snr = _safe_float(snr_after_db)
    ep = _clamp(_safe_float(energy_preservation), 0.0, 1.0)
    sd = _clamp(_safe_float(spectral_distortion), 0.0, 1.0)
    conf = _clamp(_safe_float(confidence), 0.0, 1.0)

    # SNR component (weight 0.35): >20 dB = 100%, 15-20 dB = linear 50-100%,
    # <15 dB = proportional 0-50% (floored at 0 dB)
    if snr >= 20.0:
        snr_normalized = 100.0
    elif snr >= 15.0:
        snr_normalized = 50.0 + (snr - 15.0) / 5.0 * 50.0
    elif snr > 0.0:
        snr_normalized = snr / 15.0 * 50.0
    else:
        snr_normalized = 0.0

    # Energy preservation (weight 0.25): 0-1 mapped to 0-100
    ep_normalized = ep * 100.0

    # Spectral fidelity (weight 0.20): 1 - spectral_distortion, clamped 0-1
    fidelity = _clamp(1.0 - sd, 0.0, 1.0)
    fidelity_normalized = fidelity * 100.0

    # Classification confidence (weight 0.20): confidence * 100
    conf_normalized = conf * 100.0

    snr_contribution = snr_normalized * 0.35
    ep_contribution = ep_normalized * 0.25
    fidelity_contribution = fidelity_normalized * 0.20
    conf_contribution = conf_normalized * 0.20

    score = round(_clamp(
        snr_contribution + ep_contribution + fidelity_contribution + conf_contribution,
    ), 1)

    # Determine tier
    if score >= 85.0:
        tier = "publishable"
        tier_label = "Publishable — peer-review ready"
    elif score >= 70.0:
        tier = "research_grade"
        tier_label = "Research grade — usable for analysis"
    elif score >= 50.0:
        tier = "reference_only"
        tier_label = "Reference only — patterns visible, metrics unreliable"
    else:
        tier = "insufficient"
        tier_label = "Insufficient — do not use for research"

    return {
        "score": score,
        "tier": tier,
        "tier_label": tier_label,
        "components": {
            "snr": {
                "value": round(snr, 2),
                "weight": 0.35,
                "contribution": round(snr_contribution, 2),
            },
            "energy_preservation": {
                "value": round(ep, 4),
                "weight": 0.25,
                "contribution": round(ep_contribution, 2),
            },
            "spectral_fidelity": {
                "value": round(fidelity, 4),
                "weight": 0.20,
                "contribution": round(fidelity_contribution, 2),
            },
            "classification_confidence": {
                "value": round(conf, 4),
                "weight": 0.20,
                "contribution": round(conf_contribution, 2),
            },
        },
    }


def _compute_call_publishability(call: dict[str, Any], quality: dict[str, Any]) -> dict[str, Any]:
    """Compute publishability for a single call using available quality data."""
    snr_after = _safe_float(quality.get("snr_after_db"))
    ep = _safe_float(quality.get("energy_preservation"), default=0.5)
    sd = _safe_float(quality.get("spectral_distortion"))
    conf = _safe_float(call.get("confidence"))
    return compute_publishability_score(snr_after, ep, sd, conf)


def _tier_for_score(score: float) -> str:
    """Return the tier string for a given score."""
    if score >= 85.0:
        return "publishable"
    if score >= 70.0:
        return "research_grade"
    if score >= 50.0:
        return "reference_only"
    return "insufficient"


def generate_recording_summary(
    recording: dict[str, Any],
    calls: list[dict[str, Any]],
) -> dict[str, Any]:
    """Generate a structured research summary for a processed recording.

    Args:
        recording: Recording dict with id, filename, duration_s, status,
            metadata, result. The ``result`` dict may contain ``quality``
            (from quality_check.assess_quality), ``noise_types`` (list of
            noise detections), and ``calls``.
        calls: List of call dicts detected in this recording. Each call
            has id, call_type, confidence, start_ms, duration_ms,
            individual_id, acoustic_features, etc.

    Returns:
        {
            "recording_id": str,
            "filename": str,
            "duration_s": float,
            "processing_date": str,
            "noise_environment": {
                "primary_type": str,
                "severity": str,
                "pct_affected": float
            },
            "call_inventory": {
                "total_calls": int,
                "by_type": {"rumble": 3, "contact_call": 1, ...},
                "by_tier": {"publishable": 5, "research_grade": 2, ...},
                "individuals_detected": int,
                "individual_ids": [str]
            },
            "quality_assessment": {
                "avg_publishability_score": float,
                "avg_snr_improvement_db": float,
                "best_call_id": str | None,
                "best_call_score": float
            },
            "notable_findings": [str],
            "recommended_actions": [str]
        }
    """
    recording_id = recording.get("id") or ""
    filename = recording.get("filename") or ""
    duration_s = _safe_float(recording.get("duration_s"))
    result = recording.get("result") or {}
    quality = result.get("quality") or {}
    metadata = recording.get("metadata") or {}
    processing = recording.get("processing") or {}

    # Processing date: prefer completed_at from processing, then uploaded_at
    processing_date = (
        processing.get("completed_at")
        or recording.get("uploaded_at")
        or datetime.now(timezone.utc).isoformat()
    )

    # --- Noise environment ---
    noise_types = result.get("noise_types") or []
    if noise_types:
        # noise_types is a list of dicts with 'type', 'confidence', 'pct_frames' etc.
        primary_noise = noise_types[0] if isinstance(noise_types[0], dict) else {"type": str(noise_types[0])}
        primary_type = primary_noise.get("type") or "unknown"
        # Estimate severity from SNR before denoising
        snr_before = _safe_float(quality.get("snr_before_db"))
        if snr_before < 5.0:
            severity = "severe"
        elif snr_before < 10.0:
            severity = "moderate"
        elif snr_before < 20.0:
            severity = "mild"
        else:
            severity = "minimal"
        pct_affected = _safe_float(primary_noise.get("pct_frames"), default=0.0)
    elif metadata.get("noise_type_ref"):
        primary_type = str(metadata["noise_type_ref"])
        severity = "unknown"
        pct_affected = 0.0
    else:
        primary_type = "none_detected"
        severity = "none"
        pct_affected = 0.0

    noise_environment = {
        "primary_type": primary_type,
        "severity": severity,
        "pct_affected": round(pct_affected, 1),
    }

    # --- Call inventory ---
    type_counts: Counter[str] = Counter()
    tier_counts: Counter[str] = Counter()
    individual_ids: list[str] = []
    individual_set: set[str] = set()
    publishability_scores: list[float] = []
    best_call_id: str | None = None
    best_call_score: float = -1.0

    for call in calls:
        call_type = str(call.get("call_type") or "unknown")
        type_counts[call_type] += 1

        # Compute per-call publishability
        pub = _compute_call_publishability(call, quality)
        score = pub["score"]
        publishability_scores.append(score)
        tier_counts[pub["tier"]] += 1

        if score > best_call_score:
            best_call_score = score
            best_call_id = call.get("id")

        # Track individuals
        ind_id = call.get("individual_id")
        if ind_id and ind_id not in individual_set:
            individual_set.add(ind_id)
            individual_ids.append(ind_id)

    call_inventory = {
        "total_calls": len(calls),
        "by_type": dict(type_counts.most_common()),
        "by_tier": {
            tier: tier_counts.get(tier, 0)
            for tier in ("publishable", "research_grade", "reference_only", "insufficient")
        },
        "individuals_detected": len(individual_ids),
        "individual_ids": individual_ids,
    }

    # --- Quality assessment ---
    avg_pub_score = (
        round(sum(publishability_scores) / len(publishability_scores), 1)
        if publishability_scores
        else 0.0
    )
    avg_snr_improvement = round(_safe_float(quality.get("snr_improvement_db")), 2)

    quality_assessment = {
        "avg_publishability_score": avg_pub_score,
        "avg_snr_improvement_db": avg_snr_improvement,
        "best_call_id": best_call_id,
        "best_call_score": round(best_call_score, 1) if best_call_score >= 0.0 else 0.0,
    }

    # --- Notable findings ---
    notable_findings: list[str] = []

    if not calls:
        notable_findings.append("No vocalizations detected in this recording.")
    else:
        # Rare or unusual call types
        rare_types = {"novel", "cry", "roar", "greeting", "play"}
        found_rare = [ct for ct in type_counts if ct in rare_types]
        if found_rare:
            notable_findings.append(
                f"Unusual call type(s) detected: {', '.join(sorted(found_rare))}."
            )

        # Multiple individuals
        if len(individual_ids) > 1:
            notable_findings.append(
                f"Multi-speaker recording: {len(individual_ids)} distinct individuals detected."
            )

        # High-confidence reference-quality calls
        high_conf_calls = [
            c for c in calls if _safe_float(c.get("confidence")) >= 0.9
        ]
        if high_conf_calls:
            notable_findings.append(
                f"{len(high_conf_calls)} call(s) with >=90% classification confidence — "
                f"suitable as reference exemplars."
            )

        # Large SNR improvement
        if avg_snr_improvement >= 10.0:
            notable_findings.append(
                f"Significant noise removal: {avg_snr_improvement} dB SNR improvement."
            )

        # Dominant call type
        if type_counts:
            dominant_type, dominant_count = type_counts.most_common(1)[0]
            if dominant_count > 1 and dominant_count >= len(calls) * 0.6:
                notable_findings.append(
                    f"Recording dominated by {dominant_type} calls "
                    f"({dominant_count}/{len(calls)})."
                )

        # Long recording with many calls — high-value field session
        if duration_s > 300.0 and len(calls) >= 10:
            notable_findings.append(
                f"Extended field session ({duration_s:.0f}s) with {len(calls)} calls — "
                f"high-value for behavioral analysis."
            )

    # --- Recommended actions ---
    recommended_actions: list[str] = []

    if not calls:
        recommended_actions.append(
            "Verify audio file is an elephant recording. Consider adjusting "
            "detection sensitivity if vocalizations are expected."
        )
    else:
        # Low-confidence calls need review
        low_conf_calls = [
            c for c in calls if _safe_float(c.get("confidence")) < 0.5
        ]
        if low_conf_calls:
            recommended_actions.append(
                f"Review {len(low_conf_calls)} low-confidence call(s) for manual classification."
            )

        # Insufficient-tier calls
        insufficient_count = tier_counts.get("insufficient", 0)
        if insufficient_count > 0:
            recommended_actions.append(
                f"{insufficient_count} call(s) scored below publishable quality — "
                f"consider re-processing with adjusted noise profiles."
            )

        # Cross-reference individuals
        if individual_ids:
            recommended_actions.append(
                f"Cross-reference {len(individual_ids)} detected individual(s) "
                f"with known ElephantVoices vocal profiles."
            )

        # Severe noise
        if severity == "severe":
            recommended_actions.append(
                "Severe noise environment detected. Manual spectrogram inspection "
                "recommended to verify call boundaries."
            )

        # Novel calls need expert review
        if type_counts.get("novel", 0) > 0:
            recommended_actions.append(
                f"{type_counts['novel']} novel/anomalous call(s) detected — "
                f"expert acoustic review recommended."
            )

        # If mostly publishable, note readiness
        publishable_count = tier_counts.get("publishable", 0)
        if publishable_count > 0 and publishable_count == len(calls):
            recommended_actions.append(
                "All calls meet publishable quality. Ready for inclusion in "
                "research datasets and publications."
            )

    return {
        "recording_id": recording_id,
        "filename": filename,
        "duration_s": duration_s,
        "processing_date": processing_date,
        "noise_environment": noise_environment,
        "call_inventory": call_inventory,
        "quality_assessment": quality_assessment,
        "notable_findings": notable_findings,
        "recommended_actions": recommended_actions,
    }
