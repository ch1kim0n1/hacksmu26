from __future__ import annotations
from pathlib import Path
import pytest


def _make_calls():
    return {
        "c1": {"id": "c1", "call_type": "rumble", "confidence": 0.9, "acoustic_features": {"f0": 1.0}, "recording_id": "r1", "duration_ms": 500},
        "c2": {"id": "c2", "call_type": "trumpet", "confidence": 0.3, "acoustic_features": {"f0": 2.0}, "recording_id": "r1", "duration_ms": 300},
        "c3": {"id": "c3", "call_type": "rumble", "confidence": 0.5, "acoustic_features": {"f0": 3.0}, "recording_id": "r2", "duration_ms": 800},
    }


def test_labeling_queue_returns_most_uncertain_first(tmp_path: Path):
    from echofield.ml.active_learning import ActiveLearningManager
    mgr = ActiveLearningManager(labels_path=tmp_path / "labels.json", model_dir=tmp_path / "models")
    queue = mgr.get_labeling_queue(_make_calls(), limit=3)
    assert queue[0]["id"] == "c2"
    assert queue[1]["id"] == "c3"


def test_labeling_queue_excludes_already_labeled(tmp_path: Path):
    from echofield.ml.active_learning import ActiveLearningManager
    mgr = ActiveLearningManager(labels_path=tmp_path / "labels.json", model_dir=tmp_path / "models")
    mgr.save_label("c2", "trumpet", "responding")
    calls = _make_calls()
    queue = mgr.get_labeling_queue(calls, limit=10)
    assert all(item["id"] != "c2" for item in queue)


def test_save_label_persists(tmp_path: Path):
    from echofield.ml.active_learning import ActiveLearningManager
    mgr = ActiveLearningManager(labels_path=tmp_path / "labels.json", model_dir=tmp_path / "models")
    mgr.save_label("c1", "contact-rumble", "initiating")
    labels = mgr.get_all_labels()
    assert len(labels) == 1
    assert labels["c1"]["call_type_refined"] == "contact-rumble"
    assert labels["c1"]["social_function"] == "initiating"


def test_should_retrain_after_threshold(tmp_path: Path):
    from echofield.ml.active_learning import ActiveLearningManager
    mgr = ActiveLearningManager(labels_path=tmp_path / "labels.json", model_dir=tmp_path / "models", retrain_threshold=3)
    mgr.save_label("c1", "trumpet", "initiating")
    mgr.save_label("c2", "roar", "responding")
    assert not mgr.should_retrain()
    mgr.save_label("c3", "bark", "unknown")
    assert mgr.should_retrain()


def test_mark_retrained_resets_counter(tmp_path: Path):
    from echofield.ml.active_learning import ActiveLearningManager
    mgr = ActiveLearningManager(labels_path=tmp_path / "labels.json", model_dir=tmp_path / "models", retrain_threshold=2)
    mgr.save_label("c1", "trumpet", "initiating")
    mgr.save_label("c2", "roar", "responding")
    assert mgr.should_retrain()
    mgr.mark_retrained()
    assert not mgr.should_retrain()


def test_labels_since_last_train(tmp_path: Path):
    from echofield.ml.active_learning import ActiveLearningManager
    mgr = ActiveLearningManager(labels_path=tmp_path / "labels.json", model_dir=tmp_path / "models", retrain_threshold=20)
    mgr.save_label("c1", "trumpet", "initiating")
    mgr.save_label("c2", "roar", "responding")
    assert mgr.labels_since_last_train == 2
    mgr.mark_retrained()
    assert mgr.labels_since_last_train == 0
