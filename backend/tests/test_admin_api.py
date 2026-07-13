from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.admin_auth import create_admin
from app.config import Settings
from app.main import create_app


class AdminApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        root = Path(self.temp_dir.name)
        self.settings = Settings(
            db_path=root / "data" / "test.db",
            upload_dir=root / "uploads",
            allowed_origins=("http://localhost:8080",),
        )
        self.client_context = TestClient(
            create_app(self.settings),
            base_url="https://testserver",
        )
        self.client = self.client_context.__enter__()
        self.addCleanup(self.client_context.__exit__, None, None, None)
        self.origin = {"Origin": "http://localhost:8080"}
        create_admin(self.settings.db_path, "operator", "safe-password")
        login = self.client.post(
            "/api/admin/auth/login",
            headers=self.origin,
            json={"loginId": "operator", "password": "safe-password"},
        )
        self.assertEqual(200, login.status_code)

    def test_notice_crud_pin_search_and_paging(self) -> None:
        created = self.client.post(
            "/api/admin/notices",
            headers=self.origin,
            json={"tag": "이벤트", "title": "검색 전용 공지", "body": "특별 내용", "pinned": False},
        )
        self.assertEqual(201, created.status_code)
        notice_id = created.json()["id"]

        listing = self.client.get(
            "/api/admin/notices",
            params={"query": "검색 전용", "page": 1, "pageSize": 1},
        )
        self.assertEqual(1, listing.json()["total"])
        self.assertEqual(1, listing.json()["pageSize"])

        updated = self.client.put(
            f"/api/admin/notices/{notice_id}",
            headers=self.origin,
            json={"tag": "공지", "title": "수정된 공지", "body": "수정 내용", "pinned": True},
        )
        self.assertEqual(200, updated.status_code)
        self.assertTrue(updated.json()["pinned"])
        self.assertEqual(
            notice_id,
            self.client.get("/api/admin/notices", params={"pageSize": 100}).json()["items"][0]["id"],
        )
        self.assertEqual(
            204,
            self.client.delete(f"/api/admin/notices/{notice_id}", headers=self.origin).status_code,
        )

    def test_catalog_create_update_reorder_hide_and_delete(self) -> None:
        original = self.client.get("/api/admin/catalog").json()
        new_item = {
            "id": "night_special",
            "name": "야간 특가권",
            "desc": "테스트 품목",
            "price": 40000,
            "discountGeneral": 0,
            "discountAffiliate": 0,
            "hidden": False,
        }
        created = self.client.post(
            "/api/admin/catalog/lift",
            headers=self.origin,
            json=new_item,
        )
        self.assertEqual(201, created.status_code)

        updated_payload = {**new_item, "id": "ignored", "name": "야간권", "hidden": True}
        updated_payload.pop("id")
        updated = self.client.put(
            "/api/admin/catalog/lift/night_special",
            headers=self.origin,
            json=updated_payload,
        )
        self.assertEqual(200, updated.status_code)
        self.assertTrue(updated.json()["hidden"])
        public_ids = {item["id"] for item in self.client.get("/api/catalog").json()["lift"]}
        self.assertNotIn("night_special", public_ids)

        item_ids = ["night_special", *[item["id"] for item in original["lift"]]]
        ordered = self.client.put(
            "/api/admin/catalog/lift/order",
            headers=self.origin,
            json={"itemIds": item_ids},
        )
        self.assertEqual(200, ordered.status_code)
        self.assertEqual("night_special", ordered.json()["lift"][0]["id"])
        self.assertEqual(
            204,
            self.client.delete(
                "/api/admin/catalog/lift/night_special",
                headers=self.origin,
            ).status_code,
        )

    def test_discount_save_is_reflected_in_public_api(self) -> None:
        payload = {
            "general": {"enabled": True, "type": "fixed", "value": 3000},
            "affiliate": {"enabled": False, "type": "percent", "value": 15},
            "keywords": ["학교", "동호회"],
        }
        response = self.client.put("/api/admin/discounts", headers=self.origin, json=payload)
        self.assertEqual(200, response.status_code)
        self.assertEqual(payload, response.json())
        self.assertEqual(payload, self.client.get("/api/discounts").json())

    def test_inquiry_full_data_search_filter_answer_and_delete(self) -> None:
        submitted = self.client.post(
            "/api/inquiries",
            json={
                "name": "홍길동",
                "contact": "010-1234-5678",
                "email": "hong@example.com",
                "title": "단체 견적 문의",
                "content": "20명 견적을 부탁드려요.",
                "secret": True,
                "password": "1234",
                "estimate": {"tripInfo": "1월 3일 · 20명", "lines": []},
            },
        )
        inquiry_id = submitted.json()["id"]

        listing = self.client.get(
            "/api/admin/inquiries",
            params={"status": "답변대기", "query": "010-1234", "pageSize": 10},
        )
        self.assertEqual(1, listing.json()["total"])
        detail = self.client.get(f"/api/admin/inquiries/{inquiry_id}")
        self.assertEqual("홍길동", detail.json()["name"])
        self.assertEqual("hong@example.com", detail.json()["email"])
        self.assertEqual("1월 3일 · 20명", detail.json()["estimate"]["tripInfo"])
        self.assertNotIn("password", detail.json())

        answered = self.client.patch(
            f"/api/admin/inquiries/{inquiry_id}",
            headers=self.origin,
            json={"answer": "단체 담당자가 연락드릴게요.", "status": "답변완료"},
        )
        self.assertEqual(200, answered.status_code)
        self.assertEqual("답변완료", answered.json()["status"])
        self.assertTrue(answered.json()["answeredAt"])
        public = self.client.post(
            f"/api/inquiries/{inquiry_id}/verify",
            json={"password": "1234"},
        )
        self.assertEqual("단체 담당자가 연락드릴게요.", public.json()["answer"])
        self.assertEqual(
            204,
            self.client.delete(
                f"/api/admin/inquiries/{inquiry_id}",
                headers=self.origin,
            ).status_code,
        )

    def test_all_admin_data_requires_authentication(self) -> None:
        self.client.cookies.clear()
        for path in (
            "/api/admin/notices",
            "/api/admin/catalog",
            "/api/admin/discounts",
            "/api/admin/inquiries",
        ):
            with self.subTest(path=path):
                self.assertEqual(401, self.client.get(path).status_code)


if __name__ == "__main__":
    unittest.main()
