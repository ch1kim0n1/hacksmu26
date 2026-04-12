"""EchoField ML — active learning, classification, and prediction."""

from echofield.ml.taxonomy import CALL_TYPES, SOCIAL_FUNCTIONS
from echofield.ml.feature_engineer import compute_extended_features, compute_inter_call_features
from echofield.ml.classifier import CallClassifier
from echofield.ml.active_learning import ActiveLearningManager
from echofield.ml.narrative import generate_narrative

__all__ = [
    "CALL_TYPES",
    "SOCIAL_FUNCTIONS",
    "compute_extended_features",
    "compute_inter_call_features",
    "CallClassifier",
    "ActiveLearningManager",
    "generate_narrative",
]
