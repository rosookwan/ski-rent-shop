"""관리자 계정과 첨부파일을 서버 터미널에서 관리하는 CLI."""

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
from .attachments import audit_uploads
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
    parser = argparse.ArgumentParser(description="준스키타운 서버 관리")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("create-admin", "set-admin-password"):
        command = commands.add_parser(name)
        command.add_argument("--login-id", required=True, help="관리자 로그인 아이디")
    upload_check = commands.add_parser("check-upload-files")
    upload_check.add_argument(
        "--delete-orphans",
        action="store_true",
        help="DB에 없는 업로드 파일을 삭제합니다.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = Settings.from_env()
    initialize_database(settings.db_path)
    if args.command == "check-upload-files":
        report = audit_uploads(settings.db_path, settings.upload_dir, args.delete_orphans)
        print(f"고아 파일: {len(report.orphan_files)}개")
        for filename in report.orphan_files:
            print(f"  - {filename}")
        print(f"실제 파일이 없는 DB 항목: {len(report.missing_files)}개")
        for filename in report.missing_files:
            print(f"  - {filename}")
        if args.delete_orphans:
            print(f"삭제한 고아 파일: {len(report.deleted_orphans)}개")
        unresolved_orphans = set(report.orphan_files) - set(report.deleted_orphans)
        return 1 if unresolved_orphans or report.missing_files else 0
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
