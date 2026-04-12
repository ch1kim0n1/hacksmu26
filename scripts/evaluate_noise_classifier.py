#!/usr/bin/env python
"""
Evaluate the noise classifier against the labeled dataset.

Runs the classifier on all 44 labeled elephant recordings in data/metadata.csv
and reports:
- Overall accuracy
- Per-class recall (sensitivity)
- Confusion matrix
- List of misclassified samples

Usage:
    python scripts/evaluate_noise_classifier.py
    python scripts/evaluate_noise_classifier.py [--verbose]
"""

import sys
import json
from pathlib import Path

# Add parent directory to path so we can import echofield
sys.path.insert(0, str(Path(__file__).parent.parent))

from echofield.pipeline.noise_classifier import validate_noise_classifier


def print_header(text):
    """Print a formatted header."""
    print(f"\n{'=' * 70}")
    print(f"  {text}")
    print(f"{'=' * 70}")


def print_confusion_matrix(confusion: dict[str, dict[str, int]]):
    """Pretty-print the confusion matrix."""
    # Get all unique labels
    labels = sorted(set(confusion.keys()) | {p for probs in confusion.values() for p in probs.keys()})

    # Print header
    print("\nConfusion Matrix:")
    print(f"{'True \\ Pred':<15}", end="")
    for label in labels:
        print(f"{label:<15}", end="")
    print()
    print("-" * (15 + len(labels) * 15))

    # Print rows
    for true_label in labels:
        print(f"{true_label:<15}", end="")
        for pred_label in labels:
            count = confusion.get(true_label, {}).get(pred_label, 0)
            print(f"{count:<15}", end="")
        print()


def print_per_class_metrics(confusion: dict[str, dict[str, int]], per_class_recall: dict[str, float]):
    """Print per-class metrics including precision and recall."""
    print("\nPer-Class Performance Metrics:")
    print("-" * 70)
    print(f"{'Class':<15} {'Recall':<12} {'Support':<12}")
    print("-" * 70)

    for label in sorted(per_class_recall.keys()):
        recall = per_class_recall[label]
        support = sum(confusion.get(label, {}).values())
        print(f"{label:<15} {recall:.1%}         {support:<12}")


def print_misclassified_samples(samples: list[dict], limit: int = 10):
    """Print misclassified samples."""
    misclassified = [s for s in samples if not s["correct"]]

    if not misclassified:
        print("\n✓ All samples classified correctly!")
        return

    print(f"\n{len(misclassified)} Misclassified Samples (showing first {min(limit, len(misclassified))}):")
    print("-" * 100)
    print(f"{'Filename':<40} {'True':<15} {'Predicted':<15} {'Confidence':<12}")
    print("-" * 100)

    for sample in misclassified[:limit]:
        filename = Path(sample["path"]).name
        print(
            f"{filename:<40} {sample['label']:<15} {sample['predicted']:<15} "
            f"{sample['confidence']:.3f}"
        )

    if len(misclassified) > limit:
        print(f"... and {len(misclassified) - limit} more")


def main():
    verbose = "--verbose" in sys.argv or "-v" in sys.argv

    print_header("NOISE CLASSIFIER EVALUATION")
    print(f"Dataset: data/metadata.csv")
    print(f"Audio Files: data/audio-files/")

    # Run validation
    print("\nValidating classifier against 44 labeled samples...")
    result = validate_noise_classifier("data/metadata.csv")

    # Print results
    print_header("OVERALL RESULTS")
    print(f"Total Samples:    {result['total']}")
    print(f"Correct:          {result['correct']}/{result['total']}")
    print(f"Overall Accuracy: {result['accuracy']:.1%}")

    print_per_class_metrics(result["confusion"], result["per_class_recall"])

    print_confusion_matrix(result["confusion"])

    print_misclassified_samples(result["samples"], limit=15)

    # Summary
    print_header("SUMMARY")
    if result["accuracy"] >= 0.70:
        print("✓ Classifier performs well (≥70% overall accuracy)")
    elif result["accuracy"] >= 0.50:
        print("⚠ Classifier needs improvement (50-70% accuracy)")
    else:
        print("✗ Classifier needs significant improvement (<50% accuracy)")

    max_recall = max(result["per_class_recall"].values())
    if max_recall >= 0.70:
        print("✓ At least one class achieves good per-class recall (≥70%)")
    else:
        print("⚠ All classes need better per-class recall")

    # Save detailed results
    output_file = Path("data/analysis/classifier_evaluation.json")
    output_file.parent.mkdir(exist_ok=True)
    with open(output_file, "w") as f:
        # Convert confusion dict values to be JSON serializable
        json_result = {
            "total": result["total"],
            "correct": result["correct"],
            "accuracy": result["accuracy"],
            "per_class_recall": result["per_class_recall"],
            "confusion": result["confusion"],
        }
        json.dump(json_result, f, indent=2)
    print(f"\nDetailed results saved to: {output_file}")

    return 0 if result["accuracy"] >= 0.70 else 1


if __name__ == "__main__":
    sys.exit(main())
