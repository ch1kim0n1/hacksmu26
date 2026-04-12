"""Real-time chunk-by-chunk live audio denoising pipeline.

This module provides :class:`LiveRecordingSession`, a stateful handler that
accepts raw PCM audio chunks from a browser WebSocket connection, denoises
each chunk in near real-time using the existing spectral-gating pipeline, and
assembles the cleaned audio for final storage in :class:`RecordingStore`.

Design decisions
----------------
* **Overlap-save processing** – each chunk is prepended with the last 50 % of
  the previous chunk's *raw* input before denoising.  This gives the spectral
  estimator cross-boundary context and avoids the edge-distortion artefacts
  that arise when short FFT frames straddle a hard boundary.  Only the *new*
  samples are returned, so output length always equals input length.
* **Noise-profile bootstrap** – the very first chunk's opening 0.5 s is used
  to build a stationary noise estimate via the existing
  :func:`~echofield.pipeline.spectral_gate.estimate_noise_profile`.  This
  profile is stored and reused for all subsequent chunks; it is **never**
  updated during the session, which keeps denoising consistent and prevents
  convergence noise from creeping into the cleaned signal.
* **Hann crossfade** – after denoising the extended (overlap-save) signal, a
  Hann-envelope fade is applied to the leading and trailing *crossfade_ms*
  milliseconds.  This mirrors the weighting used by
  :func:`~echofield.pipeline.spectral_gate.adaptive_gate_denoise` and prevents
  amplitude discontinuities in the assembled output.
* **No modifications to existing pipeline modules** – this file only imports
  and composes existing helpers.

Usage::

    session = LiveRecordingSession(session_id="abc", sample_rate=44100)
    for raw_bytes in audio_stream:
        result = session.process_chunk(raw_bytes)
        websocket.send_bytes(result.cleaned_bytes)
    final_audio = session.finalize()          # np.ndarray float32
    duration   = session.duration_s           # seconds of captured audio
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from echofield.pipeline.ingestion import validate_audio
from echofield.pipeline.noise_classifier import classify_noise
from echofield.pipeline.quality_check import compute_snr
from echofield.pipeline.spectrogram import compute_stft
from echofield.pipeline.spectral_gate import apply_spectral_gate, estimate_noise_profile
from echofield.utils.logging_config import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Public data container
# ---------------------------------------------------------------------------


@dataclass
class ChunkResult:
    """Denoising result for one audio chunk.

    All fields are populated by :meth:`LiveRecordingSession.process_chunk` and
    are safe to serialise directly into a WebSocket JSON message (except
    *cleaned_bytes* which is sent as a binary frame).
    """

    cleaned_bytes: bytes
    """Raw PCM float32 bytes of the denoised audio chunk (same length as input)."""

    spectrogram_columns: np.ndarray
    """STFT magnitude in dB, shape ``(n_freq_bins, n_time_frames)``, float32."""

    noise_type: str
    """Dominant noise type: ``'airplane'``, ``'car'``, ``'generator'``,
    ``'wind'``, or ``'other'``."""

    confidence: float
    """Classifier confidence for *noise_type*, in the range ``[0.0, 1.0]``."""

    snr_before: float
    """Estimated SNR (dB) of the *raw* input chunk."""

    snr_after: float
    """Estimated SNR (dB) of the *denoised* output chunk."""


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------


class LiveRecordingSession:
    """Stateful per-connection handler for real-time chunk-by-chunk denoising.

    One instance is created per WebSocket session.  It maintains:

    * A noise profile extracted once from the first 0.5 s of audio
    * A 50 % input tail from the previous chunk for overlap-save processing
    * A list of cleaned output chunks for final assembly

    Args:
        session_id:   Unique string identifier for this session (used in logs).
        sample_rate:  PCM sample rate of incoming audio, in Hz.  Must match
                      the ``AudioContext`` sample rate on the browser side.
        crossfade_ms: Duration of the Hann fade applied to the edges of each
                      processed chunk, in milliseconds.  Default 50 ms matches
                      the crossfade used by
                      :func:`~echofield.pipeline.spectral_gate.adaptive_gate_denoise`.
    """

    def __init__(
        self,
        session_id: str,
        sample_rate: int = 44_100,
        crossfade_ms: float = 50.0,
    ) -> None:
        self.session_id: str = session_id
        self.sr: int = sample_rate
        self._crossfade_samples: int = max(1, int(crossfade_ms / 1000.0 * sample_rate))

        # Mutable session state ------------------------------------------------
        self._noise_profile: np.ndarray | None = None
        """Noise clip used by the spectral gate; bootstrapped from first chunk."""

        self._input_tail: np.ndarray | None = None
        """Last 50 % of the previous raw (pre-denoise) chunk; prepended for context."""

        self._accumulated: list[np.ndarray] = []
        """Cleaned output chunk list; concatenated by :meth:`finalize`."""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_chunk(self, raw_bytes: bytes) -> ChunkResult:
        """Denoise one raw PCM chunk and return cleaned audio plus metrics.

        The method performs the following steps in order:

        1. Deserialise *raw_bytes* to a float32 numpy array.
        2. Validate and repair any NaN / Inf samples.
        3. Bootstrap the noise profile on the first call (0.5 s from the chunk).
        4. Build an *extended* chunk by prepending the 50 % input tail from the
           previous call (overlap-save technique).
        5. Run :func:`~echofield.pipeline.spectral_gate.apply_spectral_gate`
           on the extended chunk using the stored noise profile.
        6. Apply a Hann-envelope crossfade to the edges of the cleaned extended
           chunk.
        7. Extract only the *new* portion (last ``len(chunk)`` samples) as the
           output.
        8. Accumulate the output and compute per-chunk metrics.

        Args:
            raw_bytes: Raw PCM audio bytes in **float32 little-endian mono**
                       format, sampled at ``self.sr`` Hz.  An empty bytes
                       object is handled gracefully.

        Returns:
            A :class:`ChunkResult` containing cleaned bytes and acoustic metrics.

        Raises:
            ValueError: If the audio contains unrecoverable NaN / Inf samples
                        (more than 50 % corrupt).
        """
        # ------------------------------------------------------------------ #
        # 1. Deserialise                                                       #
        # ------------------------------------------------------------------ #
        chunk: np.ndarray = np.frombuffer(raw_bytes, dtype=np.float32).copy()

        # ------------------------------------------------------------------ #
        # 2. Validate                                                          #
        # ------------------------------------------------------------------ #
        chunk, _warnings = validate_audio(chunk, self.sr)
        n: int = len(chunk)

        if n == 0:
            logger.debug("live[%s]: received empty chunk — skipping", self.session_id)
            # Return an empty result with a plausible spectrogram shape.
            return ChunkResult(
                cleaned_bytes=b"",
                spectrogram_columns=np.zeros((1025, 0), dtype=np.float32),
                noise_type="other",
                confidence=0.0,
                snr_before=0.0,
                snr_after=0.0,
            )

        # ------------------------------------------------------------------ #
        # 3. Bootstrap noise profile (first chunk only)                        #
        # ------------------------------------------------------------------ #
        if self._noise_profile is None:
            self._noise_profile = estimate_noise_profile(
                chunk, self.sr, noise_duration_s=0.5
            )
            logger.debug(
                "live[%s]: bootstrapped noise profile — %d samples (%.3f s)",
                self.session_id,
                len(self._noise_profile),
                len(self._noise_profile) / self.sr,
            )

        # ------------------------------------------------------------------ #
        # 4. Build extended chunk (overlap-save: prepend 50 % tail)            #
        # ------------------------------------------------------------------ #
        overlap_n: int = n // 2
        if self._input_tail is not None and self._input_tail.size > 0:
            extended: np.ndarray = np.concatenate(
                [self._input_tail, chunk]
            ).astype(np.float32)
        else:
            extended = chunk

        # Store tail for the next call *before* modifying chunk.
        self._input_tail = chunk[-overlap_n:].copy() if overlap_n > 0 else np.zeros(0, dtype=np.float32)

        # ------------------------------------------------------------------ #
        # 5. Spectral-gate denoising on the extended signal                   #
        # ------------------------------------------------------------------ #
        cleaned_extended: np.ndarray = apply_spectral_gate(
            extended,
            self.sr,
            noise_clip=self._noise_profile,
        )

        # ------------------------------------------------------------------ #
        # 6. Hann crossfade at edges (mirrors adaptive_gate_denoise weighting) #
        # ------------------------------------------------------------------ #
        ext_len: int = len(cleaned_extended)
        fade_len: int = min(self._crossfade_samples, max(ext_len // 4, 1))

        if fade_len > 1 and ext_len >= 2 * fade_len:
            # Use the first half of a full Hann window for the fade-in and the
            # second half for the fade-out — exactly as adaptive_gate_denoise does.
            hann: np.ndarray = np.hanning(2 * fade_len).astype(np.float32)
            cleaned_extended = cleaned_extended.copy()
            cleaned_extended[:fade_len] *= hann[:fade_len]   # fade-in at start
            cleaned_extended[-fade_len:] *= hann[fade_len:]  # fade-out at end

        # ------------------------------------------------------------------ #
        # 7. Extract new-samples-only output (discard overlap prefix)         #
        # ------------------------------------------------------------------ #
        if len(cleaned_extended) > n:
            output: np.ndarray = cleaned_extended[-n:].astype(np.float32)
        else:
            output = cleaned_extended.astype(np.float32)

        # ------------------------------------------------------------------ #
        # 8. Accumulate + compute metrics                                      #
        # ------------------------------------------------------------------ #
        self._accumulated.append(output)

        snr_before: float = float(compute_snr(chunk, self.sr))
        snr_after: float = float(compute_snr(output, self.sr))

        noise_result = classify_noise(chunk, self.sr)
        stft_data = compute_stft(output, self.sr)

        logger.debug(
            "live[%s]: processed %d samples — snr %.1f→%.1f dB, noise=%s (%.2f)",
            self.session_id,
            n,
            snr_before,
            snr_after,
            noise_result["primary_type"],
            noise_result["confidence"],
        )

        return ChunkResult(
            cleaned_bytes=output.tobytes(),
            spectrogram_columns=stft_data["magnitude_db"].astype(np.float32),
            noise_type=str(noise_result["primary_type"]),
            confidence=float(noise_result["confidence"]),
            snr_before=snr_before,
            snr_after=snr_after,
        )

    def finalize(self) -> np.ndarray:
        """Assemble all accumulated cleaned chunks into a single audio array.

        Returns:
            A float32 numpy array containing the concatenated cleaned audio.
            Returns an empty float32 array if no chunks have been processed.
        """
        if not self._accumulated:
            return np.zeros(0, dtype=np.float32)
        if len(self._accumulated) == 1:
            return self._accumulated[0].copy()
        return np.concatenate(self._accumulated).astype(np.float32)

    def reset(self) -> None:
        """Clear all session state so the object can be reused.

        Resets the noise profile, overlap tail, and accumulated chunks.
        The *session_id* and *sr* remain unchanged.
        """
        self._noise_profile = None
        self._input_tail = None
        self._accumulated = []

    # ------------------------------------------------------------------
    # Read-only properties
    # ------------------------------------------------------------------

    @property
    def total_samples(self) -> int:
        """Total number of cleaned output samples accumulated so far."""
        return sum(len(c) for c in self._accumulated)

    @property
    def duration_s(self) -> float:
        """Total duration of accumulated cleaned audio, in seconds."""
        return self.total_samples / self.sr
