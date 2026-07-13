"""빈 운영 DB에 적용하는 기본 품목·공지·할인 데이터."""

from __future__ import annotations

import json
from pathlib import Path

from .database import connect


DEFAULT_SEED_KEY = "default_data_v1"

DEFAULT_CATALOG = {
    "lift": [
        ("full", "종일권", "09:00–17:00", 55_000),
        ("am", "오전권", "09:00–13:00", 40_000),
        ("pm", "오후권", "13:00–17:00", 40_000),
        ("night", "야간권", "18:30–22:00", 35_000),
    ],
    "equipment": [
        ("ski_set", "스키 풀세트", "스키+폴+부츠", 25_000),
        ("board_set", "보드 풀세트", "보드+부츠", 28_000),
        ("ski_pole", "스키+폴", "부츠 제외", 18_000),
    ],
    "clothing": [
        ("jacket", "상의 자켓", "상의만", 15_000),
        ("pants", "하의 팬츠", "하의만", 15_000),
        ("set", "상하의 세트", "자켓+팬츠", 25_000),
        ("glove", "장갑", "프리사이즈", 5_000),
    ],
    "safety": [
        ("helmet", "헬멧", "전 사이즈", 8_000),
        ("wrist", "손목보호대", "프리사이즈", 5_000),
        ("goggle", "고글", "UV 코팅", 7_000),
        ("hip", "힙 프로텍터", "프리사이즈", 6_000),
    ],
}

DEFAULT_NOTICES = [
    (1, "공지", "2025-26 시즌 운영 안내", "2026-11-20", "2025-26 시즌 운영 일정과 이용 안내입니다. 방문 전 참고해주세요."),
    (2, "", "리프트권 가격 변경 안내", "2026-11-05", "리프트권 가격이 일부 변경되었습니다. 자세한 내용은 셀프견적 화면에서 확인해주세요."),
    (3, "", "주말 렌탈 예약 마감 임박 안내", "2026-10-28", "주말 렌탈 물량이 한정되어 있어 미리 예약해주시면 좋아요."),
    (4, "", "설 연휴 운영시간 안내", "2026-10-12", "설 연휴 기간 운영시간이 일부 조정됩니다."),
    (5, "", "장비 소독·점검 안내", "2026-09-30", "모든 렌탈 장비는 이용 전후로 소독과 점검을 진행하고 있습니다."),
    (6, "", "제휴 숙소 추가 안내", "2026-09-15", "제휴 숙소가 추가되었습니다. 숙박안내에서 확인해보세요."),
    (7, "", "시즌권 사전예약 안내", "2026-09-01", "시즌권 사전예약을 받고 있습니다. 문의게시판으로 남겨주세요."),
    (8, "", "홈페이지 리뉴얼 안내", "2026-08-20", "셀프견적을 포함해 홈페이지가 새로워졌습니다."),
]


def seed_defaults(db_path: Path) -> bool:
    """기본 데이터를 정확히 한 번 적용하고 적용 여부를 반환한다."""

    with connect(db_path) as connection:
        already_applied = connection.execute(
            "SELECT 1 FROM seed_runs WHERE seed_key = ?",
            (DEFAULT_SEED_KEY,),
        ).fetchone()
        if already_applied:
            return False

        for category, items in DEFAULT_CATALOG.items():
            for sort_order, (item_id, name, description, price) in enumerate(items):
                connection.execute(
                    """
                    INSERT OR IGNORE INTO catalog_items (
                        category, item_id, name, description, price, sort_order
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (category, item_id, name, description, price, sort_order),
                )

        for notice_id, tag, title, date, body in DEFAULT_NOTICES:
            connection.execute(
                """
                INSERT OR IGNORE INTO notices (
                    id, tag, title, body, pinned, published_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)
                """,
                (notice_id, tag, title, body, date, date, date),
            )

        keywords_json = json.dumps(["여행사", "패키지", "제휴"], ensure_ascii=False)
        connection.execute(
            """
            INSERT OR IGNORE INTO discount_config (
                discount_group, enabled, discount_type, value, keywords_json
            ) VALUES ('general', 1, 'percent', 5, '[]')
            """
        )
        connection.execute(
            """
            INSERT OR IGNORE INTO discount_config (
                discount_group, enabled, discount_type, value, keywords_json
            ) VALUES ('affiliate', 1, 'percent', 12, ?)
            """,
            (keywords_json,),
        )
        connection.execute(
            "INSERT INTO seed_runs (seed_key) VALUES (?)",
            (DEFAULT_SEED_KEY,),
        )

    return True
