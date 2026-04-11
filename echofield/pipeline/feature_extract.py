"""Acoustic feature extraction for elephant call analysis.

Extracts 12 acoustic metrics from cleaned elephant recordings using librosa,
and classifies call types based on extracted features. Supports both ML-based
(Random Forest) and rule-based classification with automatic fallback.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import librosa
from scipy.signal import find_peaks
from echofield.utils.logging_config import get_logger

try:
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.ensemble import IsolationForest, RandomForestClassifier
    from sklearn.metrics import accuracy_score
    import joblib
    _SKLEARN_AVAILABLE = True
except ImportError:
    _SKLEARN_AVAILABLE = False

logger = get_logger(__name__)

_BASE_FEATURE_KEYS = [
    "fundamental_frequency_hz",
    "harmonicity",
    "harmonic_count",
    "bandwidth_hz",
    "spectral_centroid_hz",
    "spectral_rolloff_hz",
    "zero_crossing_rate",
    "snr_db",
    "duration_s",
    "below_100hz",
    "above_100hz",
    "formant_count",
    "pitch_contour_slope",
    "temporal_energy_variance",
    "spectral_entropy",
]
_MFCC_COUNT = 13
_CLASSIFIER_FEATURE_KEYS = [
    *_BASE_FEATURE_KEYS,
    *[f"mfcc_{index}" for index in range(_MFCC_COUNT)],
    *[f"mfcc_delta_{index}" for index in range(_MFCC_COUNT)],
    *[f"mfcc_delta2_{index}" for index in range(_MFCC_COUNT)],
]

_CALL_TYPE_HIERARCHY = {
    "rumble": "low-frequency",
    "contact call": "low-frequency",
    "greeting": "low-frequency",
    "bark": "broadband",
    "roar": "broadband",
    "play": "broadband",
    "trumpet": "high-frequency",
    "cry": "high-frequency",
    "unknown": "unknown",
    "novel": "unknown",
}

_classifier_model: object | None = None
_anomaly_detector: object | None = None
_model_version: str | None = None


def _finite(value: float, default: float = 0.0) -> float:
    return default if not np.isfinite(value) else float(value)


def _safe_list(values: Any, length: int = _MFCC_COUNT) -> list[float]:
    if not isinstance(values, list):
        values = []
    result = []
    for value in values[:length]:
        try:
            result.append(_finite(float(value)))
        except (TypeError, ValueError):
            result.append(0.0)
    result.extend([0.0] * (length - len(result)))
    return result


def _hierarchy_for_call_type(call_type: str, confidence: float, level2_confidence: float | None = None) -> dict[str, Any]:
    level2 = call_type or "unknown"
    level1 = _CALL_TYPE_HIERARCHY.get(level2, "unknown")
    return {
        "level1": level1,
        "level2": level2,
        "level1_confidence": round(float(confidence), 3),
        "level2_confidence": round(float(level2_confidence if level2_confidence is not None else confidence), 3),
    }


def _softmax_entropy(probabilities: list[float]) -> float:
    if not probabilities:
        return 0.0
    values = np.asarray(probabilities, dtype=np.float64)
    total = float(np.sum(values))
    if total <= 0:
        return 0.0
    values = np.clip(values / total, 1e-12, 1.0)
    entropy = float(-np.sum(values * np.log(values)))
    max_entropy = float(np.log(len(values))) if len(values) > 1 else 1.0
    return round(entropy / max(max_entropy, 1e-12), 4)


def _estimate_fundamental_frequency(y: np.ndarray, sr: int) -> float:
    """Estimate fundamental frequency using YIN algorithm.

    Args:
        y: Audio time-series.
        sr: Sample rate.

    Returns:
        Median fundamental frequency in Hz, or 0.0 if undetectable.
    """
    min_f0 = 8.0
    frame_length = max(8192, int(np.ceil(sr / min_f0)) + 2)
    f0 = librosa.yin(y, fmin=min_f0, fmax=200, sr=sr, frame_length=frame_length)
    # Filter out zero/NaN values
    valid = f0[(f0 > 0) & np.isfinite(f0)]
    if len(valid) == 0:
        return 0.0
    return float(np.median(valid))


def _compute_harmonicity(y: np.ndarray) -> float:
    """Compute harmonicity as ratio of harmonic energy to total energy.

    Uses librosa's harmonic-percussive source separation.

    Args:
        y: Audio time-series.

    Returns:
        Harmonicity ratio between 0 and 1.
    """
    y_harmonic, y_percussive = librosa.effects.hpss(y)
    harmonic_energy = np.sum(y_harmonic ** 2)
    total_energy = np.sum(y ** 2)
    if total_energy == 0:
        return 0.0
    return float(min(harmonic_energy / total_energy, 1.0))


def _count_harmonics(y: np.ndarray, sr: int, threshold_ratio: float = 0.1) -> int:
    """Count harmonic peaks in the magnitude spectrum.

    Args:
        y: Audio time-series.
        sr: Sample rate.
        threshold_ratio: Minimum peak height as fraction of max peak.

    Returns:
        Number of detected harmonic peaks.
    """
    n_fft = 4096
    S = np.abs(librosa.stft(y, n_fft=n_fft))
    mean_spectrum = np.mean(S, axis=1)

    if np.max(mean_spectrum) == 0:
        return 0

    threshold = np.max(mean_spectrum) * threshold_ratio
    # Minimum distance between peaks: ~20 Hz worth of bins
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    freq_resolution = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0
    min_distance = max(int(20.0 / freq_resolution), 1)

    peaks, _ = find_peaks(mean_spectrum, height=threshold, distance=min_distance)
    return int(len(peaks))


def get_harmonic_peaks(y: np.ndarray, sr: int, threshold_ratio: float = 0.1) -> list[float]:
    """Return frequencies of detected harmonic peaks in the spectrum.

    Same analysis as _count_harmonics but returns the actual frequencies.
    """
    n_fft = 4096
    S = np.abs(librosa.stft(y, n_fft=n_fft))
    mean_spectrum = np.mean(S, axis=1)

    if np.max(mean_spectrum) == 0:
        return []

    threshold = np.max(mean_spectrum) * threshold_ratio
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    freq_resolution = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0
    min_distance = max(int(20.0 / freq_resolution), 1)

    peaks, _ = find_peaks(mean_spectrum, height=threshold, distance=min_distance)
    return [round(float(freqs[p]), 2) for p in sorted(peaks)]


def _find_formant_peaks(y: np.ndarray, sr: int, max_formants: int = 5) -> list[float]:
    """Find formant-like peaks in the spectral envelope.

    Args:
        y: Audio time-series.
        sr: Sample rate.
        max_formants: Maximum number of formant peaks to return.

    Returns:
        List of formant peak frequencies in Hz, sorted ascending.
    """
    n_fft = 4096
    S = np.abs(librosa.stft(y, n_fft=n_fft))
    mean_spectrum = np.mean(S, axis=1)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    if np.max(mean_spectrum) == 0:
        return []

    # Smooth the spectrum to find envelope peaks
    from scipy.ndimage import uniform_filter1d
    smoothed = uniform_filter1d(mean_spectrum, size=15)

    threshold = np.max(smoothed) * 0.05
    freq_resolution = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0
    min_distance = max(int(50.0 / freq_resolution), 1)

    peaks, properties = find_peaks(
        smoothed, height=threshold, distance=min_distance, prominence=threshold * 0.5
    )

    if len(peaks) == 0:
        return []

    # Sort by prominence and take the top formants
    if "prominences" in properties:
        sorted_indices = np.argsort(properties["prominences"])[::-1]
        peaks = peaks[sorted_indices[:max_formants]]

    formant_freqs = sorted(float(freqs[p]) for p in peaks)
    return formant_freqs


def _compute_bandwidth(y: np.ndarray, sr: int, energy_fraction: float = 0.9) -> float:
    """Compute the frequency bandwidth containing a fraction of total energy.

    Args:
        y: Audio time-series.
        sr: Sample rate.
        energy_fraction: Fraction of energy to capture (default 90%).

    Returns:
        Bandwidth in Hz.
    """
    n_fft = 2048
    S = np.abs(librosa.stft(y, n_fft=n_fft))
    power_spectrum = np.mean(S ** 2, axis=1)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    total_energy = np.sum(power_spectrum)
    if total_energy == 0:
        return 0.0

    cumulative = np.cumsum(power_spectrum)
    lower_threshold = total_energy * (1 - energy_fraction) / 2
    upper_threshold = total_energy * (1 + energy_fraction) / 2

    lower_idx = np.searchsorted(cumulative, lower_threshold)
    upper_idx = np.searchsorted(cumulative, upper_threshold)

    lower_idx = min(lower_idx, len(freqs) - 1)
    upper_idx = min(upper_idx, len(freqs) - 1)

    return float(freqs[upper_idx] - freqs[lower_idx])


def _compute_energy_distribution(y: np.ndarray, sr: int,
                                  split_freq: float = 100.0) -> dict[str, float]:
    """Compute energy distribution below and above a split frequency.

    Args:
        y: Audio time-series.
        sr: Sample rate.
        split_freq: Frequency boundary in Hz.

    Returns:
        Dict with 'below_100hz' and 'above_100hz' percentages (0-100).
    """
    n_fft = 2048
    S = np.abs(librosa.stft(y, n_fft=n_fft))
    power_spectrum = np.mean(S ** 2, axis=1)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    total_energy = np.sum(power_spectrum)
    if total_energy == 0:
        return {"below_100hz": 0.0, "above_100hz": 0.0}

    below_mask = freqs < split_freq
    below_energy = np.sum(power_spectrum[below_mask])

    below_pct = (below_energy / total_energy) * 100
    above_pct = 100.0 - below_pct

    return {
        "below_100hz": round(float(below_pct), 1),
        "above_100hz": round(float(above_pct), 1),
    }


def _estimate_snr(y: np.ndarray, sr: int, frame_length: int = 2048,
                   hop_length: int = 512) -> float:
    """Estimate signal-to-noise ratio in dB.

    Uses a simple approach: segments the signal into frames, considers
    the quietest frames as noise and the loudest as signal.

    Args:
        y: Audio time-series.
        sr: Sample rate.
        frame_length: Frame length for energy computation.
        hop_length: Hop length between frames.

    Returns:
        Estimated SNR in dB.
    """
    # Compute frame-wise RMS energy
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]

    if len(rms) < 4:
        return 0.0

    sorted_rms = np.sort(rms)
    n = len(sorted_rms)

    # Bottom 10% as noise estimate
    noise_end = max(int(n * 0.1), 1)
    noise_rms = np.mean(sorted_rms[:noise_end])

    # Top 10% as signal estimate
    signal_start = max(int(n * 0.9), n - 1)
    signal_rms = np.mean(sorted_rms[signal_start:])

    if noise_rms == 0:
        return 60.0  # Effectively no noise

    snr = 20 * np.log10(signal_rms / noise_rms)
    return round(float(snr), 1)


def _mfcc_dynamics(y: np.ndarray, sr: int) -> tuple[list[float], list[float], list[float]]:
    if y.size == 0:
        zeros = [0.0] * _MFCC_COUNT
        return zeros, zeros, zeros
    n_fft = min(2048, max(256, 2 ** int(np.floor(np.log2(max(len(y), 256))))))
    hop_length = max(min(n_fft // 4, len(y) or 1), 1)
    try:
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=_MFCC_COUNT, n_fft=n_fft, hop_length=hop_length)
    except Exception:
        zeros = [0.0] * _MFCC_COUNT
        return zeros, zeros, zeros

    mfcc_means = [round(_finite(float(np.mean(mfccs[index]))), 4) for index in range(_MFCC_COUNT)]
    if mfccs.shape[1] < 3:
        zeros = [0.0] * _MFCC_COUNT
        return mfcc_means, zeros, zeros

    width = min(9, mfccs.shape[1] if mfccs.shape[1] % 2 == 1 else mfccs.shape[1] - 1)
    width = max(width, 3)
    try:
        delta = librosa.feature.delta(mfccs, width=width, mode="nearest")
        delta2 = librosa.feature.delta(mfccs, width=width, order=2, mode="nearest")
    except Exception:
        delta = np.zeros_like(mfccs)
        delta2 = np.zeros_like(mfccs)
    delta_means = [round(_finite(float(np.mean(delta[index]))), 4) for index in range(_MFCC_COUNT)]
    delta2_means = [round(_finite(float(np.mean(delta2[index]))), 4) for index in range(_MFCC_COUNT)]
    return mfcc_means, delta_means, delta2_means


def _pitch_contour_slope(y: np.ndarray, sr: int) -> float:
    if y.size < 128:
        return 0.0
    try:
        frame_length = max(2048, int(np.ceil(sr / 8.0)) + 2)
        f0 = librosa.yin(y, fmin=8, fmax=300, sr=sr, frame_length=frame_length)
        valid = f0[(f0 > 0) & np.isfinite(f0)]
        if len(valid) < 2:
            return 0.0
        x = np.linspace(0.0, 1.0, len(valid))
        slope = np.polyfit(x, valid.astype(np.float64), 1)[0]
        return round(_finite(float(slope)), 4)
    except Exception:
        return 0.0


def _temporal_energy_variance(y: np.ndarray, sr: int) -> float:
    if y.size < 2:
        return 0.0
    frame_length = max(int(0.1 * sr), 32)
    hop_length = max(frame_length // 2, 1)
    try:
        rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
        return round(_finite(float(np.var(rms))), 8)
    except Exception:
        return 0.0


def _spectral_entropy(y: np.ndarray, sr: int) -> float:
    if y.size < 2:
        return 0.0
    try:
        S = np.abs(librosa.stft(y, n_fft=min(2048, max(256, len(y)))))
        power = np.mean(S ** 2, axis=1)
        total = float(np.sum(power))
        if total <= 0:
            return 0.0
        probs = np.clip(power / total, 1e-12, 1.0)
        entropy = -float(np.sum(probs * np.log2(probs)))
        normalized = entropy / max(np.log2(len(probs)), 1e-12)
        return round(_finite(normalized), 6)
    except Exception:
        return 0.0


def extract_acoustic_features(y: np.ndarray, sr: int) -> dict:
    """Extract 12 acoustic features from an audio signal.

    Designed for analysis of elephant vocalizations but applicable to
    general bioacoustic signals.

    Args:
        y: Audio time-series as a 1-D numpy array.
        sr: Sample rate in Hz.

    Returns:
        Dictionary containing all 12 acoustic metrics:
            - fundamental_frequency_hz: float
            - harmonicity: float (0-1)
            - harmonic_count: int
            - formant_peaks_hz: list[float]
            - duration_s: float
            - bandwidth_hz: float
            - energy_distribution: dict with 'below_100hz' and 'above_100hz'
            - spectral_centroid_hz: float
            - spectral_rolloff_hz: float
            - mfcc: list[float] (13 coefficients)
            - zero_crossing_rate: float
            - snr_db: float
    """
    # 1. Fundamental frequency
    fundamental_frequency = _estimate_fundamental_frequency(y, sr)

    # 2. Harmonicity
    harmonicity = _compute_harmonicity(y)

    # 3. Harmonic count
    harmonic_count = _count_harmonics(y, sr)

    # 4. Formant peaks
    formant_peaks = _find_formant_peaks(y, sr)

    # 5. Duration
    duration_s = float(len(y)) / sr

    # 6. Bandwidth (90% energy)
    bandwidth = _compute_bandwidth(y, sr)

    # 7. Energy distribution
    energy_dist = _compute_energy_distribution(y, sr)

    # 8. Spectral centroid
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    spectral_centroid = float(np.mean(centroid))

    # 9. Spectral rolloff
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
    spectral_rolloff = float(np.mean(rolloff))

    # 10. MFCCs and temporal dynamics
    mfcc_means, mfcc_delta_means, mfcc_delta2_means = _mfcc_dynamics(y, sr)

    # 11. Zero crossing rate
    zcr = librosa.feature.zero_crossing_rate(y)
    zero_crossing_rate = float(np.mean(zcr))

    # 12. SNR estimate
    snr = _estimate_snr(y, sr)

    pitch_slope = _pitch_contour_slope(y, sr)
    energy_variance = _temporal_energy_variance(y, sr)
    spectral_entropy = _spectral_entropy(y, sr)

    return {
        "fundamental_frequency_hz": round(_finite(fundamental_frequency), 2),
        "harmonicity": round(_finite(harmonicity), 4),
        "harmonic_count": harmonic_count,
        "formant_peaks_hz": [round(f, 1) for f in formant_peaks],
        "duration_s": round(_finite(duration_s), 3),
        "bandwidth_hz": round(_finite(bandwidth), 1),
        "energy_distribution": energy_dist,
        "spectral_centroid_hz": round(_finite(spectral_centroid), 1),
        "spectral_rolloff_hz": round(_finite(spectral_rolloff), 1),
        "mfcc": mfcc_means,
        "mfcc_delta": mfcc_delta_means,
        "mfcc_delta2": mfcc_delta2_means,
        "pitch_contour_slope": pitch_slope,
        "temporal_energy_variance": energy_variance,
        "spectral_entropy": spectral_entropy,
        "zero_crossing_rate": round(_finite(zero_crossing_rate), 6),
        "snr_db": _finite(snr),
        "feature_vector_dim": len(_CLASSIFIER_FEATURE_KEYS),
    }


def _features_to_vector(features: dict) -> list[float]:
    """Convert a features dict to a numeric vector for ML classification."""
    energy_dist = features.get("energy_distribution", {})
    mfcc = _safe_list(features.get("mfcc"))
    mfcc_delta = _safe_list(features.get("mfcc_delta"))
    mfcc_delta2 = _safe_list(features.get("mfcc_delta2"))
    base = [
        float(features.get("fundamental_frequency_hz", 0)),
        float(features.get("harmonicity", 0)),
        float(features.get("harmonic_count", 0)),
        float(features.get("bandwidth_hz", 0)),
        float(features.get("spectral_centroid_hz", 0)),
        float(features.get("spectral_rolloff_hz", 0)),
        float(features.get("zero_crossing_rate", 0)),
        float(features.get("snr_db", 0)),
        float(features.get("duration_s", 0)),
        float(energy_dist.get("below_100hz", 0)),
        float(energy_dist.get("above_100hz", 0)),
        float(len(features.get("formant_peaks_hz") or [])),
        float(features.get("pitch_contour_slope", 0)),
        float(features.get("temporal_energy_variance", 0)),
        float(features.get("spectral_entropy", 0)),
    ]
    return [_finite(float(value)) for value in [*base, *mfcc, *mfcc_delta, *mfcc_delta2]]


def load_classifier(model_path: str | Path) -> bool:
    """Load a trained call type classifier from disk. Returns True on success."""
    global _anomaly_detector, _classifier_model, _model_version
    if not _SKLEARN_AVAILABLE:
        return False
    path = Path(model_path)
    if not path.exists():
        return False
    try:
        payload = joblib.load(path)
        if isinstance(payload, dict) and "classifier" in payload:
            _classifier_model = payload["classifier"]
            _anomaly_detector = payload.get("anomaly_detector")
            _model_version = payload.get("version")
        else:
            _classifier_model = payload
            _anomaly_detector = None
            _model_version = path.stem
        logger.info("Loaded call classifier from %s", path)
        return True
    except Exception:
        logger.warning("Failed to load call classifier from %s", path)
        _classifier_model = None
        _anomaly_detector = None
        _model_version = None
        return False


class AnomalyDetector:
    """Isolation Forest wrapper that returns normalized novelty scores."""

    def __init__(self) -> None:
        self.model: IsolationForest | None = None
        self.score_min = 0.0
        self.score_max = 1.0

    def fit(self, X: list[list[float]]) -> None:
        if not X:
            return
        self.model = IsolationForest(n_estimators=100, contamination="auto", random_state=42)
        self.model.fit(X)
        raw = -self.model.decision_function(X)
        self.score_min = float(np.min(raw))
        self.score_max = float(np.max(raw))

    def score(self, vector: list[float]) -> float | None:
        if self.model is None:
            return None
        raw = float(-self.model.decision_function([vector])[0])
        denom = max(self.score_max - self.score_min, 1e-8)
        normalized = (raw - self.score_min) / denom
        return round(float(np.clip(normalized, 0.0, 1.0)), 4)


def _expected_calibration_error(probabilities: np.ndarray, labels: np.ndarray, classes: np.ndarray, bins: int = 10) -> float:
    if probabilities.size == 0:
        return 0.0
    confidences = np.max(probabilities, axis=1)
    predictions = classes[np.argmax(probabilities, axis=1)]
    accuracies = predictions == labels
    ece = 0.0
    for lower in np.linspace(0.0, 1.0, bins, endpoint=False):
        upper = lower + 1.0 / bins
        mask = (confidences > lower) & (confidences <= upper)
        if not np.any(mask):
            continue
        ece += float(np.mean(mask)) * abs(float(np.mean(accuracies[mask])) - float(np.mean(confidences[mask])))
    return round(ece, 4)


def train_classifier(
    training_data: list[dict],
    model_path: str | Path,
) -> dict[str, Any]:
    """Train a Random Forest call type classifier and save to disk.

    Args:
        training_data: List of dicts with 'features' (acoustic features dict)
            and 'call_type' (str label).
        model_path: Path to save the trained model.

    Returns:
        Dict with 'samples' count and 'classes' count.
    """
    global _anomaly_detector, _classifier_model, _model_version
    if not _SKLEARN_AVAILABLE:
        raise RuntimeError("scikit-learn is required for ML classification")
    X = []
    y_labels = []
    for item in training_data:
        features = item.get("features") or item.get("acoustic_features") or {}
        label = item.get("call_type", "unknown")
        if label == "unknown":
            continue
        X.append(_features_to_vector(features))
        y_labels.append(label)
    if len(X) < 5:
        raise ValueError(f"Need at least 5 labeled samples, got {len(X)}")
    class_counts = Counter(y_labels)
    base_model = RandomForestClassifier(n_estimators=150, random_state=42, max_depth=12, class_weight="balanced")
    model: Any
    min_class_count = min(class_counts.values())
    if len(class_counts) > 1 and min_class_count >= 2:
        cv = min(3, min_class_count)
        try:
            model = CalibratedClassifierCV(base_model, method="sigmoid", cv=cv)
            model.fit(X, y_labels)
        except Exception as exc:
            logger.warning("Classifier calibration failed, using uncalibrated forest: %s", exc)
            model = base_model.fit(X, y_labels)
    else:
        model = base_model.fit(X, y_labels)

    anomaly_detector = AnomalyDetector()
    anomaly_detector.fit(X)

    probabilities = model.predict_proba(X)
    classes = np.asarray(model.classes_)
    labels = np.asarray(y_labels)
    accuracy = round(float(accuracy_score(labels, model.predict(X))), 4)
    ece = _expected_calibration_error(probabilities, labels, classes)

    path = Path(model_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    payload = {
        "classifier": model,
        "anomaly_detector": anomaly_detector,
        "version": version,
        "feature_keys": _CLASSIFIER_FEATURE_KEYS,
        "feature_dim": len(X[0]),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": {
            "accuracy": accuracy,
            "ece": ece,
            "samples": len(X),
            "classes": len(class_counts),
            "class_distribution": dict(class_counts),
        },
    }
    joblib.dump(payload, path)
    calibration_path = path.with_suffix(".calibration.json")
    calibration_path.write_text(
        json.dumps(
            {
                "ece": ece,
                "classes": [str(value) for value in classes.tolist()],
                "confidence": [round(float(value), 4) for value in np.max(probabilities, axis=1).tolist()],
                "correct": [bool(a == b) for a, b in zip(model.predict(X), y_labels)],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    _classifier_model = model
    _anomaly_detector = anomaly_detector
    _model_version = version
    logger.info("Trained call classifier with %d samples, %d classes", len(X), len(set(y_labels)))
    return {
        "samples": len(X),
        "classes": len(set(y_labels)),
        "accuracy": accuracy,
        "ece": ece,
        "class_distribution": dict(class_counts),
        "feature_dim": len(X[0]),
        "calibration_artifact": str(calibration_path),
        "model_version": version,
    }


def detect_anomaly(features: dict) -> float | None:
    if _anomaly_detector is None:
        return None
    try:
        return _anomaly_detector.score(_features_to_vector(features))
    except Exception:
        return None


def classify_call_type(features: dict) -> dict:
    """Classify elephant call type based on acoustic features.

    Uses ML classifier if available, otherwise falls back to rule-based
    heuristics derived from known acoustic properties of elephant vocalizations.

    Args:
        features: Dictionary of acoustic features as returned by
            extract_acoustic_features().

    Returns:
        Dictionary with:
            - call_type: str -- one of "rumble", "trumpet", "roar",
              "bark", "cry", "unknown".
            - confidence: float -- confidence score between 0 and 1.
    """
    anomaly_score = detect_anomaly(features)
    if anomaly_score is not None and anomaly_score > 0.8:
        return {
            "call_type": "novel",
            "confidence": round(anomaly_score, 3),
            "anomaly_score": anomaly_score,
            "prediction_uncertainty": 1.0 - anomaly_score,
            "call_type_hierarchy": _hierarchy_for_call_type("novel", anomaly_score),
            "model_version": _model_version,
        }

    if _classifier_model is not None and _SKLEARN_AVAILABLE:
        try:
            vector = [_features_to_vector(features)]
            predicted = _classifier_model.predict(vector)[0]
            proba = _classifier_model.predict_proba(vector)[0]
            confidence = float(max(proba))
            probabilities = [round(float(value), 5) for value in proba.tolist()]
            uncertainty = _softmax_entropy(probabilities)
            return {
                "call_type": str(predicted),
                "confidence": round(confidence, 3),
                "classifier_probs": probabilities,
                "prediction_uncertainty": uncertainty,
                "anomaly_score": anomaly_score,
                "call_type_hierarchy": _hierarchy_for_call_type(str(predicted), confidence),
                "model_version": _model_version,
            }
        except Exception:
            pass
    result = _classify_call_type_rules(features)
    result["anomaly_score"] = anomaly_score
    result["prediction_uncertainty"] = 1.0 - float(result.get("confidence", 0.0))
    result["call_type_hierarchy"] = _hierarchy_for_call_type(
        str(result.get("call_type", "unknown")),
        float(result.get("confidence", 0.0)),
    )
    result["model_version"] = _model_version
    return result


def _classify_call_type_rules(features: dict) -> dict:
    """Rule-based call type classification (fallback)."""
    f0 = features.get("fundamental_frequency_hz", 0)
    harmonicity = features.get("harmonicity", 0)
    bandwidth = features.get("bandwidth_hz", 0)
    duration = features.get("duration_s", 0)
    energy_dist = features.get("energy_distribution", {})
    below_100 = energy_dist.get("below_100hz", 0)
    spectral_centroid = features.get("spectral_centroid_hz", 0)
    snr = features.get("snr_db", 0)

    # Rumble: very low fundamental, high harmonicity, long duration
    # Elephant rumbles are typically 8-25 Hz with strong harmonic structure
    if f0 > 0 and f0 < 25 and harmonicity > 0.4:
        confidence = 0.5
        if below_100 > 50:
            confidence += 0.2
        if duration > 2.0:
            confidence += 0.15
        if harmonicity > 0.6:
            confidence += 0.15
        return {"call_type": "rumble", "confidence": round(min(confidence, 1.0), 3)}

    # Trumpet: high fundamental frequency, high energy, bright spectrum
    if f0 > 200 or (spectral_centroid > 1500 and snr > 15):
        confidence = 0.5
        if f0 > 300:
            confidence += 0.15
        if spectral_centroid > 2000:
            confidence += 0.15
        if snr > 20:
            confidence += 0.1
        if bandwidth > 2000:
            confidence += 0.1
        return {"call_type": "trumpet", "confidence": round(min(confidence, 1.0), 3)}

    # Roar: broad bandwidth, low harmonicity, loud
    if bandwidth > 3000 and harmonicity < 0.4:
        confidence = 0.5
        if snr > 15:
            confidence += 0.15
        if bandwidth > 5000:
            confidence += 0.15
        if duration > 1.0:
            confidence += 0.1
        return {"call_type": "roar", "confidence": round(min(confidence, 1.0), 3)}

    # Bark: short duration, mid frequency range
    if duration < 1.0 and 25 <= f0 <= 200:
        confidence = 0.4
        if duration < 0.5:
            confidence += 0.15
        if 50 <= f0 <= 150:
            confidence += 0.15
        if snr > 10:
            confidence += 0.1
        return {"call_type": "bark", "confidence": round(min(confidence, 1.0), 3)}

    # Cry: mid-high frequency, moderate harmonicity, moderate duration
    if 100 <= f0 <= 500 and harmonicity > 0.3 and duration > 0.5:
        confidence = 0.35
        if harmonicity > 0.5:
            confidence += 0.1
        if 150 <= f0 <= 400:
            confidence += 0.1
        return {"call_type": "cry", "confidence": round(min(confidence, 1.0), 3)}

    return {"call_type": "unknown", "confidence": 0.1}
