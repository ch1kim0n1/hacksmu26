from __future__ import annotations
from pathlib import Path
import pytest


def test_registry_starts_empty(tmp_path: Path):
    from echofield.ml.model_registry import ModelRegistry
    registry = ModelRegistry(base_dir=tmp_path / "models")
    assert registry.latest_version("call_type") is None
    assert registry.latest_version("social_fn") is None


def test_save_and_load_round_trip(tmp_path: Path):
    from echofield.ml.model_registry import ModelRegistry
    from sklearn.ensemble import RandomForestClassifier
    registry = ModelRegistry(base_dir=tmp_path / "models")
    model = RandomForestClassifier(n_estimators=5, random_state=42)
    model.fit([[1, 2], [3, 4]], ["a", "b"])
    metrics = {"accuracy": 0.95, "ece": 0.02}
    version = registry.save("call_type", model, metrics, label_count=10)
    assert version == "v1"
    loaded = registry.load("call_type")
    assert loaded is not None
    assert loaded.predict([[1, 2]])[0] == "a"


def test_version_increments(tmp_path: Path):
    from echofield.ml.model_registry import ModelRegistry
    from sklearn.ensemble import RandomForestClassifier
    registry = ModelRegistry(base_dir=tmp_path / "models")
    for i in range(3):
        model = RandomForestClassifier(n_estimators=5, random_state=42)
        model.fit([[1, 2], [3, 4]], ["a", "b"])
        version = registry.save("call_type", model, {"accuracy": 0.9}, label_count=10 + i)
    assert version == "v3"
    assert registry.latest_version("call_type") == "v3"


def test_benchmarks_accumulate(tmp_path: Path):
    from echofield.ml.model_registry import ModelRegistry
    from sklearn.ensemble import RandomForestClassifier
    registry = ModelRegistry(base_dir=tmp_path / "models")
    for i in range(2):
        model = RandomForestClassifier(n_estimators=5, random_state=42)
        model.fit([[1, 2], [3, 4]], ["a", "b"])
        registry.save("call_type", model, {"accuracy": 0.8 + i * 0.1}, label_count=10 + i * 10)
    history = registry.get_benchmark_history("call_type")
    assert len(history) == 2
    assert history[0]["metrics"]["accuracy"] == 0.8
    assert history[1]["metrics"]["accuracy"] == pytest.approx(0.9)
    assert history[1]["label_count"] == 20


def test_load_nonexistent_returns_none(tmp_path: Path):
    from echofield.ml.model_registry import ModelRegistry
    registry = ModelRegistry(base_dir=tmp_path / "models")
    assert registry.load("social_fn") is None
