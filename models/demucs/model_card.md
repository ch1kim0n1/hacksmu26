# Model Card — Demucs (htdemucs) for EchoField

## Model Details

| Field | Value |
|---|---|
| Name | htdemucs (Hybrid Transformer Demucs) |
| Source | Facebook Research — https://github.com/facebookresearch/demucs |
| Version | htdemucs (default pretrained) |
| Architecture | Hybrid Transformer U-Net for audio source separation |
| Input | Stereo audio, 44 100 Hz |
| Output | 4 stems: drums, bass, other, vocals (EchoField uses the "vocals" stem as the clean signal) |
| Framework | PyTorch |
| License | MIT |

## How EchoField Uses Demucs

EchoField treats Demucs as an optional ensemble candidate:
1. The original mono recording is converted to fake stereo.
2. `apply_model(htdemucs, ...)` separates the signal into 4 stems.
3. The **vocals** stem is used as the denoised candidate (elephants vocalisations
   share spectral characteristics with human vocals in the Demucs training data).
4. The output is scored against spectral-gating and U-Net candidates; the
   highest-scoring candidate wins.

Demucs is only used when the `demucs` Python package is installed. If it is not
available, the ensemble falls back to spectral-gating ± U-Net.

## Installation

```bash
pip install demucs
```

Weights (~800 MB) are downloaded automatically on first use to `~/.cache/torch/hub/`.

## Limitations

- Not trained on elephant vocalisations; "vocals" separation is an approximation.
- Large memory footprint (~2 GB RAM during inference).
- Significantly slower than the U-Net denoiser (~15–30 s per 60-second clip on CPU).
- May introduce frequency coloration outside the elephant band (8–1200 Hz).

## Benchmark Notes

Demucs is evaluated as part of the ensemble benchmark.
Run `python scripts/benchmark.py --method all` to compare all candidates.
