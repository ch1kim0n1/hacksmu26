"""Circuit breakers for optional denoising backends."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

CLOSED = "closed"
OPEN = "open"
HALF_OPEN = "half_open"


class CircuitBreakerOpen(RuntimeError):
    """Raised when a backend is skipped by an open circuit breaker."""


@dataclass
class CircuitBreaker:
    name: str
    failure_threshold: int = 3
    reset_timeout_s: float = 300.0
    state: str = CLOSED
    consecutive_failures: int = 0
    opened_at: float | None = None
    last_error: str | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def _transition(self, state: str) -> None:
        if self.state != state:
            logger.info("circuit_breaker: %s -> %s", self.name, state)
        self.state = state
        self.opened_at = time.monotonic() if state == OPEN else None

    def allow_request(self) -> bool:
        with self._lock:
            if self.state == CLOSED:
                return True
            if self.state == OPEN and self.opened_at is not None:
                if time.monotonic() - self.opened_at >= self.reset_timeout_s:
                    self._transition(HALF_OPEN)
                    return True
                return False
            return self.state == HALF_OPEN

    def record_success(self) -> None:
        with self._lock:
            self.consecutive_failures = 0
            self.last_error = None
            self._transition(CLOSED)

    def record_failure(self, error: BaseException | str) -> None:
        with self._lock:
            self.consecutive_failures += 1
            self.last_error = str(error)
            if self.state == HALF_OPEN or self.consecutive_failures >= self.failure_threshold:
                self._transition(OPEN)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            retry_after_s = None
            if self.state == OPEN and self.opened_at is not None:
                retry_after_s = max(self.reset_timeout_s - (time.monotonic() - self.opened_at), 0.0)
            return {
                "state": self.state,
                "consecutive_failures": self.consecutive_failures,
                "retry_after_s": round(retry_after_s, 2) if retry_after_s is not None else None,
                "last_error": self.last_error,
            }


class CircuitBreakerRegistry:
    def __init__(self) -> None:
        self._breakers: dict[str, CircuitBreaker] = {}
        self._lock = threading.Lock()

    def get(self, name: str) -> CircuitBreaker:
        with self._lock:
            if name not in self._breakers:
                self._breakers[name] = CircuitBreaker(name=name)
            return self._breakers[name]

    def run(self, name: str, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        breaker = self.get(name)
        if not breaker.allow_request():
            raise CircuitBreakerOpen(f"{name} circuit breaker is open")
        try:
            result = func(*args, **kwargs)
        except Exception as exc:
            breaker.record_failure(exc)
            raise
        if result is None:
            breaker.record_failure("backend returned no result")
        else:
            breaker.record_success()
        return result

    def snapshot(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            names = sorted(self._breakers)
        return {name: self.get(name).snapshot() for name in names}


_REGISTRY = CircuitBreakerRegistry()


def get_circuit_breaker_registry() -> CircuitBreakerRegistry:
    return _REGISTRY


def run_with_breaker(name: str, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    return _REGISTRY.run(name, func, *args, **kwargs)
