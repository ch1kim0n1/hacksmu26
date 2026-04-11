"""Heuristic noise classification using frequency-band energy analysis.

Classifies background noise in audio recordings by analyzing energy
distribution across frequency bands, harmonic structure, and temporal
stationarity. No pre-trained ML models are used.
"""

import numpy as np
import librosa


# Frequency band definitions: (name, low_hz, high_hz)
FREQUENCY_BANDS = [
    ("sub_bass", 8, 60),
    ("low", 60, 250),
    ("low_mid", 250, 500),
    ("mid", 500, 2000),
    ("high_mid", 2000, 6000),
    ("high", 6000, 20000),
]

# Noise type to primary frequency bands mapping
NOISE_PROFILES = {
    "aircraft": {
        "primary_bands": ["sub_bass", "low_mid"],
        "frequency_range": (8, 500),
        "description": "Aircraft engine noise",
    },
    "vehicle": {
        "primary_bands": ["sub_bass", "low"],
        "frequency_range": (20, 250),
        "description": "Vehicle traffic noise",
    },
    "generator": {
        "primary_bands": ["low"],
        "frequency_range": (50, 250),
        "description": "Generator or electrical hum",
    },
    "wind": {
        "primary_bands": ["mid"],
        "frequency_range": (200, 2000),
        "description": "Wind noise",
    },
    "rain": {
        "primary_bands": ["high_mid"],
        "frequency_range": (2000, 8000),
        "description": "Rain or water noise",
    },
    "biological": {
        "primary_bands": ["high"],
        "frequency_range": (4000, 20000),
        "description": "Biological noise (insects, birds)",
    },
}


def _compute_band_energies(S: np.ndarray, freqs: np.ndarray) -> dict[str, float]:
    """Compute energy in each frequency band from a magnitude spectrogram.

    Args:
        S: Magnitude spectrogram, shape (n_freq, n_frames).
        freqs: Frequency values for each spectrogram bin.

    Returns:
        Dictionary mapping band name to energy ratio (0-1).
    """
    total_energy = np.sum(S ** 2)
    if total_energy == 0:
        return {name: 0.0 for name, _, _ in FREQUENCY_BANDS}

    band_energies = {}
    for name, low, high in FREQUENCY_BANDS:
        mask = (freqs >= low) & (freqs < high)
        band_energy = np.sum(S[mask, :] ** 2) if np.any(mask) else 0.0
        band_energies[name] = float(band_energy / total_energy)

    return band_energies


def _check_harmonic_peaks(S: np.ndarray, freqs: np.ndarray,
                          base_freqs: tuple[float, ...] = (50.0, 60.0),
                          n_harmonics: int = 5,
                          peak_threshold: float = 2.0) -> dict:
    """Check for harmonic peaks at power-line frequencies and their multiples.

    Generator hum typically manifests as strong peaks at 50 Hz or 60 Hz
    (depending on region) and their harmonics.

    Args:
        S: Magnitude spectrogram.
        freqs: Frequency values per bin.
        base_freqs: Fundamental frequencies to check.
        n_harmonics: Number of harmonics to examine.
        peak_threshold: Ratio above median to consider a peak significant.

    Returns:
        Dict with 'is_harmonic', 'base_frequency', and 'strength'.
    """
    mean_spectrum = np.mean(S, axis=1)
    median_level = np.median(mean_spectrum)
    if median_level == 0:
        return {"is_harmonic": False, "base_frequency": None, "strength": 0.0}

    best_score = 0.0
    best_base = None

    for base in base_freqs:
        harmonic_score = 0.0
        for h in range(1, n_harmonics + 1):
            target_freq = base * h
            if target_freq > freqs[-1]:
                break
            idx = np.argmin(np.abs(freqs - target_freq))
            ratio = mean_spectrum[idx] / median_level
            if ratio > peak_threshold:
                harmonic_score += ratio
        if harmonic_score > best_score:
            best_score = harmonic_score
            best_base = base

    is_harmonic = best_score > peak_threshold * 2
    return {
        "is_harmonic": is_harmonic,
        "base_frequency": best_base if is_harmonic else None,
        "strength": float(min(best_score / (peak_threshold * n_harmonics), 1.0)),
    }


def _check_temporal_stationarity(S: np.ndarray, n_segments: int = 8) -> dict:
    """Assess temporal stationarity of the signal.

    Constant noise (generators, steady wind) has low variance across
    time segments. Variable noise (traffic, aircraft flyovers) has high
    variance.

    Args:
        S: Magnitude spectrogram.
        n_segments: Number of time segments to divide into.

    Returns:
        Dict with 'is_stationary' (bool) and 'variance_ratio' (float).
    """
    n_frames = S.shape[1]
    if n_frames < n_segments:
        return {"is_stationary": True, "variance_ratio": 0.0}

    segment_len = n_frames // n_segments
    segment_energies = []
    for i in range(n_segments):
        start = i * segment_len
        end = start + segment_len
        segment_energies.append(np.sum(S[:, start:end] ** 2))

    segment_energies = np.array(segment_energies)
    mean_energy = np.mean(segment_energies)
    if mean_energy == 0:
        return {"is_stationary": True, "variance_ratio": 0.0}

    cv = float(np.std(segment_energies) / mean_energy)  # coefficient of variation
    return {
        "is_stationary": cv < 0.3,
        "variance_ratio": cv,
    }


