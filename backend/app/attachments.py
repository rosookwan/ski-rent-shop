"""공지 첨부파일 검증, 저장, 삭제와 고아 파일 점검."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from .database import connect


MAX_FILES_PER_NOTICE = 5
MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_TOTAL_SIZE = 25 * 1024 * 1024
READ_CHUNK_SIZE = 64 * 1024
ALLOWED_MIME_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
STORED_NAME_PATTERN = re.compile(r"^[0-9a-f]{32}\.(?:pdf|png|jpg|jpeg|webp)$")


class AttachmentError(RuntimeError):
    pass


class NoticeNotFound(AttachmentError):
    pass


class AttachmentNotFound(AttachmentError):
    pass


class AttachmentValidationError(AttachmentError):
    pass


class AttachmentUnsupported(AttachmentError):
    pass


class AttachmentTooLarge(AttachmentError):
    pass


class AttachmentLimitReached(AttachmentError):
    pass


class AttachmentCleanupError(AttachmentError):
    pass


@dataclass(frozen=True, slots=True)
class UploadAudit:
    orphan_files: tuple[str, ...]
    missing_files: tuple[str, ...]
    deleted_orphans: tuple[str, ...]


def _validate_original_name(filename: str | None) -> tuple[str, str]:
    if not filename or not filename.strip():
        raise AttachmentValidationError("파일 이름이 필요합니다.")
    if len(filename) > 255:
        raise AttachmentValidationError("파일 이름은 255자 이하여야 합니다.")
    if filename in {".", ".."} or "/" in filename or "\\" in filename:
        raise AttachmentValidationError("경로가 포함된 파일 이름은 사용할 수 없습니다.")
    if any(ord(char) < 32 or ord(char) == 127 for char in filename):
        raise AttachmentValidationError("파일 이름에 허용되지 않은 문자가 있습니다.")
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_MIME_BY_EXTENSION:
        raise AttachmentUnsupported("PDF, JPG, PNG, WEBP 파일만 첨부할 수 있습니다.")
    return filename, extension


def _matches_signature(extension: str, header: bytes) -> bool:
    if extension == ".pdf":
        return header.startswith(b"%PDF-")
    if extension == ".png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in {".jpg", ".jpeg"}:
        return header.startswith(b"\xff\xd8\xff")
    if extension == ".webp":
        return len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"WEBP"
    return False


def safe_stored_path(upload_dir: Path, stored_name: str) -> Path:
    """DB 저장명이 업로드 루트 바로 아래의 서버 생성 파일인지 확인한다."""

    if not STORED_NAME_PATTERN.fullmatch(stored_name):
        raise AttachmentCleanupError("저장 파일명이 안전하지 않습니다.")
    root = upload_dir.resolve()
    candidate = root / stored_name
    if candidate.is_symlink() or candidate.resolve().parent != root:
        raise AttachmentCleanupError("업로드 디렉터리 밖의 파일에는 접근할 수 없습니다.")
    return candidate


def _notice_usage(db_path: Path, notice_id: int) -> tuple[int, int]:
    with connect(db_path) as connection:
        notice = connection.execute("SELECT 1 FROM notices WHERE id = ?", (notice_id,)).fetchone()
        if not notice:
            raise NoticeNotFound
        row = connection.execute(
            """
            SELECT COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS total_size
            FROM notice_files WHERE notice_id = ?
            """,
            (notice_id,),
        ).fetchone()
    return int(row["file_count"]), int(row["total_size"])


def _check_usage(file_count: int, total_size: int, new_size: int = 0) -> None:
    if file_count >= MAX_FILES_PER_NOTICE:
        raise AttachmentLimitReached(f"공지 하나에 파일은 최대 {MAX_FILES_PER_NOTICE}개까지 첨부할 수 있습니다.")
    if total_size + new_size > MAX_TOTAL_SIZE:
        raise AttachmentLimitReached("공지 첨부파일 전체 용량은 25MB를 넘을 수 없습니다.")


async def store_notice_file(
    db_path: Path,
    upload_dir: Path,
    notice_id: int,
    upload: UploadFile,
) -> dict[str, object]:
    original_name, extension = _validate_original_name(upload.filename)
    expected_mime = ALLOWED_MIME_BY_EXTENSION[extension]
    if upload.content_type != expected_mime:
        raise AttachmentUnsupported("파일 확장자와 MIME 형식이 일치하지 않습니다.")

    file_count, total_size = _notice_usage(db_path, notice_id)
    _check_usage(file_count, total_size)

    upload_dir.mkdir(parents=True, exist_ok=True)
    identifier = uuid4().hex
    stored_name = f"{identifier}{extension}"
    final_path = safe_stored_path(upload_dir, stored_name)
    temp_path = upload_dir.resolve() / f".{identifier}.upload"
    size = 0
    moved_to_final = False

    try:
        first_chunk = await upload.read(READ_CHUNK_SIZE)
        if not first_chunk or not _matches_signature(extension, first_chunk):
            raise AttachmentUnsupported("파일 내용이 선택한 형식과 일치하지 않습니다.")

        descriptor = os.open(temp_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as target:
            chunk = first_chunk
            while chunk:
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    raise AttachmentTooLarge("첨부파일 한 개는 10MB를 넘을 수 없습니다.")
                target.write(chunk)
                chunk = await upload.read(READ_CHUNK_SIZE)
            target.flush()
            os.fsync(target.fileno())

        with connect(db_path) as connection:
            connection.execute("BEGIN IMMEDIATE")
            notice = connection.execute("SELECT 1 FROM notices WHERE id = ?", (notice_id,)).fetchone()
            if not notice:
                raise NoticeNotFound
            usage = connection.execute(
                """
                SELECT COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS total_size
                FROM notice_files WHERE notice_id = ?
                """,
                (notice_id,),
            ).fetchone()
            _check_usage(int(usage["file_count"]), int(usage["total_size"]), size)
            os.replace(temp_path, final_path)
            moved_to_final = True
            cursor = connection.execute(
                """
                INSERT INTO notice_files (
                    notice_id, stored_name, original_name, mime_type, size_bytes
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (notice_id, stored_name, original_name, expected_mime, size),
            )
            file_id = int(cursor.lastrowid)
            connection.commit()
    except Exception:
        cleanup_path = final_path if moved_to_final else temp_path
        try:
            cleanup_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise

    return {
        "id": file_id,
        "name": original_name,
        "size": size,
        "mimeType": expected_mime,
        "downloadUrl": f"/api/notices/{notice_id}/files/{file_id}",
    }


