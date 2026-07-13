# 아키텍처 가이드

## 1. 전체 구조

빌드 도구 없는 정적 사이트. 페이지별 HTML이 루트에 있고, 스크립트는 4계층이다.

```
┌─ 페이지 스크립트 ──────────────────────────────────────────┐
│ js/home.js  js/notice.js  js/inquiry.js  js/estimate.js    │  화면 상태·렌더링
│ js/admin.js                                                │
├─ 공통 UI (사용자 화면만) ──────────────────────────────────┤
│ js/site.js   → window.JST (JSTStore 포함 + 헤더/푸터)      │  헤더·푸터 주입
├─ 데이터 계층 ──────────────────────────────────────────────┤
│ js/store.js  → window.JSTStore                             │  API·임시 데이터 캡슐화
├─ 환경 설정 ────────────────────────────────────────────────┤
│ js/config.js → window.JSTConfig                            │  API 기준 URL
└────────────────────────────────────────────────────────────┘
```

- 사용자 페이지: `config.js → store.js → site.js → 페이지.js` 순서로 로드. 페이지 코드는 `JST.*`만 사용.
- 관리자 페이지: `config.js → store.js → admin.js`. 헤더/푸터가 없으므로 site.js를 로드하지 않고 `JSTStore.*`를 직접 사용.
- 공통 스타일은 `css/base.css`, 페이지 고유 스타일(예: index의 `.hero`)은 각 html의 `<style>`.
- 나머지 스타일은 디자인 시안 그대로 **인라인 style 속성** 방식이다. 반복되는 조각은 각 페이지 스크립트 상단의 `S` 객체(스타일 문자열 상수)로 관리한다.

## 2. 페이지 맵

| 페이지 | 스크립트 | 역할 | 이동 경로 |
|---|---|---|---|
| index.html | home.js | 홈. 일정·인원 플래너, 게시판 미리보기 | 플래너 → estimate.html (jst_trip_info 전달) |
| notice.html | notice.js | 공지 목록/상세. `?id=N`으로 상세 직접 진입 | |
| inquiry.html | inquiry.js | 문의 목록/상세/글쓰기. `?mode=write&from=estimate`로 견적 첨부 글쓰기 진입 | |
| estimate.html | estimate.js | 셀프견적. 날짜별 담기, 확인 모달 | 문의하기 → inquiry.html (jst_estimate 전달) |
| admin-login.html | (인라인) | 서버 관리자 인증 | 로그인 → admin.html |
| admin.html | admin.js | 관리자: 품목/할인/공지/문의 탭 | 세션 없으면 admin-login.html로 리다이렉트 |

## 3. 데이터 계층 (js/store.js)

**규칙: API와 localStorage 접근은 이 파일에서만 한다.** 페이지 코드는 `JST.loadNotices()` /
`JST.createInquiry(payload)` 같은 Promise API만 호출한다. 서버 공유 데이터는 API 실패 시
localStorage로 대체하거나 이전 브라우저 데이터를 자동 업로드하지 않는다.

### 서버 공유 데이터

공지·문의·렌탈 품목·할인 설정·관리자 인증·공지 첨부는 FastAPI와 SQLite가 관리한다.
공개 화면은 공개 API를, 관리자 화면은 HttpOnly 세션 쿠키가 필요한 관리자 API를 사용한다.
모든 초기 조회와 저장 액션은 비동기이며, 화면은 로딩·빈 상태·재시도 가능한 오류 상태를
명시적으로 렌더링한다. API 경로와 스키마는 `docs/requirements/M3-backend-migration.md`를 따른다.

### 브라우저 임시 데이터 (localStorage 키 → 값 형태)

```js
// jst_estimate — 셀프견적 → 문의 글쓰기 전달 페이로드 (1회성)
{ tripInfo: '12/24(목) – 12/26(토) · 2박3일 · 대인 2', affiliateType: 'none'|'affiliate',
  affiliateName: '', lines: [{ group, label, qty, subtotal, subtotalValue, cat, itemId }],
  total: '128,250원', totalValue: 128250, email: '', createdAt: ISO문자열 }

// jst_estimate_draft — 셀프견적 작성 중 자동 저장
{ affiliateType: 'none'|'affiliate', affiliateName: '', scheduleUndecided: false,
  startDate: '2026-12-24', endDate: '2026-12-26', adult: 2, child: 0,
  liftQty: {}, equipmentQty: {}, clothingQty: {}, safetyQty: {}, savedAt: ISO문자열 }

// jst_trip_info — 홈 → 셀프견적 전달 일정·인원
{ undecided: false, start: '2026-12-24', end: '2026-12-26', adult: 2, child: 0 }
```

### 할인 계산 규칙 (inquiry.js의 견적 첨부 박스에서 사용)

1. 모드 결정: 제휴 예약이고 업체명이 `keywords` 중 하나를 **부분 포함**(대소문자 무시)하며
   affiliate.enabled면 `affiliate` 모드. 아니면 general.enabled일 때 `general` 모드. 둘 다 아니면 할인 없음.
2. 금액: `percent`면 라인 소계 × value%. `fixed`면 (품목 오버라이드 값 || 설정 value) × 수량.
3. 반올림 후 0 ≤ 할인액 ≤ 소계로 클램프.

## 4. UI 패턴 (모든 페이지 공통)

```js
var state = { ... };                    // 화면 상태는 일반 객체
function render() { el.innerHTML = ...; } // 상태 → HTML 문자열 → innerHTML

// 클릭: data-action 속성 + 이벤트 위임
document.getElementById('app').addEventListener('click', function (e) {
  var el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

// 텍스트 입력: input 이벤트로 상태만 갱신, 재렌더 금지(포커스 유지)
// 재렌더는 클릭 액션·change(블러/선택 확정) 시점에만
```

- 사용자 입력을 HTML에 넣을 때는 반드시 `esc()`.
- 서버 데이터는 페이지 초기화와 저장 완료 시 다시 반영하며, 네트워크 오류에는 재시도 동작을 제공한다.
- 관리자 저장 피드백: `showFlash()` → "✓ 저장됨" 1.6초 표시.

## 5. M3 백엔드 구조

R13에서 브라우저 데이터 계층을 Promise 기반 API로 전환했다. `jst_trip_info`와
`jst_estimate`, `jst_estimate_draft`는 같은 브라우저 안의 페이지 전달·복구 용도이므로
localStorage에 유지한다.

### 확정된 목표 구조

```
브라우저(기존 HTML/JS)
  ├─ JSTStore API 대상: 공지 · 문의 · 품목 · 할인 · 관리자 인증 · 첨부
  └─ localStorage 유지: 일정 전달 · 견적 전달 · 견적 임시저장
            │ HTTPS / JSON
            ▼
Nginx ── FastAPI(systemd, 전용 사용자) ── SQLite
                    │
                    └─ 공지 첨부 전용 디렉터리
```

- 배포 대상은 기존 Vultr 서버(1 vCPU, RAM 2 GB, SSD 55 GB)다.
- 백엔드와 데이터는 테니스 웹·알림 봇의 사용자 및 디렉터리와 분리한다.
- SQLite 접근 코드는 저장소 계층에 모아 향후 PostgreSQL 전환 범위를 제한한다.
- 상세 단계와 완료 기준은 `docs/requirements/M3-backend-migration.md`를 따른다.
