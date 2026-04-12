from __future__ import annotations
from pathlib import Path
import numpy as np
import pytest


def _make_training_data():
    """Generate synthetic labeled training data."""
    rng = np.random.default_rng(42)
    data = []
    call_types = ["contact-rumble", "trumpet", "roar", "bark"]
    social_fns = ["initiating", "responding", "maintaining-contact", "unknown"]
    for i in range(40):
        ct = call_types[i % len(call_types)]
        sf = social_fns[i % len(social_fns)]
        features = {f"f{j}": rng.standard_normal() + (i % 4) for j in range(10)}
        data.append({
            "acoustic_features": features,
            "call_type_refined": ct,
            "social_function": sf,
        })
    return data


def test_train_creates_models(tmp_path: Path):
    from echofield.ml.classifier import CallClassifier
    clf = CallClassifier(model_dir=tmp_path / "models")
    training_data = _make_training_data()
    result = clf.train(training_data)
    assert "call_type" in result
    assert "social_function" in result
    assert result["call_type"]["accuracy"] > 0.0
    assert result["social_function"]["accuracy"] > 0.0


def test_predict_returns_both_labels(tmp_path: Path):
    from echofield.ml.classifier import CallClassifier
    clf = CallClassifier(model_dir=tmp_path / "models")
    clf.train(_make_training_data())
    features = {f"f{j}": 0.5 for j in range(10)}
    prediction = clf.predict(features)
    assert prediction is not None
    assert "call_type" in prediction
    assert "social_function" in prediction
    assert "confidence" in prediction
    assert 0.0 <= prediction["confidence"] <= 1.0


def test_predict_returns_none_when_untrained(tmp_path: Path):
    from echofield.ml.classifier import CallClassifier
    clf = CallClassifier(model_dir=tmp_path / "models")
    prediction = clf.predict({"f0": 1.0})
    assert prediction is None


def test_predict_returns_classifier_probs(tmp_path: Path):
    from echofield.ml.classifier import CallClassifier
    clf = CallClassifier(model_dir=tmp_path / "models")
    clf.train(_make_training_data())
    features = {f"f{j}": 0.5 for j in range(10)}
    prediction = clf.predict(features)
    assert "call_type_probs" in prediction
    assert "social_function_probs" in prediction
    assert isinstance(prediction["call_type_probs"], dict)


def test_feature_keys_are_consistent(tmp_path: Path):
    from echofield.ml.classifier import CallClassifier
    clf = CallClassifier(model_dir=tmp_path / "models")
    clf.train(_make_training_data())
    assert clf.feature_keys is not None
    assert len(clf.feature_keys) == 10


def test_classifier_persists_across_instances(tmp_path: Path):
    from echofield.ml.classifier import CallClassifier
    model_dir = tmp_path / "models"
    clf1 = CallClassifier(model_dir=model_dir)
    clf1.train(_make_training_data())
    clf2 = CallClassifier(model_dir=model_dir)
    prediction = clf2.predict({f"f{j}": 0.5 for j in range(10)})
    assert prediction is not None
    assert "call_type" in prediction
