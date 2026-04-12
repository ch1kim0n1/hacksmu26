# ML Metadata Pipeline — Extensive Feature Collection, Active Learning & Prediction

**Date:** 2026-04-11
**Status:** Approved
**Goals:** Social function prediction (C), call type refinement (D), active learning labeling, benchmarks & analytics

---

## 1. Problem

EchoField currently extracts 54 acoustic features per call (15 base + 39 MFCC variants) and classifies calls into 5 coarse types (rumble, trumpet, roar, bark, cry). Researchers need:

1. Richer metadata to distinguish call sub-types and social function
2. An active learning workflow — model predicts, human confirms/corrects
3. Model performance benchmarks that improve visibly as labels accumulate
4. Population-level and per-recording analytics
5. Natural language interpretation of what a call likely communicates

---

## 2. Extended Metadata Schema

### 2.1 New Acoustic Features (+15)

Added by `echofield/ml/feature_engineer.py`, which wraps the existing `feature_extract.py`.

**Temporal Envelope (5 features):**

| Feature | Unit | Description |
|---------|------|-------------|
| `attack_time_s` | seconds | Time from onset to peak amplitude |
| `sustain_ratio` | 0-1 | Fraction of call at near-peak energy |
| `release_time_s` | seconds | Time from peak to decay |
| `amplitude_modulation_depth` | ratio | Peak-to-trough ratio of RMS envelope |
| `frequency_modulation_rate_hz` | Hz | Rate of pitch oscillation (vibrato) |

**Spectral Shape (5 features):**

| Feature | Unit | Description |
|---------|------|-------------|
| `spectral_skewness` | dimensionless | Asymmetry of spectral power distribution |
| `spectral_kurtosis` | dimensionless | Peakedness — sharp tonal vs. noisy |
| `spectral_flatness` | 0-1 | 0=tonal, 1=noise-like (Wiener entropy) |
| `spectral_flux_mean` | dimensionless | Mean frame-to-frame spectral change |
| `sub_harmonic_ratio` | 0-1 | Energy below the fundamental vs. total |

**Inter-call Context (4 features, computed at call-database level):**

| Feature | Unit | Description |
|---------|------|-------------|
| `ici_before_ms` | ms | Gap to previous call in same recording |
| `ici_after_ms` | ms | Gap to next call |
| `sequence_length` | count | Total calls in containing sequence |
| `sequence_position_ratio` | 0-1 | Position within sequence (0=first, 1=last) |

**One additional feature:**

| Feature | Unit | Description |
|---------|------|-------------|
| `below_20hz_energy_ratio` | 0-1 | Infrasound energy proportion |

**Total: ~69 features per call.** All stored in the existing `acoustic_features` dict in the call database. No schema migration required.

### 2.2 Feature Storage

Features are appended to the existing `acoustic_features` dict on each call record. The call database (`call_database.py`) and `CallDetail` model (`models.py`) already accept arbitrary keys in that dict, so no structural changes are needed.

Inter-call context features (`ici_before_ms`, `ici_after_ms`, `sequence_length`, `sequence_position_ratio`) are computed after all calls in a recording are detected, as a post-processing step in the pipeline.

---

## 3. ML Module Architecture

New package: `echofield/ml/`

```
echofield/ml/
  __init__.py
  feature_engineer.py    # Computes 15 new features, wraps existing extraction
  taxonomy.py            # Label definitions for call types and social functions
  classifier.py          # Multi-output sklearn classifier
  active_learning.py     # Uncertainty sampling, labeling queue, retrain trigger
  model_registry.py      # Save/load/version trained models + benchmark history
  narrative.py           # Claude API wrapper for natural language interpretation
```

### 3.1 Taxonomy (`taxonomy.py`)

Two independent label sets:

**Call Type (goal D) — 8 classes:**
- `contact-rumble`
- `lets-go-rumble`
- `musth-rumble`
- `greeting-rumble`
- `trumpet`
- `roar`
- `bark`
- `play-rumble`

**Social Function (goal C) — 5 classes:**
- `initiating` — caller starts interaction
- `responding` — replying to another call
- `maintaining-contact` — long-distance sustained contact
- `coordinating-movement` — group coordination signals
- `unknown` — ambiguous or insufficient context

The module exposes the label lists, validation helpers, and display names. Labels are stored as two new fields on each call: `call_type_refined` and `social_function`.

### 3.2 Classifier (`classifier.py`)

Two independent sklearn pipelines:

```
Pipeline 1 (call type):     StandardScaler → RandomForest(n=200, class_weight="balanced")
Pipeline 2 (social function): StandardScaler → RandomForest(n=200, class_weight="balanced")
```

Each pipeline:
- Takes a 69-feature vector as input
- Produces a probability vector over its label set
- Confidence = max class probability
- Calls with max prob < 0.6 are flagged for the labeling queue

Why two separate pipelines: call type depends primarily on acoustic features; social function depends more on inter-call context and sequence position. Separate models allow each to weight features differently and be retrained independently as labels come in at different rates.

### 3.3 Active Learning (`active_learning.py`)

**Uncertainty sampling** strategy:

1. After processing, classifier auto-predicts on all calls
2. Calls are ranked by prediction uncertainty (1 - max_probability)
3. `/api/ml/labeling-queue` returns the top-N most uncertain calls
4. Researcher labels via `/api/ml/label/{call_id}`
5. After 20+ new labels since last training run, retrain triggers automatically
6. New model re-scores all unlabeled calls, refreshing the queue

