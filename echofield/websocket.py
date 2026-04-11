"""WebSocket connection manager for real-time processing updates."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._recording_connections: dict[str, set[WebSocket]] = {}
        self._global_connections: set[WebSocket] = set()
        self._sequences: dict[str, int] = {}

    async def connect_recording(self, websocket: WebSocket, recording_id: str) -> None:
        await websocket.accept()
        self._recording_connections.setdefault(recording_id, set()).add(websocket)

    async def connect_global(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._global_connections.add(websocket)

    def disconnect_recording(self, websocket: WebSocket, recording_id: str) -> None:
        peers = self._recording_connections.get(recording_id)
        if not peers:
            return
        peers.discard(websocket)
        if not peers:
            self._recording_connections.pop(recording_id, None)

    def disconnect_global(self, websocket: WebSocket) -> None:
        self._global_connections.discard(websocket)

    def _message(self, recording_id: str, event_type: str, data: dict[str, Any]) -> dict[str, Any]:
        sequence = self._sequences.get(recording_id, 0) + 1
        self._sequences[recording_id] = sequence
        return {
            "type": event_type,
            "recording_id": recording_id,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "sequence": sequence,
        }

    async def broadcast(self, recording_id: str, event_type: str, data: dict[str, Any]) -> None:
        message = self._message(recording_id, event_type, data)
        dead_recording: list[WebSocket] = []
        for websocket in self._recording_connections.get(recording_id, set()):
            try:
                await websocket.send_json(message)
            except Exception:
                dead_recording.append(websocket)
        for websocket in dead_recording:
            self.disconnect_recording(websocket, recording_id)

        dead_global: list[WebSocket] = []
        for websocket in self._global_connections:
            try:
                await websocket.send_json(message)
            except Exception:
                dead_global.append(websocket)
        for websocket in dead_global:
            self.disconnect_global(websocket)

    async def send_processing_started(self, recording_id: str, method: str) -> None:
        await self.broadcast(
            recording_id,
            "PROCESSING_STARTED",
            {"recording_id": recording_id, "method": method},
        )

    async def send_stage_update(
        self,
        recording_id: str,
        stage: str,
        status: str,
        progress: int,
        extra: dict[str, Any] | None = None,
    ) -> None:
        payload = {"stage": stage, "status": status, "progress": progress}
        if extra:
            payload.update(extra)
        await self.broadcast(recording_id, "STAGE_UPDATE", payload)

    async def send_noise_classified(self, recording_id: str, noise_type: str, confidence: float, frequency_range: list[float]) -> None:
        await self.broadcast(
            recording_id,
            "NOISE_CLASSIFIED",
            {
                "noise_type": noise_type,
                "confidence": confidence,
                "frequency_range": frequency_range,
            },
        )

    async def send_spectrogram_update(self, recording_id: str, spectrogram_url: str, variant: str) -> None:
        await self.broadcast(
            recording_id,
            "SPECTROGRAM_UPDATE",
            {"spectrogram_url": spectrogram_url, "variant": variant},
        )

    async def send_quality_score(self, recording_id: str, metrics: dict[str, Any]) -> None:
        payload = dict(metrics)
        payload.setdefault("snr_before", metrics.get("snr_before_db"))
        payload.setdefault("snr_after", metrics.get("snr_after_db"))
        payload.setdefault("improvement", metrics.get("snr_improvement_db"))
        payload.setdefault("score", metrics.get("quality_score"))
        await self.broadcast(recording_id, "QUALITY_SCORE", payload)

    async def send_processing_complete(self, recording_id: str, result: dict[str, Any]) -> None:
        await self.broadcast(recording_id, "PROCESSING_COMPLETE", result)

    async def send_processing_failed(self, recording_id: str, error: str) -> None:
        await self.broadcast(recording_id, "PROCESSING_FAILED", {"error": error})

    async def heartbeat(self, websocket: WebSocket) -> None:
        while True:
            await asyncio.sleep(15)
            await websocket.send_json(
                {
                    "type": "PING",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )


manager = ConnectionManager()
