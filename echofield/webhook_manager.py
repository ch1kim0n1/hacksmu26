"""Webhook registration and event delivery."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx


class WebhookManager:
    def __init__(self, persist_path: str | Path) -> None:
        self.persist_path = Path(persist_path)
        self.persist_path.parent.mkdir(parents=True, exist_ok=True)
        self._webhooks: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if not self.persist_path.exists():
            return
        try:
            payload = json.loads(self.persist_path.read_text(encoding="utf-8"))
            items = payload.get("webhooks", []) if isinstance(payload, dict) else []
            self._webhooks = {str(item["id"]): item for item in items if isinstance(item, dict) and item.get("id")}
        except Exception:
            self._webhooks = {}

    def _save(self) -> None:
        self.persist_path.write_text(
            json.dumps({"version": 1, "webhooks": list(self._webhooks.values())}, indent=2, default=str),
            encoding="utf-8",
        )

    def register(self, url: str, event_type: str) -> dict[str, Any]:
        webhook_id = uuid.uuid4().hex
        config = {
            "id": webhook_id,
            "url": url,
            "event_type": event_type,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self._webhooks[webhook_id] = config
        self._save()
        return config

    def list(self) -> list[dict[str, Any]]:
        return list(self._webhooks.values())

    def delete(self, webhook_id: str) -> bool:
        removed = self._webhooks.pop(webhook_id, None)
        if removed is not None:
            self._save()
            return True
        return False

    async def emit(self, event_type: str, payload: dict[str, Any]) -> None:
        targets = [webhook for webhook in self._webhooks.values() if webhook.get("event_type") == event_type]
        if not targets:
            return
        await asyncio.gather(
            *(self._deliver(webhook, {"event_type": event_type, **payload}) for webhook in targets),
            return_exceptions=True,
        )

    async def _deliver(self, webhook: dict[str, Any], payload: dict[str, Any]) -> None:
        url = str(webhook["url"])
        async with httpx.AsyncClient(timeout=5.0) as client:
            for attempt in range(3):
                try:
                    response = await client.post(url, json=payload)
                    if 200 <= response.status_code < 300:
                        return
                except httpx.HTTPError:
                    pass
                if attempt < 2:
                    await asyncio.sleep(0.5 * (2 ** attempt))
