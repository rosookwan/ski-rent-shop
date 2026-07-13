/* 준스키타운 공통 모듈: 헤더/푸터 + 공유 데이터 (Header.dc.html / Footer.dc.html 구현) */
window.JST = (function () {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }

  function todayDateStr() {
    var d = new Date();
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }

  function load(key, fallback, validate) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (!validate || validate(parsed)) return parsed;
      }
    } catch (e) {}
    return fallback;
  }

  // ── 기본 데이터 (관리자 페이지와 동일 키/구조) ──────────────
  function defaultCatalog() {
    return {
      lift: [
        { id: 'full', name: '종일권', desc: '09:00–17:00', price: 55000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'am', name: '오전권', desc: '09:00–13:00', price: 40000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'pm', name: '오후권', desc: '13:00–17:00', price: 40000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'night', name: '야간권', desc: '18:30–22:00', price: 35000, discountGeneral: 0, discountAffiliate: 0 },
      ],
      equipment: [
        { id: 'ski_set', name: '스키 풀세트', desc: '스키+폴+부츠', price: 25000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'board_set', name: '보드 풀세트', desc: '보드+부츠', price: 28000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'ski_pole', name: '스키+폴', desc: '부츠 제외', price: 18000, discountGeneral: 0, discountAffiliate: 0 },
      ],
      clothing: [
        { id: 'jacket', name: '상의 자켓', desc: '상의만', price: 15000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'pants', name: '하의 팬츠', desc: '하의만', price: 15000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'set', name: '상하의 세트', desc: '자켓+팬츠', price: 25000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'glove', name: '장갑', desc: '프리사이즈', price: 5000, discountGeneral: 0, discountAffiliate: 0 },
      ],
      safety: [
        { id: 'helmet', name: '헬멧', desc: '전 사이즈', price: 8000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'wrist', name: '손목보호대', desc: '프리사이즈', price: 5000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'goggle', name: '고글', desc: 'UV 코팅', price: 7000, discountGeneral: 0, discountAffiliate: 0 },
        { id: 'hip', name: '힙 프로텍터', desc: '프리사이즈', price: 6000, discountGeneral: 0, discountAffiliate: 0 },
      ],
    };
  }

  function defaultDiscountConfig() {
    return {
      general: { enabled: true, type: 'percent', value: 5 },
      affiliate: { enabled: true, type: 'percent', value: 12 },
      keywords: ['여행사', '패키지', '제휴'],
    };
  }

  function mergeDiscountConfig(raw) {
    var def = defaultDiscountConfig();
    if (!raw || typeof raw !== 'object') return def;
    return {
      general: Object.assign({}, def.general, raw.general || {}),
      affiliate: Object.assign({}, def.affiliate, raw.affiliate || {}),
      keywords: Array.isArray(raw.keywords) ? raw.keywords : def.keywords,
    };
  }

  function defaultNotices() {
    return [
      { id: 1, tag: '공지', title: '2025-26 시즌 운영 안내', date: '2026.11.20', body: '2025-26 시즌 운영 일정과 이용 안내입니다. 방문 전 참고해주세요.' },
      { id: 2, tag: '', title: '리프트권 가격 변경 안내', date: '2026.11.05', body: '리프트권 가격이 일부 변경되었습니다. 자세한 내용은 셀프견적 화면에서 확인해주세요.' },
      { id: 3, tag: '', title: '주말 렌탈 예약 마감 임박 안내', date: '2026.10.28', body: '주말 렌탈 물량이 한정되어 있어 미리 예약해주시면 좋아요.' },
      { id: 4, tag: '', title: '설 연휴 운영시간 안내', date: '2026.10.12', body: '설 연휴 기간 운영시간이 일부 조정됩니다.' },
      { id: 5, tag: '', title: '장비 소독·점검 안내', date: '2026.09.30', body: '모든 렌탈 장비는 이용 전후로 소독과 점검을 진행하고 있습니다.' },
      { id: 6, tag: '', title: '제휴 숙소 추가 안내', date: '2026.09.15', body: '제휴 숙소가 추가되었습니다. 숙박안내에서 확인해보세요.' },
      { id: 7, tag: '', title: '시즌권 사전예약 안내', date: '2026.09.01', body: '시즌권 사전예약을 받고 있습니다. 문의게시판으로 남겨주세요.' },
      { id: 8, tag: '', title: '홈페이지 리뉴얼 안내', date: '2026.08.20', body: '셀프견적을 포함해 홈페이지가 새로워졌습니다.' },
    ];
  }

  function defaultInquiries() {
    return [
      { id: 1, title: '숙박 문의드립니다', date: '2026.07.10', status: '답변완료', secret: false, name: '', contact: '', email: '', content: '무주리조트 근처에서 2박 묵을 숙소를 찾고 있어요. 4인 가족 기준으로 추천 부탁드려요.', answer: '안녕하세요, 문의주셔서 감사합니다. 원하시는 일정에 맞는 숙소를 안내해드렸어요.' },
      { id: 2, title: '렌탈 사이즈 관련 문의', date: '2026.07.09', status: '답변대기', secret: true, name: '', contact: '', email: '', content: '', answer: '' },
      { id: 3, title: '리프트권 단체 할인 문의', date: '2026.07.06', status: '답변완료', secret: false, name: '', contact: '', email: '', content: '20명 단체로 방문 예정인데 리프트권 할인이 가능한가요?', answer: '단체 인원 기준 할인 안내를 답변드렸습니다.' },
      { id: 4, title: '주차 가능 여부 문의', date: '2026.07.02', status: '답변완료', secret: false, name: '', contact: '', email: '', content: '방문객 주차 공간이 따로 있는지 궁금합니다.', answer: '네, 방문객 전용 주차공간이 마련되어 있습니다.' },
      { id: 5, title: '초보자 강습 문의', date: '2026.06.28', status: '답변대기', secret: false, name: '', contact: '', email: '', content: '스키가 처음인데 강습 프로그램이 있을까요?', answer: '' },
      { id: 6, title: '예약 변경 문의', date: '2026.06.25', status: '답변완료', secret: true, name: '', contact: '', email: '', content: '', answer: '예약 변경 처리해드렸습니다.' },
    ];
  }

  function loadCatalog() {
    return load('jst_catalog', defaultCatalog(), function (p) {
      return p && p.lift && p.equipment && p.clothing && p.safety;
    });
  }
  function loadNotices() { return load('jst_notices', defaultNotices(), Array.isArray); }
  function loadInquiries() { return load('jst_inquiries', defaultInquiries(), Array.isArray); }
  function loadDiscountConfig() { return mergeDiscountConfig(load('jst_discount_config', null)); }

  // ── 헤더 / 푸터 ─────────────────────────────────────────────
  function logoSVG(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none">' +
      '<path d="M2 18.5L7.5 9.5L11.5 18.5Z" fill="#FF6A3D" fill-opacity="0.5"/>' +
      '<path d="M6.5 18.5L14 4.5L22 18.5Z" fill="#FF6A3D"/>' +
      '<path d="M14 4.5L16.1 8.6L11.9 8.6Z" fill="#FFFFFF"/>' +
      '<circle cx="18.7" cy="6.3" r="1.3" fill="#FFFFFF"/>' +
    '</svg>';
  }

  function headerHTML(active) {
    function navLink(key, href, label) {
      var on = active === key;
      if (key === 'selfcalc') {
        return '<a href="' + href + '" style="padding:9px 18px;border-radius:999px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;white-space:nowrap;flex:none;background:' + (on ? '#E85425' : '#FF6A3D') + ';">' + label + '</a>';
      }
      return on
        ? '<a href="' + href + '" style="padding:9px 16px;border-radius:999px;font-size:14px;font-weight:700;color:#14263F;text-decoration:none;white-space:nowrap;flex:none;background:#F5F6F8;border:1px solid #E6E8EC;">' + label + '</a>'
        : '<a href="' + href + '" style="padding:9px 16px;border-radius:999px;font-size:14px;font-weight:600;color:#4B5563;text-decoration:none;white-space:nowrap;flex:none;border:1px solid transparent;">' + label + '</a>';
    }
    return '<div style="background:#FFFFFF;">' +
      '<div style="max-width:1200px;margin:0 auto;padding:14px clamp(16px,4vw,32px) 0;display:flex;align-items:center;justify-content:space-between;gap:14px;">' +
        '<a href="index.html" style="display:flex;align-items:center;gap:9px;text-decoration:none;flex:none;">' +
          '<span style="width:34px;height:34px;border-radius:9px;background:#14263F;display:flex;align-items:center;justify-content:center;flex:none;">' + logoSVG(20) + '</span>' +
          '<span style="font-weight:800;font-size:18px;color:#14263F;letter-spacing:-0.02em;white-space:nowrap;">준스키타운</span>' +
        '</a>' +
        '<a href="tel:0633220696" style="display:flex;align-items:center;gap:6px;flex:none;background:#F5F6F8;border:1px solid #E6E8EC;padding:8px 14px;border-radius:999px;text-decoration:none;color:#14263F;font-weight:700;font-size:13px;white-space:nowrap;">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex:none;"><path d="M6.6 10.8C8 13.6 10.4 16 13.2 17.4L15.4 15.2C15.7 14.9 16.1 14.8 16.5 14.9C17.7 15.3 19 15.5 20.3 15.5C20.9 15.5 21.3 16 21.3 16.5V20.3C21.3 20.9 20.9 21.3 20.3 21.3C10.7 21.3 3 13.6 3 4C3 3.4 3.4 3 4 3H7.8C8.3 3 8.8 3.4 8.8 4C8.8 5.3 9 6.6 9.4 7.8C9.5 8.2 9.4 8.6 9.1 8.9L6.6 10.8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
          '전화문의' +
        '</a>' +
      '</div>' +
      '<nav style="max-width:1200px;margin:0 auto;padding:12px clamp(16px,4vw,32px) 12px;display:flex;flex-wrap:wrap;gap:8px;">' +
        navLink('notice', 'notice.html', '공지사항') +
        navLink('inquiry', 'inquiry.html', '문의게시판') +
        navLink('selfcalc', 'estimate.html', '셀프견적') +
        navLink('lodging', 'index.html#lodging', '숙박안내') +
        navLink('visit', 'index.html#visit', '오시는길') +
      '</nav>' +
      '<div style="height:1px;background:#E6E8EC;"></div>' +
    '</div>';
  }

  function footerHTML(opts) {
    opts = opts || {};
    var linkStyle = 'color:rgba(255,255,255,.75);text-decoration:none;font-size:14px;font-weight:600;';
    var html = '<footer style="background:#14263F;color:#FFFFFF;">' +
      '<div style="max-width:1200px;margin:0 auto;padding:40px clamp(16px,4vw,32px) 28px;display:flex;flex-direction:column;gap:22px;">' +
        '<div style="display:flex;flex-wrap:wrap;gap:10px 20px;">' +
          '<a href="index.html" style="' + linkStyle + '">홈</a>' +
          '<a href="notice.html" style="' + linkStyle + '">공지사항</a>' +
          '<a href="inquiry.html" style="' + linkStyle + '">문의게시판</a>' +
          '<a href="estimate.html" style="' + linkStyle + '">셀프견적</a>' +
          '<a href="index.html#lodging" style="' + linkStyle + '">숙박안내</a>' +
          '<a href="index.html#visit" style="' + linkStyle + '">오시는길</a>' +
        '</div>' +
        '<div style="height:1px;background:rgba(255,255,255,.12);"></div>' +
        '<div style="display:flex;flex-direction:column;gap:7px;">' +
          '<div style="font-weight:800;font-size:15px;letter-spacing:-0.01em;">준스키타운</div>' +
          '<p style="margin:0;font-size:12.5px;line-height:1.85;color:rgba(255,255,255,.55);word-break:keep-all;">' +
            '대표자 : 오용선 · 사업자번호 : 753-55-00685 · 통신판매신고 : 제 2022-전북무주-0045호<br/>' +
            '주소 : 전라북도 무주군 설천면 만선로 68 · TEL : 063-322-0696 · H.P : 010-9433-0696' +
          '</p>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-top:4px;">' +
          '<span style="font-size:12px;color:rgba(255,255,255,.4);">© 2026 Junskitown. All rights reserved.</span>' +
          '<a href="admin-login.html" style="font-size:12px;color:rgba(255,255,255,.35);text-decoration:none;">관리자</a>' +
        '</div>' +
      '</div>';
    if (!opts.hideMobileBar) {
      html += '<div class="jst-mobile-spacer" style="height:70px;"></div>' +
        '<div class="jst-mobile-bar" style="position:fixed;left:0;right:0;bottom:0;z-index:60;background:#FFFFFF;border-top:1px solid #E6E8EC;padding:10px clamp(12px,4vw,24px) calc(10px + env(safe-area-inset-bottom));gap:10px;box-shadow:0 -8px 24px rgba(20,38,63,0.10);">' +
          '<a href="tel:0633220696" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:13px 10px;border-radius:12px;border:1.5px solid #14263F;color:#14263F;font-weight:700;font-size:14.5px;text-decoration:none;white-space:nowrap;">전화문의</a>' +
          '<a href="estimate.html" style="flex:1.3;display:flex;align-items:center;justify-content:center;gap:6px;padding:13px 10px;border-radius:12px;background:#FF6A3D;color:#FFFFFF;font-weight:800;font-size:14.5px;text-decoration:none;white-space:nowrap;">셀프견적 시작</a>' +
        '</div>';
    }
    html += '</footer>';
    return html;
  }

  function injectChrome(active, opts) {
    var h = document.getElementById('siteHeader');
    var f = document.getElementById('siteFooter');
    if (h) h.innerHTML = headerHTML(active);
    if (f) f.innerHTML = footerHTML(opts);
  }

  // 공용 스타일 (모바일 하단 바 표시 제어)
  (function () {
    var style = document.createElement('style');
    style.textContent =
      '.jst-mobile-spacer{display:none;}' +
      '.jst-mobile-bar{display:none;}' +
      '@media (max-width:899px){.jst-mobile-spacer{display:block;}.jst-mobile-bar{display:flex;}}';
    document.head.appendChild(style);
  })();

  return {
    esc: esc, won: won, todayDateStr: todayDateStr, load: load,
    defaultCatalog: defaultCatalog, defaultDiscountConfig: defaultDiscountConfig,
    mergeDiscountConfig: mergeDiscountConfig, defaultNotices: defaultNotices, defaultInquiries: defaultInquiries,
    loadCatalog: loadCatalog, loadNotices: loadNotices, loadInquiries: loadInquiries, loadDiscountConfig: loadDiscountConfig,
    headerHTML: headerHTML, footerHTML: footerHTML, injectChrome: injectChrome,
  };
})();
