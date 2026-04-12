#!/usr/bin/env python3
"""Train external elephant classifier and replace legacy results with new predictions.

Workflow:
1. Train YAMNet from Audio-Classification-for-Elephant-Sounds dataset.
2. Save the trained model in the external repo using expected naming.
3. Run batch inference on data/recordings/original WAV files.
4. Replace the repo results/ directory with fresh classifier outputs.
"""

from __future__ import annotations

import argparse
import csv
import importlib
import json
import random
import shutil
import sys
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio
from torch import nn
from torch.utils.data import DataLoader, Dataset

REPO_ROOT = Path(__file__).resolve().parent.parent
EXTERNAL_ROOT = REPO_ROOT / "Audio-Classification-for-Elephant-Sounds"
DATA_ROOT = EXTERNAL_ROOT / "data"
INPUT_RECORDINGS = REPO_ROOT / "data" / "recordings" / "original"
RESULTS_ROOT = REPO_ROOT / "results"
OUT_ROOT = RESULTS_ROOT / "audio-classification"

TARGET_SR = 16_000
CLIP_SECONDS = 6
TARGET_SAMPLES = TARGET_SR * CLIP_SECONDS


def _now() -> float:
    return time.perf_counter()


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def _device(preferred: str = "auto") -> torch.device:
    if preferred == "cpu":
        return torch.device("cpu")
    if preferred == "mps":
        if not (torch.backends.mps.is_available() and torch.backends.mps.is_built()):
            raise RuntimeError("Requested device 'mps' is not available")
        return torch.device("mps")
    if preferred == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("Requested device 'cuda' is not available")
        return torch.device("cuda")

    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def _load_wave(path: Path, target_sr: int = TARGET_SR) -> torch.Tensor:
    data, sr = sf.read(str(path), always_2d=False)
    waveform_np = np.asarray(data, dtype=np.float32)
    if waveform_np.ndim == 2:
        waveform_np = waveform_np.mean(axis=1)
    waveform = torch.from_numpy(waveform_np.copy())
    if sr != target_sr:
        waveform = torchaudio.functional.resample(waveform, sr, target_sr)
    return waveform.to(torch.float32)


def _fix_length(waveform: torch.Tensor, target_samples: int = TARGET_SAMPLES) -> torch.Tensor:
    n = waveform.numel()
    if n == target_samples:
        return waveform
    if n > target_samples:
        start = (n - target_samples) // 2
        return waveform[start : start + target_samples]
    out = torch.zeros(target_samples, dtype=torch.float32)
    out[:n] = waveform
    return out


class TensorClipDataset(Dataset[tuple[torch.Tensor, int]]):
    def __init__(self, items: list[tuple[torch.Tensor, int]], augment: bool = False):
        self.items = items
        self.augment = augment

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        waveform, label = self.items[idx]
        if self.augment:
            waveform = _augment(waveform)
        return waveform, label


def _augment(waveform: torch.Tensor) -> torch.Tensor:
    """Apply random audio augmentations for training robustness."""
    # Time shift (up to 10% of duration)
    if random.random() < 0.5:
        shift = random.randint(-int(len(waveform) * 0.1), int(len(waveform) * 0.1))
        waveform = torch.roll(waveform, shift)

    # Add Gaussian noise (SNR 15-30 dB)
    if random.random() < 0.5:
        snr_db = random.uniform(15.0, 30.0)
        signal_power = float(torch.mean(waveform ** 2))
        noise_power = signal_power / (10 ** (snr_db / 10))
        noise = torch.randn_like(waveform) * (noise_power ** 0.5)
        waveform = waveform + noise

    # Gain variation (+/- 3 dB)
    if random.random() < 0.5:
        gain_db = random.uniform(-3.0, 3.0)
        waveform = waveform * (10 ** (gain_db / 20))

    return waveform


@dataclass
class SplitData:
    items: list[tuple[torch.Tensor, int]]
    count_by_class: dict[str, int]


def _load_split(split: str, class_to_idx: dict[str, int]) -> SplitData:
    split_dir = DATA_ROOT / split
    items: list[tuple[torch.Tensor, int]] = []
    counts: dict[str, int] = {name: 0 for name in class_to_idx}

    for class_name, label in class_to_idx.items():
        class_dir = split_dir / class_name
        wavs = sorted(class_dir.glob("*.wav"))
        counts[class_name] = len(wavs)
        for wav_path in wavs:
            wave = _fix_length(_load_wave(wav_path))
            items.append((wave, label))

    return SplitData(items=items, count_by_class=counts)


