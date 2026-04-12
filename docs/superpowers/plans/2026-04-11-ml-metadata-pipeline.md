# ML Metadata Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add extensive acoustic metadata collection, an active learning labeling pipeline, dual classifiers (call type + social function), benchmark tracking, analytics endpoints, and Claude API narrative interpretation.

**Architecture:** New `echofield/ml/` package with six focused modules. `feature_engineer.py` hooks into the existing `call_detector.py` after `extract_acoustic_features()`. Two independent sklearn Random Forest pipelines classify call type (8 classes) and social function (5 classes). Active learning ranks uncertain calls for human labeling. Claude API generates natural language interpretations cached per call.

**Tech Stack:** scikit-learn (existing), numpy/scipy/librosa (existing), anthropic SDK (new, lightweight), joblib (existing via sklearn)

**Spec:** `docs/superpowers/specs/2026-04-11-ml-metadata-pipeline-design.md`

---

## File Map

### New files to create:
| File | Purpose |
|------|---------|
| `echofield/ml/__init__.py` | Package init, expose public API |
| `echofield/ml/taxonomy.py` | Call type (8) and social function (5) label definitions |
| `echofield/ml/feature_engineer.py` | 15 new acoustic features + inter-call context computation |
| `echofield/ml/classifier.py` | Dual sklearn pipelines: call type + social function |
| `echofield/ml/model_registry.py` | Save/load/version trained models + benchmark history |
| `echofield/ml/active_learning.py` | Uncertainty sampling, labeling queue, retrain trigger |
| `echofield/ml/narrative.py` | Claude API interpretation with template fallback |
| `tests/test_taxonomy.py` | Label validation tests |
| `tests/test_feature_engineer.py` | Feature computation tests |
| `tests/test_ml_classifier.py` | Train/predict round-trip tests |
| `tests/test_model_registry.py` | Save/load lifecycle tests |
| `tests/test_active_learning.py` | Queue ordering and retrain trigger tests |
| `tests/test_narrative.py` | Template fallback and formatting tests |
| `tests/test_ml_endpoints.py` | API integration tests for all new ML endpoints |

### Files to modify:
| File | Change |
|------|--------|
| `echofield/pipeline/call_detector.py` | Hook `compute_extended_features` after `extract_acoustic_features` (~line 415), add `compute_inter_call_features` after call loop (~line 534) |
| `echofield/server.py` | Add ML labeling, training, prediction, benchmark, and analytics endpoints |
| `requirements.txt` | Add `anthropic` SDK |

---

## Task 1: Taxonomy Module

**Files:**
- Create: `echofield/ml/__init__.py`
- Create: `echofield/ml/taxonomy.py`
- Test: `tests/test_taxonomy.py`

- [ ] **Step 1: Write failing tests**

```python
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
```

- [ ] **Step 2: Run tests to verify RED**

Run: `.venv/bin/python -m pytest tests/test_taxonomy.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'echofield.ml'`

- [ ] **Step 3: Create package and implement taxonomy**

```python
# echofield/ml/__init__.py
"""EchoField ML — active learning, classification, and prediction."""
```

```python
# echofield/ml/taxonomy.py
"""Call type and social function label definitions."""

from __future__ import annotations

CALL_TYPES: list[str] = [
    "contact-rumble",
    "lets-go-rumble",
    "musth-rumble",
    "greeting-rumble",
    "trumpet",
    "roar",
    "bark",
    "play-rumble",
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
    "lets-go-rumble": "Let's-Go Rumble",
    "musth-rumble": "Musth Rumble",
    "greeting-rumble": "Greeting Rumble",
    "trumpet": "Trumpet",
    "roar": "Roar",
    "bark": "Bark",
    "play-rumble": "Play Rumble",
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
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_taxonomy.py -v`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add echofield/ml/__init__.py echofield/ml/taxonomy.py tests/test_taxonomy.py
git commit -m "feat(ml): add call type and social function taxonomy"
```

---

## Task 2: Feature Engineer — Temporal Envelope & Spectral Shape

**Files:**
- Create: `echofield/ml/feature_engineer.py`
- Test: `tests/test_feature_engineer.py`

- [ ] **Step 1: Write failing tests for temporal envelope features**

```python
# tests/test_feature_engineer.py
from __future__ import annotations

import numpy as np
import pytest


def _make_synthetic_call(duration_s: float = 1.0, sr: int = 22050, freq: float = 50.0) -> tuple[np.ndarray, int]:
    """Generate a synthetic elephant-like call: sine wave with attack/sustain/release envelope."""
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    sine = np.sin(2 * np.pi * freq * t)
    # Envelope: 20% attack, 50% sustain, 30% release
    envelope = np.ones_like(t)
    attack_end = int(len(t) * 0.2)
    release_start = int(len(t) * 0.7)
    envelope[:attack_end] = np.linspace(0, 1, attack_end)
    envelope[release_start:] = np.linspace(1, 0, len(t) - release_start)
    return (sine * envelope).astype(np.float32), sr


def test_compute_extended_features_returns_all_new_keys():
    from echofield.ml.feature_engineer import compute_extended_features
    y, sr = _make_synthetic_call()
    base_features = {"fundamental_frequency_hz": 50.0, "snr_db": 10.0}
    result = compute_extended_features(y, sr, base_features)

    expected_keys = [
        "attack_time_s",
        "sustain_ratio",
        "release_time_s",
        "amplitude_modulation_depth",
        "frequency_modulation_rate_hz",
        "spectral_skewness",
        "spectral_kurtosis",
        "spectral_flatness",
        "spectral_flux_mean",
        "sub_harmonic_ratio",
        "below_20hz_energy_ratio",
    ]
    for key in expected_keys:
        assert key in result, f"Missing key: {key}"


def test_compute_extended_features_preserves_base_features():
    from echofield.ml.feature_engineer import compute_extended_features
    y, sr = _make_synthetic_call()
    base_features = {"fundamental_frequency_hz": 50.0, "snr_db": 10.0}
    result = compute_extended_features(y, sr, base_features)
    assert result["fundamental_frequency_hz"] == 50.0
    assert result["snr_db"] == 10.0


def test_attack_time_is_positive_for_ramped_signal():
    from echofield.ml.feature_engineer import compute_extended_features
    y, sr = _make_synthetic_call()
    result = compute_extended_features(y, sr, {})
    assert result["attack_time_s"] > 0.0
    assert result["attack_time_s"] < 1.0


