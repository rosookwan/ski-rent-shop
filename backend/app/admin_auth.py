"""관리자 계정, 로그인 제한, 서버 세션 처리."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .database import connect
from .security import hash_password, verify_password


SESSION_COOKIE_NAME = "jst_admin_session"
SESSION_HOURS = 12
LOGIN_WINDOW_MINUTES = 15
LOGIN_BLOCK_MINUTES = 15
LOGIN_FAILURE_LIMIT = 5
DUMMY_PASSWORD_HASH = hash_password("not-a-real-admin-password")


@dataclass(frozen=True, slots=True)
class AdminIdentity:
    admin_id: int
    login_id: str
    expires_at: str


def _timestamp(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S")


def _now() -> datetime:
    return datetime.now(UTC)


def _subject_hash(scope: str, value: str) -> str:
    return hashlib.sha256(f"{scope}:{value}".encode("utf-8")).hexdigest()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _normalized_login_id(login_id: str) -> str:
    return login_id.strip().lower()


def _attempt_keys(login_id: str, ip_address: str) -> tuple[tuple[str, str], ...]:
    return (
        ("account", _subject_hash("account", _normalized_login_id(login_id))),
        ("ip", _subject_hash("ip", ip_address or "unknown")),
    )


def _is_blocked(
    connection: sqlite3.Connection,
    keys: tuple[tuple[str, str], ...],
    now_text: str,
) -> bool:
    return any(
        connection.execute(
            """
            SELECT 1 FROM admin_login_attempts
            WHERE scope = ? AND subject_hash = ?
              AND blocked_until IS NOT NULL AND blocked_until > ?
            """,
            (scope, subject_hash, now_text),
        ).fetchone()
        for scope, subject_hash in keys
    )


def _record_failures(
    connection: sqlite3.Connection,
    keys: tuple[tuple[str, str], ...],
    now: datetime,
) -> bool:
    now_text = _timestamp(now)
    window_start = now - timedelta(minutes=LOGIN_WINDOW_MINUTES)
    blocked = False
    for scope, subject_hash in keys:
        row = connection.execute(
            """
            SELECT failure_count, window_started_at, blocked_until
            FROM admin_login_attempts
            WHERE scope = ? AND subject_hash = ?
            """,
            (scope, subject_hash),
        ).fetchone()
        if row and row["blocked_until"] and row["blocked_until"] > now_text:
            blocked = True
            continue

        if row and row["window_started_at"] > _timestamp(window_start):
            failure_count = int(row["failure_count"]) + 1
            started_at = row["window_started_at"]
        else:
            failure_count = 1
            started_at = now_text

        blocked_until = None
        if failure_count >= LOGIN_FAILURE_LIMIT:
            blocked_until = _timestamp(now + timedelta(minutes=LOGIN_BLOCK_MINUTES))
            blocked = True

        connection.execute(
            """
            INSERT INTO admin_login_attempts (
                scope, subject_hash, failure_count, window_started_at,
                blocked_until, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(scope, subject_hash) DO UPDATE SET
                failure_count = excluded.failure_count,
                window_started_at = excluded.window_started_at,
                blocked_until = excluded.blocked_until,
                updated_at = excluded.updated_at
            """,
            (scope, subject_hash, failure_count, started_at, blocked_until, now_text),
        )
    return blocked


def authenticate_admin(
    db_path: Path,
    login_id: str,
    password: str,
    ip_address: str,
    user_agent: str,
) -> tuple[str, AdminIdentity] | None:
    """자격 증명을 확인하고 원문 토큰은 호출자에게 한 번만 반환한다."""

    now = _now()
    now_text = _timestamp(now)
    keys = _attempt_keys(login_id, ip_address)
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        if _is_blocked(connection, keys, now_text):
            raise LoginRateLimited

        row = connection.execute(
            "SELECT id, login_id, password_hash FROM admins WHERE login_id = ? AND active = 1",
            (_normalized_login_id(login_id),),
        ).fetchone()
        password_hash = row["password_hash"] if row else DUMMY_PASSWORD_HASH
        if not verify_password(password, password_hash):
            if _record_failures(connection, keys, now):
                connection.commit()
                raise LoginRateLimited
            return None

        connection.executemany(
            "DELETE FROM admin_login_attempts WHERE scope = ? AND subject_hash = ?",
            keys,
        )
        connection.execute("DELETE FROM admin_sessions WHERE expires_at <= ?", (now_text,))
        token = secrets.token_urlsafe(32)
        expires_at = _timestamp(now + timedelta(hours=SESSION_HOURS))
        connection.execute(
            """
            INSERT INTO admin_sessions (
                admin_id, token_hash, expires_at, ip_address, user_agent
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                int(row["id"]),
                _token_hash(token),
                expires_at,
                (ip_address or "")[:100],
                (user_agent or "")[:500],
            ),
        )
    return token, AdminIdentity(int(row["id"]), row["login_id"], expires_at)


