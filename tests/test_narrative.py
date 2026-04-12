from __future__ import annotations
import os


def test_template_fallback_when_no_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from echofield.ml.narrative import generate_narrative
    result = generate_narrative(
        call_type="contact-rumble",
        social_function="initiating",
        confidence=0.85,
        top_features=[
            ("fundamental_frequency_hz", 18.2),
            ("harmonicity", 0.72),
            ("duration_s", 1.2),
        ],
    )
    assert isinstance(result, str)
    assert len(result) > 20
    assert "Contact Rumble" in result
    assert "Initiating" in result


def test_template_includes_confidence():
    from echofield.ml.narrative import generate_narrative
    result = generate_narrative(
        call_type="trumpet",
        social_function="responding",
        confidence=0.42,
        top_features=[("spectral_centroid_hz", 2500.0)],
    )
    assert "42" in result or "0.42" in result


def test_template_handles_unknown_gracefully():
    from echofield.ml.narrative import generate_narrative
    result = generate_narrative(
        call_type="unknown",
        social_function="unknown",
        confidence=0.1,
        top_features=[],
    )
    assert isinstance(result, str)
    assert len(result) > 10