def test_sustain_ratio_between_zero_and_one():
    from echofield.ml.feature_engineer import compute_extended_features
    y, sr = _make_synthetic_call()
    result = compute_extended_features(y, sr, {})
    assert 0.0 <= result["sustain_ratio"] <= 1.0


def test_spectral_flatness_near_zero_for_pure_tone():
    from echofield.ml.feature_engineer import compute_extended_features
    sr = 22050
    t = np.linspace(0, 1.0, sr, endpoint=False)
    pure_tone = np.sin(2 * np.pi * 440 * t).astype(np.float32)
    result = compute_extended_features(pure_tone, sr, {})
    assert result["spectral_flatness"] < 0.1


def test_spectral_flatness_higher_for_noise():
    from echofield.ml.feature_engineer import compute_extended_features
    sr = 22050
    rng = np.random.default_rng(42)
    noise = rng.standard_normal(sr).astype(np.float32)
    result = compute_extended_features(noise, sr, {})
    assert result["spectral_flatness"] > 0.5


def test_compute_inter_call_features_adds_ici_fields():
    from echofield.ml.feature_engineer import compute_inter_call_features
    calls = [
        {"id": "c1", "start_ms": 0, "duration_ms": 500, "acoustic_features": {}},
        {"id": "c2", "start_ms": 2000, "duration_ms": 300, "acoustic_features": {}},
        {"id": "c3", "start_ms": 5000, "duration_ms": 400, "acoustic_features": {}},
    ]
    result = compute_inter_call_features(calls)
    assert result[0]["acoustic_features"]["ici_before_ms"] is None
    assert result[0]["acoustic_features"]["ici_after_ms"] == pytest.approx(1500.0, abs=1)
    assert result[1]["acoustic_features"]["ici_before_ms"] == pytest.approx(1500.0, abs=1)
    assert result[1]["acoustic_features"]["ici_after_ms"] == pytest.approx(2700.0, abs=1)
    assert result[2]["acoustic_features"]["ici_before_ms"] == pytest.approx(2700.0, abs=1)
    assert result[2]["acoustic_features"]["ici_after_ms"] is None


def test_compute_inter_call_features_adds_sequence_fields():
    from echofield.ml.feature_engineer import compute_inter_call_features
    calls = [
        {"id": "c1", "start_ms": 0, "duration_ms": 500, "acoustic_features": {}},
        {"id": "c2", "start_ms": 2000, "duration_ms": 300, "acoustic_features": {}},
    ]
    result = compute_inter_call_features(calls)
    assert result[0]["acoustic_features"]["sequence_length"] == 2
    assert result[0]["acoustic_features"]["sequence_position_ratio"] == pytest.approx(0.0)
    assert result[1]["acoustic_features"]["sequence_position_ratio"] == pytest.approx(1.0)


def test_compute_extended_features_handles_empty_audio():
    from echofield.ml.feature_engineer import compute_extended_features
    y = np.array([], dtype=np.float32)
    result = compute_extended_features(y, 22050, {})
    assert result["attack_time_s"] == 0.0
    assert result["spectral_flatness"] == 0.0
```

- [ ] **Step 2: Run tests to verify RED**

Run: `.venv/bin/python -m pytest tests/test_feature_engineer.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'echofield.ml.feature_engineer'`

- [ ] **Step 3: Implement feature_engineer.py**

```python
# echofield/ml/feature_engineer.py
"""Extended acoustic feature extraction for ML classification.

Adds 15 new features on top of the base 54 from feature_extract.py:
- Temporal envelope: attack, sustain, release, AM depth, FM rate
- Spectral shape: skewness, kurtosis, flatness, flux, sub-harmonic ratio
- Infrasound: below-20Hz energy ratio
- Inter-call context: ICI before/after, sequence length/position (computed separately)
"""

from __future__ import annotations

import numpy as np
import librosa
from scipy.signal import hilbert


def _safe_finite(value: float, default: float = 0.0) -> float:
    return default if not np.isfinite(value) else float(value)


def _temporal_envelope(y: np.ndarray, sr: int) -> dict[str, float]:
    """Compute attack, sustain, release times and AM depth from amplitude envelope."""
    if y.size < 2:
        return {
            "attack_time_s": 0.0,
            "sustain_ratio": 0.0,
            "release_time_s": 0.0,
            "amplitude_modulation_depth": 0.0,
        }

    frame_length = max(int(0.01 * sr), 32)
    hop_length = max(frame_length // 2, 1)
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]

    if rms.size == 0 or np.max(rms) == 0:
        return {
            "attack_time_s": 0.0,
            "sustain_ratio": 0.0,
            "release_time_s": 0.0,
            "amplitude_modulation_depth": 0.0,
        }

    peak_idx = int(np.argmax(rms))
    peak_val = float(np.max(rms))
    total_frames = len(rms)
    frame_duration = hop_length / sr

    # Attack: onset to peak
    attack_time = peak_idx * frame_duration

    # Sustain: frames within 70% of peak amplitude
    sustain_mask = rms >= (peak_val * 0.7)
    sustain_ratio = float(np.sum(sustain_mask)) / total_frames

    # Release: last frame above 70% peak to end
    above_threshold = np.where(sustain_mask)[0]
    if len(above_threshold) > 0:
        last_sustain = int(above_threshold[-1])
        release_time = (total_frames - last_sustain) * frame_duration
    else:
        release_time = 0.0

    # AM depth: peak-to-trough ratio of the envelope
    trough_val = float(np.min(rms[rms > 0])) if np.any(rms > 0) else 0.0
    am_depth = (peak_val - trough_val) / peak_val if peak_val > 0 else 0.0

    return {
        "attack_time_s": round(_safe_finite(attack_time), 4),
        "sustain_ratio": round(_safe_finite(sustain_ratio), 4),
        "release_time_s": round(_safe_finite(release_time), 4),
        "amplitude_modulation_depth": round(_safe_finite(am_depth), 4),
    }


def _frequency_modulation_rate(y: np.ndarray, sr: int) -> float:
    """Estimate FM rate (vibrato) from pitch contour zero-crossings."""
    if y.size < 512:
        return 0.0
    try:
        frame_length = max(2048, int(np.ceil(sr / 8.0)) + 2)
        f0 = librosa.yin(y, fmin=8, fmax=300, sr=sr, frame_length=frame_length)
        valid = f0[(f0 > 0) & np.isfinite(f0)]
        if len(valid) < 4:
            return 0.0
        # Detrend and count zero-crossings of the pitch deviation
        detrended = valid - np.mean(valid)
        crossings = np.sum(np.diff(np.sign(detrended)) != 0)
        hop_time = 512 / sr  # librosa default hop for yin
        total_time = len(valid) * hop_time
        fm_rate = crossings / (2 * total_time) if total_time > 0 else 0.0
        return round(_safe_finite(fm_rate), 2)
    except Exception:
        return 0.0


