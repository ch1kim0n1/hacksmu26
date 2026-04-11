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

_configured = False


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
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
def request_context(request_id: str | None = None) -> Iterator[str]:
    token = _request_id_var.set(request_id or uuid.uuid4().hex)
    try:
        yield _request_id_var.get()
    finally:
        _request_id_var.reset(token)


def configure_logging(level: str = "INFO", log_format: str = "text") -> None:
    global _configured
    if _configured:
        return

    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    if log_format.lower() == "json":
        formatter: logging.Formatter = JsonFormatter(datefmt="%Y-%m-%dT%H:%M:%SZ")
    else:
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(request_id)s | %(message)s",
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
    try:
        import structlog

        return structlog.stdlib.get_logger(name)  # type: ignore[return-value]
    except Exception:
        return logging.getLogger(name)
