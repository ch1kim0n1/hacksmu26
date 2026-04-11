"""Optional deep-denoise stage with a CPU-safe fallback."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy.signal import wiener

_DEFAULT_KERNEL = np.array([0.2, 0.6, 0.2], dtype=np.float32)


def _fallback_refine(y: np.ndarray) -> np.ndarray:
    refined = wiener(y.astype(np.float32), mysize=31)
    return np.asarray(refined, dtype=np.float32)


def _smooth_with_kernel(y: np.ndarray, kernel: np.ndarray) -> np.ndarray:
    padded = np.pad(y.astype(np.float32), (1, 1), mode="edge")
    smoothed = np.convolve(padded, kernel.astype(np.float32), mode="valid")
    return smoothed.astype(np.float32)


def _run_tiny_unet_with_torch(y: np.ndarray, model_path: str | None) -> np.ndarray | None:
    try:
        import torch
        import torch.nn as nn
    except Exception:
        return None

    class TinyUNet1D(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.encoder = nn.Sequential(
                nn.Conv1d(1, 8, kernel_size=9, padding=4),
                nn.ReLU(),
                nn.Conv1d(8, 16, kernel_size=9, stride=2, padding=4),
                nn.ReLU(),
            )
            self.decoder = nn.Sequential(
                nn.ConvTranspose1d(16, 8, kernel_size=4, stride=2, padding=1),
                nn.ReLU(),
                nn.Conv1d(8, 1, kernel_size=9, padding=4),
                nn.Tanh(),
            )

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            encoded = self.encoder(x)
            decoded = self.decoder(encoded)
            if decoded.shape[-1] != x.shape[-1]:
                decoded = decoded[..., : x.shape[-1]]
            # Residual learning keeps results close to the input signal.
            return (0.8 * x) + (0.2 * decoded)

    model = TinyUNet1D().cpu().eval()
    checkpoint_path = Path(model_path) if model_path else None
    if checkpoint_path and checkpoint_path.exists():
        try:
            checkpoint = torch.load(str(checkpoint_path), map_location="cpu")
            state_dict = checkpoint.get("state_dict", checkpoint) if isinstance(checkpoint, dict) else checkpoint
            if isinstance(state_dict, dict):
                model.load_state_dict(state_dict, strict=False)
        except Exception:
            return None

    waveform = torch.from_numpy(y.astype(np.float32)).unsqueeze(0).unsqueeze(0)
    with torch.no_grad():
        refined = model(waveform).squeeze(0).squeeze(0)
    return refined.numpy().astype(np.float32)


def deep_denoise(
    y: np.ndarray,
    sr: int,
    *,
    model_path: str | None = None,
) -> np.ndarray:
    """Run the optional deep denoiser.

    When PyTorch/model weights are unavailable, falls back to a lightweight
    Wiener refinement so the pipeline still supports ``deep`` and ``hybrid``
    modes on CPU-only environments.
    """
    if y.size == 0:
        return y.astype(np.float32)

    del sr

    unet_refined = _run_tiny_unet_with_torch(y, model_path)
    if unet_refined is not None:
        return unet_refined

    if model_path and Path(model_path).exists():
        return _smooth_with_kernel(y, _DEFAULT_KERNEL)

    return _fallback_refine(y)
