"""Entry point for ``python -m echofield``."""

from __future__ import annotations

import uvicorn

from echofield.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "echofield.server:app",
        host="0.0.0.0",
        port=settings.API_PORT,
        reload=settings.DEMO_MODE,
    )


if __name__ == "__main__":
    main()