def _spectral_shape(y: np.ndarray, sr: int) -> dict[str, float]:
    """Compute spectral skewness, kurtosis, flatness, flux, and sub-harmonic ratio."""
    if y.size < 2:
        return {
            "spectral_skewness": 0.0,
            "spectral_kurtosis": 0.0,
            "spectral_flatness": 0.0,
            "spectral_flux_mean": 0.0,
            "sub_harmonic_ratio": 0.0,
            "below_20hz_energy_ratio": 0.0,
        }

    n_fft = min(2048, max(256, len(y)))
    S = np.abs(librosa.stft(y, n_fft=n_fft))
    power = np.mean(S ** 2, axis=1)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    total_power = float(np.sum(power))

    if total_power == 0:
        return {
            "spectral_skewness": 0.0,
            "spectral_kurtosis": 0.0,
            "spectral_flatness": 0.0,
            "spectral_flux_mean": 0.0,
            "sub_harmonic_ratio": 0.0,
            "below_20hz_energy_ratio": 0.0,
        }

    # Spectral centroid and moments
    probs = power / total_power
    mean_freq = float(np.sum(freqs * probs))
    variance = float(np.sum(((freqs - mean_freq) ** 2) * probs))
    std = np.sqrt(variance) if variance > 0 else 1e-8

    skewness = float(np.sum(((freqs - mean_freq) ** 3) * probs)) / (std ** 3) if std > 1e-8 else 0.0
    kurtosis = float(np.sum(((freqs - mean_freq) ** 4) * probs)) / (std ** 4) - 3.0 if std > 1e-8 else 0.0

    # Spectral flatness (Wiener entropy): geometric mean / arithmetic mean
    flatness = librosa.feature.spectral_flatness(y=y, n_fft=n_fft)
    flatness_val = float(np.mean(flatness))

    # Spectral flux: mean frame-to-frame L2 difference
    flux = np.sqrt(np.sum(np.diff(S, axis=1) ** 2, axis=0))
    flux_mean = float(np.mean(flux)) if flux.size > 0 else 0.0
    # Normalize by number of frequency bins for scale-independence
    flux_mean = flux_mean / S.shape[0] if S.shape[0] > 0 else 0.0

    # Sub-harmonic ratio: energy below fundamental frequency vs total
    # Approximate fundamental as the strongest low-frequency peak
    low_mask = freqs < 100
    if np.any(low_mask) and np.any(power[low_mask] > 0):
        f0_bin = np.argmax(power[low_mask])
        f0_freq = freqs[f0_bin]
        sub_mask = freqs < f0_freq
        sub_energy = float(np.sum(power[sub_mask]))
        sub_ratio = sub_energy / total_power
    else:
        sub_ratio = 0.0

    # Below 20Hz energy ratio
    below_20_mask = freqs < 20
    below_20_energy = float(np.sum(power[below_20_mask]))
    below_20_ratio = below_20_energy / total_power

    return {
        "spectral_skewness": round(_safe_finite(skewness), 4),
        "spectral_kurtosis": round(_safe_finite(kurtosis), 4),
        "spectral_flatness": round(_safe_finite(flatness_val), 4),
        "spectral_flux_mean": round(_safe_finite(flux_mean), 6),
        "sub_harmonic_ratio": round(_safe_finite(sub_ratio), 4),
        "below_20hz_energy_ratio": round(_safe_finite(below_20_ratio), 4),
    }


def compute_extended_features(
    y: np.ndarray, sr: int, base_features: dict[str, object]
) -> dict[str, object]:
    """Compute 15 new acoustic features and merge with base features.

    Args:
        y: Audio time-series (1-D numpy array).
        sr: Sample rate.
        base_features: Existing features dict from extract_acoustic_features().

    Returns:
        Merged dict containing all base + extended features.
    """
    result = dict(base_features)
    result.update(_temporal_envelope(y, sr))
    result["frequency_modulation_rate_hz"] = _frequency_modulation_rate(y, sr)
    result.update(_spectral_shape(y, sr))
    return result


def compute_inter_call_features(calls: list[dict[str, object]]) -> list[dict[str, object]]:
    """Add inter-call context features to a list of calls from one recording.

    Computes ICI (inter-call interval) and sequence position for each call.
    Must be called after all calls in a recording are detected.

    Args:
        calls: List of call dicts, each with 'start_ms', 'duration_ms', 'acoustic_features'.

    Returns:
        Same list with acoustic_features updated in-place.
    """
    n = len(calls)
    sorted_calls = sorted(calls, key=lambda c: float(c.get("start_ms") or 0))

    for i, call in enumerate(sorted_calls):
        features = call.get("acoustic_features")
        if not isinstance(features, dict):
            features = {}
            call["acoustic_features"] = features

        start = float(call.get("start_ms") or 0)
        duration = float(call.get("duration_ms") or 0)
        end = start + duration

        # ICI before: gap from previous call's end to this call's start
        if i > 0:
            prev_end = float(sorted_calls[i - 1].get("start_ms") or 0) + float(
                sorted_calls[i - 1].get("duration_ms") or 0
            )
            features["ici_before_ms"] = round(start - prev_end, 2)
        else:
            features["ici_before_ms"] = None

        # ICI after: gap from this call's end to next call's start
        if i < n - 1:
            next_start = float(sorted_calls[i + 1].get("start_ms") or 0)
            features["ici_after_ms"] = round(next_start - end, 2)
        else:
            features["ici_after_ms"] = None

        features["sequence_length"] = n
        features["sequence_position_ratio"] = round(i / max(n - 1, 1), 4)

    return calls
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_feature_engineer.py -v`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add echofield/ml/feature_engineer.py tests/test_feature_engineer.py
git commit -m "feat(ml): add extended feature extraction — temporal envelope, spectral shape, inter-call context"
```

---

## Task 3: Pipeline Integration

**Files:**
- Modify: `echofield/pipeline/call_detector.py` (~lines 415 and 534)
- Test: `tests/test_feature_engineer.py` (already covers the functions; integration verified by existing pipeline tests)

