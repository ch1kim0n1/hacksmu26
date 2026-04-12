"""Speaker separation for overlapping elephant vocalizations.

Uses harmonic-series decomposition to separate multiple simultaneous callers.
When two elephants rumble at the same time, they have different fundamental
frequencies, and their harmonics fall at different intervals. This module
detects candidate fundamentals and builds per-speaker harmonic masks.
"""

from __future__ import annotations

import numpy as np
import librosa
from scipy.signal import find_peaks
from typing import Any

from echofield.utils.logging_config import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Elephant fundamental frequency range (Hz).
_F0_MIN = 8.0
_F0_MAX = 50.0

# Upper frequency bound for the analysis band used to detect fundamentals.
_ANALYSIS_BAND_MAX = 100.0

# Minimum spacing between candidate fundamentals (Hz) so that two peaks are
# considered distinct speakers rather than harmonics of a single speaker.
_MIN_FUNDAMENTAL_SEPARATION_HZ = 5.0

# Minimum relative energy for a peak to count as a candidate fundamental.
# Expressed as a fraction of the strongest peak.
_PEAK_ENERGY_THRESHOLD = 0.15

# Default STFT parameters — chosen for good low-frequency resolution.
_DEFAULT_N_FFT = 4096
_DEFAULT_HOP_LENGTH = 1024


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def estimate_speaker_count(
    y: np.ndarray,
    sr: int,
    n_fft: int = _DEFAULT_N_FFT,
) -> dict[str, Any]:
    """Estimate how many speakers are present by detecting multiple fundamentals.

    Computes a magnitude spectrogram, averages across time to get a mean
    spectrum, restricts attention to the 8-100 Hz band where elephant
    fundamentals live, and uses peak-finding to identify candidate f0 values.

    Parameters
    ----------
    y : np.ndarray
        Audio time-series (mono, float32).
    sr : int
        Sample rate in Hz.
    n_fft : int
        FFT size.  Larger values give finer frequency resolution.

    Returns
    -------
    dict with:
        - ``speaker_count`` (int): number of detected speakers (>= 1).
        - ``fundamentals`` (list[float]): detected f0 values in Hz.
        - ``confidence`` (float): 0-1 indicating how clear the separation is.
    """
    # Edge case: very short or silent audio.
    if y.size < n_fft:
        logger.debug("Audio too short for speaker estimation (%d samples)", y.size)
        return {"speaker_count": 1, "fundamentals": [], "confidence": 0.0}

    # Magnitude spectrogram → mean spectrum.
    S = np.abs(librosa.stft(y, n_fft=n_fft))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    mean_spectrum = np.mean(S, axis=1)

    if np.max(mean_spectrum) == 0:
        return {"speaker_count": 1, "fundamentals": [], "confidence": 0.0}

    # Restrict to the analysis band.
    band_mask = (freqs >= _F0_MIN) & (freqs <= _ANALYSIS_BAND_MAX)
    band_freqs = freqs[band_mask]
    band_spectrum = mean_spectrum[band_mask]

    if len(band_spectrum) < 3:
        return {"speaker_count": 1, "fundamentals": [], "confidence": 0.0}

    # Peak detection.
    freq_resolution = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0
    min_peak_distance = max(int(_MIN_FUNDAMENTAL_SEPARATION_HZ / freq_resolution), 1)
    height_threshold = np.max(band_spectrum) * _PEAK_ENERGY_THRESHOLD

    peaks, properties = find_peaks(
        band_spectrum,
        height=height_threshold,
        distance=min_peak_distance,
    )

    if len(peaks) == 0:
        return {"speaker_count": 1, "fundamentals": [], "confidence": 0.0}

    # Sort peaks by descending energy.
    peak_heights = band_spectrum[peaks]
    order = np.argsort(peak_heights)[::-1]
    peaks = peaks[order]
    peak_heights = peak_heights[order]

    fundamentals = [round(float(band_freqs[p]), 2) for p in peaks]

    # Confidence: if there are 2+ peaks, the confidence in multi-speaker
    # detection is based on how strong the second peak is relative to the first.
    if len(fundamentals) == 1:
        confidence = min(float(peak_heights[0] / np.max(mean_spectrum)), 1.0)
        return {
            "speaker_count": 1,
            "fundamentals": fundamentals,
            "confidence": round(confidence, 3),
        }

    # Ratio of second-strongest to strongest peak.  A ratio close to 1.0
    # means the two fundamentals are equally prominent (high confidence).
    ratio = float(peak_heights[1] / peak_heights[0])
    confidence = round(min(ratio, 1.0), 3)

    return {
        "speaker_count": len(fundamentals),
        "fundamentals": fundamentals,
        "confidence": confidence,
    }


