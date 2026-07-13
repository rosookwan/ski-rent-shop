"""관리자 계정을 서버 터미널에서만 관리하는 CLI."""

from __future__ import annotations

import argparse
import getpass
import sys

from .admin_auth import (
    AdminAccountExists,
    AdminAccountNotFound,
    change_admin_password,
    create_admin,
)
from .config import Settings
from .database import initialize_database


def _password() -> str:
    password = getpass.getpass("새 비밀번호: ")
    confirmation = getpass.getpass("새 비밀번호 확인: ")
    if password != confirmation:
        raise ValueError("비밀번호 확인이 일치하지 않습니다.")
    if len(password) < 10:
        raise ValueError("관리자 비밀번호는 10자 이상이어야 합니다.")
    if len(password) > 128:
        raise ValueError("관리자 비밀번호는 128자 이하여야 합니다.")
    return password


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="준스키타운 관리자 계정 관리")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("create-admin", "set-admin-password"):
        command = commands.add_parser(name)
        command.add_argument("--login-id", required=True, help="관리자 로그인 아이디")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = Settings.from_env()
    initialize_database(settings.db_path)
    try:
        password = _password()
        if args.command == "create-admin":
            create_admin(settings.db_path, args.login_id, password)
            print("관리자 계정을 생성했습니다.")
        else:
            change_admin_password(settings.db_path, args.login_id, password)
            print("관리자 비밀번호를 변경하고 기존 세션을 종료했습니다.")
    except (ValueError, AdminAccountExists, AdminAccountNotFound) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
