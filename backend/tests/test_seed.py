from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.database import connect, initialize_database
from app.seed import DEFAULT_CATALOG, DEFAULT_NOTICES, seed_defaults


class DefaultSeedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "seed.db"
        initialize_database(self.db_path)

    def test_default_data_is_seeded_exactly_once(self) -> None:
        self.assertTrue(seed_defaults(self.db_path))
        self.assertFalse(seed_defaults(self.db_path))

        with connect(self.db_path) as connection:
            catalog_count = connection.execute("SELECT COUNT(*) FROM catalog_items").fetchone()[0]
            notice_count = connection.execute("SELECT COUNT(*) FROM notices").fetchone()[0]
            discount_count = connection.execute("SELECT COUNT(*) FROM discount_config").fetchone()[0]
            inquiry_count = connection.execute("SELECT COUNT(*) FROM inquiries").fetchone()[0]
            seed_count = connection.execute("SELECT COUNT(*) FROM seed_runs").fetchone()[0]

        self.assertEqual(sum(len(items) for items in DEFAULT_CATALOG.values()), catalog_count)
        self.assertEqual(len(DEFAULT_NOTICES), notice_count)
        self.assertEqual(2, discount_count)
        self.assertEqual(0, inquiry_count)
        self.assertEqual(1, seed_count)

    def test_seed_marker_prevents_deleted_data_from_reappearing(self) -> None:
        seed_defaults(self.db_path)
        with connect(self.db_path) as connection:
            connection.execute("DELETE FROM notices WHERE id = 1")

        self.assertFalse(seed_defaults(self.db_path))
        with connect(self.db_path) as connection:
            notice = connection.execute("SELECT id FROM notices WHERE id = 1").fetchone()
        self.assertIsNone(notice)


if __name__ == "__main__":
    unittest.main()
