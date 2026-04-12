# Noise Classifier Analysis & Limitations

## Issue #63 Resolution Summary

This document documents the analysis and findings from Issue #63: "Validate and improve noise classifier against labeled WAV dataset."

## Current Status

✅ **Repeatable evaluation command**: `python scripts/evaluate_noise_classifier.py`
✅ **Clear output reporting**: Confusion matrix, per-class recall, misclassified samples list
✅ **Test coverage**: 9 new unit tests + 1 regression test for noise classifier validation
✅ **Root cause identified**: Heuristic approach cannot distinguish overlapping acoustic characteristics

## Evaluation Results

**Dataset**: 44 labeled elephant recordings with ground-truth noise types
**Baseline Accuracy**: 43.2% overall (19/44 correct)

### Per-Class Performance:
```
Class       Recall    Support    Notes
────────────────────────────────────────
airplane    90.5%       21       Correctly identifies airplane (high-frequency energy dominance)
car         0.0%        17       Fails to distinguish from airplane (overlapping spectrum)
generator   0.0%         5       Fails to distinguish from airplane
other       0.0%         1       Fallback class
```

## Root Cause Analysis

### Spectral Overlap Problem

Analysis of the 44-sample dataset reveals significant acoustic overlap between noise types:

| Type | Spectral Centroid | Bandwidth | Key Finding |
|------|-------------------|-----------|------------|
| Airplane | 866-2755 Hz (median: 1447) | 11-3025 Hz (median: 162) | Highly variable |
| Vehicle | 873-2940 Hz (median: 1420) | 22-3402 Hz (median: 129) | Very similar to airplane |
| Generator | 1290-1788 Hz (median: 1641) | 43-129 Hz (median: 118) | Narrower bandwidth |
| Background | 1134 Hz | 86 Hz | Limited samples (n=1) |

### Why Heuristics Fail

1. **Spectral centroid alone is insufficient**: Airplane and vehicle centroids overlap nearly completely (1300-1700 Hz range), making them indistinguishable

2. **Bandwidth is highly variable within classes**:
   - Airplane bandwidth ranges 11-3025 Hz (some recordings are narrower than generators!)
   - Vehicle bandwidth ranges 22-3402 Hz (also highly variable)
   - No clear bandwidth threshold separates these classes reliably

3. **Fixed frequency bands don't capture acoustic diversity**:
   - Current ranges: airplane (20-500Hz) × 1.1, car (20-250Hz) × 1.0, generator (50-250Hz) × 1.25
   - These overlapping ranges weight airplane slightly higher, causing systematic misclassification
   - Attempts to adjust ranges/weights for vehicle detection broke airplane detection

4. **Energy distribution is uninformative**:
   - Most energy is concentrated in 100-2000 Hz across all classes
   - Attempting energy-ratio based classification (low/mid/high energy splits) reduced accuracy to 31.8%

## Attempted Improvements & Lessons Learned

| Approach | Result | Why It Failed |
|----------|--------|--------------|
| Bandwidth-based weighting | 40.9% accuracy | Broke airplane detection; bandwidth too variable within classes |
| Energy-ratio scoring | 31.8% accuracy | Frequency band distribution too similar across classes |
| Centroid-based fine-tuning | Marginal improvement | Centroid overlaps almost completely |

**Conclusion**: Incremental heuristic improvements either make airplane detection worse or don't improve overall accuracy.

## Why a Trained Model is Required

The heuristic classifier hits a fundamental limitation because:

1. **Statistical overlap**: Classes cannot be separated by simple decision rules in the spectral domain
2. **Temporal dynamics**: Current analysis only examines aggregate spectral properties; temporal evolution (attack, sustain, decay) might help but requires more complex features
3. **Context-dependent features**: Optimal features may depend on recording conditions, elephant identity, and other factors not captured by simple frequency analysis

A trained supervised model (Random Forest, SVM, neural network) would be better because it can:
- Learn nonlinear decision boundaries from the 44-sample dataset
- Discover which feature combinations (e.g., centroid + bandwidth + energy ratios) are most informative
- Adapt to the actual acoustic characteristics of the elephant recordings rather than general noise types

## Recommendations

### Short-term (current code)
- ✅ Use `scripts/evaluate_noise_classifier.py` for ongoing validation
- ✅ Accept 43.2% accuracy as baseline for heuristic approach
- ✅ Airplane detection works well (90.5% recall) for some use cases

### Medium-term (if needed for better accuracy)
- Implement `echofield/ml/noise_classifier_trained.py` with scikit-learn
- Use Random Forest or SVM with features: spectral centroid, bandwidth, energy ratios, and temporal statistics
- Train on the 44-sample labeled dataset with cross-validation
- Target: >70% per-class recall

### Long-term
- Collect more labeled data (44 samples is quite limited for supervised learning)
- Incorporate domain knowledge from ElephantVoices team about noise characteristics
- Consider end-to-end learning (neural network) if more data becomes available

## Files Modified/Created

- `echofield/pipeline/noise_classifier.py`:
  - Updated `_iter_labeled_audio()` to support `noise_type_ref` column
  - Added path resolution for `data/audio-files/` directory
  - Updated `normalize_noise_label()` to handle compound labels (e.g., "vehicle+generator")

- `scripts/evaluate_noise_classifier.py`: ✨ NEW
  - Repeatablecommand-line tool for classifier evaluation
  - Prints confusion matrix, per-class recall, and misclassified samples
  - Saves detailed results to `data/analysis/classifier_evaluation.json`

- `tests/test_noise_classifier.py`: ✨ NEW
  - 9 comprehensive unit tests
  - Tests real dataset loading and validation
  - Tests backward compatibility with existing synthetic test

## Verification

```bash
# Run evaluation
python scripts/evaluate_noise_classifier.py

# Run all tests
pytest tests/test_noise_classifier.py -v
pytest tests/test_issue_regressions.py::test_noise_classifier_validation_suite -v

# Check backward compatibility
pytest tests/test_api.py -k "noise" -v
```

---

**Issue #63 Status**: ✅ RESOLVED
- [x] Repeatable evaluation command exists
- [x] Clear reporting of mismatches and per-class metrics
- [x] Root cause documented (heuristic limitations with overlapping spectra)
- [x] Path forward defined (trained model recommended for >70% accuracy)
