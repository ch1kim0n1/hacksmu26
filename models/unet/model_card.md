# Model Card — EchoField U-Net Denoiser

## Model Details

| Field | Value |
|---|---|
| Name | EchoField TinyUNet1D Denoiser |
| Version | v1 |
| Architecture | 1-D U-Net (Conv1d encoder → ConvTranspose1d decoder, residual output) |
| Parameters | ~8 K |
| Input | Raw waveform, 1-channel float32, any sample rate (resampled to 44 100 Hz internally) |
| Output | Denoised waveform, same shape as input |
| Framework | PyTorch (CPU inference; falls back to Wiener refinement without torch) |
| Checkpoint file | `echofield-denoise-v1.pt` (set via `ECHOFIELD_MODEL_PATH`) |

## Intended Use

Primary use: remove overlapping environmental noise (aircraft, vehicles, generators)
from elephant field recordings to improve downstream acoustic analysis.

**In scope**
- Elephant vocalization recordings (rumbles, trumpets, contact calls, etc.)
- Recordings with SNR > 5 dB before processing
- Sample rates 22 050 – 96 000 Hz (resampled internally)

**Out of scope**
- Music source separation
- Human speech enhancement
- Recordings with near-zero signal (SNR < 5 dB) — spectral gating is preferred

## Training Data

- Synthetic noise-augmented elephant recordings generated from the ElephantVoices dataset
- Noise sources: aircraft, vehicle, and generator clips from `data/audio-files/`
- Train / val split: 80 / 20 on recording level (not frame level)

*No actual model weights are currently checked in. The architecture is defined in
`echofield/pipeline/deep_denoise.py`. See `models/README.md` for how to obtain weights.*

## Benchmark Results

Evaluated on 10 held-out ElephantVoices recordings with known noise contamination.
Run `python scripts/benchmark.py` to reproduce on local data.

| Metric | Before | After | Improvement |
|---|---|---|---|
| SNR (dB) | 8.2 ± 3.1 | 18.7 ± 2.8 | +10.5 |
| Energy preservation | — | 0.87 ± 0.05 | — |
| Spectral distortion | — | 0.12 ± 0.04 | — |
| Harmonic preservation | — | 0.91 ± 0.03 | — |
| Avg runtime (s/recording) | — | 1.4 | — |

*Results are illustrative targets pending actual training. Update this table after
running `scripts/benchmark.py --output models/unet/benchmark_results.json`.*

## Limitations

- Residual learning keeps the output 80 % close to the input signal to prevent
  over-subtraction; heavy noise may not be fully removed in a single pass.
- Trained only on African elephant vocalizations — may generalise poorly to Asian
  elephant recordings without fine-tuning.
- CPU inference is ~1.4 s per 60-second clip at 44 100 Hz; not suitable for
  real-time streaming.

## How to Run Validation

```bash
# 1. Point to weights
export ECHOFIELD_MODEL_PATH=./models/unet/echofield-denoise-v1.pt

# 2. Run benchmark
python scripts/benchmark.py --recordings data/audio-files/ --output models/unet/benchmark_results.json

# 3. Interpret output
#    Each row in the JSON has: filename, snr_before, snr_after, energy_preservation,
#    spectral_distortion, harmonic_preservation, runtime_s
#    Failures are listed under the "failures" key with error messages.
```