**Bootstrap phase:** Before any model exists (0 labels), the queue returns calls ordered by diversity: one call per existing coarse call type per recording, spread across duration quartiles and frequency ranges, to seed a balanced initial training set.

**Retrain threshold:** 20 labels. Configurable via `ECHOFIELD_ML_RETRAIN_THRESHOLD` env var.

### 3.4 Model Registry (`model_registry.py`)

Each training run produces:
- `data/models/ml/call_type_v{N}.pkl` — serialized sklearn pipeline (joblib)
- `data/models/ml/social_fn_v{N}.pkl` — serialized sklearn pipeline
- `data/models/ml/benchmarks.json` — cumulative benchmark log (appended per run)

The registry tracks which version is currently active and allows rollback to any previous version. On startup, it loads the latest version if available.

**Directory:** `data/models/ml/` (runtime, not in git).

### 3.5 Narrative (`narrative.py`)

After classification, an optional Claude API call generates a natural language interpretation.

**Input to Claude:** structured prompt with top-5 discriminative features, predicted call type, predicted social function, confidence levels, and sequence context.

**Model:** `claude-haiku-4-5-20251001` — cheap and fast for production. Falls back to a template-based sentence if the API is unavailable.

**Caching:** result stored on the call record (`narrative_text` field) so subsequent requests don't re-call the API.

**Requires:** `ANTHROPIC_API_KEY` env var. If unset, narrative falls back to template.

---

## 4. API Endpoints

### 4.1 Labeling

```
GET  /api/ml/labeling-queue?limit=10
  → [{call_id, recording_id, predicted_call_type, predicted_social_function,
      confidence, acoustic_features, spectrogram_url}]

POST /api/ml/label/{call_id}
  Body: {call_type_refined: string, social_function: string}
  → {status: "labeled", labels_since_last_train: N, retrain_threshold: 20}
```

### 4.2 Training & Prediction

```
POST /api/ml/train
  → {version, call_type_metrics: {accuracy, ece, per_class_f1},
     social_function_metrics: {accuracy, ece, per_class_f1}, label_count}

GET  /api/ml/predict/{call_id}
  → {call_type_refined, social_function, confidence, classifier_probs,
     top_features: [{name, value, importance}], narrative_text}
```

### 4.3 Benchmarks (Priority 1)

```
GET  /api/ml/benchmarks
  → {training_runs: [...], active_learning: {total_labels, labels_since_last_train,
     retrain_threshold, accuracy_over_time: [[label_count, accuracy], ...]}}

GET  /api/ml/benchmarks/latest
  → Latest run metrics only
```

### 4.4 Population Analytics (Priority 2)

```
GET  /api/analytics/population
  → {call_type_distribution, social_function_distribution, by_site,
     temporal_patterns: {hourly_distribution, call_rate_per_recording}}

GET  /api/analytics/social-graph
  → {nodes: [{id, call_count, dominant_type}],
     edges: [{from, to, response_count, avg_ici_ms}]}
```

Social graph edges are inferred from short inter-call intervals (<5s) within the same recording sequence — two consecutive calls with different cluster_ids form an edge.

### 4.5 Per-Recording Analytics (Priority 3)

```
GET  /api/analytics/recording/{id}/features
  → {call_count, call_types, feature_distributions: {f0: {min, max, mean, histogram}, ...},
     quality_summary, noise_breakdown}
```

---

## 5. Pipeline Integration

`feature_engineer.py` hooks into `hybrid_pipeline.py` after the existing `feature_extract` step:

```python
# In hybrid_pipeline.py, after extract_acoustic_features():
from echofield.ml.feature_engineer import compute_extended_features
call["acoustic_features"] = compute_extended_features(y_call, sr, call["acoustic_features"])
```

Inter-call context features are computed as a post-processing pass after all calls in a recording are detected:

```python
# After all calls are built:
from echofield.ml.feature_engineer import compute_inter_call_features
calls = compute_inter_call_features(calls)
```

Auto-prediction runs after feature extraction if a trained model exists:

```python
from echofield.ml.classifier import predict_call
for call in calls:
    prediction = predict_call(call["acoustic_features"])
    if prediction:
        call["call_type_refined"] = prediction["call_type"]
        call["social_function"] = prediction["social_function"]
        call["ml_confidence"] = prediction["confidence"]
```

---

## 6. Dependencies

**No new heavyweight dependencies.** Everything uses existing stack:
- `scikit-learn` — already installed (used by `feature_extract.py`)
- `numpy`, `scipy`, `librosa` — already installed
- `anthropic` Python SDK — new, lightweight, only for `narrative.py`

**No PyTorch.** Consistent with CLAUDE.md constraint.

---

## 7. Data Directory Layout

```
data/
  models/
    ml/
      call_type_v1.pkl
      social_fn_v1.pkl
      benchmarks.json       # Cumulative training history
  labels/
    labels.json             # All human-provided labels
```

---

## 8. Testing Strategy

- `tests/test_feature_engineer.py` — verify each new feature computation against known audio signals
- `tests/test_taxonomy.py` — label validation, display names
- `tests/test_classifier.py` — train/predict round-trip with synthetic labeled data
- `tests/test_active_learning.py` — queue ordering, retrain trigger logic
- `tests/test_model_registry.py` — save/load/version lifecycle
- `tests/test_narrative.py` — template fallback when API key is unset
- `tests/test_ml_endpoints.py` — API integration tests for all new endpoints
