# EchoField Model Assets

## Asset Strategy

Model weights are **not checked into git** due to file size and binary diff constraints.
Instead, this directory holds:

- `model_card.md` files documenting provenance, intended use, and benchmark results
- A `.gitkeep` placeholder for each model subdirectory

### Obtaining weights

| Model | Source | How to obtain |
|---|---|---|
| U-Net denoiser (`unet/`) | Trained on synthetic + ElephantVoices data | Run `make train-unet` or download from team shared drive |
| Demucs (`demucs/`) | Facebook Research pretrained `htdemucs` | Installed automatically via `pip install demucs` |

### Environment variables

```
ECHOFIELD_MODEL_PATH              Path to U-Net denoiser checkpoint (.pt)
ECHOFIELD_DETECTOR_MODEL_PATH     Path to call-boundary detector checkpoint (.pt)
ECHOFIELD_CLASSIFIER_MODEL_PATH   Path to call-type classifier checkpoint (.pt)
```

Set these in `.env` or pass directly. If a path is unset or the file does not exist,
the pipeline degrades gracefully to spectral-gating / heuristic fallback — no crash.

### Running validation

```bash
python scripts/benchmark.py
# or
make benchmark
```

See `scripts/benchmark.py --help` for options.
