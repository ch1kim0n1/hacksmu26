"""Claude API narrative interpretation with template fallback."""

from __future__ import annotations

import os
from typing import Any

from echofield.ml.taxonomy import display_name


def _template_narrative(
    call_type: str,
    social_function: str,
    confidence: float,
    top_features: list[tuple[str, float]],
) -> str:
    ct_display = display_name(call_type)
    sf_display = display_name(social_function)
    conf_pct = round(confidence * 100)

    feature_desc = ""
    if top_features:
        parts = [f"{name.replace('_', ' ')}={value}" for name, value in top_features[:3]]
        feature_desc = f" Key acoustic signatures: {', '.join(parts)}."

    if call_type == "unknown" and social_function == "unknown":
        return (
            f"This vocalization could not be confidently classified (confidence: {conf_pct}%). "
            f"Additional labeled examples may help improve detection.{feature_desc}"
        )

    return (
        f"This vocalization is classified as a {ct_display} with a social function of "
        f"{sf_display} (confidence: {conf_pct}%).{feature_desc}"
    )


def generate_narrative(
    call_type: str,
    social_function: str,
    confidence: float,
    top_features: list[tuple[str, float]],
    sequence_context: str | None = None,
) -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return _template_narrative(call_type, social_function, confidence, top_features)

    try:
        import anthropic

        feature_lines = "\n".join(
            f"- {name}: {value}" for name, value in top_features[:5]
        )
        context_line = f"\nSequence context: {sequence_context}" if sequence_context else ""

        prompt = (
            f"You are an expert in elephant bioacoustics. Given the following classification "
            f"of an elephant vocalization, write a 2-3 sentence interpretation of what this "
            f"call likely communicates. Be specific about acoustic properties.\n\n"
            f"Call type: {display_name(call_type)}\n"
            f"Social function: {display_name(social_function)}\n"
            f"Confidence: {round(confidence * 100)}%\n"
            f"Top acoustic features:\n{feature_lines}"
            f"{context_line}\n\n"
            f"Write the interpretation in plain English for a researcher."
        )

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text.strip()
        return text if text else _template_narrative(
            call_type, social_function, confidence, top_features
        )
    except Exception:
        return _template_narrative(call_type, social_function, confidence, top_features)
