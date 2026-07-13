from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import cli
from app.admin_auth import create_admin
from app.attachments import audit_uploads
from app.config import Settings
from app.database import connect
from app.main import create_app


PDF_BYTES = b"%PDF-1.4\n% test attachment\n"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"test-png-data"


class NoticeAttachmentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        root = Path(self.temp_dir.name)
        self.settings = Settings(
            db_path=root / "data" / "test.db",
            upload_dir=root / "uploads",
            allowed_origins=("http://localhost:8080",),
        )
        self.app = create_app(self.settings)
        self.client_context = TestClient(self.app, base_url="https://testserver")
        self.client = self.client_context.__enter__()
        self.addCleanup(self.client_context.__exit__, None, None, None)
        self.origin = {"Origin": "http://localhost:8080"}
        create_admin(self.settings.db_path, "operator", "safe-password")
        response = self.client.post(
            "/api/admin/auth/login",
            headers=self.origin,
            json={"loginId": "operator", "password": "safe-password"},
        )
        self.assertEqual(200, response.status_code)

    def upload(
        self,
        filename: str = "시즌 안내.pdf",
        content: bytes = PDF_BYTES,
        mime_type: str = "application/pdf",
        notice_id: int = 1,
    ):
        return self.client.post(
            f"/api/admin/notices/{notice_id}/files",
            headers=self.origin,
            files={"file": (filename, content, mime_type)},
        )

    def test_authenticated_upload_is_publicly_listed_and_downloadable(self) -> None:
        uploaded = self.upload()

        self.assertEqual(201, uploaded.status_code)
        metadata = uploaded.json()
        self.assertEqual("시즌 안내.pdf", metadata["name"])
        self.assertEqual(len(PDF_BYTES), metadata["size"])
        self.assertEqual("application/pdf", metadata["mimeType"])
        with connect(self.settings.db_path) as connection:
            row = connection.execute(
                "SELECT stored_name, original_name, size_bytes FROM notice_files WHERE id = ?",
                (metadata["id"],),
            ).fetchone()
        self.assertRegex(row["stored_name"], r"^[0-9a-f]{32}\.pdf$")
        self.assertNotIn("시즌", row["stored_name"])
        self.assertEqual("시즌 안내.pdf", row["original_name"])
        self.assertTrue((self.settings.upload_dir / row["stored_name"]).is_file())

        public_notice = self.client.get("/api/notices/1").json()
        self.assertEqual([metadata], public_notice["files"])
        public_listing = self.client.get("/api/notices", params={"pageSize": 100}).json()
        listed_notice = next(item for item in public_listing["items"] if item["id"] == 1)
        self.assertEqual([metadata], listed_notice["files"])
        updated_notice = self.client.put(
            "/api/admin/notices/1",
            headers=self.origin,
            json={"tag": "공지", "title": "첨부 유지", "body": "수정 내용", "pinned": False},
        )
        self.assertEqual([metadata], updated_notice.json()["files"])
        with TestClient(
            create_app(self.settings),
            base_url="https://another-browser",
        ) as public_client:
            download = public_client.get(metadata["downloadUrl"])
            self.assertEqual(200, download.status_code)
            self.assertEqual(PDF_BYTES, download.content)
            self.assertEqual("nosniff", download.headers["x-content-type-options"])
            self.assertIn("attachment", download.headers["content-disposition"])

    def test_upload_requires_authentication_and_allowed_origin(self) -> None:
        self.client.cookies.clear()
        unauthenticated = self.upload()
        self.assertEqual(401, unauthenticated.status_code)

        self.client.post(
            "/api/admin/auth/login",
            headers=self.origin,
            json={"loginId": "operator", "password": "safe-password"},
        )
        missing_origin = self.client.post(
            "/api/admin/notices/1/files",
            files={"file": ("notice.pdf", PDF_BYTES, "application/pdf")},
        )
        self.assertEqual(403, missing_origin.status_code)
        self.assertEqual([], list(self.settings.upload_dir.iterdir()))

    def test_extension_mime_signature_and_path_manipulation_are_rejected(self) -> None:
        cases = [
            ("run.exe", b"MZ executable", "application/octet-stream", 415),
            ("fake.pdf", PDF_BYTES, "application/octet-stream", 415),
            ("renamed.pdf", b"MZ executable", "application/pdf", 415),
            ("../escape.pdf", PDF_BYTES, "application/pdf", 400),
            ("folder\\escape.pdf", PDF_BYTES, "application/pdf", 400),
        ]
        for filename, content, mime_type, expected in cases:
            with self.subTest(filename=filename):
                self.assertEqual(expected, self.upload(filename, content, mime_type).status_code)

        with connect(self.settings.db_path) as connection:
            self.assertEqual(0, connection.execute("SELECT COUNT(*) FROM notice_files").fetchone()[0])
        self.assertEqual([], list(self.settings.upload_dir.iterdir()))
        self.assertFalse((Path(self.temp_dir.name) / "escape.pdf").exists())

    def test_individual_total_and_file_count_limits_are_enforced(self) -> None:
        with patch("app.attachments.MAX_FILE_SIZE", len(PDF_BYTES) - 1):
            self.assertEqual(413, self.upload().status_code)
        self.assertEqual([], list(self.settings.upload_dir.iterdir()))

        with patch("app.attachments.MAX_TOTAL_SIZE", len(PDF_BYTES) + len(PNG_BYTES) - 1):
            self.assertEqual(201, self.upload().status_code)
            self.assertEqual(409, self.upload("image.png", PNG_BYTES, "image/png").status_code)

        for index in range(4):
            self.assertEqual(201, self.upload(f"extra-{index}.pdf").status_code)
        self.assertEqual(409, self.upload("sixth.pdf").status_code)
        with connect(self.settings.db_path) as connection:
            self.assertEqual(5, connection.execute("SELECT COUNT(*) FROM notice_files").fetchone()[0])

    def test_file_and_notice_deletion_remove_metadata_and_physical_files(self) -> None:
        first = self.upload().json()
        with connect(self.settings.db_path) as connection:
            first_name = connection.execute(
                "SELECT stored_name FROM notice_files WHERE id = ?",
                (first["id"],),
            ).fetchone()["stored_name"]
        first_path = self.settings.upload_dir / first_name
        self.assertEqual(
            204,
            self.client.delete(
                f"/api/admin/notices/1/files/{first['id']}",
                headers=self.origin,
            ).status_code,
        )
        self.assertFalse(first_path.exists())
        self.assertEqual(404, self.client.get(first["downloadUrl"]).status_code)

        second = self.upload("second.pdf").json()
        with connect(self.settings.db_path) as connection:
            second_name = connection.execute(
                "SELECT stored_name FROM notice_files WHERE id = ?",
                (second["id"],),
            ).fetchone()["stored_name"]
        self.assertEqual(
            204,
            self.client.delete("/api/admin/notices/1", headers=self.origin).status_code,
        )
        self.assertFalse((self.settings.upload_dir / second_name).exists())
        self.assertEqual(404, self.client.get(second["downloadUrl"]).status_code)
        self.assertEqual(404, self.client.get("/api/notices/1").status_code)

    def test_unsafe_stored_path_is_never_downloaded_or_deleted_outside_uploads(self) -> None:
        outside = Path(self.temp_dir.name) / "outside.pdf"
        outside.write_bytes(PDF_BYTES)
        with connect(self.settings.db_path) as connection:
            cursor = connection.execute(
                """
                INSERT INTO notice_files (
                    notice_id, stored_name, original_name, mime_type, size_bytes
                ) VALUES (1, '../outside.pdf', 'outside.pdf', 'application/pdf', ?)
                """,
                (len(PDF_BYTES),),
            )
            file_id = int(cursor.lastrowid)

        self.assertEqual(404, self.client.get(f"/api/notices/1/files/{file_id}").status_code)
        deletion = self.client.delete(
            f"/api/admin/notices/1/files/{file_id}",
            headers=self.origin,
        )
        self.assertEqual(500, deletion.status_code)
        self.assertTrue(outside.is_file())
        with connect(self.settings.db_path) as connection:
            self.assertIsNone(
                connection.execute("SELECT 1 FROM notice_files WHERE id = ?", (file_id,)).fetchone()
            )

    def test_upload_audit_reports_missing_and_deletes_orphans(self) -> None:
        orphan = self.settings.upload_dir / "orphan.bin"
        orphan.write_bytes(b"orphan")
        with connect(self.settings.db_path) as connection:
            connection.execute(
                """
                INSERT INTO notice_files (
                    notice_id, stored_name, original_name, mime_type, size_bytes
                ) VALUES (1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf', 'missing.pdf', 'application/pdf', 1)
                """
            )

        report = audit_uploads(self.settings.db_path, self.settings.upload_dir)
        self.assertEqual(("orphan.bin",), report.orphan_files)
        self.assertEqual(("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf",), report.missing_files)

        env = {
            "JST_DB_PATH": str(self.settings.db_path),
            "JST_UPLOAD_DIR": str(self.settings.upload_dir),
        }
        with patch.dict(os.environ, env, clear=False):
            self.assertEqual(1, cli.main(["check-upload-files", "--delete-orphans"]))
        self.assertFalse(orphan.exists())


if __name__ == "__main__":
    unittest.main()