- [ ] **Step 1: Write failing integration test**

Add to `tests/test_feature_engineer.py`:

```python
def test_extended_features_present_after_call_detector():
    """Verify the call_detector pipeline produces extended features."""
    from echofield.pipeline.call_detector import CallDetector
    sr = 22050
    rng = np.random.default_rng(99)
    # 5 seconds of audio with a loud segment in the middle
    y = rng.standard_normal(sr * 5).astype(np.float32) * 0.01
    y[sr * 2 : sr * 3] = np.sin(2 * np.pi * 50 * np.linspace(0, 1, sr)) * 0.5
    detector = CallDetector()
    calls = detector.detect("test-rec", y, sr, {})
    if len(calls) > 0:
        features = calls[0].get("acoustic_features", {})
        assert "attack_time_s" in features
        assert "spectral_flatness" in features
        assert "sequence_length" in features
```

- [ ] **Step 2: Run test to verify RED**

Run: `.venv/bin/python -m pytest tests/test_feature_engineer.py::test_extended_features_present_after_call_detector -v`
Expected: FAIL — `attack_time_s` not in features (feature_engineer not hooked in yet)

- [ ] **Step 3: Hook feature_engineer into call_detector.py**

In `echofield/pipeline/call_detector.py`, find the `_classify_snippet` method (around line 415) where `extract_acoustic_features` is called. Add the import at the top of the file:

```python
from echofield.ml.feature_engineer import compute_extended_features, compute_inter_call_features
```

In `_classify_snippet`, after `features = extract_acoustic_features(snippet, sr)`, add:

```python
        features = compute_extended_features(snippet, sr, features)
```

In the `detect` method, after the call-building loop ends (after all calls are appended, around line 534), add before the return:

```python
        calls = compute_inter_call_features(calls)
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_feature_engineer.py -v`
Expected: All 11 tests PASS

Run: `.venv/bin/python -m pytest tests/ -q --ignore=tests/test_pipeline.py`
Expected: All existing tests still pass

- [ ] **Step 5: Commit**

```bash
git add echofield/pipeline/call_detector.py tests/test_feature_engineer.py
git commit -m "feat(ml): hook extended features into call detector pipeline"
```

---

## Task 4: Model Registry

**Files:**
- Create: `echofield/ml/model_registry.py`
- Test: `tests/test_model_registry.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_model_registry.py
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
```

- [ ] **Step 2: Run tests to verify RED**

Run: `.venv/bin/python -m pytest tests/test_model_registry.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement model_registry.py**

```python
# echofield/ml/model_registry.py
"""Versioned model storage and benchmark history."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib


class ModelRegistry:
    """Save, load, and version sklearn models with benchmark tracking."""

    def __init__(self, base_dir: str | Path = "data/models/ml") -> None:
        self._base_dir = Path(base_dir)
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def _model_dir(self, model_name: str) -> Path:
        d = self._base_dir / model_name
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _benchmarks_path(self, model_name: str) -> Path:
        return self._model_dir(model_name) / "benchmarks.json"

    def _load_benchmarks(self, model_name: str) -> list[dict[str, Any]]:
        path = self._benchmarks_path(model_name)
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return []

    def _save_benchmarks(self, model_name: str, history: list[dict[str, Any]]) -> None:
        path = self._benchmarks_path(model_name)
        path.write_text(json.dumps(history, indent=2, default=str), encoding="utf-8")

    def latest_version(self, model_name: str) -> str | None:
        history = self._load_benchmarks(model_name)
        if not history:
            return None
        return history[-1]["version"]

    def save(
        self,
        model_name: str,
        model: Any,
        metrics: dict[str, Any],
        label_count: int,
    ) -> str:
        """Save a trained model and append benchmark entry. Returns version string."""
        history = self._load_benchmarks(model_name)
        version_num = len(history) + 1
        version = f"v{version_num}"

        model_path = self._model_dir(model_name) / f"{version}.pkl"
        joblib.dump(model, model_path)

        entry = {
            "version": version,
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "label_count": label_count,
            "metrics": metrics,
            "model_path": str(model_path),
        }
        history.append(entry)
        self._save_benchmarks(model_name, history)
        return version

    def load(self, model_name: str, version: str | None = None) -> Any | None:
        """Load a model by name and optional version. Returns None if not found."""
        history = self._load_benchmarks(model_name)
        if not history:
            return None
        if version is None:
            entry = history[-1]
        else:
            entry = next((e for e in history if e["version"] == version), None)
            if entry is None:
                return None
        model_path = Path(entry["model_path"])
        if not model_path.exists():
            return None
        return joblib.load(model_path)

    def get_benchmark_history(self, model_name: str) -> list[dict[str, Any]]:
        """Return full training history for a model."""
        return self._load_benchmarks(model_name)
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_model_registry.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add echofield/ml/model_registry.py tests/test_model_registry.py
git commit -m "feat(ml): add versioned model registry with benchmark history"
```

---

## Task 5: Classifier — Dual Pipeline

**Files:**
- Create: `echofield/ml/classifier.py`
- Test: `tests/test_ml_classifier.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_ml_classifier.py
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
```

- [ ] **Step 2: Run tests to verify RED**

Run: `.venv/bin/python -m pytest tests/test_ml_classifier.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement classifier.py**

```python
# echofield/ml/classifier.py
"""Dual-output sklearn classifiers for call type and social function."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

from echofield.ml.model_registry import ModelRegistry
from echofield.ml.taxonomy import CALL_TYPES, SOCIAL_FUNCTIONS


