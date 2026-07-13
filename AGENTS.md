# AGENTS.md — 개발 에이전트 가이드

무주 스키 렌탈샵 "준스키타운" 홈페이지. **고객 시연용 프로토타입**으로, 백엔드 없이
정적 사이트 + localStorage로 동작한다. 실서비스 백엔드 전환은 M3에서 진행한다.

- 배포: https://rosookwan.github.io/ski-rent-shop/ (main 푸시 시 GitHub Pages 자동 배포)
- 계획: [docs/development-plan.md](docs/development-plan.md) — 마일스톤(M1–M4) 정의
- 구조: [docs/architecture.md](docs/architecture.md) — 모듈 구조·데이터 스키마·UI 패턴
- 요구사항: [docs/requirements/](docs/requirements/) — 마일스톤별 상세 스펙과 완료 기준

## 실행과 검증

```bash
python3 -m http.server 8080   # 빌드 없음. http://localhost:8080 접속
```

작업 후 반드시 확인할 것:
1. 브라우저 콘솔 에러 0건 (전 페이지)
2. 핵심 플로우: 홈 → 셀프견적 담기 → 문의 등록 → 관리자(문의 답변 탭)에 표시
3. 모바일 폭(<900px)과 데스크톱 폭 양쪽 레이아웃
4. `node --check js/*.js` 통과

## 소스 구조

```
index.html 등 *.html   # 페이지는 반드시 루트에 (GitHub Pages URL 유지 — 이동 금지)
css/base.css           # 전 페이지 공통 스타일
js/store.js            # ★ 데이터 계층 — 모든 localStorage 접근은 여기서만
js/site.js             # 사용자 화면 공통(헤더/푸터). JSTStore를 포함해 JST로 노출
js/{home,notice,inquiry,estimate}.js  # 사용자 페이지 로직
js/admin.js            # 관리자 페이지 로직 (site.js 미사용, store.js만 사용)
assets/img/            # 이미지
docs/                  # 계획서·아키텍처·요구사항
```

스크립트 로드 순서: 사용자 페이지 `store.js → site.js → 페이지.js`, 관리자 `store.js → admin.js`.

## 필수 규칙

1. **데이터 접근은 JSTStore만**: `localStorage`를 직접 호출하는 코드를 새로 만들지 말 것.
   새 엔티티가 필요하면 `js/store.js`에 load/save 함수를 추가한다. (M3에서 이 파일만
   API 구현으로 교체하는 것이 아키텍처 목표)
2. **XSS 방지**: 사용자 입력을 innerHTML에 넣을 때 반드시 `esc()` (JSTStore.esc) 사용.
3. **디자인 언어 유지**: Claude Design 시안 기반. 색상 네이비 `#14263F` / 오렌지
   `#FF6A3D`(강조 `#E85425`) / 회색 `#8A93A1`·`#4B5563` / 테두리 `#E6E8EC`,
   Pretendard 폰트, radius 10–20px, 인라인 스타일 방식을 따른다. 새 화면도 기존
   페이지의 스타일 조각(js 파일 상단 `S` 객체)을 재사용할 것.
4. **UI 패턴 준수** (자세한 것은 docs/architecture.md):
   - 상태 객체 + `render()` 함수 + innerHTML 재렌더
   - 클릭은 `data-action` 속성 + 이벤트 위임
   - 텍스트 입력은 `input` 이벤트로 상태만 갱신하고 **재렌더하지 않는다** (포커스 유지).
     재렌더는 클릭 액션에서만.
5. **빌드 도구·프레임워크·npm 의존성 추가 금지**: 바닐라 HTML/CSS/JS 유지. 외부
   리소스는 Pretendard CDN뿐이다.
6. **UI 문구는 모두 한국어**, 존댓말("~해요" 톤)로 기존 문구와 통일.
7. **페이지 URL 변경 금지**: html 파일명·경로 변경은 배포된 링크를 깨뜨린다.

## Git

- main 브랜치에 직접 커밋, 푸시하면 GitHub Pages가 자동 재배포된다 (빌드 1분 내외)
- 커밋 메시지: 제목은 영어 명령형, 본문에 한국어 상세 (기존 로그 참조)

## 현재 알려진 한계 (의도된 것 — "고치지" 말 것)

- 관리자 로그인은 아무 값이나 통과 (실제 인증은 M3)
- 데이터는 브라우저별 localStorage (서버 공유는 M3)
- 셀프견적 이메일 발송은 시뮬레이션 (M4)
- 셀프견적 사용자 화면에는 금액을 표시하지 않음 (정책 — docs/development-plan.md §6)
