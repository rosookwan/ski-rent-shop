"""사용자 비밀번호 해시 유틸리티."""

from __future__ import annotations

import hashlib
import hmac
import secrets


SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32
SALT_BYTES = 16


def hash_password(password: str) -> str:
    """무작위 salt를 사용한 scrypt 해시 문자열을 생성한다."""

    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded_hash: str | None) -> bool:
    """저장된 scrypt 해시를 검증하고 손상된 값은 실패로 처리한다."""

    if not password or not encoded_hash:
        return False

    try:
        algorithm, n, r, p, salt_hex, digest_hex = encoded_hash.split("$", 5)
        if algorithm != "scrypt":
            return False
        params = (int(n), int(r), int(p))
        if params != (SCRYPT_N, SCRYPT_R, SCRYPT_P):
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
        if len(salt) != SALT_BYTES or len(expected) != SCRYPT_DKLEN:
            return False
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=params[0],
            r=params[1],
            p=params[2],
            dklen=len(expected),
        )
    except (TypeError, ValueError):
        return False

    return hmac.compare_digest(actual, expected)
