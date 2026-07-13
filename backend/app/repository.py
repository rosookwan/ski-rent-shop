"""공용 API용 SQLite 저장소와 UI 응답 변환."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from .database import connect
from .schemas import InquiryCreate
from .security import hash_password, verify_password


CATEGORIES = ("lift", "equipment", "clothing", "safety")


class InquiryNotFound(LookupError):
    pass


class InquiryPasswordRequired(PermissionError):
    pass


class InquiryPasswordInvalid(PermissionError):
    pass


def _date_label(value: str) -> str:
    return value[:10].replace("-", ".")


def _page_result(items: list[dict[str, Any]], page: int, page_size: int, total: int) -> dict[str, Any]:
    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": max(1, math.ceil(total / page_size)),
    }


def _notice_file_from_row(row: Any) -> dict[str, Any]:
    notice_id = int(row["notice_id"])
    file_id = int(row["id"])
    return {
        "id": file_id,
        "name": row["original_name"],
        "size": int(row["size_bytes"]),
        "mimeType": row["mime_type"],
        "downloadUrl": f"/api/notices/{notice_id}/files/{file_id}",
    }


def _notice_files_by_id(connection: Any, notice_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    files: dict[int, list[dict[str, Any]]] = {notice_id: [] for notice_id in notice_ids}
    if not notice_ids:
        return files
    placeholders = ",".join("?" for _ in notice_ids)
    rows = connection.execute(
        f"""
        SELECT id, notice_id, original_name, mime_type, size_bytes
        FROM notice_files WHERE notice_id IN ({placeholders})
        ORDER BY id
        """,
        notice_ids,
    ).fetchall()
    for row in rows:
        files[int(row["notice_id"])].append(_notice_file_from_row(row))
    return files


def _notice_from_row(row: Any, files: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "tag": row["tag"],
        "title": row["title"],
        "date": _date_label(row["published_at"]),
        "body": row["body"],
        "pinned": bool(row["pinned"]),
        "files": files or [],
    }


def list_notices(db_path: Path, page: int, page_size: int) -> dict[str, Any]:
    offset = (page - 1) * page_size
    with connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM notices").fetchone()[0])
        rows = connection.execute(
            """
            SELECT id, tag, title, body, pinned, published_at
            FROM notices
            ORDER BY pinned DESC, published_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (page_size, offset),
        ).fetchall()
        files_by_id = _notice_files_by_id(connection, [int(row["id"]) for row in rows])
    return _page_result(
        [_notice_from_row(row, files_by_id[int(row["id"])]) for row in rows],
        page,
        page_size,
        total,
    )


def get_notice(db_path: Path, notice_id: int) -> dict[str, Any] | None:
    with connect(db_path) as connection:
        row = connection.execute(
            "SELECT id, tag, title, body, pinned, published_at FROM notices WHERE id = ?",
            (notice_id,),
        ).fetchone()
        files = _notice_files_by_id(connection, [notice_id])[notice_id] if row else []
    return _notice_from_row(row, files) if row else None


def get_catalog(db_path: Path) -> dict[str, list[dict[str, Any]]]:
    catalog: dict[str, list[dict[str, Any]]] = {category: [] for category in CATEGORIES}
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT category, item_id, name, description, price,
                   discount_general, discount_affiliate, hidden
            FROM catalog_items
            WHERE hidden = 0
            ORDER BY category, sort_order, item_id
            """
        ).fetchall()

    for row in rows:
        catalog[row["category"]].append(
            {
                "id": row["item_id"],
                "name": row["name"],
                "desc": row["description"],
                "price": int(row["price"]),
                "discountGeneral": int(row["discount_general"]),
                "discountAffiliate": int(row["discount_affiliate"]),
                "hidden": False,
            }
        )
    return catalog


def get_discount_config(db_path: Path) -> dict[str, Any]:
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT discount_group, enabled, discount_type, value, keywords_json
            FROM discount_config
            WHERE discount_group IN ('general', 'affiliate')
            """
        ).fetchall()

    rules = {row["discount_group"]: row for row in rows}

    def rule(name: str) -> dict[str, Any]:
        row = rules.get(name)
        if not row:
            return {"enabled": False, "type": "percent", "value": 0}
        return {
            "enabled": bool(row["enabled"]),
            "type": row["discount_type"],
            "value": int(row["value"]),
        }

    affiliate = rules.get("affiliate")
    try:
        keywords = json.loads(affiliate["keywords_json"]) if affiliate else []
    except (TypeError, json.JSONDecodeError):
        keywords = []
    keywords = [str(keyword) for keyword in keywords if str(keyword).strip()]

    return {
        "general": rule("general"),
        "affiliate": rule("affiliate"),
        "keywords": keywords,
    }


def mask_name(name: str) -> str:
    chars = list(name.strip())
    if len(chars) <= 1:
        return "".join(chars)
    if len(chars) == 2:
        return chars[0] + "*"
    return chars[0] + ("*" * (len(chars) - 2)) + chars[-1]


def _inquiry_summary_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "title": row["title"],
        "date": _date_label(row["created_at"]),
        "status": row["status"],
        "secret": bool(row["secret"]),
        "name": mask_name(row["name"]),
    }


def _inquiry_detail_from_row(row: Any) -> dict[str, Any]:
    return {
        **_inquiry_summary_from_row(row),
        "content": row["content"],
        "answer": row["answer"],
    }


def list_inquiries(db_path: Path, page: int, page_size: int) -> dict[str, Any]:
    offset = (page - 1) * page_size
    with connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM inquiries").fetchone()[0])
        rows = connection.execute(
            """
            SELECT id, title, name, status, secret, created_at
            FROM inquiries
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (page_size, offset),
        ).fetchall()
    return _page_result([_inquiry_summary_from_row(row) for row in rows], page, page_size, total)


def create_inquiry(db_path: Path, payload: InquiryCreate) -> dict[str, Any]:
    password_hash = hash_password(payload.password) if payload.secret else None
    estimate_json = None
    if payload.estimate is not None:
        estimate_json = json.dumps(
            payload.estimate.model_dump(mode="json"),
            ensure_ascii=False,
            separators=(",", ":"),
        )

    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO inquiries (
                title, content, name, contact, email, secret, password_hash,
                status, answer, estimate_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, '답변대기', '', ?)
            """,
            (
                payload.title,
                payload.content,
                payload.name,
                payload.contact,
                payload.email,
                int(payload.secret),
                password_hash,
                estimate_json,
            ),
        )
        inquiry_id = int(cursor.lastrowid)
        created_at = connection.execute(
            "SELECT created_at FROM inquiries WHERE id = ?",
            (inquiry_id,),
        ).fetchone()["created_at"]

    return {
        "id": inquiry_id,
        "date": _date_label(created_at),
        "status": "답변대기",
    }


def get_public_inquiry(
    db_path: Path,
    inquiry_id: int,
    password: str | None = None,
) -> dict[str, Any]:
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT id, title, content, name, status, secret, password_hash,
                   answer, created_at
            FROM inquiries
            WHERE id = ?
            """,
            (inquiry_id,),
        ).fetchone()

    if not row:
        raise InquiryNotFound
    if row["secret"] and password is None:
        raise InquiryPasswordRequired
    if row["secret"] and not verify_password(password or "", row["password_hash"]):
        raise InquiryPasswordInvalid
    return _inquiry_detail_from_row(row)
