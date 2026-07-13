from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


class HealthEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        root = Path(self.temp_dir.name)
        self.settings = Settings(
            db_path=root / "data" / "test.db",
            upload_dir=root / "uploads",
            allowed_origins=("http://localhost:8080",),
        )

    def test_health_returns_ok_when_database_is_available(self) -> None:
        with TestClient(create_app(self.settings)) as client:
            response = client.get("/api/health")

        self.assertEqual(200, response.status_code)
        self.assertEqual({"status": "ok", "database": "connected"}, response.json())
        self.assertTrue(self.settings.upload_dir.is_dir())

    def test_health_returns_service_unavailable_when_database_check_fails(self) -> None:
        with TestClient(create_app(self.settings)) as client:
            with patch("app.main.check_database", side_effect=sqlite3.OperationalError("failed")):
                response = client.get("/api/health")

        self.assertEqual(503, response.status_code)
        self.assertEqual({"status": "unhealthy", "database": "unavailable"}, response.json())


if __name__ == "__main__":
    unittest.main()
