"""WebSocket manager for real-time processing updates."""

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections for real-time processing events."""

    def __init__(self):
        # recording_id -> set of WebSocket connections
        self._recording_connections: dict[str, set[WebSocket]] = {}
        # Global feed connections
        self._global_connections: set[WebSocket] = set()

    async def connect_recording(self, websocket: WebSocket, recording_id: str):
        """Accept and register a per-recording connection."""
        await websocket.accept()
        if recording_id not in self._recording_connections:
            self._recording_connections[recording_id] = set()
        self._recording_connections[recording_id].add(websocket)

    async def connect_global(self, websocket: WebSocket):
        """Accept and register a global feed connection."""
        await websocket.accept()
        self._global_connections.add(websocket)

    def disconnect_recording(self, websocket: WebSocket, recording_id: str):
        """Remove a per-recording connection."""
        if recording_id in self._recording_connections:
            self._recording_connections[recording_id].discard(websocket)
            if not self._recording_connections[recording_id]:
                del self._recording_connections[recording_id]

    def disconnect_global(self, websocket: WebSocket):
        """Remove a global feed connection."""
        self._global_connections.discard(websocket)

    async def broadcast(self, recording_id: str, event_type: str, data: dict[str, Any]):
        """Send event to all subscribers of a recording and global feed."""
        message = {
            "type": event_type,
            "recording_id": recording_id,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        payload = json.dumps(message)

        # Send to recording-specific subscribers
        dead = []
        for ws in self._recording_connections.get(recording_id, set()):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_recording(ws, recording_id)

        # Send to global feed subscribers
        dead = []
        for ws in self._global_connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_global(ws)

    async def send_processing_started(self, recording_id: str):
        await self.broadcast(recording_id, "PROCESSING_STARTED", {
            "recording_id": recording_id,
        })

    async def send_stage_update(self, recording_id: str, stage: str, progress: int):
        await self.broadcast(recording_id, "STAGE_UPDATE", {
            "stage": stage,
            "progress": progress,
        })

    async def send_spectrogram_update(self, recording_id: str, spectrogram_url: str):
        await self.broadcast(recording_id, "SPECTROGRAM_UPDATE", {
            "spectrogram_url": spectrogram_url,
        })

    async def send_noise_classified(self, recording_id: str, noise_type: str, confidence: float):
        await self.broadcast(recording_id, "NOISE_CLASSIFIED", {
            "noise_type": noise_type,
            "confidence": confidence,
        })

    async def send_quality_score(self, recording_id: str, metrics: dict):
        await self.broadcast(recording_id, "QUALITY_SCORE", metrics)

    async def send_processing_complete(self, recording_id: str, result: dict):
        await self.broadcast(recording_id, "PROCESSING_COMPLETE", result)

    async def send_processing_failed(self, recording_id: str, error: str):
        await self.broadcast(recording_id, "PROCESSING_FAILED", {
            "error": error,
        })


# Global singleton
manager = ConnectionManager()