def _accuracy(model: nn.Module, loader: DataLoader, device: torch.device) -> tuple[float, float]:
    model.eval()
    total = 0
    correct = 0
    loss_sum = 0.0
    criterion = nn.CrossEntropyLoss()

    with torch.no_grad():
        for x, y in loader:
            x = x.to(device)
            y = y.to(device)
            logits = model(x)
            loss = criterion(logits, y)
            loss_sum += float(loss.item()) * y.size(0)
            pred = torch.argmax(logits, dim=1)
            correct += int((pred == y).sum().item())
            total += int(y.size(0))

    if total == 0:
        return 0.0, 0.0
    return correct / total, loss_sum / total


def _segment_waveform(waveform: torch.Tensor, target_samples: int = TARGET_SAMPLES) -> list[tuple[torch.Tensor, float, float]]:
    step = target_samples
    n = waveform.numel()
    if n <= target_samples:
        return [(_fix_length(waveform, target_samples), 0.0, float(n) / TARGET_SR)]

    segments: list[tuple[torch.Tensor, float, float]] = []
    start = 0
    while start + target_samples <= n:
        end = start + target_samples
        seg = waveform[start:end]
        segments.append((seg, start / TARGET_SR, end / TARGET_SR))
        start += step

    remainder = n - start
    # Keep tails longer than ~3 seconds.
    if remainder >= target_samples // 2:
        tail = _fix_length(waveform[start:])
        segments.append((tail, start / TARGET_SR, n / TARGET_SR))

    return segments


