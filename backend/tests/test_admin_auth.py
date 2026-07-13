from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import cli
from app.admin_auth import SESSION_COOKIE_NAME, create_admin
from app.config import Settings
from app.database import connect
from app.main import create_app


class AdminAuthTests(unittest.TestCase):
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

    def login(self, login_id: str = "operator", password: str = "safe-password"):
        return self.client.post(
            "/api/admin/auth/login",
            headers=self.origin,
            json={"loginId": login_id, "password": password},
        )

    def test_no_default_admin_and_cli_manages_hashed_credentials(self) -> None:
        with connect(self.settings.db_path) as connection:
            self.assertEqual(0, connection.execute("SELECT COUNT(*) FROM admins").fetchone()[0])

        env = {"JST_DB_PATH": str(self.settings.db_path)}
        with patch.dict(os.environ, env, clear=False), patch.object(
            cli,
            "_password",
            return_value="cli-safe-password",
        ):
            self.assertEqual(0, cli.main(["create-admin", "--login-id", "Operator"]))

        with connect(self.settings.db_path) as connection:
            row = connection.execute(
                "SELECT login_id, password_hash FROM admins"
            ).fetchone()
        self.assertEqual("operator", row["login_id"])
        self.assertNotIn("cli-safe-password", row["password_hash"])

        self.assertEqual(200, self.login(password="cli-safe-password").status_code)
        with patch.dict(os.environ, env, clear=False), patch.object(
            cli,
            "_password",
            return_value="changed-password",
        ):
            self.assertEqual(0, cli.main(["set-admin-password", "--login-id", "operator"]))
        self.assertEqual(401, self.client.get("/api/admin/auth/session").status_code)
        self.assertEqual(200, self.login(password="changed-password").status_code)

    def test_login_cookie_is_secure_and_only_hash_is_stored(self) -> None:
        create_admin(self.settings.db_path, "operator", "safe-password")

        response = self.login()

        self.assertEqual(200, response.status_code)
        cookie_header = response.headers["set-cookie"]
        self.assertIn("HttpOnly", cookie_header)
        self.assertIn("Secure", cookie_header)
        self.assertIn("SameSite=lax", cookie_header)
        raw_token = self.client.cookies.get(SESSION_COOKIE_NAME)
        self.assertTrue(raw_token)
        with connect(self.settings.db_path) as connection:
            stored = connection.execute(
                "SELECT token_hash, expires_at FROM admin_sessions"
            ).fetchone()
        self.assertNotEqual(raw_token, stored["token_hash"])
        self.assertNotIn(raw_token, stored["token_hash"])
        self.assertEqual("operator", self.client.get("/api/admin/auth/session").json()["loginId"])

    def test_wrong_expired_and_logged_out_sessions_are_rejected(self) -> None:
        create_admin(self.settings.db_path, "operator", "safe-password")
        missing = self.login("missing", "wrong-password")
        wrong = self.login("operator", "wrong-password")
        self.assertEqual(401, missing.status_code)
        self.assertEqual(401, wrong.status_code)
        self.assertEqual(missing.json(), wrong.json())

        self.assertEqual(200, self.login().status_code)
        with connect(self.settings.db_path) as connection:
            connection.execute(
                "UPDATE admin_sessions SET expires_at = '2000-01-01 00:00:00'"
            )
        self.assertEqual(401, self.client.get("/api/admin/auth/session").status_code)

        self.client.cookies.clear()
        self.assertEqual(200, self.login().status_code)
        self.assertEqual(
            204,
            self.client.post("/api/admin/auth/logout", headers=self.origin).status_code,
        )
        self.assertEqual(401, self.client.get("/api/admin/auth/session").status_code)

    def test_login_is_limited_by_account_and_ip(self) -> None:
        create_admin(self.settings.db_path, "operator", "safe-password")
        statuses = [
            self.login("operator", "wrong-password").status_code
            for _ in range(5)
        ]
        self.assertEqual([401, 401, 401, 401, 429], statuses)
        self.assertEqual(429, self.login().status_code)
        with connect(self.settings.db_path) as connection:
            rows = connection.execute(
                "SELECT scope, subject_hash, blocked_until FROM admin_login_attempts"
            ).fetchall()
        self.assertEqual({"account", "ip"}, {row["scope"] for row in rows})
        self.assertTrue(all(len(row["subject_hash"]) == 64 for row in rows))

    def test_origin_is_required_for_login_and_mutations(self) -> None:
        create_admin(self.settings.db_path, "operator", "safe-password")
        self.assertEqual(
            403,
            self.client.post(
                "/api/admin/auth/login",
                json={"loginId": "operator", "password": "safe-password"},
            ).status_code,
        )
        self.assertEqual(200, self.login().status_code)
        self.assertEqual(
            403,
            self.client.put(
                "/api/admin/discounts",
                json={
                    "general": {"enabled": True, "type": "percent", "value": 5},
                    "affiliate": {"enabled": True, "type": "percent", "value": 10},
                    "keywords": [],
                },
            ).status_code,
        )


if __name__ == "__main__":
    unittest.main()
