"""인증된 관리자 API용 SQLite 저장소."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from .database import connect
from .repository import (
    CATEGORIES,
    _date_label,
    _notice_files_by_id,
    _notice_from_row,
    get_discount_config,
)
from .schemas import (
    AdminCatalogItemInput,
    AdminCatalogItemUpdate,
    AdminInquiryUpdate,
    AdminNoticeInput,
    DiscountConfigOut,
)


def _page_result(items: list[dict[str, Any]], page: int, page_size: int, total: int) -> dict[str, Any]:
    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": max(1, math.ceil(total / page_size)),
    }


def list_admin_notices(db_path: Path, page: int, page_size: int, query: str) -> dict[str, Any]:
    where = ""
    params: list[Any] = []
    if query:
        where = "WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\'"
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        params.extend([f"%{escaped}%", f"%{escaped}%"])
    offset = (page - 1) * page_size
    with connect(db_path) as connection:
        total = int(connection.execute(f"SELECT COUNT(*) FROM notices {where}", params).fetchone()[0])
        rows = connection.execute(
            f"""
            SELECT id, tag, title, body, pinned, published_at
            FROM notices {where}
            ORDER BY pinned DESC, published_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            [*params, page_size, offset],
        ).fetchall()
        files_by_id = _notice_files_by_id(connection, [int(row["id"]) for row in rows])
    return _page_result(
        [_notice_from_row(row, files_by_id[int(row["id"])]) for row in rows],
        page,
        page_size,
        total,
    )


def create_notice(db_path: Path, payload: AdminNoticeInput) -> dict[str, Any]:
    with connect(db_path) as connection:
        cursor = connection.execute(
            "INSERT INTO notices (tag, title, body, pinned) VALUES (?, ?, ?, ?)",
            (payload.tag or "공지", payload.title, payload.body, int(payload.pinned)),
        )
        notice_id = int(cursor.lastrowid)
        row = connection.execute(
            "SELECT id, tag, title, body, pinned, published_at FROM notices WHERE id = ?",
            (notice_id,),
        ).fetchone()
    return _notice_from_row(row, [])


def update_notice(db_path: Path, notice_id: int, payload: AdminNoticeInput) -> dict[str, Any] | None:
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            UPDATE notices SET tag = ?, title = ?, body = ?, pinned = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (payload.tag or "공지", payload.title, payload.body, int(payload.pinned), notice_id),
        )
        if cursor.rowcount == 0:
            return None
        row = connection.execute(
            "SELECT id, tag, title, body, pinned, published_at FROM notices WHERE id = ?",
            (notice_id,),
        ).fetchone()
        files = _notice_files_by_id(connection, [notice_id])[notice_id]
    return _notice_from_row(row, files)


def _catalog_item(row: Any) -> dict[str, Any]:
    return {
        "id": row["item_id"],
        "name": row["name"],
        "desc": row["description"],
        "price": int(row["price"]),
        "discountGeneral": int(row["discount_general"]),
        "discountAffiliate": int(row["discount_affiliate"]),
        "hidden": bool(row["hidden"]),
    }


def get_admin_catalog(db_path: Path) -> dict[str, list[dict[str, Any]]]:
    catalog: dict[str, list[dict[str, Any]]] = {category: [] for category in CATEGORIES}
    with connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT category, item_id, name, description, price,
                   discount_general, discount_affiliate, hidden
            FROM catalog_items ORDER BY category, sort_order, item_id
            """
        ).fetchall()
    for row in rows:
        catalog[row["category"]].append(_catalog_item(row))
    return catalog


def create_catalog_item(db_path: Path, category: str, payload: AdminCatalogItemInput) -> dict[str, Any]:
    with connect(db_path) as connection:
        sort_order = int(
            connection.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM catalog_items WHERE category = ?",
                (category,),
            ).fetchone()[0]
        )
        connection.execute(
            """
            INSERT INTO catalog_items (
                category, item_id, name, description, price, discount_general,
                discount_affiliate, sort_order, hidden
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                category, payload.id, payload.name, payload.desc, payload.price,
                payload.discountGeneral, payload.discountAffiliate, sort_order, int(payload.hidden),
            ),
        )
        row = connection.execute(
            """
            SELECT item_id, name, description, price, discount_general,
                   discount_affiliate, hidden
            FROM catalog_items WHERE category = ? AND item_id = ?
            """,
            (category, payload.id),
        ).fetchone()
    return _catalog_item(row)


