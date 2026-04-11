"""Structured logging helpers with request-id propagation."""

from __future__ import annotations

import contextlib
import contextvars
import json
import logging
import sys
import uuid
from typing import Iterator

_request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id",
    default="-",
)
_recording_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "recording_id",
    default="-",
)
_stage_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "stage",
    default="-",
)

_configured = False


class TraceContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = _request_id_var.get()
        if not hasattr(record, "recording_id"):
            record.recording_id = _recording_id_var.get()
        if not hasattr(record, "stage"):
            record.stage = _stage_var.get()
        if not hasattr(record, "duration_ms"):
            record.duration_ms = None
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "recording_id": getattr(record, "recording_id", "-"),
            "stage": getattr(record, "stage", "-"),
        }
        if getattr(record, "duration_ms", None) is not None:
            payload["duration_ms"] = getattr(record, "duration_ms")
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def set_request_id(request_id: str | None = None) -> str:
    value = request_id or uuid.uuid4().hex
    _request_id_var.set(value)
    return value


def get_request_id() -> str:
    return _request_id_var.get()


@contextlib.contextmanager
def request_context(
    request_id: str | None = None,
    *,
    recording_id: str | None = None,
    stage: str | None = None,
) -> Iterator[str]:
    request_token = _request_id_var.set(request_id or uuid.uuid4().hex)
    recording_token = _recording_id_var.set(recording_id or _recording_id_var.get())
    stage_token = _stage_var.set(stage or _stage_var.get())
    try:
        yield _request_id_var.get()
    finally:
        _stage_var.reset(stage_token)
        _recording_id_var.reset(recording_token)
        _request_id_var.reset(request_token)


def configure_logging(level: str = "INFO", log_format: str = "text") -> None:
    global _configured
    if _configured:
        return

    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(TraceContextFilter())
    if log_format.lower() == "json":
        formatter: logging.Formatter = JsonFormatter(datefmt="%Y-%m-%dT%H:%M:%SZ")
    else:
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(request_id)s | %(recording_id)s | %(stage)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    handler.setFormatter(formatter)
    root.handlers = [handler]
    try:
        import structlog

        processors = [
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
        ]
        if log_format.lower() == "json":
            processors.append(structlog.processors.JSONRenderer())
        else:
            processors.append(structlog.dev.ConsoleRenderer(colors=False))
        structlog.configure(
            processors=processors,
            wrapper_class=structlog.stdlib.BoundLogger,
            logger_factory=structlog.stdlib.LoggerFactory(),
            cache_logger_on_first_use=True,
        )
    except Exception:
        pass
    _configured = True


def get_logger(name: str) -> logging.Logger:
    try:
        from echofield.config import get_settings

        settings = get_settings()
        configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
    except Exception:
        configure_logging()
    return logging.getLogger(name)
