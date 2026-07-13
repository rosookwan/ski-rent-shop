/**
 * 데이터 계층 (Data Access Layer)
 *
 * 모든 페이지의 데이터 저장/조회는 반드시 이 모듈(JSTStore)을 통해서만 한다.
 * localStorage를 직접 만지는 코드를 다른 파일에 추가하지 말 것.
 *
 * ▶ M3(백엔드 이관) 시나리오: 이 파일의 내부 구현(localStorage)을 API 호출로
 *   교체하면 나머지 코드는 수정 없이 동작하는 것이 목표다.
 *   (그 시점에 load·save 함수는 async로 바뀌고 호출부 조정이 필요하다 —
 *    docs/architecture.md의 "M3 전환 계획" 참고)
 *
 * 데이터 스키마는 docs/architecture.md 참고.
 */
window.JSTStore = (function () {
  'use strict';

  var KEYS = {
    catalog: 'jst_catalog',
    discount: 'jst_discount_config',
    notices: 'jst_notices',
    inquiries: 'jst_inquiries',
    estimate: 'jst_estimate',
    estimateDraft: 'jst_estimate_draft',
    tripInfo: 'jst_trip_info',
    adminSession: 'jst_admin_session',
  };

  // ── 공통 유틸 ───────────────────────────────────────────────
  /** HTML 이스케이프. 사용자 입력을 innerHTML에 넣을 때 반드시 사용. */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 원화 표기: 55000 → "55,000원" */
  function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }

  /** 오늘 날짜 "YYYY.MM.DD" */
  function todayDateStr() {
    var d = new Date();
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }

  function loadRaw(key, fallback, validate) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (!validate || validate(parsed)) return parsed;
      }
    } catch (e) {}
    return fallback;
  }

  function saveRaw(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function removeRaw(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  // ── 기본(시드) 데이터 ───────────────────────────────────────
  function defaultCatalog() {
    return {
      lift: [
        { id: 'full', name: '종일권', desc: '09:00–17:00', price: 55000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'am', name: '오전권', desc: '09:00–13:00', price: 40000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'pm', name: '오후권', desc: '13:00–17:00', price: 40000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'night', name: '야간권', desc: '18:30–22:00', price: 35000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
      ],
      equipment: [
        { id: 'ski_set', name: '스키 풀세트', desc: '스키+폴+부츠', price: 25000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'board_set', name: '보드 풀세트', desc: '보드+부츠', price: 28000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'ski_pole', name: '스키+폴', desc: '부츠 제외', price: 18000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
      ],
      clothing: [
        { id: 'jacket', name: '상의 자켓', desc: '상의만', price: 15000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'pants', name: '하의 팬츠', desc: '하의만', price: 15000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'set', name: '상하의 세트', desc: '자켓+팬츠', price: 25000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'glove', name: '장갑', desc: '프리사이즈', price: 5000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
      ],
      safety: [
        { id: 'helmet', name: '헬멧', desc: '전 사이즈', price: 8000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'wrist', name: '손목보호대', desc: '프리사이즈', price: 5000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'goggle', name: '고글', desc: 'UV 코팅', price: 7000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'hip', name: '힙 프로텍터', desc: '프리사이즈', price: 6000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
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
      { id: 2, title: '렌탈 사이즈 관련 문의', date: '2026.07.09', status: '답변대기', secret: true, password: '1234', name: '', contact: '', email: '', content: '', answer: '' },
      { id: 3, title: '리프트권 단체 할인 문의', date: '2026.07.06', status: '답변완료', secret: false, name: '', contact: '', email: '', content: '20명 단체로 방문 예정인데 리프트권 할인이 가능한가요?', answer: '단체 인원 기준 할인 안내를 답변드렸습니다.' },
      { id: 4, title: '주차 가능 여부 문의', date: '2026.07.02', status: '답변완료', secret: false, name: '', contact: '', email: '', content: '방문객 주차 공간이 따로 있는지 궁금합니다.', answer: '네, 방문객 전용 주차공간이 마련되어 있습니다.' },
      { id: 5, title: '초보자 강습 문의', date: '2026.06.28', status: '답변대기', secret: false, name: '', contact: '', email: '', content: '스키가 처음인데 강습 프로그램이 있을까요?', answer: '' },
      { id: 6, title: '예약 변경 문의', date: '2026.06.25', status: '답변완료', secret: true, password: '1234', name: '', contact: '', email: '', content: '', answer: '예약 변경 처리해드렸습니다.' },
    ];
  }

  // ── 엔티티별 조회/저장 ──────────────────────────────────────
  function loadCatalog() {
    return loadRaw(KEYS.catalog, defaultCatalog(), function (p) {
      return p && p.lift && p.equipment && p.clothing && p.safety;
    });
  }
  function saveCatalog(catalog) { saveRaw(KEYS.catalog, catalog); }

  function loadDiscountConfig() { return mergeDiscountConfig(loadRaw(KEYS.discount, null)); }
  function saveDiscountConfig(config) { saveRaw(KEYS.discount, config); }

  function loadNotices() { return loadRaw(KEYS.notices, defaultNotices(), Array.isArray); }
  function saveNotices(notices) { saveRaw(KEYS.notices, notices); }

  function loadInquiries() { return loadRaw(KEYS.inquiries, defaultInquiries(), Array.isArray); }
  function saveInquiries(inquiries) { saveRaw(KEYS.inquiries, inquiries); }
  function verifyInquiryPassword(id, password) {
    var provided = String(password || '');
    if (!provided) return false;
    var inquiry = loadInquiries().find(function (item) { return String(item.id) === String(id); });
    return !!inquiry && !!inquiry.secret && String(inquiry.password || '') === provided;
  }

  /** 셀프견적 → 문의게시판 전달 페이로드 */
  function loadEstimate() { return loadRaw(KEYS.estimate, null); }
  function saveEstimate(payload) { saveRaw(KEYS.estimate, payload); }

  /** 셀프견적 작성 중 자동 저장 데이터 */
  function loadEstimateDraft() {
    return loadRaw(KEYS.estimateDraft, null, function (draft) {
      return !!draft && typeof draft === 'object' &&
        draft.liftQty && draft.equipmentQty && draft.clothingQty && draft.safetyQty;
    });
  }
  function saveEstimateDraft(draft) { saveRaw(KEYS.estimateDraft, draft); }
  function clearEstimateDraft() { removeRaw(KEYS.estimateDraft); }

  /** 홈 → 셀프견적 전달 일정·인원 */
  function loadTripInfo() { return loadRaw(KEYS.tripInfo, null); }
  function saveTripInfo(info) { saveRaw(KEYS.tripInfo, info); }

  // ── 관리자 세션 (프로토타입: 실제 인증은 M3) ────────────────
  function hasAdminSession() {
    try { return !!localStorage.getItem(KEYS.adminSession); } catch (e) { return false; }
  }
  function setAdminSession() {
    try { localStorage.setItem(KEYS.adminSession, '1'); } catch (e) {}
  }
  function clearAdminSession() {
    try { localStorage.removeItem(KEYS.adminSession); } catch (e) {}
  }

  return {
    KEYS: KEYS,
    esc: esc, won: won, todayDateStr: todayDateStr,
    defaultCatalog: defaultCatalog,
    defaultDiscountConfig: defaultDiscountConfig,
    mergeDiscountConfig: mergeDiscountConfig,
    defaultNotices: defaultNotices,
    defaultInquiries: defaultInquiries,
    loadCatalog: loadCatalog, saveCatalog: saveCatalog,
    loadDiscountConfig: loadDiscountConfig, saveDiscountConfig: saveDiscountConfig,
    loadNotices: loadNotices, saveNotices: saveNotices,
    loadInquiries: loadInquiries, saveInquiries: saveInquiries, verifyInquiryPassword: verifyInquiryPassword,
    loadEstimate: loadEstimate, saveEstimate: saveEstimate,
    loadEstimateDraft: loadEstimateDraft, saveEstimateDraft: saveEstimateDraft, clearEstimateDraft: clearEstimateDraft,
    loadTripInfo: loadTripInfo, saveTripInfo: saveTripInfo,
    hasAdminSession: hasAdminSession, setAdminSession: setAdminSession, clearAdminSession: clearAdminSession,
  };
})();
