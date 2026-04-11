"""
EchoField configuration module.

Loads settings from environment variables (ECHOFIELD_ prefix) and the
YAML pipeline configuration file at config/echofield.config.yml.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Project root is one level above the echofield package directory
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _env(key: str, default: str | None = None) -> str | None:
    """Read an environment variable with the ECHOFIELD_ prefix."""
    return os.getenv(f"ECHOFIELD_{key}", default)


def _env_bool(key: str, default: bool = False) -> bool:
    """Read a boolean environment variable (accepts true/1/yes)."""
    val = _env(key)
    if val is None:
        return default
    return val.strip().lower() in ("true", "1", "yes")


def _env_int(key: str, default: int = 0) -> int:
    """Read an integer environment variable."""
    val = _env(key)
    if val is None:
        return default
    try:
        return int(val)
    except ValueError:
        return default


def _env_list(key: str, default: list[str] | None = None) -> list[str]:
    """Read a comma-separated list from an environment variable."""
    val = _env(key)
    if val is None:
        return default if default is not None else []
    return [item.strip() for item in val.split(",") if item.strip()]


def _load_yaml(path: str | Path) -> dict[str, Any]:
    """Load a YAML file and return its contents as a dict."""
    path = Path(path)
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    return data if isinstance(data, dict) else {}


# ---------------------------------------------------------------------------
# Settings dataclass
# ---------------------------------------------------------------------------

@dataclass
class Settings:
    """Application-wide settings for EchoField."""

    # Directories
    AUDIO_DIR: str = "./data/recordings"
    PROCESSED_DIR: str = "./data/processed"
    SPECTROGRAM_DIR: str = "./data/spectrograms"

    # Files
    METADATA_FILE: str = "./data/metadata.csv"
    CONFIG_FILE: str = "./config/echofield.config.yml"

    # Logging
    LOG_LEVEL: str = "INFO"

    # Audio defaults
    SAMPLE_RATE: int = 44100

    # Server
    API_PORT: int = 8000
    CORS_ORIGINS: list[str] = field(default_factory=lambda: ["http://localhost:3000"])

    # Feature flags
    DEMO_MODE: bool = True

    # Pipeline configuration loaded from the YAML config file
    pipeline_config: dict[str, Any] = field(default_factory=dict)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @property
    def audio_dir(self) -> Path:
        return Path(self.AUDIO_DIR)

    @property
    def processed_dir(self) -> Path:
        return Path(self.PROCESSED_DIR)

    @property
    def spectrogram_dir(self) -> Path:
        return Path(self.SPECTROGRAM_DIR)

    @property
    def metadata_file(self) -> Path:
        return Path(self.METADATA_FILE)

    @property
    def config_file(self) -> Path:
        return Path(self.CONFIG_FILE)

    def ensure_directories(self) -> None:
        """Create data directories if they do not exist."""
        for d in (self.audio_dir, self.processed_dir, self.spectrogram_dir):
            d.mkdir(parents=True, exist_ok=True)
        # Ensure the parent directory of the metadata CSV exists
        self.metadata_file.parent.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_settings_instance: Settings | None = None


def get_settings() -> Settings:
    """Return the global *Settings* singleton, creating it on first call.

    The function:
    1. Loads ``.env`` via *python-dotenv*.
    2. Reads every ``ECHOFIELD_*`` environment variable into the dataclass.
    3. Loads the YAML pipeline config referenced by ``CONFIG_FILE``.
    """
    global _settings_instance
    if _settings_instance is not None:
        return _settings_instance

    # 1. Load .env from project root (no-op if missing)
    load_dotenv(dotenv_path=_PROJECT_ROOT / ".env")

    # 2. Build settings from env vars (with defaults)
    settings = Settings(
        AUDIO_DIR=_env("AUDIO_DIR", Settings.AUDIO_DIR),
        PROCESSED_DIR=_env("PROCESSED_DIR", Settings.PROCESSED_DIR),
        SPECTROGRAM_DIR=_env("SPECTROGRAM_DIR", Settings.SPECTROGRAM_DIR),
        METADATA_FILE=_env("METADATA_FILE", Settings.METADATA_FILE),
        CONFIG_FILE=_env("CONFIG_FILE", Settings.CONFIG_FILE),
        LOG_LEVEL=_env("LOG_LEVEL", Settings.LOG_LEVEL),
        SAMPLE_RATE=_env_int("SAMPLE_RATE", Settings.SAMPLE_RATE),
        API_PORT=_env_int("API_PORT", Settings.API_PORT),
        CORS_ORIGINS=_env_list("CORS_ORIGINS", ["http://localhost:3000"]),
        DEMO_MODE=_env_bool("DEMO_MODE", Settings.DEMO_MODE),
    )

    # 3. Load YAML pipeline configuration
    yaml_path = Path(settings.CONFIG_FILE)
    if not yaml_path.is_absolute():
        yaml_path = _PROJECT_ROOT / yaml_path
    settings.pipeline_config = _load_yaml(yaml_path)

    _settings_instance = settings
    return _settings_instance


def reset_settings() -> None:
    """Reset the cached singleton (useful for testing)."""
    global _settings_instance
    _settings_instance = None
