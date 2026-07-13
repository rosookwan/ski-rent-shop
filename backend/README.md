# 준스키타운 백엔드

M3에서 사용하는 FastAPI + SQLite 백엔드다. 현재 R10까지 실행 기반, DB 마이그레이션,
공용 데이터 API와 초기 데이터 시딩을 포함한다.

## 디렉터리

```text
backend/
├── app/
│   ├── config.py       # 환경변수 설정
│   ├── database.py     # SQLite 연결·마이그레이션·상태 점검
│   ├── seed.py         # 기본 품목·공지·할인 1회 시딩
│   ├── repository.py   # SQL과 UI 응답 변환
│   ├── schemas.py      # 공용 API 요청·응답 검증
│   ├── security.py     # 문의 비밀번호 scrypt 해시
│   └── main.py         # FastAPI 앱 진입점
├── migrations/         # 순번 기반 SQL 마이그레이션
├── tests/              # unittest 자동 테스트
├── .env.example        # 환경변수 이름과 개발 예시
└── requirements.txt    # 고정된 Python 의존성
```

## 로컬 실행

Python 3.12 기준이다.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export JST_DB_PATH=./data/junski.db
export JST_UPLOAD_DIR=./uploads
export JST_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

정상 실행 후 `http://127.0.0.1:8000/api/health`는 아래 JSON을 반환한다.

```json
{"status":"ok","database":"connected"}
```

`.env.example`은 변수 이름을 설명하기 위한 예시다. `.env`는 Git에 포함되지 않으며 운영에서는
systemd의 `EnvironmentFile`을 사용한다.

## 테스트

```bash
cd backend
source .venv/bin/activate
python -m unittest discover -s tests -v
```

테스트는 임시 디렉터리의 SQLite DB만 사용하며 `backend/data/`의 개발 DB를 변경하지 않는다.

## 공용 API

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/api/health` | 서버·DB 상태 확인 |
| GET | `/api/notices?page=1&pageSize=10` | 고정 우선 공지 목록 |
| GET | `/api/notices/{id}` | 공지 상세 |
| GET | `/api/catalog` | 노출 품목 목록 |
| GET | `/api/discounts` | 할인 설정 |
| GET | `/api/inquiries?page=1&pageSize=10` | 개인정보를 제외한 문의 목록 |
| POST | `/api/inquiries` | 문의 등록 |
| GET | `/api/inquiries/{id}` | 공개 문의 상세 |
| POST | `/api/inquiries/{id}/verify` | 비밀글 비밀번호 확인과 상세 조회 |

문의 목록과 공개 상세에는 연락처, 이메일, 비밀번호 해시, 견적 원본을 포함하지 않는다.

## 마이그레이션 규칙

- 파일명은 `0001_initial.sql`처럼 증가하는 숫자와 영문 소문자 이름을 사용한다.
- 서버 시작 시 미적용 파일만 버전순으로 적용한다.
- 적용된 파일의 이름이나 내용을 변경하면 체크섬 검증이 실패한다. 새 변경은 다음 번호의 파일로 추가한다.
- DB, `-wal`, `-shm` 파일과 업로드 파일은 Git에 커밋하지 않는다.