def build_harmonic_mask(
    fundamental_hz: float,
    freqs: np.ndarray,
    max_harmonic: int = 50,
    bandwidth_hz: float = 3.0,
) -> np.ndarray:
    """Build a frequency-domain mask for a harmonic series.

    For a fundamental at *f0* the mask has gaussian bumps centred on
    ``f0, 2*f0, 3*f0, ...`` up to *max_harmonic* multiples.

    Parameters
    ----------
    fundamental_hz : float
        Fundamental frequency in Hz.
    freqs : np.ndarray
        1-D array of frequency bin centres (Hz), e.g. from
        ``librosa.fft_frequencies``.
    max_harmonic : int
        Highest harmonic multiple to include.
    bandwidth_hz : float
        Standard-deviation (in Hz) of the gaussian window around each
        harmonic.  Controls how sharp or soft the mask transitions are.

    Returns
    -------
    np.ndarray
        1-D float mask, same length as *freqs*, values in [0, 1].
    """
    mask = np.zeros(len(freqs), dtype=np.float64)

    if fundamental_hz <= 0 or bandwidth_hz <= 0:
        return mask.astype(np.float32)

    nyquist = float(freqs[-1]) if len(freqs) > 0 else 0.0

    for h in range(1, max_harmonic + 1):
        centre = fundamental_hz * h
        if centre > nyquist:
            break
        # Gaussian weighting: exp(-0.5 * ((f - centre) / sigma)^2)
        mask += np.exp(-0.5 * ((freqs - centre) / bandwidth_hz) ** 2)

    # Clip to [0, 1].
    peak = np.max(mask)
    if peak > 0:
        mask /= peak

    return mask.astype(np.float32)


