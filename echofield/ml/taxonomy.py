"""Call type and social function label definitions."""

from __future__ import annotations

CALL_TYPES: list[str] = [
    "rumble",
    "contact-rumble",
    "contact call",
    "lets-go-rumble",
    "musth-rumble",
    "greeting-rumble",
    "greeting",
    "trumpet",
    "roar",
    "bark",
    "cry",
    "play-rumble",
    "play",
    "unknown",
    "novel",
]

SOCIAL_FUNCTIONS: list[str] = [
    "initiating",
    "responding",
    "maintaining-contact",
    "coordinating-movement",
    "unknown",
]

_DISPLAY_NAMES: dict[str, str] = {
    "contact-rumble": "Contact Rumble",
    "contact call": "Contact Call",
    "lets-go-rumble": "Let's-Go Rumble",
    "musth-rumble": "Musth Rumble",
    "greeting-rumble": "Greeting Rumble",
    "greeting": "Greeting",
    "rumble": "Rumble",
    "trumpet": "Trumpet",
    "roar": "Roar",
    "bark": "Bark",
    "cry": "Cry",
    "play-rumble": "Play Rumble",
    "play": "Play",
    "novel": "Novel",
    "initiating": "Initiating",
    "responding": "Responding",
    "maintaining-contact": "Maintaining Contact",
    "coordinating-movement": "Coordinating Movement",
    "unknown": "Unknown",
}

_CALL_TYPE_SET = frozenset(CALL_TYPES)
_SOCIAL_FUNCTION_SET = frozenset(SOCIAL_FUNCTIONS)


def validate_call_type(label: str) -> str | None:
    return label if label in _CALL_TYPE_SET else None


def validate_social_function(label: str) -> str | None:
    return label if label in _SOCIAL_FUNCTION_SET else None


def display_name(label: str) -> str:
    return _DISPLAY_NAMES.get(label, label.replace("-", " ").title())
