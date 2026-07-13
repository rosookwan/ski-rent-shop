/**
 * 관리자 페이지 로직 (Admin.dc.html 디자인 구현)
 * 데이터 조회/저장은 JSTStore(js/store.js)를 통해서만 한다.
 * 로드 순서: store.js → admin.js
 */
(function () {
  'use strict';

  // ── 로그인 세션 확인 (프로토타입: 실제 인증은 M3) ───────────
  if (!JSTStore.hasAdminSession()) {
    window.location.replace('admin-login.html');
    return;
  }

  // ── 상태 ────────────────────────────────────────────────────
  var state = {
    activeTab: 'lift',
    catalog: JSTStore.loadCatalog(),
    discountConfig: JSTStore.loadDiscountConfig(),
    notices: JSTStore.loadNotices(),
    inquiries: JSTStore.loadInquiries(),
    expandedInquiryId: null,
    answerDrafts: {},
    showResetConfirm: false,
    draftName: '', draftDesc: '', draftPrice: '', draftError: '',
    draftKeyword: '',
    draftNoticeTag: '', draftNoticeTitle: '', draftNoticeBody: '', noticeError: '',
  };

  var TABS = [
    { key: 'lift', label: '리프트권' },
    { key: 'equipment', label: '장비' },
    { key: 'clothing', label: '의류' },
    { key: 'safety', label: '안전장비' },
    { key: 'discount', label: '할인 설정' },
    { key: 'notice', label: '공지사항' },
    { key: 'inquiry', label: '문의 답변' },
  ];
  var CATALOG_TABS = ['lift', 'equipment', 'clothing', 'safety'];

  // ── 저장 + "저장됨" 표시 ─────────────────────────────────────
  var flashTimer = null;
  function showFlash() {
    var el = document.getElementById('savedFlash');
    el.style.display = 'inline-block';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.style.display = 'none'; }, 1600);
  }
  var persistCatalog = function () { JSTStore.saveCatalog(state.catalog); showFlash(); };
  var persistDiscount = function () { JSTStore.saveDiscountConfig(state.discountConfig); showFlash(); };
  var persistNotices = function () { JSTStore.saveNotices(state.notices); showFlash(); };
  var persistInquiries = function () { JSTStore.saveInquiries(state.inquiries); showFlash(); };

  var todayDateStr = JSTStore.todayDateStr;
  var esc = JSTStore.esc;

  function nonNegInt(v) {
    var n = parseInt(v || '0', 10);
    return isNaN(n) ? 0 : Math.max(0, n);
  }
  function nonNegFloat(v) {
    var n = parseFloat(v || '0');
    return isNaN(n) ? 0 : Math.max(0, n);
  }

  // ── 스타일 조각 ─────────────────────────────────────────────
  var S = {
    tabOn: 'flex:none;padding:9px 16px;border-radius:11px;background:#14263F;color:#FFFFFF;font-weight:700;font-size:13.5px;border:none;cursor:pointer;font-family:inherit;white-space:nowrap;',
    tabOff: 'flex:none;padding:9px 16px;border-radius:11px;background:#FFFFFF;color:#4B5563;font-weight:600;font-size:13.5px;border:1.5px solid #E6E8EC;cursor:pointer;font-family:inherit;white-space:nowrap;',
    pillOn: 'flex:none;padding:7px 13px;border-radius:999px;background:#14263F;color:#FFFFFF;font-weight:700;font-size:12.5px;border:none;cursor:pointer;font-family:inherit;white-space:nowrap;',
    pillOff: 'flex:none;padding:7px 13px;border-radius:999px;background:#FFFFFF;color:#8A93A1;font-weight:600;font-size:12.5px;border:1.5px solid #E6E8EC;cursor:pointer;font-family:inherit;white-space:nowrap;',
    typeOn: 'flex:none;padding:9px 14px;border-radius:10px;background:#14263F;color:#FFFFFF;font-weight:700;font-size:13px;border:none;cursor:pointer;font-family:inherit;',
    typeOff: 'flex:none;padding:9px 14px;border-radius:10px;background:#FFFFFF;color:#4B5563;font-weight:600;font-size:13px;border:1.5px solid #E6E8EC;cursor:pointer;font-family:inherit;',
    input: 'padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:13.5px;color:#14263F;width:100%;',
    deleteBtn: 'flex:none;width:36px;height:36px;border-radius:10px;border:1.5px solid #F3D9D6;background:#FDF3F2;color:#E0483E;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;',
    primaryBtn: 'padding:12px;border-radius:11px;border:none;background:#14263F;color:#FFFFFF;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;',
  };

  // ── 렌더링 ──────────────────────────────────────────────────
  function pageMeta() {
    var t = state.activeTab;
    if (t === 'notice') return { title: '공지사항 관리', desc: '공지사항을 작성하고 관리하세요. 변경사항은 자동으로 저장돼요.' };
    if (t === 'inquiry') return { title: '문의 답변 관리', desc: '고객이 남긴 문의를 확인하고 답변을 등록하세요. 답변을 저장하면 상태가 답변완료로 바뀌어요.' };
    if (t === 'discount') return { title: '할인 설정', desc: '셀프견적 문의에 적용할 기본 할인과 제휴업체 할인, 제휴 키워드를 설정하세요. 변경사항은 자동으로 저장돼요.' };
    return { title: '렌탈 품목 관리', desc: '셀프견적에 표시되는 리프트권·장비·의류·안전장비 품목을 추가하거나 가격을 조정하세요. 변경사항은 자동으로 저장돼요.' };
  }

  function renderTabs() {
    return TABS.map(function (t) {
      var on = state.activeTab === t.key;
      return '<button data-action="set-tab" data-tab="' + t.key + '" style="' + (on ? S.tabOn : S.tabOff) + '">' + t.label + '</button>';
    }).join('');
  }

  function generalHelperText(d) {
    return d.general.type === 'percent'
      ? '견적 금액의 ' + d.general.value + '%가 할인돼요.'
      : '품목별로 따로 정하지 않으면 1개당 ' + Math.round(d.general.value).toLocaleString('ko-KR') + '원씩 할인돼요. 특정 품목만 다르게 하려면 아래 리프트권·장비·의류·안전장비 탭에서 품목별로 설정하세요.';
  }
  function affiliateHelperText(d) {
    return d.affiliate.type === 'percent'
      ? '견적 금액의 ' + d.affiliate.value + '%가 할인돼요.'
      : '품목별로 따로 정하지 않으면 1개당 ' + Math.round(d.affiliate.value).toLocaleString('ko-KR') + '원씩 할인돼요. 특정 품목만 다르게 하려면 아래 리프트권·장비·의류·안전장비 탭에서 품목별로 설정하세요.';
  }

  function renderDiscountSection(section) {
    var d = state.discountConfig;
    var cfg = d[section];
    var isGeneral = section === 'general';
    var title = isGeneral ? '기본 할인' : '제휴업체 할인';
    var descText = isGeneral
      ? '제휴 키워드와 일치하지 않는 모든 셀프견적 문의에 기본으로 적용돼요.'
      : "아래 제휴 키워드와 일치하면 기본 할인 대신 이 할인이 적용되고, 상품 금액 옆에 '제휴 할인가'로 표시돼요.";
    var html = '<div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;">' +
        '<div style="font-size:15px;font-weight:800;color:#14263F;">' + title + '</div>' +
        '<button data-action="toggle-enabled" data-section="' + section + '" style="' + (cfg.enabled ? S.pillOn : S.pillOff) + '">' + (cfg.enabled ? '사용 중' : '사용 안 함') + '</button>' +
      '</div>' +
      '<p style="margin:0 0 14px;font-size:12.5px;color:#8A93A1;line-height:1.6;">' + descText + '</p>';
    if (cfg.enabled) {
      html +=
        '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
          '<button data-action="set-disc-type" data-section="' + section + '" data-type="percent" style="' + (cfg.type === 'percent' ? S.typeOn : S.typeOff) + '">퍼센트 할인 (%)</button>' +
          '<button data-action="set-disc-type" data-section="' + section + '" data-type="fixed" style="' + (cfg.type === 'fixed' ? S.typeOn : S.typeOff) + '">정액 할인 (원)</button>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;max-width:220px;">' +
          '<input type="number" data-input="disc-value" data-section="' + section + '" value="' + esc(cfg.value) + '" style="flex:1;min-width:0;' + S.input + '" />' +
          '<span style="flex:none;font-size:13px;color:#8A93A1;font-weight:600;">' + (cfg.type === 'percent' ? '%' : '원') + '</span>' +
        '</div>' +
        '<div id="helper-' + section + '" style="margin-top:8px;font-size:12px;color:#8A93A1;line-height:1.6;">' + esc(isGeneral ? generalHelperText(d) : affiliateHelperText(d)) + '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderDiscountTab() {
    var d = state.discountConfig;
    var chips = d.keywords.map(function (k, i) {
      return '<span style="display:inline-flex;align-items:center;gap:6px;padding:7px 8px 7px 13px;border-radius:999px;background:#F5F6F8;border:1px solid #E6E8EC;font-size:13px;font-weight:700;color:#14263F;">' +
        esc(k) +
        '<button data-action="remove-keyword" data-idx="' + i + '" aria-label="키워드 삭제" style="width:18px;height:18px;border-radius:999px;border:none;background:#E6E8EC;color:#6B7280;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;padding:0;">×</button>' +
      '</span>';
    }).join('');
    if (d.keywords.length === 0) {
      chips = '<span style="font-size:13px;color:#C3C9D2;padding:7px 0;">등록된 키워드가 없어요.</span>';
    }
    return '<div style="display:flex;flex-direction:column;gap:22px;">' +
      renderDiscountSection('general') +
      '<div style="height:1px;background:#F0F1F3;"></div>' +
      renderDiscountSection('affiliate') +
      '<div style="height:1px;background:#F0F1F3;"></div>' +
      '<div>' +
        '<div style="font-size:15px;font-weight:800;color:#14263F;margin-bottom:6px;">제휴 키워드</div>' +
        '<p style="margin:0 0 14px;font-size:12.5px;color:#8A93A1;line-height:1.6;">고객이 셀프견적에서 입력한 제휴업체명에 아래 단어 중 하나라도 포함되어 있으면 제휴업체 할인이 적용돼요.</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">' + chips + '</div>' +
        '<div style="display:flex;gap:8px;max-width:320px;">' +
          '<input type="text" data-input="draft-keyword" value="' + esc(state.draftKeyword) + '" placeholder="예: 여행사, 패키지" style="flex:1;min-width:0;padding:11px 13px;border-radius:11px;border:1.5px solid #E6E8EC;font-size:13.5px;color:#14263F;" />' +
          '<button data-action="add-keyword" style="flex:none;padding:11px 16px;border-radius:11px;border:none;background:#14263F;color:#FFFFFF;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;white-space:nowrap;">추가</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderCatalogTab() {
    var cat = state.activeTab;
    var d = state.discountConfig;
    var items = state.catalog[cat] || [];
    var showGeneralFixed = d.general.type === 'fixed';
    var showAffiliateFixed = d.affiliate.type === 'fixed';

    var html = '<div style="font-size:12.5px;font-weight:700;color:#8A93A1;margin-bottom:14px;">' + items.length + '개 품목</div>';

    if (showGeneralFixed || showAffiliateFixed) {
      html += '<div style="margin-bottom:14px;padding:10px 14px;border-radius:11px;background:#FFF9F5;border:1px solid #FFD9C4;font-size:12px;color:#4B5563;line-height:1.6;">품목마다 정액할인 금액을 다르게 넣을 수 있어요. 비워두면 할인 설정 탭의 기본값이 적용돼요.</div>';
    }

    html += '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">';
    items.forEach(function (it) {
      html += '<div style="border:1px solid #E6E8EC;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<input type="text" data-input="item-field" data-id="' + esc(it.id) + '" data-field="name" value="' + esc(it.name) + '" placeholder="이름" style="flex:1;min-width:0;padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:14px;font-weight:700;color:#14263F;" />' +
          '<button data-action="remove-item" data-id="' + esc(it.id) + '" aria-label="삭제" style="' + S.deleteBtn + '">×</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">' +
          '<input type="text" data-input="item-field" data-id="' + esc(it.id) + '" data-field="desc" value="' + esc(it.desc) + '" placeholder="설명 (예: 09:00–17:00)" style="' + S.input + '" />' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<input type="number" data-input="item-field" data-id="' + esc(it.id) + '" data-field="price" value="' + esc(it.price) + '" placeholder="가격" style="flex:1;min-width:0;' + S.input + '" />' +
            '<span style="flex:none;font-size:13px;color:#8A93A1;font-weight:600;">원</span>' +
          '</div>' +
        '</div>';
      if (showGeneralFixed) {
        html += '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="flex:none;font-size:12px;color:#8A93A1;font-weight:700;white-space:nowrap;min-width:82px;">기본 정액할인</span>' +
          '<input type="number" data-input="item-field" data-id="' + esc(it.id) + '" data-field="discountGeneral" value="' + esc(it.discountGeneral || 0) + '" placeholder="미입력시 ' + (d.general.value || 0) + '원" style="flex:1;min-width:0;padding:9px 11px;border-radius:9px;border:1.5px solid #E6E8EC;font-size:13px;color:#14263F;width:100%;" />' +
          '<span style="flex:none;font-size:12.5px;color:#8A93A1;font-weight:600;">원</span>' +
        '</div>';
      }
      if (showAffiliateFixed) {
        html += '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="flex:none;font-size:12px;color:#8A93A1;font-weight:700;white-space:nowrap;min-width:82px;">제휴 정액할인</span>' +
          '<input type="number" data-input="item-field" data-id="' + esc(it.id) + '" data-field="discountAffiliate" value="' + esc(it.discountAffiliate || 0) + '" placeholder="미입력시 ' + (d.affiliate.value || 0) + '원" style="flex:1;min-width:0;padding:9px 11px;border-radius:9px;border:1.5px solid #E6E8EC;font-size:13px;color:#14263F;width:100%;" />' +
          '<span style="flex:none;font-size:12.5px;color:#8A93A1;font-weight:600;">원</span>' +
        '</div>';
      }
      html += '</div>';
    });
    html += '</div>';

    html += '<div style="border-top:1px solid #F0F1F3;padding-top:18px;">' +
      '<div style="font-size:12.5px;font-weight:700;color:#4B5563;margin-bottom:10px;">새 품목 추가</div>' +
      '<div style="border:1.5px dashed #D8DCE3;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;">' +
        '<input type="text" data-input="draft-name" value="' + esc(state.draftName) + '" placeholder="이름" style="padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:14px;color:#14263F;width:100%;" />' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">' +
          '<input type="text" data-input="draft-desc" value="' + esc(state.draftDesc) + '" placeholder="설명 (선택)" style="' + S.input + '" />' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<input type="number" data-input="draft-price" value="' + esc(state.draftPrice) + '" placeholder="가격" style="flex:1;min-width:0;' + S.input + '" />' +
            '<span style="flex:none;font-size:13px;color:#8A93A1;font-weight:600;">원</span>' +
          '</div>' +
        '</div>' +
        (state.draftError ? '<div style="font-size:12.5px;color:#E0483E;">' + esc(state.draftError) + '</div>' : '') +
        '<button data-action="add-item" style="' + S.primaryBtn + '">이 품목 추가하기</button>' +
      '</div>' +
    '</div>';

    return html;
  }

  function renderNoticeTab() {
    var html = '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">';
    state.notices.forEach(function (n) {
      html += '<div style="border:1px solid #E6E8EC;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<input type="text" data-input="notice-field" data-id="' + n.id + '" data-field="tag" value="' + esc(n.tag) + '" placeholder="태그(선택)" style="width:110px;flex:none;padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:13px;color:#14263F;" />' +
          '<input type="text" data-input="notice-field" data-id="' + n.id + '" data-field="title" value="' + esc(n.title) + '" placeholder="제목" style="flex:1;min-width:160px;padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:14px;font-weight:700;color:#14263F;" />' +
          '<span style="flex:none;font-size:12px;color:#8A93A1;font-weight:600;white-space:nowrap;">' + esc(n.date) + '</span>' +
          '<button data-action="remove-notice" data-id="' + n.id + '" aria-label="삭제" style="' + S.deleteBtn + '">×</button>' +
        '</div>' +
        '<textarea data-input="notice-field" data-id="' + n.id + '" data-field="body" placeholder="내용" rows="3" style="padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:13.5px;color:#14263F;width:100%;line-height:1.6;resize:vertical;font-family:inherit;">' + esc(n.body) + '</textarea>' +
      '</div>';
    });
    if (state.notices.length === 0) {
      html += '<div style="font-size:13px;color:#8A93A1;padding:8px 0;">등록된 공지사항이 없어요.</div>';
    }
    html += '</div>';

    html += '<div style="border-top:1px solid #F0F1F3;padding-top:18px;">' +
      '<div style="font-size:12.5px;font-weight:700;color:#4B5563;margin-bottom:10px;">새 공지 작성</div>' +
      '<div style="border:1.5px dashed #D8DCE3;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<input type="text" data-input="draft-notice-tag" value="' + esc(state.draftNoticeTag) + '" placeholder="태그(선택, 예: 공지)" style="width:160px;flex:none;padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:13px;color:#14263F;" />' +
          '<input type="text" data-input="draft-notice-title" value="' + esc(state.draftNoticeTitle) + '" placeholder="제목" style="flex:1;min-width:160px;padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:14px;color:#14263F;" />' +
        '</div>' +
        '<textarea data-input="draft-notice-body" placeholder="내용을 입력하세요" rows="4" style="padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:13.5px;color:#14263F;width:100%;line-height:1.6;resize:vertical;font-family:inherit;">' + esc(state.draftNoticeBody) + '</textarea>' +
        (state.noticeError ? '<div style="font-size:12.5px;color:#E0483E;">' + esc(state.noticeError) + '</div>' : '') +
        '<button data-action="add-notice" style="' + S.primaryBtn + '">공지 등록하기</button>' +
      '</div>' +
    '</div>';

    return html;
  }

  function renderInquiryTab() {
    var html = '<div style="display:flex;flex-direction:column;gap:10px;">';
    state.inquiries.forEach(function (q) {
      var expanded = state.expandedInquiryId === q.id;
      var done = q.status === '답변완료';
      var draft = state.answerDrafts[q.id] !== undefined ? state.answerDrafts[q.id] : (q.answer || '');
      html += '<div style="border:1px solid #E6E8EC;border-radius:14px;overflow:hidden;">' +
        '<button data-action="toggle-inquiry" data-id="' + q.id + '" style="width:100%;display:flex;align-items:center;gap:10px;padding:14px;background:none;border:none;cursor:pointer;text-align:left;font-family:inherit;">' +
          (q.secret ? '<span style="flex:none;font-size:13px;">🔒</span>' : '') +
          '<span style="flex:1;min-width:0;font-size:14px;color:#14263F;font-weight:700;">' + esc(q.title) + '</span>' +
          '<span style="flex:none;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:800;background:' + (done ? '#E9F7EF' : '#F0F1F3') + ';color:' + (done ? '#1F9254' : '#6B7280') + ';white-space:nowrap;">' + esc(q.status) + '</span>' +
          '<span style="flex:none;font-size:12px;color:#8A93A1;white-space:nowrap;">' + esc(q.date) + '</span>' +
          '<span style="flex:none;color:#8A93A1;font-size:12px;font-weight:700;white-space:nowrap;">' + (expanded ? '접기 ▲' : '펼치기 ▼') + '</span>' +
        '</button>';
      if (expanded) {
        html += '<div style="padding:0 14px 16px;display:flex;flex-direction:column;gap:12px;border-top:1px solid #F0F1F3;">' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px 16px;padding-top:12px;font-size:12.5px;color:#8A93A1;font-weight:600;">' +
            '<span>이름 ' + esc(q.name && q.name.trim() ? q.name : '-') + '</span>' +
            '<span>연락처 ' + esc(q.contact && q.contact.trim() ? q.contact : '-') + '</span>' +
            '<span>이메일 ' + esc(q.email && q.email.trim() ? q.email : '-') + '</span>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;font-weight:700;color:#4B5563;margin-bottom:6px;">문의 내용</div>' +
            '<div style="padding:12px 14px;border-radius:10px;background:#F5F6F8;font-size:13.5px;color:#374151;line-height:1.7;white-space:pre-wrap;">' + esc(q.content && q.content.trim() ? q.content : '(등록된 문의 내용이 없어요)') + '</div>' +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;font-weight:700;color:#4B5563;margin-bottom:6px;">답변</div>' +
            '<textarea data-input="answer-draft" data-id="' + q.id + '" placeholder="답변을 입력하세요" rows="4" style="padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:13.5px;color:#14263F;width:100%;line-height:1.6;resize:vertical;font-family:inherit;">' + esc(draft) + '</textarea>' +
          '</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<button data-action="save-answer" data-id="' + q.id + '" style="flex:1;padding:11px;border-radius:10px;border:none;background:#14263F;color:#FFFFFF;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">' + (done ? '답변 수정하기' : '답변 등록하기') + '</button>' +
            '<button data-action="remove-inquiry" data-id="' + q.id + '" style="flex:none;padding:11px 16px;border-radius:10px;border:1.5px solid #F3D9D6;background:#FDF3F2;color:#E0483E;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">삭제</button>' +
          '</div>' +
        '</div>';
      }
      html += '</div>';
    });
    if (state.inquiries.length === 0) {
      html += '<div style="font-size:13px;color:#8A93A1;padding:8px 0;">등록된 문의가 없어요.</div>';
    }
    html += '</div>';
    return html;
  }

  function renderAll() {
    var meta = pageMeta();
    document.getElementById('pageTitle').textContent = meta.title;
    document.getElementById('pageDesc').textContent = meta.desc;
    document.getElementById('tabBar').innerHTML = renderTabs();

    var panel = document.getElementById('panel');
    var tab = state.activeTab;
    if (tab === 'discount') panel.innerHTML = renderDiscountTab();
    else if (tab === 'notice') panel.innerHTML = renderNoticeTab();
    else if (tab === 'inquiry') panel.innerHTML = renderInquiryTab();
    else panel.innerHTML = renderCatalogTab();

    document.getElementById('resetRow').style.display = CATALOG_TABS.indexOf(tab) !== -1 ? '' : 'none';
    document.getElementById('resetModal').style.display = state.showResetConfirm ? 'flex' : 'none';
  }

  // ── 동작 ────────────────────────────────────────────────────
  var actions = {
    'set-tab': function (el) { state.activeTab = el.dataset.tab; renderAll(); },

    'toggle-enabled': function (el) {
      var s = el.dataset.section;
      state.discountConfig[s].enabled = !state.discountConfig[s].enabled;
      persistDiscount(); renderAll();
    },
    'set-disc-type': function (el) {
      state.discountConfig[el.dataset.section].type = el.dataset.type;
      persistDiscount(); renderAll();
    },
    'add-keyword': function () {
      var kw = (state.draftKeyword || '').trim();
      if (!kw) return;
      var exists = state.discountConfig.keywords.some(function (k) { return k.toLowerCase() === kw.toLowerCase(); });
      if (!exists) {
        state.discountConfig.keywords.push(kw);
        persistDiscount();
      }
      state.draftKeyword = '';
      renderAll();
    },
    'remove-keyword': function (el) {
      state.discountConfig.keywords.splice(Number(el.dataset.idx), 1);
      persistDiscount(); renderAll();
    },

    'remove-item': function (el) {
      var cat = state.activeTab;
      state.catalog[cat] = state.catalog[cat].filter(function (it) { return it.id !== el.dataset.id; });
      persistCatalog(); renderAll();
    },
    'add-item': function () {
      var cat = state.activeTab;
      var name = state.draftName.trim();
      var price = parseInt(state.draftPrice, 10);
      if (!name) { state.draftError = '이름을 입력해주세요'; renderAll(); return; }
      if (isNaN(price) || price < 0) { state.draftError = '올바른 가격을 입력해주세요'; renderAll(); return; }
      state.catalog[cat].push({
        id: cat + '_' + Date.now(),
        name: name, desc: state.draftDesc.trim(), price: price,
        discountGeneral: 0, discountAffiliate: 0,
      });
      state.draftName = ''; state.draftDesc = ''; state.draftPrice = ''; state.draftError = '';
      persistCatalog(); renderAll();
    },
    'request-reset': function () { state.showResetConfirm = true; renderAll(); },
    'cancel-reset': function () { state.showResetConfirm = false; renderAll(); },
    'confirm-reset': function () {
      state.catalog = JSTStore.defaultCatalog();
      state.showResetConfirm = false;
      persistCatalog(); renderAll();
    },

    'remove-notice': function (el) {
      var id = Number(el.dataset.id);
      state.notices = state.notices.filter(function (n) { return n.id !== id; });
      persistNotices(); renderAll();
    },
    'add-notice': function () {
      var title = (state.draftNoticeTitle || '').trim();
      var body = (state.draftNoticeBody || '').trim();
      if (!title) { state.noticeError = '제목을 입력해주세요'; renderAll(); return; }
      if (!body) { state.noticeError = '내용을 입력해주세요'; renderAll(); return; }
      state.notices.unshift({ id: Date.now(), tag: (state.draftNoticeTag || '').trim(), title: title, date: todayDateStr(), body: body });
      state.draftNoticeTag = ''; state.draftNoticeTitle = ''; state.draftNoticeBody = ''; state.noticeError = '';
      persistNotices(); renderAll();
    },

    'toggle-inquiry': function (el) {
      var id = Number(el.dataset.id);
      state.expandedInquiryId = state.expandedInquiryId === id ? null : id;
      renderAll();
    },
    'save-answer': function (el) {
      var id = Number(el.dataset.id);
      var q = state.inquiries.find(function (x) { return x.id === id; });
      if (!q) return;
      var draft = (state.answerDrafts[id] !== undefined ? state.answerDrafts[id] : (q.answer || '')).trim();
      q.answer = draft;
      q.status = draft ? '답변완료' : '답변대기';
      persistInquiries(); renderAll();
    },
    'remove-inquiry': function (el) {
      var id = Number(el.dataset.id);
      state.inquiries = state.inquiries.filter(function (x) { return x.id !== id; });
      if (state.expandedInquiryId === id) state.expandedInquiryId = null;
      persistInquiries(); renderAll();
    },
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  // 입력은 리렌더 없이 상태만 갱신해 포커스를 유지한다.
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-input]');
    if (!el) return;
    var kind = el.dataset.input;
    var v = el.value;

    if (kind === 'item-field') {
      var cat = state.activeTab;
      var it = (state.catalog[cat] || []).find(function (x) { return x.id === el.dataset.id; });
      if (!it) return;
      var field = el.dataset.field;
      if (field === 'price') it.price = nonNegInt(v);
      else if (field === 'discountGeneral' || field === 'discountAffiliate') it[field] = nonNegFloat(v);
      else it[field] = v;
      persistCatalog();
    } else if (kind === 'disc-value') {
      var section = el.dataset.section;
      state.discountConfig[section].value = nonNegFloat(v);
      persistDiscount();
      var helper = document.getElementById('helper-' + section);
      if (helper) helper.textContent = section === 'general' ? generalHelperText(state.discountConfig) : affiliateHelperText(state.discountConfig);
    } else if (kind === 'notice-field') {
      var id = Number(el.dataset.id);
      var n = state.notices.find(function (x) { return x.id === id; });
      if (!n) return;
      n[el.dataset.field] = v;
      persistNotices();
    } else if (kind === 'answer-draft') {
      state.answerDrafts[Number(el.dataset.id)] = v;
    } else if (kind === 'draft-name') { state.draftName = v; state.draftError = ''; }
    else if (kind === 'draft-desc') { state.draftDesc = v; }
    else if (kind === 'draft-price') { state.draftPrice = v; state.draftError = ''; }
    else if (kind === 'draft-keyword') { state.draftKeyword = v; }
    else if (kind === 'draft-notice-tag') { state.draftNoticeTag = v; }
    else if (kind === 'draft-notice-title') { state.draftNoticeTitle = v; state.noticeError = ''; }
    else if (kind === 'draft-notice-body') { state.draftNoticeBody = v; state.noticeError = ''; }
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    JSTStore.clearAdminSession();
    window.location.href = 'admin-login.html';
  });

  renderAll();
})();
