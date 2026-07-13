from __future__ import annotations

import unittest

from app.security import hash_password, verify_password


class PasswordHashTests(unittest.TestCase):
    def test_password_hash_is_salted_and_verifiable(self) -> None:
        first = hash_password("1234")
        second = hash_password("1234")

        self.assertNotEqual(first, second)
        self.assertNotIn("1234", first)
        self.assertTrue(verify_password("1234", first))
        self.assertFalse(verify_password("9999", first))

    def test_invalid_hash_is_rejected(self) -> None:
        self.assertFalse(verify_password("1234", None))
        self.assertFalse(verify_password("1234", "broken"))
        self.assertFalse(
            verify_password(
                "1234",
                "scrypt$999999999$8$1$00112233445566778899aabbccddeeff$" + ("00" * 32),
            )
        )


if __name__ == "__main__":
    unittest.main()
