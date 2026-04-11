"""Lightweight Prometheus metrics for EchoField."""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import DefaultDict


class MetricsRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: DefaultDict[tuple[str, tuple[tuple[str, str], ...]], float] = defaultdict(float)
        self._gauges: dict[tuple[str, tuple[tuple[str, str], ...]], float] = {}
        self._sums: DefaultDict[tuple[str, tuple[tuple[str, str], ...]], float] = defaultdict(float)
        self._counts: DefaultDict[tuple[str, tuple[tuple[str, str], ...]], int] = defaultdict(int)
        self.started_at = time.time()

    @staticmethod
    def _labels(labels: dict[str, str] | None) -> tuple[tuple[str, str], ...]:
        return tuple(sorted((labels or {}).items()))

    def inc(self, name: str, value: float = 1.0, labels: dict[str, str] | None = None) -> None:
        with self._lock:
            self._counters[(name, self._labels(labels))] += value

    def set_gauge(self, name: str, value: float, labels: dict[str, str] | None = None) -> None:
        with self._lock:
            self._gauges[(name, self._labels(labels))] = value

    def observe(self, name: str, value: float, labels: dict[str, str] | None = None) -> None:
        key = (name, self._labels(labels))
        with self._lock:
            self._sums[key] += value
            self._counts[key] += 1

    @staticmethod
    def _format_labels(labels: tuple[tuple[str, str], ...]) -> str:
        if not labels:
            return ""
        escaped = ",".join(f'{key}="{value.replace(chr(34), chr(92) + chr(34))}"' for key, value in labels)
        return "{" + escaped + "}"

    def render_prometheus(self) -> str:
        lines = [
            "# HELP echofield_build_info Static EchoField app info.",
            "# TYPE echofield_build_info gauge",
            'echofield_build_info{app="echofield"} 1',
            "# HELP echofield_process_uptime_seconds EchoField process uptime.",
            "# TYPE echofield_process_uptime_seconds gauge",
            f"echofield_process_uptime_seconds {time.time() - self.started_at:.6f}",
        ]
        with self._lock:
            counters = dict(self._counters)
            gauges = dict(self._gauges)
            sums = dict(self._sums)
            counts = dict(self._counts)
        for (name, labels), value in sorted(counters.items()):
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name}{self._format_labels(labels)} {value:.6f}")
        for (name, labels), value in sorted(gauges.items()):
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{name}{self._format_labels(labels)} {value:.6f}")
        for (name, labels), value in sorted(sums.items()):
            lines.append(f"# TYPE {name} summary")
            label_text = self._format_labels(labels)
            lines.append(f"{name}_sum{label_text} {value:.6f}")
            lines.append(f"{name}_count{label_text} {counts[(name, labels)]}")
        return "\n".join(lines) + "\n"


metrics = MetricsRegistry()

CUSTOM_METRIC_NAMES = (
    "echofield_http_requests_total",
    "echofield_http_request_duration_seconds",
    "echofield_pipeline_stage_duration_seconds",
    "echofield_pipeline_active_jobs",
    "echofield_pipeline_jobs_total",
    "echofield_cache_hits_total",
    "echofield_cache_misses_total",
    "echofield_ensemble_score",
    "echofield_ensemble_candidates_evaluated",
    "echofield_calls_detected_total",
    "echofield_similarity_cache_hits_total",
    "echofield_similarity_cache_misses_total",
    "echofield_classifier_trains_total",
    "echofield_review_labels_total",
)


def prime_metrics() -> None:
    for name in CUSTOM_METRIC_NAMES:
        if name.endswith("_total"):
            metrics.inc(name, 0.0)
        elif name.endswith("_jobs") or name.endswith("_evaluated"):
            metrics.set_gauge(name, 0.0)
        else:
            metrics.observe(name, 0.0)


prime_metrics()
