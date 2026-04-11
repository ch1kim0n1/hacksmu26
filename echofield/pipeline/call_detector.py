"""Call detection and call-type classification for EchoField.

Provides a model-backed detector/classifier with explicit fallback to the
existing energy-threshold segmentation and rule-based heuristics when model
weights are unavailable.

Confidence thresholds
---------------------
- minimum    (>= 0.30): segment likely contains a call
- high       (>= 0.70): reliable enough for automated research use
- publishable(>= 0.85): suitable for peer-reviewed output

Environment variables (ECHOFIELD_ prefix)
-----------------------------------------
- DETECTOR_MODEL_PATH   : path to the detector checkpoint (.pt)
- CLASSIFIER_MODEL_PATH : path to the classifier checkpoint (.pt)
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import numpy as np

from echofield.pipeline.feature_extract import (
    classify_call_type,
    extract_acoustic_features,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Confidence thresholds
# ---------------------------------------------------------------------------

CONFIDENCE_MINIMUM = 0.30     # segment likely contains a call
CONFIDENCE_HIGH = 0.70        # reliable for automated research
CONFIDENCE_PUBLISHABLE = 0.85 # suitable for peer-reviewed output

# Call types aligned with API spec and ElephantVoices dataset labels
SUPPORTED_CALL_TYPES = [
    "rumble",
    "trumpet",
    "roar",
    "bark",
    "cry",
    "contact call",
    "greeting",
    "play",
    "unknown",
]


# ---------------------------------------------------------------------------
# Model-backed detector (optional)
# ---------------------------------------------------------------------------

class _ModelDetector:
    """Tiny CNN-based call-boundary detector.

    Loaded from a checkpoint if available; otherwise the instance is marked
    unavailable and the energy-threshold fallback is used.
    """

    def __init__(self, model_path: str | None) -> None:
        self._model = None
        self._available = False

        if not model_path or not Path(model_path).exists():
            logger.debug(
                "call_detector: detector model not found at '%s', using fallback",
                model_path,
            )
            return

        try:
            import torch
            import torch.nn as nn

            class _TinyCNNDetector(nn.Module):
                """1-D CNN that outputs per-frame call probability."""

                def __init__(self) -> None:
                    super().__init__()
                    self.net = nn.Sequential(
                        nn.Conv1d(1, 16, kernel_size=31, padding=15),
                        nn.ReLU(),
                        nn.MaxPool1d(4),
                        nn.Conv1d(16, 32, kernel_size=15, padding=7),
                        nn.ReLU(),
                        nn.MaxPool1d(4),
                        nn.Conv1d(32, 1, kernel_size=7, padding=3),
                        nn.Sigmoid(),
                    )

                def forward(self, x: "torch.Tensor") -> "torch.Tensor":  # noqa: F821
                    return self.net(x)

            model = _TinyCNNDetector().cpu().eval()
            checkpoint = torch.load(model_path, map_location="cpu")
            state_dict = checkpoint.get("state_dict", checkpoint) if isinstance(checkpoint, dict) else checkpoint
            model.load_state_dict(state_dict, strict=False)
            self._model = model
            self._available = True
            logger.info("call_detector: loaded detector model from '%s'", model_path)
        except Exception as exc:
            logger.warning(
                "call_detector: failed to load detector model ('%s'): %s",
                model_path,
                exc,
            )

    @property
    def available(self) -> bool:
        return self._available

    def predict_frame_probabilities(
        self, y: np.ndarray, sr: int, hop_length: int = 512
    ) -> np.ndarray:
        """Return per-hop-frame call probabilities (0–1).

        Args:
            y: Audio signal (1-D float32).
            sr: Sample rate.
            hop_length: Samples per output frame.

        Returns:
            1-D np.ndarray of probabilities.
        """
        if not self._available or self._model is None:
            raise RuntimeError("model not loaded")

        import torch

        n_frames = max(len(y) // hop_length, 1)
        # Pad to exact multiple of hop_length
        pad_len = n_frames * hop_length - len(y)
        y_padded = np.pad(y.astype(np.float32), (0, pad_len), mode="reflect")

        # Shape: [1, 1, T]
        wav = torch.from_numpy(y_padded).unsqueeze(0).unsqueeze(0)
        with torch.no_grad():
            probs = self._model(wav)  # [1, 1, T']
        probs_np = probs.squeeze().numpy().astype(np.float32)

        # Resample to n_frames via nearest-neighbour
        indices = (np.arange(n_frames) / n_frames * len(probs_np)).astype(int)
        indices = np.clip(indices, 0, len(probs_np) - 1)
        return probs_np[indices]


class _ModelClassifier:
    """Call-type classifier loaded from a checkpoint if available."""

    def __init__(self, model_path: str | None) -> None:
        self._model = None
        self._available = False
        self._label_map: list[str] = SUPPORTED_CALL_TYPES[:-1]  # exclude "unknown"

        if not model_path or not Path(model_path).exists():
            logger.debug(
                "call_detector: classifier model not found at '%s', using heuristic fallback",
                model_path,
            )
            return

        try:
            import torch
            import torch.nn as nn

            n_classes = len(self._label_map)

            class _TinyMLP(nn.Module):
                def __init__(self) -> None:
                    super().__init__()
                    self.net = nn.Sequential(
                        nn.Linear(12, 64),
                        nn.ReLU(),
                        nn.Dropout(0.2),
                        nn.Linear(64, 32),
                        nn.ReLU(),
                        nn.Linear(32, n_classes),
                    )

                def forward(self, x: "torch.Tensor") -> "torch.Tensor":  # noqa: F821
                    return self.net(x)

            model = _TinyMLP().cpu().eval()
            checkpoint = torch.load(model_path, map_location="cpu")
            state_dict = checkpoint.get("state_dict", checkpoint) if isinstance(checkpoint, dict) else checkpoint
            model.load_state_dict(state_dict, strict=False)
            self._model = model
            self._available = True
            logger.info("call_detector: loaded classifier model from '%s'", model_path)
        except Exception as exc:
            logger.warning(
                "call_detector: failed to load classifier model ('%s'): %s",
                model_path,
                exc,
            )

    @property
    def available(self) -> bool:
        return self._available

    def classify(self, features: dict[str, Any]) -> dict[str, Any]:
        """Classify a call from its acoustic features.

        Args:
            features: Dict as returned by extract_acoustic_features().

        Returns:
            Dict with ``call_type`` (str) and ``confidence`` (float).
        """
        if not self._available or self._model is None:
            raise RuntimeError("model not loaded")

        import torch

        feature_vector = np.array([
            features.get("fundamental_frequency_hz", 0.0),
            features.get("harmonicity", 0.0),
            float(features.get("harmonic_count", 0)),
            float(len(features.get("formant_peaks_hz", []))),
            features.get("duration_s", 0.0),
            features.get("bandwidth_hz", 0.0),
            features.get("spectral_centroid_hz", 0.0),
            features.get("spectral_rolloff_hz", 0.0),
            features.get("zero_crossing_rate", 0.0),
            features.get("snr_db", 0.0),
            features.get("energy_distribution", {}).get("below_100hz", 0.0),
            features.get("energy_distribution", {}).get("above_100hz", 0.0),
        ], dtype=np.float32)

        tensor = torch.from_numpy(feature_vector).unsqueeze(0)
        with torch.no_grad():
            logits = self._model(tensor)
            probs = torch.softmax(logits, dim=-1).squeeze()

        best_idx = int(torch.argmax(probs).item())
        confidence = float(probs[best_idx].item())

        # Reject predictions below minimum threshold
        if confidence < CONFIDENCE_MINIMUM:
            return {"call_type": "unknown", "confidence": confidence}

        return {
            "call_type": self._label_map[best_idx],
            "confidence": round(confidence, 3),
        }


# ---------------------------------------------------------------------------
# CallDetector facade
# ---------------------------------------------------------------------------

class CallDetector:
    """Unified call detector and classifier.

    Loads optional model-backed components via ``ECHOFIELD_DETECTOR_MODEL_PATH``
    and ``ECHOFIELD_CLASSIFIER_MODEL_PATH`` environment variables.  Falls back
    to energy-threshold segmentation and rule-based classification when models
    are unavailable.

    Usage::

        detector = CallDetector.from_env()
        calls = detector.detect(recording_id, y_clean, sr, metadata)
    """

    def __init__(
        self,
        detector_model_path: str | None = None,
        classifier_model_path: str | None = None,
    ) -> None:
        self._detector = _ModelDetector(detector_model_path)
        self._classifier = _ModelClassifier(classifier_model_path)

        if self._detector.available:
            logger.info("call_detector: using model-backed detector")
        else:
            logger.info("call_detector: using energy-threshold fallback detector")

        if self._classifier.available:
            logger.info("call_detector: using model-backed classifier")
        else:
            logger.info("call_detector: using rule-based heuristic classifier")

    @classmethod
    def from_env(cls) -> "CallDetector":
        """Construct from ECHOFIELD_* environment variables."""
        detector_path = os.getenv("ECHOFIELD_DETECTOR_MODEL_PATH")
        classifier_path = os.getenv("ECHOFIELD_CLASSIFIER_MODEL_PATH")
        return cls(
            detector_model_path=detector_path,
            classifier_model_path=classifier_path,
        )

    # ------------------------------------------------------------------
    # Internal: segmentation
    # ------------------------------------------------------------------

    def _segment_with_model(
        self, y: np.ndarray, sr: int, frame_hop: int = 512
    ) -> list[tuple[int, int]]:
        """Return (start_sample, end_sample) pairs via model probabilities."""
        probs = self._detector.predict_frame_probabilities(y, sr, hop_length=frame_hop)
        active_ranges: list[tuple[int, int]] = []
        current_start: int | None = None

        for i, prob in enumerate(probs):
            sample = i * frame_hop
            if prob >= CONFIDENCE_MINIMUM and current_start is None:
                current_start = sample
            elif prob < CONFIDENCE_MINIMUM and current_start is not None:
                active_ranges.append((current_start, sample))
                current_start = None
        if current_start is not None:
            active_ranges.append((current_start, len(y)))

        return active_ranges if active_ranges else [(0, len(y))]

    def _segment_with_energy(
        self, y: np.ndarray, sr: int
    ) -> list[tuple[int, int]]:
        """Energy-threshold segmentation (existing heuristic)."""
        if y.size == 0:
            return [(0, 0)]

        frame = max(int(0.25 * sr), 1)
        hop = max(int(0.1 * sr), 1)
        energies: list[float] = []
        starts: list[int] = []

        for start in range(0, max(len(y) - frame, 0) + 1, hop):
            chunk = y[start : start + frame]
            energies.append(float(np.sqrt(np.mean(chunk ** 2))))
            starts.append(start)

        if not energies:
            return [(0, len(y))]

        threshold = max(float(np.percentile(energies, 75)), 1e-6)
        active_ranges: list[tuple[int, int]] = []
        current_start: int | None = None

        for index, energy in enumerate(energies):
            if energy >= threshold and current_start is None:
                current_start = index
            elif energy < threshold and current_start is not None:
                active_ranges.append(
                    (starts[current_start], starts[index - 1] + frame)
                )
                current_start = None
        if current_start is not None:
            active_ranges.append((starts[current_start], len(y)))

        return active_ranges if active_ranges else [(0, len(y))]

    # ------------------------------------------------------------------
    # Internal: classification
    # ------------------------------------------------------------------

    def _classify_snippet(
        self, snippet: np.ndarray, sr: int
    ) -> dict[str, Any]:
        features = extract_acoustic_features(snippet, sr)
        if self._classifier.available:
            try:
                result = self._classifier.classify(features)
                return {"classification": result, "features": features}
            except Exception as exc:
                logger.debug("call_detector: model classifier failed, using heuristic: %s", exc)
        # Heuristic fallback
        result = classify_call_type(features)
        return {"classification": result, "features": features}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def detect(
        self,
        recording_id: str,
        y: np.ndarray,
        sr: int,
        metadata: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Detect and classify calls in a cleaned recording.

        Args:
            recording_id: Unique recording identifier.
            y: Cleaned audio samples (1-D float32).
            sr: Sample rate in Hz.
            metadata: Optional recording metadata dict for location/date.

        Returns:
            List of call dicts, each with:
                id, recording_id, start_ms, duration_ms,
                frequency_min_hz, frequency_max_hz,
                call_type, confidence, confidence_tier,
                acoustic_features, location, date,
                detector_backend, classifier_backend.
        """
        if metadata is None:
            metadata = {}

        detector_backend = "model" if self._detector.available else "energy_threshold"
        classifier_backend = "model" if self._classifier.available else "rule_based"

        if y.size == 0:
            return []

        # Segment
        if self._detector.available:
            try:
                segments = self._segment_with_model(y, sr)
                logger.debug("call_detector: model segmentation produced %d segment(s)", len(segments))
            except Exception as exc:
                logger.warning("call_detector: model segmentation failed, falling back: %s", exc)
                segments = self._segment_with_energy(y, sr)
                detector_backend = "energy_threshold"
        else:
            segments = self._segment_with_energy(y, sr)

        calls: list[dict[str, Any]] = []
        for call_index, (start_sample, end_sample) in enumerate(segments):
            end_sample = min(end_sample, len(y))
            snippet = y[start_sample:end_sample]

            if len(snippet) < 128:
                continue

            result = self._classify_snippet(snippet, sr)
            classification = result["classification"]
            features = result["features"]

            confidence = classification.get("confidence", 0.0)

            # Assign confidence tier
            if confidence >= CONFIDENCE_PUBLISHABLE:
                tier = "publishable"
            elif confidence >= CONFIDENCE_HIGH:
                tier = "high"
            elif confidence >= CONFIDENCE_MINIMUM:
                tier = "minimum"
            else:
                tier = "below_threshold"

            calls.append({
                "id": f"{recording_id}-call-{call_index}",
                "recording_id": recording_id,
                "start_ms": round(start_sample / sr * 1000.0, 2),
                "duration_ms": round(len(snippet) / sr * 1000.0, 2),
                "frequency_min_hz": 8.0,
                "frequency_max_hz": 1200.0,
                "call_type": classification["call_type"],
                "confidence": round(confidence, 3),
                "confidence_tier": tier,
                "acoustic_features": features,
                "location": metadata.get("location"),
                "date": metadata.get("date"),
                "detector_backend": detector_backend,
                "classifier_backend": classifier_backend,
            })

        logger.info(
            "call_detector: detected %d call(s) in recording '%s' "
            "(detector=%s, classifier=%s)",
            len(calls),
            recording_id,
            detector_backend,
            classifier_backend,
        )
        return calls
