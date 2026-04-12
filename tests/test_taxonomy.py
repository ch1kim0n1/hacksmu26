# tests/test_taxonomy.py
from __future__ import annotations


def test_call_types_has_eight_entries():
    from echofield.ml.taxonomy import CALL_TYPES
    assert len(CALL_TYPES) == 8


def test_social_functions_has_five_entries():
    from echofield.ml.taxonomy import SOCIAL_FUNCTIONS
    assert len(SOCIAL_FUNCTIONS) == 5


def test_validate_call_type_accepts_valid():
    from echofield.ml.taxonomy import validate_call_type
    assert validate_call_type("contact-rumble") == "contact-rumble"


def test_validate_call_type_rejects_invalid():
    from echofield.ml.taxonomy import validate_call_type
    assert validate_call_type("made-up-type") is None


def test_validate_social_function_accepts_valid():
    from echofield.ml.taxonomy import validate_social_function
    assert validate_social_function("initiating") == "initiating"


def test_validate_social_function_rejects_invalid():
    from echofield.ml.taxonomy import validate_social_function
    assert validate_social_function("dancing") is None


def test_display_name_returns_human_readable():
    from echofield.ml.taxonomy import display_name
    assert display_name("lets-go-rumble") == "Let's-Go Rumble"
    assert display_name("maintaining-contact") == "Maintaining Contact"
