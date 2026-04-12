"""Dual-output classifier for elephant call type and social function."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from echofield.ml.model_registry import ModelRegistry

_CT_MODEL = "call_type_classifier"
_SF_MODEL = "social_function_classifier"
_FKEYS_KEY = "feature_keys"


class CallClassifier:
    """Two independent sklearn pipelines: one for call type, one for social function."""

    def __init__(self, model_dir: str | Path = "data/models/ml") -> None:
        self._registry = ModelRegistry(base_dir=model_dir)
        self._ct_pipeline: Pipeline | None = None
        self._sf_pipeline: Pipeline | None = None
        self._feature_keys: list[str] | None = None

        # Try to restore from saved models on construction
        self._try_load()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def train(self, labeled_data: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        """Train both pipelines and persist via ModelRegistry.

        Parameters
        ----------
        labeled_data:
            Each entry must contain:
            - ``acoustic_features``: dict of numeric feature values
            - ``call_type_refined``: str label
            - ``social_function``: str label

        Returns
        -------
        dict with keys ``call_type`` and ``social_function``, each containing
        ``accuracy`` and ``per_class_f1``.
        """
        if not labeled_data:
            raise ValueError("labeled_data must not be empty")

        # Discover and sort feature keys from first sample
        first_features = labeled_data[0]["acoustic_features"]
        self._feature_keys = sorted(k for k, v in first_features.items() if isinstance(v, (int, float)))

        # Build feature matrix and labels
        X = self._build_X(labeled_data)
        y_ct = [row["call_type_refined"] for row in labeled_data]
        y_sf = [row["social_function"] for row in labeled_data]

        # Train call_type pipeline
        ct_result = self._train_pipeline(_CT_MODEL, X, y_ct)
        self._ct_pipeline = ct_result["pipeline"]

        # Train social_function pipeline
        sf_result = self._train_pipeline(_SF_MODEL, X, y_sf)
        self._sf_pipeline = sf_result["pipeline"]

        # Persist feature keys in benchmark history of a lightweight sentinel
        # We store them as extra metadata in an extra registry entry so that
        # new instances can recover them without re-training.
        self._persist_feature_keys()

        return {
            "call_type": {
                "accuracy": ct_result["accuracy"],
                "per_class_f1": ct_result["per_class_f1"],
            },
            "social_function": {
                "accuracy": sf_result["accuracy"],
                "per_class_f1": sf_result["per_class_f1"],
            },
        }

    def predict(self, features: dict[str, Any]) -> dict[str, Any] | None:
        """Predict call type and social function for a single feature dict.

        Returns None if neither pipeline has been trained/loaded.
        """
        if self._ct_pipeline is None or self._sf_pipeline is None:
            return None
        if self._feature_keys is None:
            return None

        x = self._build_feature_vector(features)

        ct_probs = self._ct_pipeline.predict_proba([x])[0]
        sf_probs = self._sf_pipeline.predict_proba([x])[0]

        ct_classes = self._ct_pipeline.classes_
        sf_classes = self._sf_pipeline.classes_

        ct_idx = int(np.argmax(ct_probs))
        sf_idx = int(np.argmax(sf_probs))

        ct_confidence = float(ct_probs[ct_idx])
        sf_confidence = float(sf_probs[sf_idx])

        return {
            "call_type": ct_classes[ct_idx],
            "social_function": sf_classes[sf_idx],
            "confidence": min(ct_confidence, sf_confidence),
            "call_type_probs": {cls: float(p) for cls, p in zip(ct_classes, ct_probs)},
            "social_function_probs": {cls: float(p) for cls, p in zip(sf_classes, sf_probs)},
        }

    @property
    def feature_keys(self) -> list[str] | None:
        """Sorted list of feature keys used for training, or None if untrained."""
        return self._feature_keys

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _make_pipeline(self) -> Pipeline:
        return Pipeline([
            ("scaler", StandardScaler()),
            ("clf", RandomForestClassifier(
                n_estimators=200,
                class_weight="balanced",
                random_state=42,
                max_depth=15,
            )),
        ])

    def _build_X(self, labeled_data: list[dict[str, Any]]) -> np.ndarray:
        rows = []
        for row in labeled_data:
            vec = self._build_feature_vector(row["acoustic_features"])
            rows.append(vec)
        return np.array(rows, dtype=float)

    def _build_feature_vector(self, features: dict[str, Any]) -> np.ndarray:
        """Build a 1-D numpy array from a feature dict using stored _feature_keys."""
        assert self._feature_keys is not None, "Feature keys not set — call train() first"
        return np.array([float(features.get(k, 0.0)) for k in self._feature_keys], dtype=float)

    def _train_pipeline(
        self, model_name: str, X: np.ndarray, y: list[str]
    ) -> dict[str, Any]:
        pipeline = self._make_pipeline()
        pipeline.fit(X, y)
        y_pred = pipeline.predict(X)
        accuracy = float(accuracy_score(y, y_pred))
        per_class_f1 = f1_score(y, y_pred, average=None, labels=pipeline.classes_).tolist()

        metrics = {
            "accuracy": accuracy,
            "per_class_f1": dict(zip(pipeline.classes_.tolist(), per_class_f1)),
        }
        self._registry.save(
            model_name=model_name,
            model=pipeline,
            metrics=metrics,
            label_count=len(set(y)),
        )
        return {"pipeline": pipeline, "accuracy": accuracy, "per_class_f1": metrics["per_class_f1"]}

    def _persist_feature_keys(self) -> None:
        """Store feature_keys in benchmark history so new instances can recover them."""
        import json

        fkeys_path = self._registry._model_dir(_FKEYS_KEY) / "keys.json"
        fkeys_path.write_text(
            json.dumps({"feature_keys": self._feature_keys}, indent=2),
            encoding="utf-8",
        )

    def _recover_feature_keys(self) -> list[str] | None:
        """Load feature keys persisted by _persist_feature_keys."""
        import json

        fkeys_path = self._registry._model_dir(_FKEYS_KEY) / "keys.json"
        if not fkeys_path.exists():
            return None
        data = json.loads(fkeys_path.read_text(encoding="utf-8"))
        return data.get("feature_keys")

    def _try_load(self) -> None:
        """Attempt to load the latest trained models and feature keys from registry."""
        ct_pipeline = self._registry.load(_CT_MODEL)
        sf_pipeline = self._registry.load(_SF_MODEL)
        if ct_pipeline is not None and sf_pipeline is not None:
            self._ct_pipeline = ct_pipeline
            self._sf_pipeline = sf_pipeline
            self._feature_keys = self._recover_feature_keys()
