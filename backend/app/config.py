"""환경변수 기반 애플리케이션 설정."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _path_from_env(name: str, default: Path) -> Path:
    raw_value = os.getenv(name)
    if not raw_value:
        return default

    path = Path(raw_value).expanduser()
    if not path.is_absolute():
        path = BACKEND_ROOT / path
    return path.resolve()


def _origins_from_env() -> tuple[str, ...]:
    raw_value = os.getenv(
        "JST_ALLOWED_ORIGINS",
        "http://localhost:8080,http://127.0.0.1:8080",
    )
    origins = tuple(origin.strip().rstrip("/") for origin in raw_value.split(",") if origin.strip())
    return tuple(dict.fromkeys(origins))


@dataclass(frozen=True, slots=True)
class Settings:
    """실행에 필요한 경로와 브라우저 Origin 설정."""

    db_path: Path
    upload_dir: Path
    allowed_origins: tuple[str, ...]

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            db_path=_path_from_env("JST_DB_PATH", BACKEND_ROOT / "data" / "junski.db"),
            upload_dir=_path_from_env("JST_UPLOAD_DIR", BACKEND_ROOT / "uploads"),
            allowed_origins=_origins_from_env(),
        )
