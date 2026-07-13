"""준스키타운 FastAPI 진입점."""

from __future__ import annotations

import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings
from .database import MigrationError, check_database, initialize_database


def create_app(settings: Settings | None = None) -> FastAPI:
    """테스트와 운영이 동일한 초기화 경로를 사용하도록 앱을 생성한다."""

    resolved_settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings.upload_dir.mkdir(parents=True, exist_ok=True)
        initialize_database(app.state.settings.db_path)
        yield

    app = FastAPI(
        title="준스키타운 API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings

    if resolved_settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(resolved_settings.allowed_origins),
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Content-Type"],
        )

    @app.get("/api/health", tags=["system"], response_model=None)
    def health(request: Request) -> JSONResponse:
        try:
            check_database(request.app.state.settings.db_path)
        except (MigrationError, OSError, sqlite3.Error):
            return JSONResponse(
                status_code=503,
                content={"status": "unhealthy", "database": "unavailable"},
            )
        return JSONResponse(
            status_code=200,
            content={"status": "ok", "database": "connected"},
        )

    return app


app = create_app()
