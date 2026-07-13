# M2 요구사항 — 사용자 화면 개선 · SEO 기본기

대상 파일: `notice.html`/`js/notice.js`, `inquiry.html`/`js/inquiry.js`, `js/estimate.js`, 전체 html `<head>`
배경: [개발계획서 §3](../development-plan.md) · 공통 규칙: [AGENTS.md](../../AGENTS.md)
전제: M1 완료 후 착수 권장 (R1의 pinned 필드·페이지네이션 패턴을 재사용)

---

## R5. 공지사항 (사용자)

1. "더보기" 버튼을 페이지네이션(10건 단위)으로 교체 — M1 관리자와 동일한 스타일
2. 고정(pinned) 공지를 목록 최상단에 📌 아이콘과 함께 표시 (M1-R1에서 선반영되었으면 확인만)
3. 첨부파일 표시 영역: 상세 화면에 첨부 목록 UI 자리만 (M3에서 활성화)

## R6. 문의게시판 (사용자)

1. **비밀글 비밀번호 확인 플로우**
   - 목록에서 비밀글 클릭 → 비밀번호 입력 화면 → 작성 시 저장된 `password`와 일치하면 상세 표시
   - 불일치: "비밀번호가 일치하지 않아요" 인라인 에러
   - 프로토타입 한계(평문 비교)는 유지하되, 비교 로직은 `js/store.js`에 함수로 두어
     M3에서 서버 검증으로 교체 가능하게 (`JSTStore.verifyInquiryPassword(id, pw)` 형태)
2. **작성자 표시**: 목록·상세에 이름 마스킹 표시 (예: "홍*동", 1글자면 그대로, 빈값이면 생략)
3. **페이지네이션**: 10건 단위
4. 글쓰기 폼에서 이름 필드를 필수로 변경 (마스킹 표시를 위해) — 에러 문구 "이름을 입력해주세요"

## R7. 셀프견적 이어하기

1. 담은 항목(state의 qty 맵들)·일정·제휴 정보를 localStorage에 자동 저장
   (`js/store.js`에 `loadEstimateDraft`/`saveEstimateDraft` 추가, 키: `jst_estimate_draft`)
2. 재방문 시 저장분이 있으면 상단에 복원 배너: "이전에 담던 견적이 있어요 [이어서 하기] [새로 시작]"
3. 문의 등록 완료(inquiry.js 제출 성공) 시 draft 삭제

## R8. SEO·공유 기본기 (전 페이지)

1. **favicon**: 기존 로고 SVG(산 모양)를 favicon.svg로 추가, 전 페이지 `<link rel="icon">`
2. **OG 태그**: 페이지별 `og:title`, `og:description`, `og:image`(assets/img/skishopImg.jpg의
   1200×630 크롭 버전 생성), `og:url` — 카카오톡 공유 미리보기 기준으로 확인
3. **meta description**: 페이지별 한 문장
4. **sitemap.xml / robots.txt**: 루트에 추가 (사용자 페이지 5개만 포함, admin 제외.
   robots.txt에서 admin*.html Disallow)
5. **JSON-LD**: index.html에 LocalBusiness 구조화 데이터
   (상호 준스키타운, 주소 전라북도 무주군 설천면 만선로 68, 전화 063-322-0696)

### 완료 기준
- 카카오톡·슬랙에 링크 공유 시 제목/설명/이미지 미리보기 표시
- 비밀글이 비밀번호 없이 열리지 않고, 관리자 화면에서는 기존대로 열람 가능
- 셀프견적 중간 이탈 후 재방문 시 복원 배너 동작

## 결정 대기 항목 (착수 전 확인)

- 가격 노출 정책: 셀프견적 화면에 금액 표시 여부 (현재 비노출). 지시가 없으면 현행 유지.
- 비밀글 기본 체크 유지 여부. 지시가 없으면 현행(기본 체크) 유지.
