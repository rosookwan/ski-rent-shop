# 준스키타운 렌탈샵 (ski-rent-shop)

무주 스키 렌탈샵 "준스키타운" 홈페이지입니다.
[Claude Design](https://claude.ai/design/p/62b09341-9bfb-4960-9165-b86bec0aba5b)에서 제작한 화면들을 바닐라 HTML/CSS/JS로 구현했습니다.

## 페이지

| 파일 | 디자인 원본 | 설명 |
|---|---|---|
| `index.html` + `home.js` | Home.dc.html | 홈 (히어로, 여행 준비 플로우, 제휴 숙소, 게시판 미리보기, 오시는길) |
| `notice.html` | NoticeBoard.dc.html | 공지사항 (목록/상세, 더보기) |
| `inquiry.html` + `inquiry.js` | InquiryBoard.dc.html | 문의게시판 (목록/상세/글쓰기, 셀프견적 첨부·할인 계산) |
| `estimate.html` + `estimate.js` | SelfEstimate.dc.html | 셀프견적 (일정·인원, 날짜별 리프트권/렌탈 담기, 문의 연동) |
| `admin-login.html` | AdminLogin.dc.html | 관리자 로그인 |
| `admin.html` + `admin.js` | Admin.dc.html | 관리자 (품목·할인·공지·문의 관리) |
| `site.js` | Header.dc.html / Footer.dc.html | 공통 헤더·푸터 + 공유 데이터 모듈 |

## 주요 기능

- **셀프견적** — 일정을 정하면 날짜별로 리프트권·장비·의류·안전장비를 나눠 담을 수 있고, 담은 내역이 문의게시판 글쓰기로 자동 첨부돼요.
- **할인 연동** — 관리자에서 설정한 기본/제휴 할인(퍼센트·정액)과 제휴 키워드가 견적 문의에 자동 적용돼요.
- **게시판** — 공지사항·문의게시판(비밀글, 답변 표시)이 관리자 페이지와 localStorage로 연동돼요.
- **관리자** — 렌탈 품목·할인·공지·문의 답변을 관리하며 변경사항이 자동 저장돼요.

모든 데이터는 브라우저 `localStorage`에 저장됩니다 (데모용, 백엔드 없음).

## 실행

정적 사이트라 별도 빌드 없이 바로 열 수 있습니다.

```bash
python3 -m http.server 8080
# http://localhost:8080 접속
```

> 관리자 로그인은 데모용으로, 아이디/비밀번호 입력 후 로그인하면 관리자 페이지로 이동합니다.
> 홈 히어로 이미지(`uploads/skishopImg.png`)는 디자인 자산 내보내기 제한으로 포함되지 않았습니다. 파일을 넣으면 자동 표시되고, 없으면 네이비 배경으로 대체됩니다.
