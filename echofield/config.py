"""
EchoField configuration module.

Loads settings from environment variables and ``config/echofield.config.yml``,
validates the runtime paths, and exposes a singleton config object.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "http://localhost:5173"]


class ConfigError(ValueError):
    """Raised when the application configuration is invalid."""


def _env_any(*keys: str, default: str | None = None) -> str | None:
    """Return the first populated ``ECHOFIELD_*`` environment variable."""
    for key in keys:
        value = os.getenv(f"ECHOFIELD_{key}")
        if value is not None and value != "":
            return value
    return default


def _env_bool(*keys: str, default: bool = False) -> bool:
    value = _env_any(*keys)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(*keys: str, default: int) -> int:
    value = _env_any(*keys)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        joined = ", ".join(keys)
        raise ConfigError(f"Expected integer for one of: {joined}") from exc


def _env_float(*keys: str, default: float) -> float:
    value = _env_any(*keys)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError as exc:
        joined = ", ".join(keys)
        raise ConfigError(f"Expected float for one of: {joined}") from exc


def _env_list(*keys: str, default: list[str] | None = None) -> list[str]:
    value = _env_any(*keys)
    if value is None:
        return list(default or [])
    return [item.strip() for item in value.split(",") if item.strip()]


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ConfigError(f"Config file not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ConfigError(f"Config file must contain a mapping: {path}")
    return data


@dataclass
class Config:
    """Typed application configuration."""

    AUDIO_DIR: str = "./data/recordings/original"
    PROCESSED_DIR: str = "./data/processed"
    SPECTROGRAM_DIR: str = "./data/spectrograms"
    CACHE_DIR: str = "./data/cache"
    CATALOG_FILE: str = "./data/cache/recording_catalog.json"
    METADATA_FILE: str = "./data/metadata.csv"
    CONFIG_FILE: str = "./config/echofield.config.yml"
    MODEL_PATH: str = "./models/echofield-denoise-v1.pt"
    CLASSIFIER_MODEL_PATH: str = "./models/call_classifier.joblib"
    MODEL_REGISTRY_DIR: str = "./models"
    DB_PATH: str = "./data/cache/echofield.sqlite"

    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "text"

    SAMPLE_RATE: int = 44100
    API_PORT: int = 8000
    CORS_ORIGINS: list[str] = field(default_factory=lambda: list(DEFAULT_CORS_ORIGINS))

    DEMO_MODE: bool = True
    DENOISE_METHOD: str = "hybrid"
    SEGMENT_SECONDS: int = 60
    SEGMENT_OVERLAP_RATIO: float = 0.5
    SPECTROGRAM_N_FFT: int = 2048
    SPECTROGRAM_HOP_LENGTH: int = 512
    SPECTROGRAM_FREQ_MAX: int = 1000
    SPECTROGRAM_TYPE: str = "stft"
    DENOISE_CHUNK_S: float = 10.0
    DENOISE_POST_PROCESS: bool = False
    DENOISE_PRESERVE_HARMONICS: bool = False

    # Call-aware time gate (Option B): attenuate audio outside detected call windows
    CALL_AWARE_GATE: bool = True
    CALL_GATE_MIN_CONFIDENCE: float = 0.45
    CALL_GATE_PAD_MS: float = 250.0
    CALL_GATE_MERGE_GAP_MS: float = 100.0
    CALL_GATE_FADE_MS: float = 40.0
    CALL_GATE_FLOOR_LINEAR: float = 0.0

    pipeline_config: dict[str, Any] = field(default_factory=dict)

    @property
    def project_root(self) -> Path:
        return PROJECT_ROOT

    def resolve_path(self, value: str) -> Path:
        path = Path(value)
        return path if path.is_absolute() else (PROJECT_ROOT / path).resolve()

    @property
    def audio_dir(self) -> Path:
        return self.resolve_path(self.AUDIO_DIR)

    @property
    def processed_dir(self) -> Path:
        return self.resolve_path(self.PROCESSED_DIR)

    @property
    def spectrogram_dir(self) -> Path:
        return self.resolve_path(self.SPECTROGRAM_DIR)

    @property
    def cache_dir(self) -> Path:
        return self.resolve_path(self.CACHE_DIR)

    @property
    def metadata_file(self) -> Path:
        return self.resolve_path(self.METADATA_FILE)

    @property
    def catalog_file(self) -> Path:
        return self.resolve_path(self.CATALOG_FILE)

    @property
    def config_file(self) -> Path:
        return self.resolve_path(self.CONFIG_FILE)

    @property
    def model_path(self) -> Path:
        return self.resolve_path(self.MODEL_PATH)

    @property
    def classifier_model_path(self) -> Path:
        return self.resolve_path(self.CLASSIFIER_MODEL_PATH)

    @property
    def model_registry_dir(self) -> Path:
        return self.resolve_path(self.MODEL_REGISTRY_DIR)

    @property
    def db_path(self) -> Path:
        return self.resolve_path(self.DB_PATH)

    def ensure_directories(self) -> None:
        for directory in (
            self.audio_dir,
            self.processed_dir,
            self.spectrogram_dir,
            self.cache_dir,
            self.model_registry_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)
        self.metadata_file.parent.mkdir(parents=True, exist_ok=True)
        self.catalog_file.parent.mkdir(parents=True, exist_ok=True)

    def validate(self) -> None:
        if not (0.0 <= self.SEGMENT_OVERLAP_RATIO < 1.0):
            raise ConfigError("ECHOFIELD_SEGMENT_OVERLAP_RATIO must be in [0, 1).")
        if self.SAMPLE_RATE < 16_000:
            raise ConfigError("ECHOFIELD_SAMPLE_RATE must be at least 16000 Hz.")
        if self.SPECTROGRAM_N_FFT <= 0 or self.SPECTROGRAM_HOP_LENGTH <= 0:
            raise ConfigError("Spectrogram FFT and hop length must be positive.")
        if self.SPECTROGRAM_TYPE.lower() not in {"stft", "cqt"}:
            raise ConfigError("ECHOFIELD_SPECTROGRAM_TYPE must be one of: stft, cqt.")
        if not (0.0 <= self.CALL_GATE_MIN_CONFIDENCE <= 1.0):
            raise ConfigError("ECHOFIELD_CALL_GATE_MIN_CONFIDENCE must be in [0, 1].")
        if not (0.0 <= self.CALL_GATE_FLOOR_LINEAR <= 1.0):
            raise ConfigError("ECHOFIELD_CALL_GATE_FLOOR_LINEAR must be in [0, 1].")

        self.ensure_directories()

        if not self.audio_dir.exists():
            raise ConfigError(f"Audio directory does not exist: {self.audio_dir}")
        if not self.metadata_file.parent.exists():
            raise ConfigError(
                f"Metadata directory does not exist: {self.metadata_file.parent}"
            )
        if not self.config_file.exists():
            raise ConfigError(f"Pipeline config not found: {self.config_file}")

        if self.DENOISE_METHOD == "deep" and not self.model_path.exists():
            raise ConfigError(
                f"Deep denoise mode requires model weights at {self.model_path}"
            )


Settings = Config

_config_instance: Config | None = None


def get_settings() -> Config:
    """Return the singleton config instance."""
    global _config_instance
    if _config_instance is not None:
        return _config_instance

    load_dotenv(PROJECT_ROOT / ".env")

    config_file = _env_any("CONFIG_FILE", default=Config.CONFIG_FILE) or Config.CONFIG_FILE
    config_path = Path(config_file)
    if not config_path.is_absolute():
        config_path = (PROJECT_ROOT / config_path).resolve()
    pipeline_config = _load_yaml(config_path)

    denoise_method = _env_any(
        "DENOISE_METHOD",
        default=str(
            pipeline_config.get("pipeline", {})
            .get("defaults", {})
            .get("denoise_method", Config.DENOISE_METHOD)
        ),
    ) or Config.DENOISE_METHOD
    pipeline_defaults = pipeline_config.get("pipeline", {}).get("defaults", {})

    settings = Config(
        AUDIO_DIR=_env_any("AUDIO_DIR", default=Config.AUDIO_DIR) or Config.AUDIO_DIR,
        PROCESSED_DIR=_env_any(
            "PROCESSED_DIR",
            "OUTPUT_DIR",
            default=Config.PROCESSED_DIR,
        )
        or Config.PROCESSED_DIR,
        SPECTROGRAM_DIR=_env_any(
            "SPECTROGRAM_DIR",
            default=Config.SPECTROGRAM_DIR,
        )
        or Config.SPECTROGRAM_DIR,
        CACHE_DIR=_env_any("CACHE_DIR", default=Config.CACHE_DIR) or Config.CACHE_DIR,
        CATALOG_FILE=_env_any("CATALOG_FILE", default=Config.CATALOG_FILE) or Config.CATALOG_FILE,
        METADATA_FILE=_env_any(
            "METADATA_FILE",
            default=Config.METADATA_FILE,
        )
        or Config.METADATA_FILE,
        CONFIG_FILE=str(config_path),
        MODEL_PATH=_env_any("MODEL_PATH", default=Config.MODEL_PATH) or Config.MODEL_PATH,
        CLASSIFIER_MODEL_PATH=_env_any("CLASSIFIER_MODEL_PATH", default=Config.CLASSIFIER_MODEL_PATH) or Config.CLASSIFIER_MODEL_PATH,
        MODEL_REGISTRY_DIR=_env_any("MODEL_REGISTRY_DIR", default=Config.MODEL_REGISTRY_DIR) or Config.MODEL_REGISTRY_DIR,
        DB_PATH=_env_any("DB_PATH", default=Config.DB_PATH) or Config.DB_PATH,
        LOG_LEVEL=_env_any("LOG_LEVEL", default=Config.LOG_LEVEL) or Config.LOG_LEVEL,
        LOG_FORMAT=_env_any("LOG_FORMAT", default=Config.LOG_FORMAT) or Config.LOG_FORMAT,
        SAMPLE_RATE=_env_int("SAMPLE_RATE", default=Config.SAMPLE_RATE),
        API_PORT=_env_int("API_PORT", "BACKEND_PORT", default=Config.API_PORT),
        CORS_ORIGINS=_env_list("CORS_ORIGINS", default=DEFAULT_CORS_ORIGINS),
        DEMO_MODE=_env_bool("DEMO_MODE", default=Config.DEMO_MODE),
        DENOISE_METHOD=denoise_method,
        SEGMENT_SECONDS=_env_int("SEGMENT_SECONDS", default=Config.SEGMENT_SECONDS),
        SEGMENT_OVERLAP_RATIO=_env_float(
            "SEGMENT_OVERLAP_RATIO",
            default=Config.SEGMENT_OVERLAP_RATIO,
        ),
        SPECTROGRAM_N_FFT=_env_int(
            "SPECTROGRAM_N_FFT",
            "SPECTROGRAM_WINDOW_SIZE",
            default=Config.SPECTROGRAM_N_FFT,
        ),
        SPECTROGRAM_HOP_LENGTH=_env_int(
            "SPECTROGRAM_HOP_LENGTH",
            default=Config.SPECTROGRAM_HOP_LENGTH,
        ),
        SPECTROGRAM_FREQ_MAX=_env_int(
            "SPECTROGRAM_FREQ_MAX",
            default=Config.SPECTROGRAM_FREQ_MAX,
        ),
        SPECTROGRAM_TYPE=_env_any(
            "SPECTROGRAM_TYPE",
            default=str(pipeline_defaults.get("spectrogram_type", Config.SPECTROGRAM_TYPE)),
        )
        or Config.SPECTROGRAM_TYPE,
        DENOISE_CHUNK_S=_env_float(
            "DENOISE_CHUNK_S",
            default=float(pipeline_defaults.get("denoise_chunk_s", Config.DENOISE_CHUNK_S)),
        ),
        DENOISE_POST_PROCESS=_env_bool(
            "DENOISE_POST_PROCESS",
            default=bool(pipeline_defaults.get("denoise_post_process", Config.DENOISE_POST_PROCESS)),
        ),
        DENOISE_PRESERVE_HARMONICS=_env_bool(
            "DENOISE_PRESERVE_HARMONICS",
            default=bool(pipeline_defaults.get("denoise_preserve_harmonics", Config.DENOISE_PRESERVE_HARMONICS)),
        ),
        CALL_AWARE_GATE=_env_bool("CALL_AWARE_GATE", default=Config.CALL_AWARE_GATE),
        CALL_GATE_MIN_CONFIDENCE=_env_float(
            "CALL_GATE_MIN_CONFIDENCE",
            default=Config.CALL_GATE_MIN_CONFIDENCE,
        ),
        CALL_GATE_PAD_MS=_env_float("CALL_GATE_PAD_MS", default=Config.CALL_GATE_PAD_MS),
        CALL_GATE_MERGE_GAP_MS=_env_float("CALL_GATE_MERGE_GAP_MS", default=Config.CALL_GATE_MERGE_GAP_MS),
        CALL_GATE_FADE_MS=_env_float("CALL_GATE_FADE_MS", default=Config.CALL_GATE_FADE_MS),
        CALL_GATE_FLOOR_LINEAR=_env_float(
            "CALL_GATE_FLOOR_LINEAR",
            default=Config.CALL_GATE_FLOOR_LINEAR,
        ),
        pipeline_config=pipeline_config,
    )
    settings.validate()

    _config_instance = settings
    return _config_instance


def reset_settings() -> None:
    global _config_instance
    _config_instance = None


config = get_settings()
