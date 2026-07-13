from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.database import connect
from app.main import create_app


class PublicApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        root = Path(self.temp_dir.name)
        self.settings = Settings(
            db_path=root / "data" / "test.db",
            upload_dir=root / "uploads",
            allowed_origins=("http://localhost:8080",),
        )
        self.client_context = TestClient(create_app(self.settings))
        self.client = self.client_context.__enter__()
        self.addCleanup(self.client_context.__exit__, None, None, None)

    def test_notices_are_paged_with_pinned_items_first(self) -> None:
        with connect(self.settings.db_path) as connection:
            connection.execute("UPDATE notices SET pinned = 1 WHERE id = 8")

        response = self.client.get("/api/notices", params={"page": 1, "pageSize": 3})

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertEqual(8, payload["total"])
        self.assertEqual(3, payload["totalPages"])
        self.assertEqual(3, len(payload["items"]))
        self.assertEqual(8, payload["items"][0]["id"])
        self.assertTrue(payload["items"][0]["pinned"])
        self.assertIn("body", payload["items"][0])

    def test_notice_detail_and_missing_notice(self) -> None:
        detail = self.client.get("/api/notices/1")
        missing = self.client.get("/api/notices/9999")

        self.assertEqual(200, detail.status_code)
        self.assertEqual("2025-26 시즌 운영 안내", detail.json()["title"])
        self.assertEqual([], detail.json()["files"])
        self.assertEqual(404, missing.status_code)

    def test_catalog_excludes_hidden_items_and_preserves_ui_shape(self) -> None:
        with connect(self.settings.db_path) as connection:
            connection.execute(
                "UPDATE catalog_items SET hidden = 1 WHERE category = 'lift' AND item_id = 'full'"
            )

        response = self.client.get("/api/catalog")

        self.assertEqual(200, response.status_code)
        catalog = response.json()
        self.assertEqual({"lift", "equipment", "clothing", "safety"}, set(catalog))
        self.assertEqual(3, len(catalog["lift"]))
        self.assertNotIn("full", {item["id"] for item in catalog["lift"]})
        self.assertEqual(
            {"id", "name", "desc", "price", "discountGeneral", "discountAffiliate", "hidden"},
            set(catalog["lift"][0]),
        )

    def test_discount_config_matches_jststore_shape(self) -> None:
        response = self.client.get("/api/discounts")

        self.assertEqual(200, response.status_code)
        self.assertEqual(
            {
                "general": {"enabled": True, "type": "percent", "value": 5},
                "affiliate": {"enabled": True, "type": "percent", "value": 12},
                "keywords": ["여행사", "패키지", "제휴"],
            },
            response.json(),
        )

    def test_secret_inquiry_requires_password_and_never_exposes_private_fields(self) -> None:
        submitted = self.client.post(
            "/api/inquiries",
            json={
                "name": "홍길동",
                "contact": "010-1234-5678",
                "email": "hong@example.com",
                "title": "장비 문의",
                "content": "장비 사이즈를 확인하고 싶어요.",
                "secret": True,
                "password": "1234",
                "estimate": {
                    "tripInfo": "12/24 · 대인 2",
                    "lines": [
                        {
                            "group": "리프트권",
                            "label": "종일권",
                            "qty": 2,
                            "subtotal": "110,000원",
                            "subtotalValue": 110000,
                            "cat": "lift",
                            "itemId": "full",
                        }
                    ],
                    "total": "110,000원",
                    "totalValue": 110000,
                },
            },
        )
        self.assertEqual(201, submitted.status_code)
        inquiry_id = submitted.json()["id"]

        with connect(self.settings.db_path) as connection:
            stored = connection.execute(
                "SELECT contact, email, password_hash, estimate_json FROM inquiries WHERE id = ?",
                (inquiry_id,),
            ).fetchone()
        self.assertEqual("010-1234-5678", stored["contact"])
        self.assertEqual("hong@example.com", stored["email"])
        self.assertNotEqual("1234", stored["password_hash"])
        self.assertNotIn("1234", stored["password_hash"])
        self.assertEqual("12/24 · 대인 2", json.loads(stored["estimate_json"])["tripInfo"])

        listing = self.client.get("/api/inquiries").json()["items"][0]
        self.assertEqual("홍*동", listing["name"])
        self.assertEqual(
            {"id", "title", "date", "status", "secret", "name"},
            set(listing),
        )

        self.assertEqual(403, self.client.get(f"/api/inquiries/{inquiry_id}").status_code)
        self.assertEqual(
            403,
            self.client.post(
                f"/api/inquiries/{inquiry_id}/verify",
                json={"password": "9999"},
            ).status_code,
        )

        verified = self.client.post(
            f"/api/inquiries/{inquiry_id}/verify",
            json={"password": "1234"},
        )
        self.assertEqual(200, verified.status_code)
        self.assertEqual("장비 사이즈를 확인하고 싶어요.", verified.json()["content"])
        self.assertEqual(
            {"id", "title", "date", "status", "secret", "name", "content", "answer"},
            set(verified.json()),
        )

    def test_non_secret_inquiry_is_public_and_stores_no_password_hash(self) -> None:
        submitted = self.client.post(
            "/api/inquiries",
            json={
                "name": "김준",
                "title": "주차 문의",
                "content": "주차장을 이용할 수 있나요?",
                "secret": False,
                "password": "ignored-password",
            },
        )
        self.assertEqual(201, submitted.status_code)
        inquiry_id = submitted.json()["id"]

        detail = self.client.get(f"/api/inquiries/{inquiry_id}")
        self.assertEqual(200, detail.status_code)
        self.assertEqual("김*", detail.json()["name"])

        with connect(self.settings.db_path) as connection:
            password_hash = connection.execute(
                "SELECT password_hash FROM inquiries WHERE id = ?",
                (inquiry_id,),
            ).fetchone()["password_hash"]
        self.assertIsNone(password_hash)

    def test_invalid_inquiry_and_oversized_page_are_rejected(self) -> None:
        invalid_payloads = [
            {"name": "", "title": "제목", "content": "내용", "secret": False},
            {"name": "홍길동", "title": "제목", "content": "", "secret": False},
            {"name": "홍길동", "title": "제목", "content": "내용", "secret": True, "password": "12"},
            {"name": "홍길동", "title": "제목", "content": "내용", "secret": False, "email": "invalid"},
            {"name": "홍길동", "title": "제목", "content": "내용", "secret": False, "contact": "전화주세요"},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                self.assertEqual(422, self.client.post("/api/inquiries", json=payload).status_code)

        self.assertEqual(
            422,
            self.client.get("/api/inquiries", params={"pageSize": 101}).status_code,
        )


if __name__ == "__main__":
    unittest.main()