class CallClassifier:
    """Train and predict call type (8 classes) and social function (5 classes)."""

    def __init__(self, model_dir: str | Path = "data/models/ml") -> None:
        self._registry = ModelRegistry(base_dir=model_dir)
        self._ct_pipeline: Pipeline | None = self._registry.load("call_type")
        self._sf_pipeline: Pipeline | None = self._registry.load("social_fn")
        self._feature_keys: list[str] | None = None
        # Try loading feature keys from latest benchmark
        for name in ("call_type", "social_fn"):
            history = self._registry.get_benchmark_history(name)
            if history and "feature_keys" in history[-1]:
                self._feature_keys = history[-1]["feature_keys"]
                break

    @property
    def feature_keys(self) -> list[str] | None:
        return self._feature_keys

    def _extract_feature_vector(self, features: dict[str, Any]) -> list[float]:
        """Convert a features dict to a numeric vector using stored key order."""
        if self._feature_keys is None:
            return []
        return [float(features.get(k, 0.0) or 0.0) for k in self._feature_keys]

    def _build_pipeline(self) -> Pipeline:
        return Pipeline([
            ("scaler", StandardScaler()),
            ("clf", RandomForestClassifier(
                n_estimators=200,
                class_weight="balanced",
                random_state=42,
                max_depth=15,
            )),
        ])

    def train(self, labeled_data: list[dict[str, Any]]) -> dict[str, Any]:
        """Train both classifiers from labeled call data.

        Args:
            labeled_data: List of dicts, each with 'acoustic_features',
                'call_type_refined', and 'social_function'.

        Returns:
            Dict with training metrics for each classifier.
        """
        # Discover feature keys from first sample
        sample_features = labeled_data[0].get("acoustic_features") or {}
        self._feature_keys = sorted(
            k for k, v in sample_features.items()
            if isinstance(v, (int, float)) and v is not None
        )

        # Build X matrix
        X = []
        ct_labels = []
        sf_labels = []
        for item in labeled_data:
            features = item.get("acoustic_features") or {}
            vector = [float(features.get(k, 0.0) or 0.0) for k in self._feature_keys]
            X.append(vector)
            ct_labels.append(item.get("call_type_refined", "unknown"))
            sf_labels.append(item.get("social_function", "unknown"))

        X_arr = np.array(X, dtype=np.float64)
        label_count = len(X)

        results: dict[str, Any] = {}

        # Train call type classifier
        ct_pipeline = self._build_pipeline()
        ct_pipeline.fit(X_arr, ct_labels)
        ct_pred = ct_pipeline.predict(X_arr)
        ct_accuracy = round(float(accuracy_score(ct_labels, ct_pred)), 4)
        ct_classes = list(ct_pipeline.classes_)
        ct_f1 = {
            str(cls): round(float(f1), 4)
            for cls, f1 in zip(
                ct_classes,
                f1_score(ct_labels, ct_pred, labels=ct_classes, average=None, zero_division=0),
            )
        }
        ct_metrics = {"accuracy": ct_accuracy, "per_class_f1": ct_f1}
        ct_version = self._registry.save(
            "call_type", ct_pipeline, ct_metrics, label_count,
        )
        # Store feature_keys in benchmark
        history = self._registry.get_benchmark_history("call_type")
        if history:
            history[-1]["feature_keys"] = self._feature_keys
            self._registry._save_benchmarks("call_type", history)
        self._ct_pipeline = ct_pipeline
        results["call_type"] = {**ct_metrics, "version": ct_version}

        # Train social function classifier
        sf_pipeline = self._build_pipeline()
        sf_pipeline.fit(X_arr, sf_labels)
        sf_pred = sf_pipeline.predict(X_arr)
        sf_accuracy = round(float(accuracy_score(sf_labels, sf_pred)), 4)
        sf_classes = list(sf_pipeline.classes_)
        sf_f1 = {
            str(cls): round(float(f1), 4)
            for cls, f1 in zip(
                sf_classes,
                f1_score(sf_labels, sf_pred, labels=sf_classes, average=None, zero_division=0),
            )
        }
        sf_metrics = {"accuracy": sf_accuracy, "per_class_f1": sf_f1}
        sf_version = self._registry.save(
            "social_fn", sf_pipeline, sf_metrics, label_count,
        )
        history = self._registry.get_benchmark_history("social_fn")
        if history:
            history[-1]["feature_keys"] = self._feature_keys
            self._registry._save_benchmarks("social_fn", history)
        self._sf_pipeline = sf_pipeline
        results["social_function"] = {**sf_metrics, "version": sf_version}

        return results

    def predict(self, features: dict[str, Any]) -> dict[str, Any] | None:
        """Predict call type and social function for a single call.

        Returns None if no model is trained.
        """
        if self._ct_pipeline is None or self._sf_pipeline is None:
            return None
        if self._feature_keys is None:
            return None

        vector = np.array([self._extract_feature_vector(features)], dtype=np.float64)

        ct_pred = str(self._ct_pipeline.predict(vector)[0])
        ct_proba = self._ct_pipeline.predict_proba(vector)[0]
        ct_classes = list(self._ct_pipeline.classes_)
        ct_confidence = float(np.max(ct_proba))

        sf_pred = str(self._sf_pipeline.predict(vector)[0])
        sf_proba = self._sf_pipeline.predict_proba(vector)[0]
        sf_classes = list(self._sf_pipeline.classes_)
        sf_confidence = float(np.max(sf_proba))

        confidence = min(ct_confidence, sf_confidence)

        return {
            "call_type": ct_pred,
            "social_function": sf_pred,
            "confidence": round(confidence, 4),
            "call_type_confidence": round(ct_confidence, 4),
            "social_function_confidence": round(sf_confidence, 4),
            "call_type_probs": {
                str(cls): round(float(p), 5) for cls, p in zip(ct_classes, ct_proba)
            },
            "social_function_probs": {
                str(cls): round(float(p), 5) for cls, p in zip(sf_classes, sf_proba)
            },
        }
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_ml_classifier.py -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add echofield/ml/classifier.py tests/test_ml_classifier.py
git commit -m "feat(ml): add dual-output call type and social function classifier"
```

---

## Task 6: Active Learning

**Files:**
- Create: `echofield/ml/active_learning.py`
- Test: `tests/test_active_learning.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_active_learning.py
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
    # c2 has lowest confidence (0.3), then c3 (0.5), then c1 (0.9)
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
```

- [ ] **Step 2: Run tests to verify RED**

Run: `.venv/bin/python -m pytest tests/test_active_learning.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement active_learning.py**