def run(args: argparse.Namespace) -> int:
    if not EXTERNAL_ROOT.exists():
        raise FileNotFoundError(f"Missing external repo: {EXTERNAL_ROOT}")
    if not INPUT_RECORDINGS.exists():
        raise FileNotFoundError(f"Missing recordings directory: {INPUT_RECORDINGS}")

    sys.path.insert(0, str(EXTERNAL_ROOT))
    models_mod = importlib.import_module("models")

    if not hasattr(models_mod, "init_weights_he"):
        def _init_weights_he(module: nn.Module) -> None:
            if isinstance(module, (nn.Conv1d, nn.Conv2d, nn.Linear)):
                nn.init.kaiming_normal_(module.weight, mode="fan_out", nonlinearity="relu")
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

        setattr(models_mod, "init_weights_he", _init_weights_he)

    YAMNet = getattr(models_mod, "YAMNet")

    _set_seed(args.seed)
    device = _device(args.device)
    print(f"[env] device={device}")

    classes = ["Roar", "Rumble", "Trumpet"]
    class_to_idx = {name: idx for idx, name in enumerate(classes)}

    t0 = _now()
    train_split = _load_split("train", class_to_idx)
    val_split = _load_split("validate", class_to_idx)
    test_split = _load_split("test", class_to_idx)
    print(
        f"[data] train={len(train_split.items)}, val={len(val_split.items)}, test={len(test_split.items)} "
        f"loaded in {_now() - t0:.1f}s"
    )

    train_loader = DataLoader(
        TensorClipDataset(train_split.items, augment=True),
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=0,
    )
    val_loader = DataLoader(
        TensorClipDataset(val_split.items),
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=0,
    )
    test_loader = DataLoader(
        TensorClipDataset(test_split.items),
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=0,
    )

    model = YAMNet(num_classes=len(classes), num_samples=TARGET_SAMPLES, kernel_size=3).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)

    best_state: dict[str, torch.Tensor] | None = None
    best_val_acc = -1.0
    patience_counter = 0
    patience = args.patience
    history: list[dict[str, float]] = []

    print(f"[train] epochs={args.epochs}, batch_size={args.batch_size}, lr={args.lr}, patience={patience}")
    for epoch in range(1, args.epochs + 1):
        model.train()
        total = 0
        correct = 0
        loss_sum = 0.0

        for x, y in train_loader:
            x = x.to(device)
            y = y.to(device)

            optimizer.zero_grad(set_to_none=True)
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            loss_sum += float(loss.item()) * y.size(0)
            total += int(y.size(0))
            correct += int((torch.argmax(logits, dim=1) == y).sum().item())

        scheduler.step()
        train_acc = correct / max(total, 1)
        train_loss = loss_sum / max(total, 1)
        val_acc, val_loss = _accuracy(model, val_loader, device)

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            patience_counter = 0
        else:
            patience_counter += 1

        current_lr = optimizer.param_groups[0]["lr"]
        history.append(
            {
                "epoch": float(epoch),
                "train_acc": float(train_acc),
                "train_loss": float(train_loss),
                "val_acc": float(val_acc),
                "val_loss": float(val_loss),
                "lr": float(current_lr),
            }
        )
        print(
            f"  epoch {epoch:02d}/{args.epochs} | "
            f"train_acc={train_acc:.3f} train_loss={train_loss:.4f} | "
            f"val_acc={val_acc:.3f} val_loss={val_loss:.4f} | "
            f"lr={current_lr:.2e}"
        )

        if patience_counter >= patience:
            print(f"  [early stop] no improvement for {patience} epochs, stopping at epoch {epoch}")
            break

    if best_state is None:
        raise RuntimeError("Training failed: no checkpoint captured")

    model.load_state_dict(best_state)
    test_acc, test_loss = _accuracy(model, test_loader, device)
    print(f"[eval] test_acc={test_acc:.3f} test_loss={test_loss:.4f}")

    # Save model in external repo with expected filename for their inference flow.
    model_cpu = model.to("cpu").eval()
    torch.save(model_cpu, EXTERNAL_ROOT / "YAMNETRawAudio_100.pt")
    torch.save(model_cpu.state_dict(), EXTERNAL_ROOT / "YAMNETRawAudio_100_state_dict.pth")
    model = model_cpu.to(device).eval()

    # Run batch inference on project recordings.
    segment_rows: list[dict[str, object]] = []
    recording_rows: list[dict[str, object]] = []

    with torch.no_grad():
        for wav_path in sorted(INPUT_RECORDINGS.glob("*.wav")):
            wave = _load_wave(wav_path)
            segments = _segment_waveform(wave)

            class_counter: Counter[str] = Counter()
            class_conf: dict[str, list[float]] = {c: [] for c in classes}

            for idx, (seg, start_sec, end_sec) in enumerate(segments, start=1):
                x = seg.unsqueeze(0).to(device)
                logits = model(x)
                probs = torch.softmax(logits, dim=1)[0].detach().cpu().numpy()

                pred_idx = int(np.argmax(probs))
                pred_class = classes[pred_idx]
                confidence = float(probs[pred_idx])

                class_counter[pred_class] += 1
                class_conf[pred_class].append(confidence)

                segment_rows.append(
                    {
                        "recording": wav_path.name,
                        "segment_index": idx,
                        "start_sec": round(float(start_sec), 3),
                        "end_sec": round(float(end_sec), 3),
                        "predicted_class": pred_class,
                        "confidence": round(confidence, 6),
                        "prob_roar": round(float(probs[class_to_idx["Roar"]]), 6),
                        "prob_rumble": round(float(probs[class_to_idx["Rumble"]]), 6),
                        "prob_trumpet": round(float(probs[class_to_idx["Trumpet"]]), 6),
                    }
                )

            if not segments:
                continue

            sorted_classes = sorted(
                classes,
                key=lambda cls: (class_counter[cls], np.mean(class_conf[cls]) if class_conf[cls] else 0.0),
                reverse=True,
            )
            top_class = sorted_classes[0]
            top_mean_conf = float(np.mean(class_conf[top_class])) if class_conf[top_class] else 0.0

            recording_rows.append(
                {
                    "recording": wav_path.name,
                    "predicted_class": top_class,
                    "mean_confidence": round(top_mean_conf, 6),
                    "num_segments": len(segments),
                    "roar_segments": class_counter["Roar"],
                    "rumble_segments": class_counter["Rumble"],
                    "trumpet_segments": class_counter["Trumpet"],
                }
            )

    # Replace old results tree with new outputs.
    if RESULTS_ROOT.exists():
        shutil.rmtree(RESULTS_ROOT)
    OUT_ROOT.mkdir(parents=True, exist_ok=True)

    recording_csv = OUT_ROOT / "recording_predictions.csv"
    segment_csv = OUT_ROOT / "segment_predictions.csv"
    summary_csv = RESULTS_ROOT / "summary.csv"

    if recording_rows:
        with recording_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(recording_rows[0].keys()))
            writer.writeheader()
            writer.writerows(recording_rows)

        with summary_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(recording_rows[0].keys()))
            writer.writeheader()
            writer.writerows(recording_rows)

    if segment_rows:
        with segment_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(segment_rows[0].keys()))
            writer.writeheader()
            writer.writerows(segment_rows)

    metrics = {
        "classes": classes,
        "train_distribution": train_split.count_by_class,
        "val_distribution": val_split.count_by_class,
        "test_distribution": test_split.count_by_class,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.lr,
        "best_val_acc": best_val_acc,
        "test_acc": test_acc,
        "test_loss": test_loss,
        "history": history,
        "recordings_scored": len(recording_rows),
        "segments_scored": len(segment_rows),
        "timestamp": int(time.time()),
    }

    (OUT_ROOT / "training_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (OUT_ROOT / "README.txt").write_text(
        "Generated by scripts/run_external_classifier_pipeline.py using "
        "Audio-Classification-for-Elephant-Sounds YAMNet model.\n",
        encoding="utf-8",
    )

    print(
        f"[done] replaced results at {RESULTS_ROOT}\n"
        f"       recordings={len(recording_rows)}, segments={len(segment_rows)}"
    )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train external classifier and replace old results")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=5e-4)
    parser.add_argument("--patience", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", choices=["auto", "cpu", "mps", "cuda"], default="auto")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run(parse_args()))