def update_catalog_item(
    db_path: Path,
    category: str,
    item_id: str,
    payload: AdminCatalogItemUpdate,
) -> dict[str, Any] | None:
    with connect(db_path) as connection:
        cursor = connection.execute(
            """
            UPDATE catalog_items SET name = ?, description = ?, price = ?,
                discount_general = ?, discount_affiliate = ?, hidden = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE category = ? AND item_id = ?
            """,
            (
                payload.name, payload.desc, payload.price, payload.discountGeneral,
                payload.discountAffiliate, int(payload.hidden), category, item_id,
            ),
        )
        if cursor.rowcount == 0:
            return None
        row = connection.execute(
            """
            SELECT item_id, name, description, price, discount_general,
                   discount_affiliate, hidden
            FROM catalog_items WHERE category = ? AND item_id = ?
            """,
            (category, item_id),
        ).fetchone()
    return _catalog_item(row)


def delete_catalog_item(db_path: Path, category: str, item_id: str) -> bool:
    with connect(db_path) as connection:
        return connection.execute(
            "DELETE FROM catalog_items WHERE category = ? AND item_id = ?",
            (category, item_id),
        ).rowcount > 0


def reorder_catalog(db_path: Path, category: str, item_ids: list[str]) -> bool:
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        current_ids = {
            row["item_id"]
            for row in connection.execute(
                "SELECT item_id FROM catalog_items WHERE category = ?",
                (category,),
            ).fetchall()
        }
        if current_ids != set(item_ids):
            return False
        connection.executemany(
            """
            UPDATE catalog_items SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
            WHERE category = ? AND item_id = ?
            """,
            [(index, category, item_id) for index, item_id in enumerate(item_ids)],
        )
    return True


def save_discount_config(db_path: Path, payload: DiscountConfigOut) -> dict[str, Any]:
    keywords_json = json.dumps(payload.keywords, ensure_ascii=False, separators=(",", ":"))
    with connect(db_path) as connection:
        for group, rule in (("general", payload.general), ("affiliate", payload.affiliate)):
            connection.execute(
                """
                INSERT INTO discount_config (
                    discount_group, enabled, discount_type, value, keywords_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(discount_group) DO UPDATE SET
                    enabled = excluded.enabled,
                    discount_type = excluded.discount_type,
                    value = excluded.value,
                    keywords_json = excluded.keywords_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (group, int(rule.enabled), rule.type, rule.value, keywords_json if group == "affiliate" else "[]"),
            )
    return get_discount_config(db_path)


def _admin_inquiry(row: Any) -> dict[str, Any]:
    estimate = None
    if row["estimate_json"]:
        try:
            estimate = json.loads(row["estimate_json"])
        except json.JSONDecodeError:
            estimate = None
    return {
        "id": int(row["id"]),
        "title": row["title"],
        "content": row["content"],
        "name": row["name"],
        "contact": row["contact"],
        "email": row["email"],
        "secret": bool(row["secret"]),
        "status": row["status"],
        "answer": row["answer"],
        "estimate": estimate,
        "date": _date_label(row["created_at"]),
        "answeredAt": row["answered_at"],
    }


def list_admin_inquiries(
    db_path: Path,
    page: int,
    page_size: int,
    status: str | None,
    query: str,
) -> dict[str, Any]:
    clauses: list[str] = []
    params: list[Any] = []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        clauses.append("(title LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR contact LIKE ? ESCAPE '\\')")
        params.extend([f"%{escaped}%"] * 3)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    offset = (page - 1) * page_size
    columns = "id, title, content, name, contact, email, secret, status, answer, estimate_json, created_at, answered_at"
    with connect(db_path) as connection:
        total = int(connection.execute(f"SELECT COUNT(*) FROM inquiries {where}", params).fetchone()[0])
        rows = connection.execute(
            f"SELECT {columns} FROM inquiries {where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
            [*params, page_size, offset],
        ).fetchall()
    return _page_result([_admin_inquiry(row) for row in rows], page, page_size, total)


def get_admin_inquiry(db_path: Path, inquiry_id: int) -> dict[str, Any] | None:
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT id, title, content, name, contact, email, secret, status,
                   answer, estimate_json, created_at, answered_at
            FROM inquiries WHERE id = ?
            """,
            (inquiry_id,),
        ).fetchone()
    return _admin_inquiry(row) if row else None


def update_inquiry(
    db_path: Path,
    inquiry_id: int,
    payload: AdminInquiryUpdate,
) -> dict[str, Any] | None:
    answered_at = "CURRENT_TIMESTAMP" if payload.status == "답변완료" else "NULL"
    with connect(db_path) as connection:
        cursor = connection.execute(
            f"""
            UPDATE inquiries SET answer = ?, status = ?, answered_at = {answered_at},
                updated_at = CURRENT_TIMESTAMP WHERE id = ?
            """,
            (payload.answer, payload.status, inquiry_id),
        )
        if cursor.rowcount == 0:
            return None
    return get_admin_inquiry(db_path, inquiry_id)


def delete_inquiry(db_path: Path, inquiry_id: int) -> bool:
    with connect(db_path) as connection:
        return connection.execute("DELETE FROM inquiries WHERE id = ?", (inquiry_id,)).rowcount > 0