```python
# echofield/ml/active_learning.py
"""Active learning manager: uncertainty sampling, labeling queue, retrain trigger."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from echofield.ml.taxonomy import validate_call_type, validate_social_function


class ActiveLearningManager:
    """Manages the labeling queue and retrain trigger for active learning."""

    def __init__(
        self,
        labels_path: str | Path = "data/labels/labels.json",
        model_dir: str | Path = "data/models/ml",
        retrain_threshold: int | None = None,
    ) -> None:
        self._labels_path = Path(labels_path)
        self._labels_path.parent.mkdir(parents=True, exist_ok=True)
        self._model_dir = Path(model_dir)
        self._retrain_threshold = retrain_threshold or int(
            os.getenv("ECHOFIELD_ML_RETRAIN_THRESHOLD", "20")
        )
        self._labels: dict[str, dict[str, Any]] = self._load_labels()
        self._labels_since_train: int = self._labels.get(
            "__meta__", {}
        ).get("labels_since_last_train", len(self._labels))

    def _load_labels(self) -> dict[str, dict[str, Any]]:
        if self._labels_path.exists():
            try:
                return json.loads(self._labels_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                return {}
        return {}

    def _save_labels(self) -> None:
        self._labels["__meta__"] = {
            "labels_since_last_train": self._labels_since_train,
            "total_labels": len(self._labels) - (1 if "__meta__" in self._labels else 0),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._labels_path.write_text(
            json.dumps(self._labels, indent=2, default=str), encoding="utf-8"
        )

    def save_label(
        self,
        call_id: str,
        call_type_refined: str,
        social_function: str,
    ) -> dict[str, Any]:
        """Save a human-provided label for a call."""
        entry = {
            "call_type_refined": call_type_refined,
            "social_function": social_function,
            "labeled_at": datetime.now(timezone.utc).isoformat(),
        }
        self._labels[call_id] = entry
        self._labels_since_train += 1
        self._save_labels()
        return entry

    def get_all_labels(self) -> dict[str, dict[str, Any]]:
        """Return all labels excluding metadata."""
        return {k: v for k, v in self._labels.items() if k != "__meta__"}

    def get_labeling_queue(
        self,
        all_calls: dict[str, dict[str, Any]],
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Return the top-N most uncertain unlabeled calls.

        Args:
            all_calls: Dict of call_id -> call dict (from CallDatabase._calls).
            limit: Max calls to return.

        Returns:
            List of call dicts sorted by uncertainty (lowest confidence first).
        """
        labeled_ids = set(self.get_all_labels().keys())
        unlabeled = [
            call for call_id, call in all_calls.items()
            if call_id not in labeled_ids and call_id != "__meta__"
        ]
        # Sort by confidence ascending (most uncertain first)
        unlabeled.sort(key=lambda c: float(c.get("confidence") or 0.0))
        return unlabeled[:limit]

    @property
    def labels_since_last_train(self) -> int:
        return self._labels_since_train

    def should_retrain(self) -> bool:
        return self._labels_since_train >= self._retrain_threshold

    def mark_retrained(self) -> None:
        """Reset the labels-since-train counter after a successful training run."""
        self._labels_since_train = 0
        self._save_labels()
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_active_learning.py -v`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add echofield/ml/active_learning.py tests/test_active_learning.py
git commit -m "feat(ml): add active learning manager with uncertainty sampling and retrain trigger"
```

---

## Task 7: Narrative — Claude API Wrapper

**Files:**
- Create: `echofield/ml/narrative.py`
- Modify: `requirements.txt`
- Test: `tests/test_narrative.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_narrative.py
from __future__ import annotations

import os


def test_template_fallback_when_no_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from echofield.ml.narrative import generate_narrative
    result = generate_narrative(
        call_type="contact-rumble",
        social_function="initiating",
        confidence=0.85,
        top_features=[
            ("fundamental_frequency_hz", 18.2),
            ("harmonicity", 0.72),
            ("duration_s", 1.2),
        ],
    )
    assert isinstance(result, str)
    assert len(result) > 20
    assert "Contact Rumble" in result
    assert "Initiating" in result


def test_template_includes_confidence():
    from echofield.ml.narrative import generate_narrative
    result = generate_narrative(
        call_type="trumpet",
        social_function="responding",
        confidence=0.42,
        top_features=[("spectral_centroid_hz", 2500.0)],
    )
    assert "42" in result or "0.42" in result


def test_template_handles_unknown_gracefully():
    from echofield.ml.narrative import generate_narrative
    result = generate_narrative(
        call_type="unknown",
        social_function="unknown",
        confidence=0.1,
        top_features=[],
    )
    assert isinstance(result, str)
    assert len(result) > 10
```

- [ ] **Step 2: Run tests to verify RED**

Run: `.venv/bin/python -m pytest tests/test_narrative.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Add anthropic to requirements.txt**

In `requirements.txt`, add:

```
anthropic
```

- [ ] **Step 4: Install the new dependency**

Run: `.venv/bin/pip install anthropic`

- [ ] **Step 5: Implement narrative.py**

```python
# echofield/ml/narrative.py
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
    """Generate a template-based narrative when API is unavailable."""
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
    """Generate a natural language interpretation of a classified call.

    Uses Claude API if ANTHROPIC_API_KEY is set, otherwise falls back to template.

    Args:
        call_type: Predicted call type label.
        social_function: Predicted social function label.
        confidence: Overall prediction confidence (0-1).
        top_features: List of (feature_name, value) tuples, most important first.
        sequence_context: Optional description of surrounding calls.

    Returns:
        2-3 sentence interpretation string.
    """
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
```