def _find_dominant_frequency(S: np.ndarray, freqs: np.ndarray) -> float:
    """Find the dominant frequency in the spectrogram.

    Args:
        S: Magnitude spectrogram.
        freqs: Frequency values per bin.

    Returns:
        Dominant frequency in Hz.
    """
    mean_spectrum = np.mean(S, axis=1)
    dominant_idx = np.argmax(mean_spectrum)
    return float(freqs[dominant_idx])


def classify_noise(y: np.ndarray, sr: int) -> dict:
    """Classify background noise type using frequency-band energy analysis.

    Analyzes the audio signal by computing a magnitude spectrogram and
    examining energy distribution across frequency bands, harmonic
    structure, and temporal stationarity to determine likely noise sources.

    Args:
        y: Audio time-series signal as a 1-D numpy array.
        sr: Sample rate in Hz.

    Returns:
        Dictionary with:
            - primary_type: str -- most likely noise type (one of:
              "aircraft", "vehicle", "generator", "wind", "rain",
              "biological", "unknown").
            - confidence: float -- confidence score between 0 and 1.
            - noise_types: list[dict] -- ranked list of detected noise
              types, each with keys 'type', 'percentage', and
              'frequency_range_hz'.
            - dominant_frequency_hz: float -- the single most prominent
              frequency in the signal.
    """
    # Compute magnitude spectrogram
    n_fft = 2048
    hop_length = 512
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    # Compute band energies
    band_energies = _compute_band_energies(S, freqs)

    # Check for generator hum (harmonic peaks at 50/60 Hz)
    harmonic_info = _check_harmonic_peaks(S, freqs)

    # Check temporal stationarity
    stationarity = _check_temporal_stationarity(S)

    # Score each noise type
    scores: dict[str, float] = {}

    # Aircraft: strong sub-bass and low-mid, non-stationary
    scores["aircraft"] = (
        band_energies["sub_bass"] * 1.5
        + band_energies["low_mid"] * 1.5
        + (0.2 if not stationarity["is_stationary"] else 0.0)
    )

    # Vehicle: strong sub-bass and low, non-stationary
    scores["vehicle"] = (
        band_energies["sub_bass"] * 1.5
        + band_energies["low"] * 2.0
        + (0.15 if not stationarity["is_stationary"] else 0.0)
    )

    # Generator: strong low band, harmonic peaks, stationary
    generator_score = band_energies["low"] * 1.5
    if harmonic_info["is_harmonic"]:
        generator_score += harmonic_info["strength"] * 2.0
    if stationarity["is_stationary"]:
        generator_score += 0.3
    scores["generator"] = generator_score

    # Wind: strong mid band, stationary or slowly varying
    scores["wind"] = (
        band_energies["mid"] * 2.5
        + (0.1 if stationarity["variance_ratio"] < 0.5 else 0.0)
    )

    # Rain: strong high-mid, stationary
    scores["rain"] = (
        band_energies["high_mid"] * 2.5
        + (0.15 if stationarity["is_stationary"] else 0.0)
    )

    # Biological: strong high band, non-stationary
    scores["biological"] = (
        band_energies["high"] * 2.5
        + (0.1 if not stationarity["is_stationary"] else 0.0)
    )

    # Normalize scores to percentages
    total_score = sum(scores.values())
    if total_score == 0:
        percentages = {k: 0.0 for k in scores}
    else:
        percentages = {k: v / total_score for k, v in scores.items()}

    # Sort by score descending
    ranked = sorted(percentages.items(), key=lambda x: x[1], reverse=True)

    # Build noise_types list
    noise_types = []
    for noise_type, pct in ranked:
        if pct > 0.01:  # Only include types above 1%
            freq_range = NOISE_PROFILES[noise_type]["frequency_range"]
            noise_types.append({
                "type": noise_type,
                "percentage": round(pct * 100, 1),
                "frequency_range_hz": list(freq_range),
            })

    primary_type = ranked[0][0] if ranked else "unknown"
    confidence = ranked[0][1] if ranked else 0.0

    # If the top score is too low or too close to the next, reduce confidence
    if len(ranked) >= 2:
        gap = ranked[0][1] - ranked[1][1]
        if gap < 0.05:
            confidence *= 0.6
        elif gap < 0.1:
            confidence *= 0.8

    # If total energy is very low, classify as unknown
    total_energy = np.sum(S ** 2)
    signal_power = total_energy / S.size if S.size > 0 else 0
    if signal_power < 1e-10:
        primary_type = "unknown"
        confidence = 0.0

    dominant_freq = _find_dominant_frequency(S, freqs)

    return {
        "primary_type": primary_type,
        "confidence": round(float(min(confidence, 1.0)), 3),
        "noise_types": noise_types,
        "dominant_frequency_hz": round(dominant_freq, 1),
    }


def get_noise_frequency_range(noise_type: str) -> tuple[float, float]:
    """Return the typical frequency range for a given noise type.

    Args:
        noise_type: One of "aircraft", "vehicle", "generator", "wind",
            "rain", "biological".

    Returns:
        Tuple of (low_hz, high_hz) representing the typical frequency
        range for the noise type.

    Raises:
        ValueError: If noise_type is not recognized.
    """
    if noise_type not in NOISE_PROFILES:
        valid = ", ".join(sorted(NOISE_PROFILES.keys()))
        raise ValueError(
            f"Unknown noise type '{noise_type}'. Valid types: {valid}"
        )
    return NOISE_PROFILES[noise_type]["frequency_range"]
