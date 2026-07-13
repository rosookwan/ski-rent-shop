# 아키텍처 가이드

## 1. 전체 구조

빌드 도구 없는 정적 사이트. 페이지별 HTML이 루트에 있고, 스크립트는 3계층이다.

```
┌─ 페이지 스크립트 ──────────────────────────────────────────┐
│ js/home.js  js/notice.js  js/inquiry.js  js/estimate.js    │  화면 상태·렌더링
│ js/admin.js                                                │
├─ 공통 UI (사용자 화면만) ──────────────────────────────────┤
│ js/site.js   → window.JST (JSTStore 포함 + 헤더/푸터)      │  헤더·푸터 주입
├─ 데이터 계층 ──────────────────────────────────────────────┤
│ js/store.js  → window.JSTStore                             │  localStorage 캡슐화
└────────────────────────────────────────────────────────────┘
```

- 사용자 페이지: `store.js → site.js → 페이지.js` 순서로 로드. 페이지 코드는 `JST.*`만 사용.
- 관리자 페이지: `store.js → admin.js`. 헤더/푸터가 없으므로 site.js를 로드하지 않고 `JSTStore.*`를 직접 사용.
- 공통 스타일은 `css/base.css`, 페이지 고유 스타일(예: index의 `.hero`)은 각 html의 `<style>`.
- 나머지 스타일은 디자인 시안 그대로 **인라인 style 속성** 방식이다. 반복되는 조각은 각 페이지 스크립트 상단의 `S` 객체(스타일 문자열 상수)로 관리한다.

## 2. 페이지 맵

| 페이지 | 스크립트 | 역할 | 이동 경로 |
|---|---|---|---|
| index.html | home.js | 홈. 일정·인원 플래너, 게시판 미리보기 | 플래너 → estimate.html (jst_trip_info 전달) |
| notice.html | notice.js | 공지 목록/상세. `?id=N`으로 상세 직접 진입 | |
| inquiry.html | inquiry.js | 문의 목록/상세/글쓰기. `?mode=write&from=estimate`로 견적 첨부 글쓰기 진입 | |
| estimate.html | estimate.js | 셀프견적. 날짜별 담기, 확인 모달 | 문의하기 → inquiry.html (jst_estimate 전달) |
| admin-login.html | (인라인) | 관리자 로그인 (프로토타입: 검증 없음) | 로그인 → admin.html |
| admin.html | admin.js | 관리자: 품목/할인/공지/문의 탭 | 세션 없으면 admin-login.html로 리다이렉트 |

## 3. 데이터 계층 (js/store.js)

**규칙: localStorage 접근은 이 파일에서만 한다.** 페이지 코드는 `JST.loadNotices()` /
`JST.saveNotices(list)` 형태만 호출한다. 키 문자열도 `JST.KEYS.*`로 참조한다.

### 스키마 (localStorage 키 → 값 형태)

```js
// jst_catalog — 렌탈 품목. 카테고리 4종 고정
{ lift: [Item], equipment: [Item], clothing: [Item], safety: [Item] }
// Item
{ id: 'full', name: '종일권', desc: '09:00–17:00', price: 55000,
  discountGeneral: 0, discountAffiliate: 0, hidden: false }
// hidden=true이면 셀프견적에서 숨김. 할인 값은 품목별 정액할인 오버라이드(0=기본값 사용)

// jst_discount_config — 할인 설정
{ general:   { enabled: true, type: 'percent'|'fixed', value: 5 },
  affiliate: { enabled: true, type: 'percent'|'fixed', value: 12 },
  keywords: ['여행사', '패키지', '제휴'] }      // 제휴업체명 부분일치 판정용

// jst_notices — 공지 배열 (최신이 앞)
[{ id: 1, tag: '공지', title: '...', date: '2026.11.20', body: '...' }]

// jst_inquiries — 문의 배열 (최신이 앞)
[{ id: 1, title: '...', date: '2026.07.10', status: '답변대기'|'답변완료',
   secret: true, password: '1234',            // 프로토타입: 평문. M3에서 해시로
   name: '', contact: '', email: '', content: '...', answer: '' }]

// jst_estimate — 셀프견적 → 문의 글쓰기 전달 페이로드 (1회성)
{ tripInfo: '12/24(목) – 12/26(토) · 2박3일 · 대인 2', affiliateType: 'none'|'affiliate',
  affiliateName: '', lines: [{ group, label, qty, subtotal, subtotalValue, cat, itemId }],
  total: '128,250원', totalValue: 128250, email: '', createdAt: ISO문자열 }

// jst_trip_info — 홈 → 셀프견적 전달 일정·인원
{ undecided: false, start: '2026-12-24', end: '2026-12-26', adult: 2, child: 0 }

// jst_admin_session — '1'이면 로그인 상태 (프로토타입)
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
- 탭 간 실시간 동기화: `window.addEventListener('storage', ...)`로 해당 키 변경 시 다시 로드.
- 관리자 저장 피드백: `showFlash()` → "✓ 저장됨" 1.6초 표시.

## 5. M3(백엔드) 전환 계획

목표: **js/store.js만 API 구현으로 교체**하면 페이지 코드가 그대로 동작하는 것.

- load*/save* 함수가 async(Promise)로 바뀌므로, 호출부는 `await` 또는 `.then()`으로
  조정이 필요하다. 페이지 초기화 코드를 `async function init()` 패턴으로 감싸는 정도의
  변경으로 끝나도록, **store 호출을 페이지당 한 곳(초기화)과 저장 액션에만** 유지할 것.
- `jst_trip_info`/`jst_estimate` 같은 페이지 간 전달 데이터는 서버로 옮기지 않고
  localStorage(또는 sessionStorage)에 남겨도 된다 — 같은 브라우저 안의 전달이므로.
- 테이블 설계 초안은 docs/development-plan.md §7 참고.