- [ ] **Step 6: Run tests to verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_narrative.py -v`
Expected: All 3 tests PASS

- [ ] **Step 7: Commit**

```bash
git add echofield/ml/narrative.py tests/test_narrative.py requirements.txt
git commit -m "feat(ml): add Claude API narrative interpretation with template fallback"
```

---

## Task 8: ML API Endpoints — Labeling, Training, Prediction, Benchmarks

**Files:**
- Modify: `echofield/server.py`
- Test: `tests/test_ml_endpoints.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_ml_endpoints.py
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from echofield.server import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_labeling_queue_returns_list(client: AsyncClient):
    resp = await client.get("/api/ml/labeling-queue")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_label_call_with_valid_labels(client: AsyncClient):
    resp = await client.post(
        "/api/ml/label/test-call-1",
        json={"call_type_refined": "contact-rumble", "social_function": "initiating"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "labeled"


@pytest.mark.asyncio
async def test_label_call_with_invalid_call_type(client: AsyncClient):
    resp = await client.post(
        "/api/ml/label/test-call-1",
        json={"call_type_refined": "invalid-type", "social_function": "initiating"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_benchmarks_endpoint(client: AsyncClient):
    resp = await client.get("/api/ml/benchmarks")
    assert resp.status_code == 200
    data = resp.json()
    assert "training_runs" in data
    assert "active_learning" in data


@pytest.mark.asyncio
async def test_predict_nonexistent_call(client: AsyncClient):
    resp = await client.get("/api/ml/predict/nonexistent-call")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify RED**

Run: `.venv/bin/python -m pytest tests/test_ml_endpoints.py -v`
Expected: FAIL — 404 on `/api/ml/labeling-queue` (endpoint doesn't exist yet)

- [ ] **Step 3: Add ML endpoints to server.py**

Add these imports near the top of `echofield/server.py`:

```python
from echofield.ml.active_learning import ActiveLearningManager
from echofield.ml.classifier import CallClassifier
from echofield.ml.narrative import generate_narrative
from echofield.ml.taxonomy import validate_call_type, validate_social_function, CALL_TYPES, SOCIAL_FUNCTIONS
```

Add these helper functions and state initialization. In the `lifespan` context manager (around line 126-163), add after the existing state setup:

```python
    app.state.ml_classifier = CallClassifier()
    app.state.al_manager = ActiveLearningManager()
```

Add helper accessors:

```python
def _get_ml_classifier() -> CallClassifier:
    return app.state.ml_classifier

def _get_al_manager() -> ActiveLearningManager:
    return app.state.al_manager
```

Add the endpoints (append to the endpoint section of `server.py`):

```python
# --- ML Labeling ---

@app.get("/api/ml/labeling-queue")
async def ml_labeling_queue(limit: int = Query(10, ge=1, le=100)):
    db = _get_call_database()
    mgr = _get_al_manager()
    queue = mgr.get_labeling_queue(db._calls, limit=limit)
    return queue


@app.post("/api/ml/label/{call_id}")
async def ml_label_call(call_id: str, body: dict):
    ct = body.get("call_type_refined", "")
    sf = body.get("social_function", "")
    if not validate_call_type(ct):
        raise HTTPException(status_code=422, detail=f"Invalid call_type_refined: {ct}. Must be one of {CALL_TYPES}")
    if not validate_social_function(sf):
        raise HTTPException(status_code=422, detail=f"Invalid social_function: {sf}. Must be one of {SOCIAL_FUNCTIONS}")

    mgr = _get_al_manager()
    mgr.save_label(call_id, ct, sf)

    # Also update the call in the database
    db = _get_call_database()
    call = db._calls.get(call_id)
    if call:
        call["call_type_refined"] = ct
        call["social_function"] = sf

    return {
        "status": "labeled",
        "labels_since_last_train": mgr.labels_since_last_train,
        "retrain_threshold": mgr._retrain_threshold,
        "should_retrain": mgr.should_retrain(),
    }


# --- ML Training & Prediction ---

@app.post("/api/ml/train")
async def ml_train():
    mgr = _get_al_manager()
    clf = _get_ml_classifier()
    db = _get_call_database()

    labels = mgr.get_all_labels()
    if len(labels) < 5:
        raise HTTPException(status_code=400, detail=f"Need at least 5 labels, have {len(labels)}")

    training_data = []
    for call_id, label in labels.items():
        call = db._calls.get(call_id)
        features = (call or {}).get("acoustic_features", {})
        training_data.append({
            "acoustic_features": features,
            "call_type_refined": label["call_type_refined"],
            "social_function": label["social_function"],
        })

    result = clf.train(training_data)
    mgr.mark_retrained()
    return result


@app.get("/api/ml/predict/{call_id}")
async def ml_predict(call_id: str):
    db = _get_call_database()
    call = db._calls.get(call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")

    clf = _get_ml_classifier()
    features = call.get("acoustic_features", {})
    prediction = clf.predict(features)

    if prediction is None:
        return {"error": "No trained model available", "call_id": call_id}

    # Generate narrative (may hit Claude API or fall back to template)
    top_features = sorted(
        [(k, v) for k, v in features.items() if isinstance(v, (int, float)) and v is not None],
        key=lambda x: abs(x[1]),
        reverse=True,
    )[:5]
    narrative = call.get("narrative_text")
    if not narrative:
        narrative = generate_narrative(
            call_type=prediction["call_type"],
            social_function=prediction["social_function"],
            confidence=prediction["confidence"],
            top_features=top_features,
        )
        call["narrative_text"] = narrative

    prediction["narrative_text"] = narrative
    prediction["call_id"] = call_id
    return prediction


# --- ML Benchmarks ---

@app.get("/api/ml/benchmarks")
async def ml_benchmarks():
    clf = _get_ml_classifier()
    mgr = _get_al_manager()
    registry = clf._registry

    ct_history = registry.get_benchmark_history("call_type")
    sf_history = registry.get_benchmark_history("social_fn")

    accuracy_over_time = []
    for entry in ct_history:
        accuracy_over_time.append([
            entry.get("label_count", 0),
            entry.get("metrics", {}).get("accuracy", 0),
        ])

    return {
        "training_runs": {
            "call_type": ct_history,
            "social_function": sf_history,
        },
        "active_learning": {
            "total_labels": len(mgr.get_all_labels()),
            "labels_since_last_train": mgr.labels_since_last_train,
            "retrain_threshold": mgr._retrain_threshold,
            "accuracy_over_time": accuracy_over_time,
        },
    }


@app.get("/api/ml/benchmarks/latest")
async def ml_benchmarks_latest():
    clf = _get_ml_classifier()
    registry = clf._registry

    ct_history = registry.get_benchmark_history("call_type")
    sf_history = registry.get_benchmark_history("social_fn")

    return {
        "call_type": ct_history[-1] if ct_history else None,
        "social_function": sf_history[-1] if sf_history else None,
    }
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_ml_endpoints.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add echofield/server.py tests/test_ml_endpoints.py
git commit -m "feat(ml): add ML labeling, training, prediction, and benchmark API endpoints"
```

---

## Task 9: Analytics Endpoints — Population, Social Graph, Per-Recording

**Files:**
- Modify: `echofield/server.py`
- Test: `tests/test_ml_endpoints.py` (append new tests)

- [ ] **Step 1: Write failing tests**

Append to `tests/test_ml_endpoints.py`:

```python
@pytest.mark.asyncio
async def test_population_analytics(client: AsyncClient):
    resp = await client.get("/api/analytics/population")
    assert resp.status_code == 200
    data = resp.json()
    assert "call_type_distribution" in data
    assert "social_function_distribution" in data
    assert "by_site" in data
    assert "temporal_patterns" in data


@pytest.mark.asyncio
async def test_social_graph(client: AsyncClient):
    resp = await client.get("/api/analytics/social-graph")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data


@pytest.mark.asyncio
async def test_per_recording_features_404_for_missing(client: AsyncClient):
    resp = await client.get("/api/analytics/recording/nonexistent/features")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify RED**

Run: `.venv/bin/python -m pytest tests/test_ml_endpoints.py::test_population_analytics tests/test_ml_endpoints.py::test_social_graph tests/test_ml_endpoints.py::test_per_recording_features_404_for_missing -v`
Expected: FAIL — 404 on `/api/analytics/*`

- [ ] **Step 3: Add analytics endpoints to server.py**

Append to `echofield/server.py`:

```python
# --- Analytics ---

@app.get("/api/analytics/population")
async def analytics_population():
    db = _get_call_database()
    calls = [c for cid, c in db._calls.items() if cid != "__meta__"]

    ct_dist: dict[str, int] = {}
    sf_dist: dict[str, int] = {}
    by_site: dict[str, dict[str, Any]] = {}
    hourly: list[int] = [0] * 24

    for call in calls:
        ct = call.get("call_type_refined") or call.get("call_type") or "unknown"
        sf = call.get("social_function") or "unknown"
        ct_dist[ct] = ct_dist.get(ct, 0) + 1
        sf_dist[sf] = sf_dist.get(sf, 0) + 1

        location = call.get("location") or "unknown"
        if location not in by_site:
            by_site[location] = {"call_count": 0, "dominant_type": ""}
        by_site[location]["call_count"] += 1

    # Compute dominant type per site
    for site, info in by_site.items():
        site_calls = [c for c in calls if (c.get("location") or "unknown") == site]
        types = {}
        for c in site_calls:
            t = c.get("call_type_refined") or c.get("call_type") or "unknown"
            types[t] = types.get(t, 0) + 1
        info["dominant_type"] = max(types, key=types.get) if types else "unknown"

    return {
        "call_type_distribution": ct_dist,
        "social_function_distribution": sf_dist,
        "by_site": by_site,
        "temporal_patterns": {
            "hourly_distribution": hourly,
            "call_rate_per_recording": [],
        },
    }


@app.get("/api/analytics/social-graph")
async def analytics_social_graph():
    db = _get_call_database()
    calls = sorted(
        [c for cid, c in db._calls.items() if cid != "__meta__"],
        key=lambda c: (c.get("recording_id", ""), float(c.get("start_ms") or 0)),
    )

    nodes: dict[str, dict[str, Any]] = {}
    edges: dict[str, dict[str, Any]] = {}

    for call in calls:
        cluster = call.get("cluster_id") or call.get("individual_id") or call.get("id", "unknown")
        if cluster not in nodes:
            nodes[cluster] = {"id": cluster, "call_count": 0, "dominant_type": "unknown"}
        nodes[cluster]["call_count"] += 1

    # Build edges from consecutive calls with short ICI in same recording
    prev = None
    for call in calls:
        if prev and prev.get("recording_id") == call.get("recording_id"):
            prev_end = float(prev.get("start_ms") or 0) + float(prev.get("duration_ms") or 0)
            curr_start = float(call.get("start_ms") or 0)
            ici = curr_start - prev_end
            if 0 < ici < 5000:  # <5s ICI = likely response
                from_id = prev.get("cluster_id") or prev.get("individual_id") or prev.get("id", "")
                to_id = call.get("cluster_id") or call.get("individual_id") or call.get("id", "")
                if from_id != to_id:
                    edge_key = f"{from_id}->{to_id}"
                    if edge_key not in edges:
                        edges[edge_key] = {"from": from_id, "to": to_id, "response_count": 0, "ici_sum": 0.0}
                    edges[edge_key]["response_count"] += 1
                    edges[edge_key]["ici_sum"] += ici
        prev = call

    edge_list = []
    for e in edges.values():
        e["avg_ici_ms"] = round(e["ici_sum"] / e["response_count"], 1) if e["response_count"] > 0 else 0
        del e["ici_sum"]
        edge_list.append(e)

    return {"nodes": list(nodes.values()), "edges": edge_list}


@app.get("/api/analytics/recording/{recording_id}/features")
async def analytics_recording_features(recording_id: str):
    db = _get_call_database()
    calls = [
        c for cid, c in db._calls.items()
        if c.get("recording_id") == recording_id and cid != "__meta__"
    ]
    if not calls:
        raise HTTPException(status_code=404, detail="Recording not found or has no calls")

    import numpy as np

    ct_dist: dict[str, int] = {}
    f0_values: list[float] = []
    snr_values: list[float] = []
    duration_values: list[float] = []

    for call in calls:
        ct = call.get("call_type_refined") or call.get("call_type") or "unknown"
        ct_dist[ct] = ct_dist.get(ct, 0) + 1
        features = call.get("acoustic_features") or {}
        f0 = features.get("fundamental_frequency_hz")
        if f0 is not None:
            f0_values.append(float(f0))
        snr = features.get("snr_db")
        if snr is not None:
            snr_values.append(float(snr))
        dur = call.get("duration_ms")
        if dur is not None:
            duration_values.append(float(dur))

    def _stats(values):
        if not values:
            return {"min": 0, "max": 0, "mean": 0}
        arr = np.array(values)
        return {
            "min": round(float(np.min(arr)), 2),
            "max": round(float(np.max(arr)), 2),
            "mean": round(float(np.mean(arr)), 2),
        }

    return {
        "recording_id": recording_id,
        "call_count": len(calls),
        "call_types": ct_dist,
        "feature_distributions": {
            "fundamental_frequency_hz": _stats(f0_values),
            "snr_db": _stats(snr_values),
            "duration_ms": _stats(duration_values),
        },
    }
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_ml_endpoints.py -v`
Expected: All 8 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `.venv/bin/python -m pytest tests/ -q --ignore=tests/test_pipeline.py`
Expected: All tests pass, no regressions

- [ ] **Step 6: Commit**

```bash
git add echofield/server.py tests/test_ml_endpoints.py
git commit -m "feat(ml): add population analytics, social graph, and per-recording feature endpoints"
```

---

## Task 10: Final Integration — Expose ML package & Update __init__

**Files:**
- Modify: `echofield/ml/__init__.py`

- [ ] **Step 1: Update ml package init with public API**

```python
# echofield/ml/__init__.py
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
```

- [ ] **Step 2: Run full test suite to verify everything works together**

Run: `.venv/bin/python -m pytest tests/ -q --ignore=tests/test_pipeline.py`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add echofield/ml/__init__.py
git commit -m "feat(ml): expose ML package public API"
```