def get_admin_identity(db_path: Path, token: str | None) -> AdminIdentity | None:
    if not token:
        return None
    now_text = _timestamp(_now())
    token_digest = _token_hash(token)
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT s.id AS session_id, s.admin_id, s.expires_at, a.login_id
            FROM admin_sessions AS s
            JOIN admins AS a ON a.id = s.admin_id
            WHERE s.token_hash = ? AND s.expires_at > ? AND a.active = 1
            """,
            (token_digest, now_text),
        ).fetchone()
        if not row:
            connection.execute("DELETE FROM admin_sessions WHERE token_hash = ?", (token_digest,))
            return None
        connection.execute(
            "UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?",
            (now_text, int(row["session_id"])),
        )
    return AdminIdentity(int(row["admin_id"]), row["login_id"], row["expires_at"])


def revoke_admin_session(db_path: Path, token: str | None) -> None:
    if not token:
        return
    with connect(db_path) as connection:
        connection.execute("DELETE FROM admin_sessions WHERE token_hash = ?", (_token_hash(token),))


class LoginRateLimited(RuntimeError):
    pass


class AdminAccountExists(ValueError):
    pass


class AdminAccountNotFound(LookupError):
    pass


def create_admin(db_path: Path, login_id: str, password: str) -> None:
    normalized = _normalized_login_id(login_id)
    if not normalized:
        raise ValueError("관리자 아이디를 입력해주세요.")
    if len(normalized) > 80:
        raise ValueError("관리자 아이디는 80자 이하여야 합니다.")
    _validate_admin_password(password)
    with connect(db_path) as connection:
        exists = connection.execute(
            "SELECT 1 FROM admins WHERE login_id = ?",
            (normalized,),
        ).fetchone()
        if exists:
            raise AdminAccountExists("이미 사용 중인 관리자 아이디입니다.")
        connection.execute(
            "INSERT INTO admins (login_id, password_hash) VALUES (?, ?)",
            (normalized, hash_password(password)),
        )


def change_admin_password(db_path: Path, login_id: str, password: str) -> None:
    normalized = _normalized_login_id(login_id)
    _validate_admin_password(password)
    with connect(db_path) as connection:
        row = connection.execute("SELECT id FROM admins WHERE login_id = ?", (normalized,)).fetchone()
        if not row:
            raise AdminAccountNotFound("관리자 계정을 찾을 수 없습니다.")
        connection.execute(
            "UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (hash_password(password), int(row["id"])),
        )
        connection.execute("DELETE FROM admin_sessions WHERE admin_id = ?", (int(row["id"]),))


def _validate_admin_password(password: str) -> None:
    if len(password) < 10:
        raise ValueError("관리자 비밀번호는 10자 이상이어야 합니다.")
    if len(password) > 128:
        raise ValueError("관리자 비밀번호는 128자 이하여야 합니다.")
