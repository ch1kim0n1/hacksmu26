"""
EchoField structured logging configuration.

Usage::

    from echofield.utils.logging_config import get_logger

    logger = get_logger(__name__)
    logger.info("Processing started", extra={"recording_id": "abc-123"})
"""

from __future__ import annotations

import logging
import sys
from typing import Optional

# Keep a registry so each name only gets configured once.
_configured_loggers: set[str] = set()

# ---------------------------------------------------------------------------
# Formatter
# ---------------------------------------------------------------------------

_LOG_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
)
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def _resolve_level(level_name: str) -> int:
    """Convert a level name string to a logging constant, defaulting to INFO."""
    return getattr(logging, level_name.upper(), logging.INFO)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_logger(
    name: str,
    level: Optional[str] = None,
) -> logging.Logger:
    """Return a configured :class:`logging.Logger`.

    Parameters
    ----------
    name:
        Logger name (typically ``__name__``).
    level:
        Override log level (e.g. ``"DEBUG"``).  When *None*, the level is
        read from :func:`echofield.config.get_settings`.
    """
    if name in _configured_loggers:
        return logging.getLogger(name)

    # Lazy import to avoid circular dependency (config imports nothing from
    # utils, but utils.logging_config reads config at runtime).
    if level is None:
        try:
            from echofield.config import get_settings
            level = get_settings().LOG_LEVEL
        except Exception:
            level = "INFO"

    logger = logging.getLogger(name)
    logger.setLevel(_resolve_level(level))

    # Avoid duplicate handlers when get_logger is called more than once
    # for the same name in rapid succession (race-free because CPython GIL).
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(_resolve_level(level))
        handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
        logger.addHandler(handler)

    # Prevent messages from propagating to the root logger and being
    # printed twice when the root logger also has a handler.
    logger.propagate = False

    _configured_loggers.add(name)
    return logger
