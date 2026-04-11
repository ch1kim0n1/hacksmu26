"""Spectrogram generation for EchoField."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import librosa
import librosa.display
import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt


@dataclass
class Spectrogram:
    recording_id: str
    stft: np.ndarray
    magnitude_db: np.ndarray
    mel_spectrogram: np.ndarray
    frequencies_hz: np.ndarray
    times_s: np.ndarray
    npy_path: str


@dataclass
class SpectrogramViz:
    recording_id: str
    url: str
    width: int
    height: int
    freq_max_hz: float


def pre_emphasis(y: np.ndarray, coefficient: float = 0.97) -> np.ndarray:
    if y.size == 0:
        return y.astype(np.float32)
    emphasized = np.empty_like(y, dtype=np.float32)
    emphasized[0] = y[0]
    emphasized[1:] = y[1:] - coefficient * y[:-1]
    return emphasized


def normalize_per_segment(spec: np.ndarray) -> np.ndarray:
    mean = float(np.mean(spec))
    std = float(np.std(spec))
    if std < 1e-8:
        return np.zeros_like(spec, dtype=np.float32)
    return ((spec - mean) / std).astype(np.float32)


def compute_stft(
    y: np.ndarray,
    sr: int,
    n_fft: int = 2048,
    hop_length: int = 512,
    window: str = "hann",
) -> dict[str, np.ndarray]:
    emphasized = pre_emphasis(y)
    stft = librosa.stft(emphasized, n_fft=n_fft, hop_length=hop_length, window=window)
    magnitude = np.abs(stft)
    magnitude_db = librosa.amplitude_to_db(magnitude, ref=np.max)
    frequencies = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    times = librosa.frames_to_time(np.arange(stft.shape[1]), sr=sr, hop_length=hop_length)
    return {
        "stft": stft,
        "magnitude_db": magnitude_db.astype(np.float32),
        "frequencies": frequencies.astype(np.float32),
        "times": times.astype(np.float32),
    }


def compute_mel_spectrogram(
    y: np.ndarray,
    sr: int,
    n_fft: int = 2048,
    hop_length: int = 512,
    n_mels: int = 128,
    fmin: float = 0.0,
    fmax: float | None = None,
) -> np.ndarray:
    mel_spec = librosa.feature.melspectrogram(
        y=pre_emphasis(y),
        sr=sr,
        n_fft=n_fft,
        hop_length=hop_length,
        n_mels=n_mels,
        fmin=fmin,
        fmax=fmax,
    )
    mel_db = librosa.power_to_db(mel_spec, ref=np.max)
    return normalize_per_segment(mel_db)


def generate_spectrogram_png(
    magnitude_db: np.ndarray,
    sr: int,
    hop_length: int,
    output_path: str | Path,
    *,
    title: str = "Spectrogram",
    freq_max: float = 1000.0,
    size: tuple[int, int] = (256, 256),
) -> str:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    dpi = 128
    fig, ax = plt.subplots(figsize=(size[0] / dpi, size[1] / dpi), dpi=dpi)
    librosa.display.specshow(
        magnitude_db,
        sr=sr,
        hop_length=hop_length,
        x_axis="time",
        y_axis="hz",
        cmap="viridis",
        ax=ax,
    )
    ax.set_ylim(0, freq_max)
    ax.set_title(title)
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Frequency (Hz)")
    fig.tight_layout(pad=0.2)
    fig.savefig(output, dpi=dpi)
    plt.close(fig)
    return str(output)


def generate_comparison_png(
    mag_before: np.ndarray,
    mag_after: np.ndarray,
    sr: int,
    hop_length: int,
    output_path: str | Path,
    *,
    freq_max: float = 1000.0,
) -> str:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(1, 2, figsize=(10, 4), dpi=150)
    for axis, data, title in (
        (axes[0], mag_before, "Before"),
        (axes[1], mag_after, "After"),
    ):
        librosa.display.specshow(
            data,
            sr=sr,
            hop_length=hop_length,
            x_axis="time",
            y_axis="hz",
            cmap="viridis",
            ax=axis,
        )
        axis.set_ylim(0, freq_max)
        axis.set_title(title)
    fig.tight_layout()
    fig.savefig(output)
    plt.close(fig)
    return str(output)


def build_spectrogram_artifacts(
    recording_id: str,
    y: np.ndarray,
    sr: int,
    output_dir: str | Path,
    *,
    n_fft: int = 2048,
    hop_length: int = 512,
    n_mels: int = 128,
    freq_max: float = 1000.0,
    progress_callback: Callable[[str, int], None] | None = None,
) -> tuple[Spectrogram, SpectrogramViz]:
    output_root = Path(output_dir)
    output_root.mkdir(parents=True, exist_ok=True)
    npy_path = output_root / f"{recording_id}_spectrogram.npy"
    png_path = output_root / f"{recording_id}_spectrogram.png"

    if progress_callback:
        progress_callback("SPECTROGRAM_PROGRESS", 50)

    if npy_path.exists() and png_path.exists():
        cached = np.load(npy_path, allow_pickle=True).item()
        spectrogram = Spectrogram(
            recording_id=recording_id,
            stft=cached["stft"],
            magnitude_db=cached["magnitude_db"],
            mel_spectrogram=cached["mel_spectrogram"],
            frequencies_hz=cached["frequencies_hz"],
            times_s=cached["times_s"],
            npy_path=str(npy_path),
        )
        viz = SpectrogramViz(
            recording_id=recording_id,
            url=str(png_path),
            width=256,
            height=256,
            freq_max_hz=freq_max,
        )
        if progress_callback:
            progress_callback("SPECTROGRAM_READY", 100)
        return spectrogram, viz

    stft_data = compute_stft(y, sr, n_fft=n_fft, hop_length=hop_length)
    mel = compute_mel_spectrogram(
        y,
        sr,
        n_fft=n_fft,
        hop_length=hop_length,
        n_mels=n_mels,
        fmax=float(sr // 2),
    )

    np.save(
        npy_path,
        {
            "stft": stft_data["stft"],
            "magnitude_db": stft_data["magnitude_db"],
            "mel_spectrogram": mel,
            "frequencies_hz": stft_data["frequencies"],
            "times_s": stft_data["times"],
        },
        allow_pickle=True,
    )
    generate_spectrogram_png(
        stft_data["magnitude_db"],
        sr,
        hop_length,
        png_path,
        title="Spectrogram",
        freq_max=freq_max,
    )

    spectrogram = Spectrogram(
        recording_id=recording_id,
        stft=stft_data["stft"],
        magnitude_db=stft_data["magnitude_db"],
        mel_spectrogram=mel,
        frequencies_hz=stft_data["frequencies"],
        times_s=stft_data["times"],
        npy_path=str(npy_path),
    )
    viz = SpectrogramViz(
        recording_id=recording_id,
        url=str(png_path),
        width=256,
        height=256,
        freq_max_hz=freq_max,
    )
    if progress_callback:
        progress_callback("SPECTROGRAM_READY", 100)
    return spectrogram, viz
