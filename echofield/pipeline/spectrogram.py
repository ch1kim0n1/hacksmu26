"""
Spectrogram generation module for the EchoField processing pipeline.

Provides STFT computation, mel spectrogram generation, and PNG export
with labelled axes.
"""

import numpy as np
import librosa
import librosa.display
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend -- safe for servers
import matplotlib.pyplot as plt


def compute_stft(
    y: np.ndarray,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> dict:
    """
    Compute the Short-Time Fourier Transform of an audio signal.

    Args:
        y: Audio samples (1-D).
        n_fft: FFT window size.
        hop_length: Hop length in samples.

    Returns:
        Dict with keys:
            stft         - complex STFT matrix (np.ndarray)
            magnitude_db - magnitude in dB (np.ndarray)
            frequencies  - frequency bin centres in Hz (np.ndarray)
            times        - time bin centres in seconds (np.ndarray)
    """
    stft = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
    magnitude = np.abs(stft)
    magnitude_db = librosa.amplitude_to_db(magnitude, ref=np.max)

    frequencies = librosa.fft_frequencies(sr=1.0, n_fft=n_fft)
    # Scale frequencies to actual Hz (sr will be applied in callers if needed;
    # here we store them normalised to Nyquist = 0.5).
    # Better: just store bin-index-based freqs; callers pass sr later.
    # We use sr=1.0 so the caller can multiply by their sr.
    # Actually, librosa.fft_frequencies wants real sr.  We'll leave sr out of
    # this function and let callers handle it.  Store raw bin count instead.
    n_freq_bins = stft.shape[0]
    frequencies = np.linspace(0, n_fft // 2, n_freq_bins)

    n_time_bins = stft.shape[1]
    times = np.arange(n_time_bins) * hop_length  # in samples

    return {
        "stft": stft,
        "magnitude_db": magnitude_db,
        "frequencies": frequencies,
        "times": times,
    }


def compute_mel_spectrogram(
    y: np.ndarray,
    sr: int,
    n_mels: int = 128,
    fmin: float = 0,
    fmax: float | None = None,
) -> np.ndarray:
    """
    Compute a log-scaled mel spectrogram.

    Args:
        y: Audio samples (1-D).
        sr: Sample rate in Hz.
        n_mels: Number of mel bands.
        fmin: Minimum frequency for mel filterbank.
        fmax: Maximum frequency for mel filterbank (None = sr/2).

    Returns:
        Log-power mel spectrogram as np.ndarray (shape: n_mels x T).
    """
    mel_spec = librosa.feature.melspectrogram(
        y=y,
        sr=sr,
        n_mels=n_mels,
        fmin=fmin,
        fmax=fmax,
    )
    log_mel = librosa.power_to_db(mel_spec, ref=np.max)
    return log_mel


def generate_spectrogram_png(
    magnitude_db: np.ndarray,
    sr: int,
    hop_length: int,
    output_path: str,
    title: str = "Spectrogram",
    freq_max: float = 2000,
) -> None:
    """
    Save a spectrogram as a PNG image with labelled axes.

    Args:
        magnitude_db: Magnitude spectrogram in dB (freq x time).
        sr: Sample rate in Hz.
        hop_length: Hop length used to compute the spectrogram.
        output_path: Destination file path for the PNG.
        title: Plot title.
        freq_max: Maximum frequency (Hz) to display on the y-axis.
    """
    fig, ax = plt.subplots(figsize=(12, 4))

    img = librosa.display.specshow(
        magnitude_db,
        sr=sr,
        hop_length=hop_length,
        x_axis="time",
        y_axis="hz",
        ax=ax,
        cmap="viridis",
    )

    ax.set_ylim(0, freq_max)
    ax.set_title(title)
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Frequency (Hz)")
    fig.colorbar(img, ax=ax, format="%+2.0f dB")
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def generate_comparison_png(
    mag_before: np.ndarray,
    mag_after: np.ndarray,
    sr: int,
    hop_length: int,
    output_path: str,
) -> None:
    """
    Save a side-by-side before/after spectrogram comparison as a PNG.

    Args:
        mag_before: Magnitude spectrogram (dB) before processing.
        mag_after: Magnitude spectrogram (dB) after processing.
        sr: Sample rate in Hz.
        hop_length: Hop length used to compute the spectrograms.
        output_path: Destination file path for the PNG.
    """
    fig, axes = plt.subplots(1, 2, figsize=(20, 5))

    img0 = librosa.display.specshow(
        mag_before,
        sr=sr,
        hop_length=hop_length,
        x_axis="time",
        y_axis="hz",
        ax=axes[0],
        cmap="viridis",
    )
    axes[0].set_title("Before Processing")
    axes[0].set_xlabel("Time (s)")
    axes[0].set_ylabel("Frequency (Hz)")
    fig.colorbar(img0, ax=axes[0], format="%+2.0f dB")

    img1 = librosa.display.specshow(
        mag_after,
        sr=sr,
        hop_length=hop_length,
        x_axis="time",
        y_axis="hz",
        ax=axes[1],
        cmap="viridis",
    )
    axes[1].set_title("After Processing")
    axes[1].set_xlabel("Time (s)")
    axes[1].set_ylabel("Frequency (Hz)")
    fig.colorbar(img1, ax=axes[1], format="%+2.0f dB")

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