def separate_speakers(
    y: np.ndarray,
    sr: int,
    n_fft: int = _DEFAULT_N_FFT,
    hop_length: int = _DEFAULT_HOP_LENGTH,
) -> dict[str, Any]:
    """Separate overlapping elephant voices using harmonic masking.

    Processing steps:

    1. Compute the STFT of the input signal.
    2. Estimate the number of speakers and their fundamental frequencies.
    3. For each speaker, build a harmonic mask from their fundamental.
    4. Apply Wiener-like soft masking: each speaker receives energy
       proportional to their mask relative to the sum of all masks.
    5. Inverse-STFT to reconstruct per-speaker time-domain signals.

    When only a single speaker is detected the original audio is returned
    as-is (no masking artefacts introduced).

    Parameters
    ----------
    y : np.ndarray
        Mono audio time-series (float32).
    sr : int
        Sample rate in Hz.
    n_fft : int
        FFT size for the STFT.
    hop_length : int
        Hop length for the STFT.

    Returns
    -------
    dict with:
        - ``speaker_count`` (int)
        - ``speakers`` (list[dict]): per-speaker records, each containing
          ``id``, ``fundamental_hz``, ``harmonic_count``, ``audio``
          (np.ndarray), and ``energy_ratio`` (float).
        - ``original_length`` (int): sample count of the input signal.
    """
    original_length = len(y)

    # Edge case: very short audio — return as single speaker.
    if y.size < n_fft:
        logger.debug("Audio too short for separation (%d samples)", y.size)
        return _single_speaker_result(y, original_length)

    # 1. Estimate speakers.
    estimation = estimate_speaker_count(y, sr, n_fft=n_fft)
    speaker_count = estimation["speaker_count"]
    fundamentals = estimation["fundamentals"]

    if speaker_count <= 1 or len(fundamentals) < 2:
        f0 = fundamentals[0] if fundamentals else 0.0
        return _single_speaker_result(y, original_length, fundamental_hz=f0)

    # 2. Compute STFT.
    stft = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
    magnitude = np.abs(stft)
    phase = np.angle(stft)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    # 3. Build per-speaker harmonic masks (each is 1-D over frequency bins).
    masks_1d = []
    for f0 in fundamentals:
        mask = build_harmonic_mask(f0, freqs)
        masks_1d.append(mask)

    # Expand masks to 2-D (frequency x time) for element-wise multiplication.
    n_time = magnitude.shape[1]
    masks_2d = [m[:, np.newaxis] * np.ones((1, n_time), dtype=np.float32) for m in masks_1d]

    # 4. Wiener-like soft masking.
    mask_sum = np.sum(masks_2d, axis=0)
    # Avoid division by zero in frequency bins where no mask has energy.
    mask_sum = np.maximum(mask_sum, 1e-10)

    total_energy = float(np.sum(magnitude ** 2))

    speakers: list[dict[str, Any]] = []
    for idx, (f0, mask_2d) in enumerate(zip(fundamentals, masks_2d)):
        wiener_mask = mask_2d / mask_sum
        speaker_mag = magnitude * wiener_mask
        speaker_stft = speaker_mag * np.exp(1j * phase)

        audio = librosa.istft(speaker_stft, hop_length=hop_length, length=original_length)
        audio = audio.astype(np.float32)

        speaker_energy = float(np.sum(speaker_mag ** 2))
        energy_ratio = speaker_energy / total_energy if total_energy > 0 else 0.0

        # Count harmonics that actually fall within the Nyquist frequency.
        nyquist = sr / 2.0
        harmonic_count = int(nyquist // f0) if f0 > 0 else 0

        speakers.append({
            "id": f"speaker_{idx + 1}",
            "fundamental_hz": round(f0, 2),
            "harmonic_count": harmonic_count,
            "audio": audio,
            "energy_ratio": round(energy_ratio, 4),
        })

    logger.info(
        "Separated %d speakers: %s",
        len(speakers),
        ", ".join(f"{s['fundamental_hz']} Hz" for s in speakers),
    )

    return {
        "speaker_count": len(speakers),
        "speakers": speakers,
        "original_length": original_length,
    }


def get_speaker_metadata(speaker: dict[str, Any], sr: int) -> dict[str, Any]:
    """Extract serialisable metadata for a separated speaker.

    Returns a dictionary suitable for JSON API responses — the heavy
    ``audio`` array is omitted, and a ``duration_s`` field is added.

    Parameters
    ----------
    speaker : dict
        A single entry from the ``speakers`` list returned by
        :func:`separate_speakers`.
    sr : int
        Sample rate used during separation.

    Returns
    -------
    dict with ``id``, ``fundamental_hz``, ``harmonic_count``,
    ``energy_ratio``, and ``duration_s``.
    """
    audio = speaker.get("audio")
    duration_s = float(len(audio)) / sr if audio is not None and sr > 0 else 0.0

    return {
        "id": speaker.get("id", "unknown"),
        "fundamental_hz": speaker.get("fundamental_hz", 0.0),
        "harmonic_count": speaker.get("harmonic_count", 0),
        "energy_ratio": speaker.get("energy_ratio", 0.0),
        "duration_s": round(duration_s, 3),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _single_speaker_result(
    y: np.ndarray,
    original_length: int,
    fundamental_hz: float = 0.0,
) -> dict[str, Any]:
    """Build a result dict when only one speaker is detected."""
    return {
        "speaker_count": 1,
        "speakers": [
            {
                "id": "speaker_1",
                "fundamental_hz": round(fundamental_hz, 2),
                "harmonic_count": 0,
                "audio": y,
                "energy_ratio": 1.0,
            },
        ],
        "original_length": original_length,
    }
