"""SQLite 연결, 마이그레이션, 상태 점검."""

from __future__ import annotations

import hashlib
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path


BUSY_TIMEOUT_MS = 5_000
MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
MIGRATION_FILE_PATTERN = re.compile(r"^(?P<version>\d+)_(?P<name>[a-z0-9_]+)\.sql$")


class MigrationError(RuntimeError):
    """마이그레이션 파일이나 적용 상태가 올바르지 않을 때 발생한다."""


@dataclass(frozen=True, slots=True)
class Migration:
    version: int
    name: str
    sql: str
    checksum: str


def connect(db_path: Path) -> sqlite3.Connection:
    """프로젝트 공통 PRAGMA가 적용된 SQLite 연결을 반환한다."""

    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=BUSY_TIMEOUT_MS / 1_000)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def _ensure_migration_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            checksum TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.commit()


def load_migrations(migrations_dir: Path = MIGRATIONS_DIR) -> tuple[Migration, ...]:
    """파일명 버전순으로 검증된 SQL 마이그레이션을 읽는다."""

    if not migrations_dir.is_dir():
        raise MigrationError(f"마이그레이션 디렉터리가 없습니다: {migrations_dir}")

    migrations: list[Migration] = []
    seen_versions: set[int] = set()
    for path in sorted(migrations_dir.glob("*.sql")):
        match = MIGRATION_FILE_PATTERN.fullmatch(path.name)
        if not match:
            raise MigrationError(f"마이그레이션 파일명이 올바르지 않습니다: {path.name}")

        version = int(match.group("version"))
        if version in seen_versions:
            raise MigrationError(f"중복 마이그레이션 버전입니다: {version}")
        seen_versions.add(version)

        sql = path.read_text(encoding="utf-8").strip()
        if not sql:
            raise MigrationError(f"빈 마이그레이션 파일입니다: {path.name}")

        migrations.append(
            Migration(
                version=version,
                name=match.group("name"),
                sql=sql,
                checksum=hashlib.sha256(sql.encode("utf-8")).hexdigest(),
            )
        )

    if not migrations:
        raise MigrationError("적용할 마이그레이션이 없습니다.")
    migrations.sort(key=lambda migration: migration.version)
    return tuple(migrations)


def apply_migrations(db_path: Path, migrations_dir: Path = MIGRATIONS_DIR) -> None:
    """미적용 마이그레이션만 적용하고 기존 파일 변조를 감지한다."""

    migrations = load_migrations(migrations_dir)
    with connect(db_path) as connection:
        _ensure_migration_table(connection)
        applied_rows = connection.execute(
            "SELECT version, name, checksum FROM schema_migrations ORDER BY version"
        ).fetchall()
        applied = {int(row["version"]): row for row in applied_rows}

        known_versions = {migration.version for migration in migrations}
        unknown_versions = sorted(set(applied) - known_versions)
        if unknown_versions:
            raise MigrationError(f"코드에 없는 마이그레이션 버전이 DB에 있습니다: {unknown_versions}")

        for migration in migrations:
            previous = applied.get(migration.version)
            if previous:
                if previous["name"] != migration.name or previous["checksum"] != migration.checksum:
                    raise MigrationError(f"적용된 마이그레이션이 변경되었습니다: {migration.version}")
                continue

            safe_name = migration.name.replace("'", "''")
            script = (
                "BEGIN IMMEDIATE;\n"
                f"{migration.sql}\n"
                "INSERT INTO schema_migrations (version, name, checksum) VALUES "
                f"({migration.version}, '{safe_name}', '{migration.checksum}');\n"
                "COMMIT;"
            )
            try:
                connection.executescript(script)
            except Exception:
                connection.rollback()
                raise


def initialize_database(db_path: Path, migrations_dir: Path = MIGRATIONS_DIR) -> None:
    """DB 디렉터리를 준비하고 최신 스키마까지 적용한다."""

    apply_migrations(db_path, migrations_dir)


def check_database(db_path: Path) -> None:
    """DB 연결과 간단한 읽기를 검증하고 실패 시 예외를 전달한다."""

    with connect(db_path) as connection:
        connection.execute("SELECT 1").fetchone()
        connection.execute("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").fetchone()
