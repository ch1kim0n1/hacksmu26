"""Extended acoustic feature extraction for elephant call analysis.

Adds temporal envelope descriptors, spectral shape metrics, and inter-call
context features on top of the base 12-feature set from feature_extract.py.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import librosa
from scipy.signal import detrend

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_finite(value: float, default: float = 0.0) -> float:
    """Return *value* if finite, otherwise *default*."""
    if value is None or not math.isfinite(float(value)):
        return default
    return float(value)


# ---------------------------------------------------------------------------
# Private computation helpers
# ---------------------------------------------------------------------------

def _temporal_envelope(y: np.ndarray, sr: int) -> dict[str, float]:
    """Compute attack/sustain/release envelope descriptors plus AM depth.

    Uses librosa.feature.rms on 512-sample frames with 256-sample hop.

    Returns
    -------
    dict with keys:
        attack_time_s, sustain_ratio, release_time_s, amplitude_modulation_depth
    """
    defaults = {
        "attack_time_s": 0.0,
        "sustain_ratio": 0.0,
        "release_time_s": 0.0,
        "amplitude_modulation_depth": 0.0,
    }
    if y.size == 0:
        return defaults

    hop_length = 256
    frame_length = 512

    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    if rms.size == 0:
        return defaults

    rms_safe = np.nan_to_num(rms, nan=0.0)
    peak_val = float(rms_safe.max())
    if peak_val == 0.0:
        return defaults

    peak_idx = int(np.argmax(rms_safe))
    n_frames = len(rms_safe)
    hop_s = hop_length / sr

    # Attack: time from frame 0 to peak frame
    attack_time_s = _safe_finite(peak_idx * hop_s)

    # Sustain: fraction of frames within 70 % of peak
    threshold = 0.70 * peak_val
    sustain_mask = rms_safe >= threshold
    sustain_ratio = _safe_finite(float(sustain_mask.sum()) / n_frames)

    # Release: time from last sustain frame to end
    sustain_indices = np.where(sustain_mask)[0]
    if sustain_indices.size > 0:
        last_sustain = int(sustain_indices[-1])
        release_frames = n_frames - 1 - last_sustain
        release_time_s = _safe_finite(release_frames * hop_s)
    else:
        release_time_s = 0.0

    # AM depth: (peak - trough) / peak  — trough is the global minimum
    trough_val = float(rms_safe.min())
    am_depth = _safe_finite((peak_val - trough_val) / peak_val)

    return {
        "attack_time_s": attack_time_s,
        "sustain_ratio": sustain_ratio,
        "release_time_s": release_time_s,
        "amplitude_modulation_depth": am_depth,
    }


def _frequency_modulation_rate(y: np.ndarray, sr: int) -> float:
    """Estimate FM vibrato rate (Hz) by counting zero-crossings of the
    detrended pitch contour from librosa.yin.

    Returns frequency_modulation_rate_hz.
    """
    if y.size < 2048:
        return 0.0

    hop_length = 256
    fmin = float(librosa.note_to_hz("C1"))
    fmax = float(librosa.note_to_hz("C8"))

    try:
        f0 = librosa.yin(y, fmin=fmin, fmax=fmax, hop_length=hop_length, sr=sr)
    except Exception:
        return 0.0

    # Replace unvoiced frames (0 Hz) with NaN, then interpolate
    f0 = f0.astype(np.float64)
    voiced = f0 > 0.0
    if voiced.sum() < 4:
        return 0.0

    # Simple linear interpolation across unvoiced gaps
    x = np.arange(len(f0))
    f0_interp = np.interp(x, x[voiced], f0[voiced])

    detrended = detrend(f0_interp)
    # Count zero-crossings per second of the detrended pitch
    zc = int(np.sum(np.diff(np.sign(detrended)) != 0))
    duration_s = len(y) / sr
    rate_hz = _safe_finite(zc / (2.0 * duration_s) if duration_s > 0 else 0.0)
    return rate_hz


def _spectral_shape(y: np.ndarray, sr: int, f0: float = 0.0) -> dict[str, float]:
    """Compute spectral shape descriptors.

    Returns
    -------
    dict with keys:
        spectral_skewness, spectral_kurtosis, spectral_flatness,
        spectral_flux_mean, sub_harmonic_ratio, below_20hz_energy_ratio
    """
    defaults = {
        "spectral_skewness": 0.0,
        "spectral_kurtosis": 0.0,
        "spectral_flatness": 0.0,
        "spectral_flux_mean": 0.0,
        "sub_harmonic_ratio": 0.0,
        "below_20hz_energy_ratio": 0.0,
    }
    if y.size == 0:
        return defaults

    n_fft = 2048
    hop_length = 512

    # Magnitude spectrogram
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length))  # (1 + n_fft//2, T)
    if S.size == 0 or S.shape[1] == 0:
        return defaults

    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)  # (1 + n_fft//2,)

    # Mean power spectrum (averaged across time)
    power_spectrum = np.mean(S ** 2, axis=1)  # (F,)
    total_power = float(power_spectrum.sum())

    if total_power == 0.0:
        return defaults

    # Normalised probability distribution over frequencies
    prob = power_spectrum / total_power

    # Weighted mean and variance of the frequency distribution
    mean_freq = float(np.dot(prob, freqs))
    variance_freq = float(np.dot(prob, (freqs - mean_freq) ** 2))
    std_freq = math.sqrt(variance_freq) if variance_freq > 0 else 0.0

    # Skewness and kurtosis of the spectral distribution
    if std_freq > 0:
        spectral_skewness = _safe_finite(
            float(np.dot(prob, ((freqs - mean_freq) / std_freq) ** 3))
        )
        spectral_kurtosis = _safe_finite(
            float(np.dot(prob, ((freqs - mean_freq) / std_freq) ** 4))
        )
    else:
        spectral_skewness = 0.0
        spectral_kurtosis = 0.0

    # Spectral flatness: mean of per-frame flatness
    flatness = librosa.feature.spectral_flatness(y=y, n_fft=n_fft, hop_length=hop_length)
    spectral_flatness = _safe_finite(float(np.mean(flatness)))

    # Spectral flux: mean L2 norm of frame-to-frame spectral magnitude difference / n_bins
    n_bins = S.shape[0]
    if S.shape[1] > 1:
        diff = np.diff(S, axis=1)  # (F, T-1)
        flux_per_frame = np.sqrt(np.sum(diff ** 2, axis=0)) / n_bins
        spectral_flux_mean = _safe_finite(float(np.mean(flux_per_frame)))
    else:
        spectral_flux_mean = 0.0

    # Sub-harmonic ratio: energy in bins below F0 / total energy
    if f0 > 0.0:
        sub_mask = freqs < f0
        sub_power = float(power_spectrum[sub_mask].sum())
        sub_harmonic_ratio = _safe_finite(sub_power / total_power)
    else:
        sub_harmonic_ratio = 0.0

    # Energy ratio below 20 Hz
    below_20_mask = freqs < 20.0
    below_20_power = float(power_spectrum[below_20_mask].sum())
    below_20hz_energy_ratio = _safe_finite(below_20_power / total_power)

    return {
        "spectral_skewness": spectral_skewness,
        "spectral_kurtosis": spectral_kurtosis,
        "spectral_flatness": spectral_flatness,
        "spectral_flux_mean": spectral_flux_mean,
        "sub_harmonic_ratio": sub_harmonic_ratio,
        "below_20hz_energy_ratio": below_20hz_energy_ratio,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_extended_features(
    y: np.ndarray, sr: int, base_features: dict[str, Any]
) -> dict[str, Any]:
    """Compute extended acoustic features and merge with *base_features*.

    Parameters
    ----------
    y:
        Raw audio samples (float32 or float64).
    sr:
        Sample rate in Hz.
    base_features:
        Pre-existing features (e.g. from feature_extract.py). These are
        preserved unchanged in the returned dict.

    Returns
    -------
    dict containing all keys from *base_features* plus:
        attack_time_s, sustain_ratio, release_time_s,
        amplitude_modulation_depth, frequency_modulation_rate_hz,
        spectral_skewness, spectral_kurtosis, spectral_flatness,
        spectral_flux_mean, sub_harmonic_ratio, below_20hz_energy_ratio
    """
    result: dict[str, Any] = dict(base_features)

    if y.size == 0:
        # Return all-zero extended features for empty audio
        result.update(
            {
                "attack_time_s": 0.0,
                "sustain_ratio": 0.0,
                "release_time_s": 0.0,
                "amplitude_modulation_depth": 0.0,
                "frequency_modulation_rate_hz": 0.0,
                "spectral_skewness": 0.0,
                "spectral_kurtosis": 0.0,
                "spectral_flatness": 0.0,
                "spectral_flux_mean": 0.0,
                "sub_harmonic_ratio": 0.0,
                "below_20hz_energy_ratio": 0.0,
            }
        )
        return result

    # Temporal envelope
    envelope_feats = _temporal_envelope(y, sr)
    result.update(envelope_feats)

    # Frequency modulation
    result["frequency_modulation_rate_hz"] = _frequency_modulation_rate(y, sr)

    # Spectral shape (pass F0 if available for sub-harmonic ratio)
    f0 = float(base_features.get("fundamental_frequency_hz", 0.0) or 0.0)
    spectral_feats = _spectral_shape(y, sr, f0=f0)
    result.update(spectral_feats)

    return result


def compute_inter_call_features(calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Add inter-call interval (ICI) and sequence context to each call dict.

    Modifies each call's ``acoustic_features`` sub-dict in-place and returns
    the modified list (a new list of the same dicts with updated features).

    ICI is defined as the gap between the end of one call and the start of the
    next:
        ici = start_next - (start_current + duration_current)

    Parameters
    ----------
    calls:
        List of call dicts, each containing at minimum:
        ``{"id": str, "start_ms": float, "duration_ms": float,
           "acoustic_features": dict}``
        Calls are assumed to be sorted by ``start_ms``.

    Returns
    -------
    The same list with updated ``acoustic_features`` dicts.
    """
    n = len(calls)
    sequence_length = n

    for i, call in enumerate(calls):
        af = call["acoustic_features"]

        start_ms = float(call["start_ms"])
        duration_ms = float(call["duration_ms"])
        end_ms = start_ms + duration_ms

        # ICI before: gap from end of previous call to start of this call
        if i == 0:
            ici_before_ms = None
        else:
            prev = calls[i - 1]
            prev_end_ms = float(prev["start_ms"]) + float(prev["duration_ms"])
            ici_before_ms = _safe_finite(start_ms - prev_end_ms)

        # ICI after: gap from end of this call to start of next call
        if i == n - 1:
            ici_after_ms = None
        else:
            nxt = calls[i + 1]
            nxt_start_ms = float(nxt["start_ms"])
            ici_after_ms = _safe_finite(nxt_start_ms - end_ms)

        # Sequence position ratio: 0.0 for first, 1.0 for last
        if n <= 1:
            sequence_position_ratio = 0.0
        else:
            sequence_position_ratio = float(i) / float(n - 1)

        af["ici_before_ms"] = ici_before_ms
        af["ici_after_ms"] = ici_after_ms
        af["sequence_length"] = sequence_length
        af["sequence_position_ratio"] = sequence_position_ratio

    return calls
