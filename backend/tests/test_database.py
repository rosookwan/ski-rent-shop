from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.database import (
    BUSY_TIMEOUT_MS,
    MigrationError,
    apply_migrations,
    connect,
    initialize_database,
)


EXPECTED_TABLES = {
    "admin_sessions",
    "admins",
    "catalog_items",
    "discount_config",
    "inquiries",
    "notice_files",
    "notices",
    "schema_migrations",
    "seed_runs",
}


class DatabaseMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "nested" / "test.db"

    def test_initialization_creates_schema_and_sqlite_pragmas(self) -> None:
        initialize_database(self.db_path)

        with connect(self.db_path) as connection:
            tables = {
                row["name"]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
                )
            }
            self.assertEqual(EXPECTED_TABLES, tables)
            self.assertEqual(1, connection.execute("PRAGMA foreign_keys").fetchone()[0])
            self.assertEqual(BUSY_TIMEOUT_MS, connection.execute("PRAGMA busy_timeout").fetchone()[0])
            self.assertEqual("wal", connection.execute("PRAGMA journal_mode").fetchone()[0])

    def test_initialization_is_idempotent(self) -> None:
        initialize_database(self.db_path)
        initialize_database(self.db_path)

        with sqlite3.connect(self.db_path) as connection:
            migration_count = connection.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
            self.assertEqual(2, migration_count)

    def test_applied_migration_cannot_be_modified(self) -> None:
        migrations_dir = Path(self.temp_dir.name) / "migrations"
        migrations_dir.mkdir()
        migration_path = migrations_dir / "0001_example.sql"
        migration_path.write_text("CREATE TABLE example (id INTEGER PRIMARY KEY);", encoding="utf-8")
        apply_migrations(self.db_path, migrations_dir)

        migration_path.write_text(
            "CREATE TABLE example (id INTEGER PRIMARY KEY, name TEXT);",
            encoding="utf-8",
        )

        with self.assertRaises(MigrationError):
            apply_migrations(self.db_path, migrations_dir)

    def test_migrations_are_applied_in_numeric_version_order(self) -> None:
        migrations_dir = Path(self.temp_dir.name) / "ordered_migrations"
        migrations_dir.mkdir()
        (migrations_dir / "2_create_example.sql").write_text(
            "CREATE TABLE ordered_example (id INTEGER PRIMARY KEY);",
            encoding="utf-8",
        )
        (migrations_dir / "10_add_name.sql").write_text(
            "ALTER TABLE ordered_example ADD COLUMN name TEXT;",
            encoding="utf-8",
        )

        apply_migrations(self.db_path, migrations_dir)

        with sqlite3.connect(self.db_path) as connection:
            versions = [
                row[0]
                for row in connection.execute(
                    "SELECT version FROM schema_migrations ORDER BY version"
                )
            ]
            self.assertEqual([2, 10], versions)


if __name__ == "__main__":
    unittest.main()