def get_notice_file(
    db_path: Path,
    upload_dir: Path,
    notice_id: int,
    file_id: int,
) -> tuple[Path, str, str]:
    with connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT stored_name, original_name, mime_type
            FROM notice_files WHERE id = ? AND notice_id = ?
            """,
            (file_id, notice_id),
        ).fetchone()
    if not row:
        raise AttachmentNotFound
    path = safe_stored_path(upload_dir, row["stored_name"])
    if not path.is_file():
        raise AttachmentNotFound
    return path, row["original_name"], row["mime_type"]


def delete_notice_file(db_path: Path, upload_dir: Path, notice_id: int, file_id: int) -> None:
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT stored_name FROM notice_files WHERE id = ? AND notice_id = ?",
            (file_id, notice_id),
        ).fetchone()
        if not row:
            raise AttachmentNotFound
        connection.execute("DELETE FROM notice_files WHERE id = ?", (file_id,))
        connection.commit()
    try:
        safe_stored_path(upload_dir, row["stored_name"]).unlink(missing_ok=True)
    except (OSError, AttachmentCleanupError) as error:
        raise AttachmentCleanupError("첨부 메타데이터는 삭제했지만 실제 파일 정리에 실패했습니다.") from error


def delete_notice_with_files(db_path: Path, upload_dir: Path, notice_id: int) -> bool:
    with connect(db_path) as connection:
        connection.execute("BEGIN IMMEDIATE")
        exists = connection.execute("SELECT 1 FROM notices WHERE id = ?", (notice_id,)).fetchone()
        if not exists:
            return False
        stored_names = [
            row["stored_name"]
            for row in connection.execute(
                "SELECT stored_name FROM notice_files WHERE notice_id = ?",
                (notice_id,),
            ).fetchall()
        ]
        connection.execute("DELETE FROM notices WHERE id = ?", (notice_id,))
        connection.commit()

    failures: list[str] = []
    for stored_name in stored_names:
        try:
            safe_stored_path(upload_dir, stored_name).unlink(missing_ok=True)
        except (OSError, AttachmentCleanupError):
            failures.append(stored_name)
    if failures:
        raise AttachmentCleanupError("공지는 삭제했지만 일부 실제 파일 정리에 실패했습니다.")
    return True


def audit_uploads(db_path: Path, upload_dir: Path, delete_orphans: bool = False) -> UploadAudit:
    upload_dir.mkdir(parents=True, exist_ok=True)
    root = upload_dir.resolve()
    with connect(db_path) as connection:
        stored_names = {
            row["stored_name"]
            for row in connection.execute("SELECT stored_name FROM notice_files").fetchall()
        }

    disk_entries = {entry.name: entry for entry in root.iterdir() if entry.is_file() or entry.is_symlink()}
    orphan_names = tuple(sorted(set(disk_entries) - stored_names))
    missing_names = tuple(sorted(name for name in stored_names if name not in disk_entries))
    deleted: list[str] = []
    if delete_orphans:
        for name in orphan_names:
            entry = disk_entries[name]
            try:
                entry.unlink()
            except OSError:
                continue
            deleted.append(name)
    return UploadAudit(orphan_names, missing_names, tuple(deleted))
