/**
 * 관리자 페이지 로직 (Admin.dc.html 디자인 구현)
 * 데이터 조회/저장은 JSTStore(js/store.js)를 통해서만 한다.
 * 로드 순서: config.js → store.js → admin.js
 */
(function () {
  'use strict';

  // ── 상태 ────────────────────────────────────────────────────
  var state = {
    activeTab: 'lift',
    catalog: JSTStore.defaultCatalog(),
    discountConfig: JSTStore.defaultDiscountConfig(),
    notices: [], inquiries: [],
    loading: true, loadError: '', operationError: '', saving: false,
    answerDrafts: {},
    showResetConfirm: false,
    draftName: '', draftDesc: '', draftPrice: '', draftError: '',
    draftKeyword: '',
    noticeView: 'list', noticeSearch: '', noticePage: 1,
    noticeEditingId: null, noticeDeleteId: null,
    noticeFormTag: '', noticeFormTitle: '', noticeFormBody: '', noticeFormPinned: false, noticeError: '',
    noticeFiles: [], noticePendingFiles: [],
    inquiryView: 'list', inquiryFilter: 'all', inquirySearch: '', inquiryPage: 1,
    selectedInquiryId: null,
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

  // ── 저장 + 상태 표시 ─────────────────────────────────────────
  var flashTimer = null;
  function showFlash() {
    var el = document.getElementById('savedFlash');
    el.style.display = 'inline-block';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { el.style.display = 'none'; }, 1600);
  }
  function handleError(error, fallback) {
    if (error && error.status === 401) {
      window.location.replace('admin-login.html?expired=1');
      return;
    }
    state.operationError = (error && error.message) || fallback || '변경사항을 저장하지 못했어요.';
    renderAll();
  }

  var catalogSaveTimers = {};
  function queueCatalogSave(cat, item) {
    var key = cat + ':' + item.id;
    clearTimeout(catalogSaveTimers[key]);
    catalogSaveTimers[key] = setTimeout(async function () {
      try {
        var saved = await JSTStore.updateCatalogItem(cat, item.id, item);
        Object.assign(item, saved);
        state.operationError = '';
        showFlash();
      } catch (error) {
        handleError(error);
      }
    }, 500);
  }

  var discountSaveTimer = null;
  function persistDiscount(immediate) {
    clearTimeout(discountSaveTimer);
    var save = async function () {
      try {
        state.discountConfig = await JSTStore.saveDiscountConfig(state.discountConfig);
        state.operationError = '';
        showFlash();
      } catch (error) {
        handleError(error);
      }
    };
    if (immediate) save();
    else discountSaveTimer = setTimeout(save, 500);
  }

  var esc = JSTStore.esc;

  function nonNegInt(v) {
    var n = parseInt(v || '0', 10);
    return isNaN(n) ? 0 : Math.max(0, n);
  }
  function nonNegFloat(v) {
    var n = parseFloat(v || '0');
    return isNaN(n) ? 0 : Math.max(0, n);
  }
  function parseCatalogPrice(v) {
    var digits = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    return digits ? nonNegInt(digits) : 0;
  }
  function formatCatalogPrice(v) {
    var digits = String(v == null ? '' : v).replace(/[^0-9]/g, '');
    return digits ? parseCatalogPrice(digits).toLocaleString('ko-KR') : '';
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

  function renderAdminSummary() {
    var pendingCount = state.inquiries.filter(function (q) { return q.status !== '답변완료'; }).length;
    var itemCount = CATALOG_TABS.reduce(function (total, cat) {
      return total + (state.catalog[cat] || []).length;
    }, 0);
    return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 16px;border:1px solid #E6E8EC;border-radius:14px;background:#F8F9FA;font-size:13.5px;font-weight:700;color:#4B5563;">' +
      '<button data-action="open-pending-inquiries" style="padding:0;border:none;background:none;color:#E85425;font:inherit;font-weight:800;cursor:pointer;text-decoration:underline;text-underline-offset:3px;">답변대기 문의 ' + pendingCount + '건</button>' +
      '<span aria-hidden="true" style="color:#C3C9D2;">·</span>' +
      '<span>공지 ' + state.notices.length + '건</span>' +
      '<span aria-hidden="true" style="color:#C3C9D2;">·</span>' +
      '<span>품목 ' + itemCount + '개</span>' +
    '</div>';
  }

  function discountLabel(section) {
    var cfg = state.discountConfig[section];
    var name = section === 'general' ? '기본' : '제휴';
    if (!cfg.enabled) return name + ' 할인 사용 안 함';
    var value = cfg.type === 'percent'
      ? cfg.value + '%'
      : Math.round(cfg.value).toLocaleString('ko-KR') + '원';
    return name + ' ' + value + ' 할인';
  }

  function discountSummaryText() {
    return '현재 적용 — ' + discountLabel('general') + ' · ' + discountLabel('affiliate');
  }

  function firstCatalogItem() {
    for (var i = 0; i < CATALOG_TABS.length; i++) {
      var items = state.catalog[CATALOG_TABS[i]] || [];
      if (items.length) return items[0];
    }
    return null;
  }

  function discountPreviewText(section) {
    var cfg = state.discountConfig[section];
    if (!cfg.enabled) return '할인을 켜면 적용 예시를 확인할 수 있어요.';
    if (cfg.type === 'fixed') {
      return '1개당 ' + Math.round(cfg.value).toLocaleString('ko-KR') + '원씩 할인돼요.';
    }
    var item = firstCatalogItem();
    if (!item) return '품목을 등록하면 적용 예시를 확인할 수 있어요.';
    var price = Math.max(0, Number(item.price) || 0);
    var discountAmount = Math.round(price * ((Number(cfg.value) || 0) / 100));
    discountAmount = Math.max(0, Math.min(price, discountAmount));
    return item.name + ' ' + JSTStore.won(price) + ' → ' + JSTStore.won(price - discountAmount);
  }

  function updateDiscountDynamicText() {
    var summary = document.getElementById('discount-summary');
    if (summary) summary.textContent = discountSummaryText();
    ['general', 'affiliate'].forEach(function (section) {
      var preview = document.getElementById('preview-' + section);
      if (preview) preview.textContent = discountPreviewText(section);
    });
  }

  function renderDiscountSection(section) {
    var d = state.discountConfig;
    var cfg = d[section];
    var isGeneral = section === 'general';
    var title = isGeneral ? '기본 할인' : '제휴업체 할인';
    var descText = isGeneral
      ? '제휴 키워드와 일치하지 않는 모든 셀프견적 문의에 기본으로 적용돼요.'
      : "아래 제휴 키워드와 일치하면 기본 할인 대신 이 할인이 적용되고, 상품 금액 옆에 '제휴 할인가'로 표시돼요.";
    var disabled = cfg.enabled ? '' : ' disabled';
    var html = '<div style="border:1px solid #E6E8EC;border-radius:14px;padding:16px;">' +
      '<div style="font-size:15px;font-weight:800;color:#14263F;margin-bottom:5px;">' + title + '</div>' +
      '<p style="margin:0 0 14px;font-size:12.5px;color:#8A93A1;line-height:1.6;">' + descText + '</p>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
        '<button data-action="toggle-enabled" data-section="' + section + '" aria-pressed="' + cfg.enabled + '" style="' + (cfg.enabled ? S.pillOn : S.pillOff) + '">' + (cfg.enabled ? 'ON' : 'OFF') + '</button>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;opacity:' + (cfg.enabled ? '1' : '.42') + ';">' +
          '<button data-action="set-disc-type" data-section="' + section + '" data-type="percent"' + disabled + ' style="' + (cfg.type === 'percent' ? S.typeOn : S.typeOff) + (cfg.enabled ? '' : 'cursor:not-allowed;') + '">' + (cfg.type === 'percent' ? '●' : '○') + ' 퍼센트</button>' +
          '<button data-action="set-disc-type" data-section="' + section + '" data-type="fixed"' + disabled + ' style="' + (cfg.type === 'fixed' ? S.typeOn : S.typeOff) + (cfg.enabled ? '' : 'cursor:not-allowed;') + '">' + (cfg.type === 'fixed' ? '●' : '○') + ' 정액</button>' +
          '<div style="display:flex;align-items:center;gap:7px;width:150px;max-width:100%;">' +
            '<input type="number" min="0" data-input="disc-value" data-section="' + section + '" value="' + esc(cfg.value) + '"' + disabled + ' aria-label="' + title + ' 값" style="flex:1;min-width:0;' + S.input + (cfg.enabled ? '' : 'cursor:not-allowed;background:#F5F6F8;') + '" />' +
            '<span style="flex:none;font-size:13px;color:#8A93A1;font-weight:700;">' + (cfg.type === 'percent' ? '%' : '원') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:#F5F6F8;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:11.5px;font-weight:800;color:#FF6A3D;">적용 예시</span>' +
        '<span id="preview-' + section + '" style="font-size:12.5px;font-weight:700;color:#4B5563;">' + esc(discountPreviewText(section)) + '</span>' +
      '</div>' +
    '</div>';
    return html;
  }

  function renderFixedDiscountTable() {
    var d = state.discountConfig;
    if (d.general.type !== 'fixed' && d.affiliate.type !== 'fixed') return '';

    var categoryLabels = { lift: '리프트권', equipment: '장비', clothing: '의류', safety: '안전장비' };
    var rows = '';
    CATALOG_TABS.forEach(function (cat) {
      var items = state.catalog[cat] || [];
      if (!items.length) return;
      rows += '<tr><th colspan="4" style="padding:10px 12px;background:#F5F6F8;color:#4B5563;font-size:12px;font-weight:800;text-align:left;border-bottom:1px solid #E6E8EC;">' + categoryLabels[cat] + '</th></tr>';
      items.forEach(function (it) {
        var generalDisabled = d.general.type !== 'fixed' || !d.general.enabled;
        var affiliateDisabled = d.affiliate.type !== 'fixed' || !d.affiliate.enabled;
        rows += '<tr>' +
          '<td style="padding:11px 12px;border-bottom:1px solid #F0F1F3;font-size:13px;font-weight:700;color:#14263F;">' + esc(it.name) + '</td>' +
          '<td style="padding:11px 12px;border-bottom:1px solid #F0F1F3;font-size:12.5px;color:#4B5563;white-space:nowrap;">' + JSTStore.won(it.price) + '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #F0F1F3;">' +
            '<input type="number" min="0" data-input="fixed-item-discount" data-cat="' + cat + '" data-id="' + esc(it.id) + '" data-field="discountGeneral" value="' + esc(it.discountGeneral || '') + '" placeholder="기본값 사용"' + (generalDisabled ? ' disabled' : '') + ' aria-label="' + esc(it.name) + ' 기본할인" style="min-width:116px;' + S.input + (generalDisabled ? 'background:#F5F6F8;color:#C3C9D2;cursor:not-allowed;' : '') + '" />' +
          '</td>' +
          '<td style="padding:8px 10px;border-bottom:1px solid #F0F1F3;">' +
            '<input type="number" min="0" data-input="fixed-item-discount" data-cat="' + cat + '" data-id="' + esc(it.id) + '" data-field="discountAffiliate" value="' + esc(it.discountAffiliate || '') + '" placeholder="기본값 사용"' + (affiliateDisabled ? ' disabled' : '') + ' aria-label="' + esc(it.name) + ' 제휴할인" style="min-width:116px;' + S.input + (affiliateDisabled ? 'background:#F5F6F8;color:#C3C9D2;cursor:not-allowed;' : '') + '" />' +
          '</td>' +
        '</tr>';
      });
    });

    return '<div>' +
      '<div style="font-size:15px;font-weight:800;color:#14263F;margin-bottom:6px;">품목별 정액할인</div>' +
      '<p style="margin:0 0 12px;font-size:12.5px;color:#8A93A1;line-height:1.6;">0 또는 빈칸이면 위에서 설정한 기본값을 사용해요. 정액 할인이 켜진 열만 입력할 수 있어요.</p>' +
      '<div style="overflow-x:auto;border:1px solid #E6E8EC;border-radius:12px;">' +
        '<table style="width:100%;min-width:620px;border-collapse:collapse;background:#FFFFFF;">' +
          '<thead><tr style="background:#FAFAFB;">' +
            '<th style="padding:11px 12px;text-align:left;font-size:12px;color:#8A93A1;border-bottom:1px solid #E6E8EC;">품목</th>' +
            '<th style="padding:11px 12px;text-align:left;font-size:12px;color:#8A93A1;border-bottom:1px solid #E6E8EC;">가격</th>' +
            '<th style="padding:11px 12px;text-align:left;font-size:12px;color:#8A93A1;border-bottom:1px solid #E6E8EC;">기본할인(원)</th>' +
            '<th style="padding:11px 12px;text-align:left;font-size:12px;color:#8A93A1;border-bottom:1px solid #E6E8EC;">제휴할인(원)</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
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
      '<div id="discount-summary" style="padding:15px 16px;border-radius:14px;background:#14263F;color:#FFFFFF;font-size:14px;font-weight:800;line-height:1.6;">' + esc(discountSummaryText()) + '</div>' +
      renderDiscountSection('general') +
      renderDiscountSection('affiliate') +
      '<div style="height:1px;background:#F0F1F3;"></div>' +
      renderFixedDiscountTable() +
      (d.general.type === 'fixed' || d.affiliate.type === 'fixed' ? '<div style="height:1px;background:#F0F1F3;"></div>' : '') +
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
    var items = state.catalog[cat] || [];

    var html = '<div style="font-size:12.5px;font-weight:700;color:#8A93A1;margin-bottom:14px;">' + items.length + '개 품목</div>';

    html += '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">';
    items.forEach(function (it, index) {
      var hidden = !!it.hidden;
      html += '<div data-item-row="' + esc(it.id) + '" style="border:1px solid #E6E8EC;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;background:' + (hidden ? '#FAFAFB' : '#FFFFFF') + ';opacity:' + (hidden ? '.58' : '1') + ';transition:opacity .16s ease;">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<input type="text" data-input="item-field" data-id="' + esc(it.id) + '" data-field="name" value="' + esc(it.name) + '" placeholder="이름" style="flex:1;min-width:180px;padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:14px;font-weight:700;color:#14263F;" />' +
          (hidden ? '<span style="flex:none;padding:4px 8px;border-radius:6px;background:#E6E8EC;color:#6B7280;font-size:11px;font-weight:800;">숨김</span>' : '') +
          '<div style="display:flex;align-items:center;gap:6px;flex:none;">' +
            '<button data-action="move-item" data-id="' + esc(it.id) + '" data-direction="up" aria-label="' + esc(it.name) + ' 위로 이동"' + (index === 0 ? ' disabled' : '') + ' style="width:36px;height:36px;border-radius:10px;border:1.5px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-size:15px;font-weight:800;cursor:' + (index === 0 ? 'not-allowed' : 'pointer') + ';opacity:' + (index === 0 ? '.38' : '1') + ';font-family:inherit;">↑</button>' +
            '<button data-action="move-item" data-id="' + esc(it.id) + '" data-direction="down" aria-label="' + esc(it.name) + ' 아래로 이동"' + (index === items.length - 1 ? ' disabled' : '') + ' style="width:36px;height:36px;border-radius:10px;border:1.5px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-size:15px;font-weight:800;cursor:' + (index === items.length - 1 ? 'not-allowed' : 'pointer') + ';opacity:' + (index === items.length - 1 ? '.38' : '1') + ';font-family:inherit;">↓</button>' +
            '<button data-action="toggle-item-hidden" data-id="' + esc(it.id) + '" aria-pressed="' + hidden + '" style="height:36px;padding:0 11px;border-radius:10px;border:1.5px solid ' + (hidden ? '#D8DCE3' : '#E6E8EC') + ';background:' + (hidden ? '#F0F1F3' : '#FFFFFF') + ';color:#4B5563;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">' + (hidden ? '다시 노출' : '숨기기') + '</button>' +
            '<button data-action="remove-item" data-id="' + esc(it.id) + '" aria-label="' + esc(it.name) + ' 삭제" style="' + S.deleteBtn + '">×</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">' +
          '<input type="text" data-input="item-field" data-id="' + esc(it.id) + '" data-field="desc" value="' + esc(it.desc) + '" placeholder="설명 (예: 09:00–17:00)" style="' + S.input + '" />' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<input type="text" inputmode="numeric" data-input="item-field" data-id="' + esc(it.id) + '" data-field="price" value="' + esc(formatCatalogPrice(it.price)) + '" placeholder="가격" style="flex:1;min-width:0;' + S.input + '" />' +
            '<span style="flex:none;font-size:13px;color:#8A93A1;font-weight:600;">원</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';

    html += '<div style="border-top:1px solid #F0F1F3;padding-top:18px;">' +
      '<div style="font-size:12.5px;font-weight:700;color:#4B5563;margin-bottom:10px;">새 품목 추가</div>' +
      '<div style="border:1.5px dashed #D8DCE3;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;">' +
        '<input type="text" data-input="draft-name" value="' + esc(state.draftName) + '" placeholder="이름" style="padding:10px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:14px;color:#14263F;width:100%;" />' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">' +
          '<input type="text" data-input="draft-desc" value="' + esc(state.draftDesc) + '" placeholder="설명 (선택)" style="' + S.input + '" />' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<input type="text" inputmode="numeric" data-input="draft-price" value="' + esc(state.draftPrice) + '" placeholder="가격" style="flex:1;min-width:0;' + S.input + '" />' +
            '<span style="flex:none;font-size:13px;color:#8A93A1;font-weight:600;">원</span>' +
          '</div>' +
        '</div>' +
        (state.draftError ? '<div style="font-size:12.5px;color:#E0483E;">' + esc(state.draftError) + '</div>' : '') +
        '<button data-action="add-item" style="' + S.primaryBtn + '">이 품목 추가하기</button>' +
      '</div>' +
    '</div>';

    return html;
  }

  function orderedNotices() {
    return state.notices.filter(function (n) { return !!n.pinned; })
      .concat(state.notices.filter(function (n) { return !n.pinned; }));
  }

  function filteredNotices() {
    var query = (state.noticeSearch || '').trim().toLowerCase();
    return orderedNotices().filter(function (n) {
      if (!query) return true;
      return String(n.title || '').toLowerCase().indexOf(query) !== -1 ||
        String(n.body || '').toLowerCase().indexOf(query) !== -1;
    });
  }

  function renderNoticePagination(totalPages) {
    if (totalPages <= 1) return '';
    var start = Math.max(1, Math.min(state.noticePage - 2, totalPages - 4));
    var end = Math.min(totalPages, start + 4);
    var html = '<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:16px;flex-wrap:wrap;">' +
      '<button data-action="notice-page" data-page="' + Math.max(1, state.noticePage - 1) + '"' + (state.noticePage === 1 ? ' disabled' : '') + ' aria-label="이전 페이지" style="width:36px;height:36px;border-radius:9px;border:1px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:800;cursor:' + (state.noticePage === 1 ? 'not-allowed' : 'pointer') + ';opacity:' + (state.noticePage === 1 ? '.42' : '1') + ';font-family:inherit;">◀</button>';
    for (var page = start; page <= end; page++) {
      var active = page === state.noticePage;
      html += '<button data-action="notice-page" data-page="' + page + '"' + (active ? ' aria-current="page"' : '') + ' style="width:36px;height:36px;border-radius:9px;border:' + (active ? 'none' : '1px solid #E6E8EC') + ';background:' + (active ? '#14263F' : '#FFFFFF') + ';color:' + (active ? '#FFFFFF' : '#4B5563') + ';font-weight:800;cursor:pointer;font-family:inherit;">' + page + '</button>';
    }
    html += '<button data-action="notice-page" data-page="' + Math.min(totalPages, state.noticePage + 1) + '"' + (state.noticePage === totalPages ? ' disabled' : '') + ' aria-label="다음 페이지" style="width:36px;height:36px;border-radius:9px;border:1px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:800;cursor:' + (state.noticePage === totalPages ? 'not-allowed' : 'pointer') + ';opacity:' + (state.noticePage === totalPages ? '.42' : '1') + ';font-family:inherit;">▶</button>' +
    '</div>';
    return html;
  }

  function renderNoticeListResults() {
    var notices = filteredNotices();
    var totalPages = Math.max(1, Math.ceil(notices.length / 10));
    state.noticePage = Math.max(1, Math.min(state.noticePage, totalPages));
    var pageNotices = notices.slice((state.noticePage - 1) * 10, state.noticePage * 10);
    var html = '<div style="font-size:12.5px;font-weight:700;color:#8A93A1;margin-bottom:12px;">' + notices.length + '건</div>' +
      '<div style="border:1px solid #E6E8EC;border-radius:14px;overflow:hidden;">';

    pageNotices.forEach(function (n) {
      html += '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px;border-bottom:1px solid #F0F1F3;align-items:center;">' +
        '<div style="min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          (n.pinned ? '<span title="상단 고정" aria-label="상단 고정" style="flex:none;font-size:14px;">📌</span>' : '') +
          (n.tag ? '<span style="flex:none;padding:4px 8px;border-radius:6px;background:#FFF3EC;color:#FF6A3D;font-size:11px;font-weight:800;">' + esc(n.tag) + '</span>' : '') +
          '<span style="min-width:140px;flex:1;font-size:14px;font-weight:700;color:#14263F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(n.title) + '</span>' +
          '<span style="flex:none;font-size:12px;color:#8A93A1;font-weight:600;white-space:nowrap;">' + esc(n.date) + '</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
          '<button data-action="edit-notice" data-id="' + esc(n.id) + '" aria-label="' + esc(n.title) + ' 수정" style="padding:7px 10px;border-radius:8px;border:1px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">수정</button>' +
          '<button data-action="request-remove-notice" data-id="' + esc(n.id) + '" aria-label="' + esc(n.title) + ' 삭제" style="padding:7px 10px;border-radius:8px;border:1px solid #F3D9D6;background:#FDF3F2;color:#E0483E;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">삭제</button>' +
        '</div>' +
      '</div>';
    });

    if (!pageNotices.length) {
      html += '<div style="padding:28px 18px;text-align:center;font-size:13px;color:#8A93A1;">' + (state.noticeSearch ? '검색 결과가 없어요.' : '등록된 공지사항이 없어요.') + '</div>';
    }
    html += '</div>' + renderNoticePagination(totalPages);
    return html;
  }

  function updateNoticeListResults() {
    var target = document.getElementById('notice-list-results');
    if (target) target.innerHTML = renderNoticeListResults();
  }

  function renderNoticeList() {
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px;flex-wrap:wrap;">' +
      '<input type="search" data-input="notice-search" value="' + esc(state.noticeSearch) + '" placeholder="제목 또는 내용 검색" aria-label="공지 검색" style="flex:1;min-width:200px;max-width:440px;' + S.input + '" />' +
      '<button data-action="new-notice" style="padding:11px 16px;border-radius:11px;border:none;background:#14263F;color:#FFFFFF;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;white-space:nowrap;">+ 새 공지</button>' +
    '</div>' +
    '<div id="notice-list-results">' + renderNoticeListResults() + '</div>';
  }

  function renderNoticeForm() {
    var editing = state.noticeEditingId !== null;
    var existingFiles = state.noticeFiles.length ? state.noticeFiles.map(function (file) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:9px;background:#FFFFFF;border:1px solid #E6E8EC;">' +
        '<span aria-hidden="true">📎</span><span style="flex:1;min-width:0;font-size:12.5px;font-weight:700;color:#14263F;overflow-wrap:anywhere;">' + esc(file.name) + '</span>' +
        '<button type="button" data-action="remove-notice-file" data-file-id="' + esc(file.id) + '" style="padding:5px 8px;border-radius:7px;border:1px solid #F3D9D6;background:#FDF3F2;color:#E0483E;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">삭제</button></div>';
    }).join('') : '';
    var pendingFiles = state.noticePendingFiles.length ? '<div style="font-size:11.5px;color:#4B5563;line-height:1.7;">업로드 예정: ' + state.noticePendingFiles.map(function (file) { return esc(file.name); }).join(', ') + '</div>' : '';
    return '<div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:18px;flex-wrap:wrap;">' +
        '<div style="font-size:17px;font-weight:800;color:#14263F;">' + (editing ? '공지 수정' : '새 공지 작성') + '</div>' +
        '<button data-action="cancel-notice-form" style="padding:8px 4px;border:none;background:none;color:#8A93A1;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">목록으로</button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:16px;">' +
        '<label style="display:flex;flex-direction:column;gap:7px;">' +
          '<span style="font-size:12.5px;font-weight:700;color:#4B5563;">태그 <span style="color:#8A93A1;font-weight:500;">(선택)</span></span>' +
          '<input type="text" data-input="notice-form-tag" value="' + esc(state.noticeFormTag) + '" placeholder="예: 공지, 이벤트" style="' + S.input + '" />' +
        '</label>' +
        '<label style="display:flex;flex-direction:column;gap:7px;">' +
          '<span style="font-size:12.5px;font-weight:700;color:#4B5563;">제목</span>' +
          '<input type="text" data-input="notice-form-title" value="' + esc(state.noticeFormTitle) + '" placeholder="제목을 입력해주세요" style="' + S.input + '" />' +
        '</label>' +
        '<label style="display:flex;flex-direction:column;gap:7px;">' +
          '<span style="font-size:12.5px;font-weight:700;color:#4B5563;">내용</span>' +
          '<textarea data-input="notice-form-body" rows="9" placeholder="내용을 입력해주세요" style="' + S.input + 'line-height:1.7;resize:vertical;font-family:inherit;">' + esc(state.noticeFormBody) + '</textarea>' +
        '</label>' +
        '<label style="display:flex;align-items:center;gap:9px;padding:12px 14px;border-radius:11px;background:#F5F6F8;cursor:pointer;">' +
          '<input type="checkbox" data-input="notice-form-pinned"' + (state.noticeFormPinned ? ' checked' : '') + ' style="width:17px;height:17px;accent-color:#FF6A3D;" />' +
          '<span style="font-size:13px;font-weight:700;color:#14263F;">상단에 고정할게요</span>' +
        '</label>' +
        '<div style="padding:14px;border:1.5px dashed #D8DCE3;border-radius:12px;background:#FAFAFB;display:flex;flex-direction:column;gap:9px;">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-size:12.5px;font-weight:700;color:#4B5563;">첨부파일</span><span style="padding:3px 7px;border-radius:6px;background:#F0F1F3;color:#8A93A1;font-size:10.5px;font-weight:800;">PDF·JPG·PNG·WEBP · 최대 5개</span></div>' +
          existingFiles + pendingFiles +
          '<input type="file" data-input="notice-files" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" aria-label="첨부파일" style="width:100%;font-size:12.5px;color:#4B5563;cursor:pointer;" />' +
        '</div>' +
        (state.noticeError ? '<div style="font-size:12.5px;color:#E0483E;font-weight:600;">' + esc(state.noticeError) + '</div>' : '') +
        '<div style="display:flex;gap:9px;">' +
          '<button data-action="save-notice"' + (state.saving ? ' disabled' : '') + ' style="flex:1;' + S.primaryBtn + 'opacity:' + (state.saving ? '.6' : '1') + ';cursor:' + (state.saving ? 'wait' : 'pointer') + ';">' + (state.saving ? '저장하고 있어요…' : (editing ? '수정 저장' : '등록')) + '</button>' +
          '<button data-action="cancel-notice-form" style="flex:1;padding:12px;border-radius:11px;border:1.5px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">취소</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderNoticeTab() {
    return state.noticeView === 'form' ? renderNoticeForm() : renderNoticeList();
  }

  function findInquiryById(id) {
    return state.inquiries.find(function (q) { return String(q.id) === String(id); });
  }

  function pendingInquiryCount() {
    return state.inquiries.filter(function (q) { return q.status !== '답변완료'; }).length;
  }

  function filteredInquiries() {
    var query = (state.inquirySearch || '').trim().toLowerCase();
    return state.inquiries.filter(function (q) {
      var isDone = q.status === '답변완료';
      if (state.inquiryFilter === 'pending' && isDone) return false;
      if (state.inquiryFilter === 'done' && !isDone) return false;
      if (!query) return true;
      return String(q.title || '').toLowerCase().indexOf(query) !== -1 ||
        String(q.name || '').toLowerCase().indexOf(query) !== -1 ||
        String(q.contact || '').toLowerCase().indexOf(query) !== -1;
    });
  }

  function renderInquiryPagination(totalPages) {
    if (totalPages <= 1) return '';
    var start = Math.max(1, Math.min(state.inquiryPage - 2, totalPages - 4));
    var end = Math.min(totalPages, start + 4);
    var html = '<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:16px;flex-wrap:wrap;">' +
      '<button data-action="inquiry-page" data-page="' + Math.max(1, state.inquiryPage - 1) + '"' + (state.inquiryPage === 1 ? ' disabled' : '') + ' aria-label="이전 페이지" style="width:36px;height:36px;border-radius:9px;border:1px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:800;cursor:' + (state.inquiryPage === 1 ? 'not-allowed' : 'pointer') + ';opacity:' + (state.inquiryPage === 1 ? '.42' : '1') + ';font-family:inherit;">◀</button>';
    for (var page = start; page <= end; page++) {
      var active = page === state.inquiryPage;
      html += '<button data-action="inquiry-page" data-page="' + page + '"' + (active ? ' aria-current="page"' : '') + ' style="width:36px;height:36px;border-radius:9px;border:' + (active ? 'none' : '1px solid #E6E8EC') + ';background:' + (active ? '#14263F' : '#FFFFFF') + ';color:' + (active ? '#FFFFFF' : '#4B5563') + ';font-weight:800;cursor:pointer;font-family:inherit;">' + page + '</button>';
    }
    html += '<button data-action="inquiry-page" data-page="' + Math.min(totalPages, state.inquiryPage + 1) + '"' + (state.inquiryPage === totalPages ? ' disabled' : '') + ' aria-label="다음 페이지" style="width:36px;height:36px;border-radius:9px;border:1px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:800;cursor:' + (state.inquiryPage === totalPages ? 'not-allowed' : 'pointer') + ';opacity:' + (state.inquiryPage === totalPages ? '.42' : '1') + ';font-family:inherit;">▶</button></div>';
    return html;
  }

  function renderInquiryListResults() {
    var inquiries = filteredInquiries();
    var totalPages = Math.max(1, Math.ceil(inquiries.length / 10));
    state.inquiryPage = Math.max(1, Math.min(state.inquiryPage, totalPages));
    var pageInquiries = inquiries.slice((state.inquiryPage - 1) * 10, state.inquiryPage * 10);
    var html = '<div style="font-size:12.5px;font-weight:700;color:#8A93A1;margin-bottom:12px;">' + inquiries.length + '건</div>' +
      '<div style="border:1px solid #E6E8EC;border-radius:14px;overflow:hidden;">';
    pageInquiries.forEach(function (q) {
      var done = q.status === '답변완료';
      html += '<button data-action="open-inquiry" data-id="' + esc(q.id) + '" style="width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px;border:none;border-bottom:1px solid #F0F1F3;background:#FFFFFF;text-align:left;cursor:pointer;font-family:inherit;align-items:center;">' +
        '<span style="min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          (q.secret ? '<span aria-label="비밀글" style="flex:none;font-size:13px;">🔒</span>' : '') +
          '<span style="min-width:140px;flex:1;font-size:14px;color:#14263F;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(q.title) + '</span>' +
          '<span style="flex:none;font-size:12px;color:#8A93A1;font-weight:600;white-space:nowrap;">' + esc(q.name && q.name.trim() ? q.name : '이름 미입력') + '</span>' +
        '</span>' +
        '<span style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;justify-content:flex-end;">' +
          '<span style="padding:3px 9px;border-radius:6px;font-size:11px;font-weight:800;background:' + (done ? '#E9F7EF' : '#F0F1F3') + ';color:' + (done ? '#1F9254' : '#6B7280') + ';white-space:nowrap;">' + esc(done ? '답변완료' : '답변대기') + '</span>' +
          '<span style="font-size:12px;color:#8A93A1;white-space:nowrap;">' + esc(q.date) + '</span>' +
        '</span>' +
      '</button>';
    });
    if (!pageInquiries.length) {
      html += '<div style="padding:28px 18px;text-align:center;font-size:13px;color:#8A93A1;">' + (state.inquirySearch ? '검색 결과가 없어요.' : '조건에 맞는 문의가 없어요.') + '</div>';
    }
    html += '</div>' + renderInquiryPagination(totalPages);
    return html;
  }

  function updateInquiryListResults() {
    var target = document.getElementById('inquiry-list-results');
    if (target) target.innerHTML = renderInquiryListResults();
  }

  function renderInquiryList() {
    function filterButton(filter, label) {
      var on = state.inquiryFilter === filter;
      return '<button data-action="set-inquiry-filter" data-filter="' + filter + '" style="' + (on ? S.pillOn : S.pillOff) + '">' + label + '</button>';
    }
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap;">' +
        filterButton('all', '전체') +
        filterButton('pending', '답변대기 (' + pendingInquiryCount() + ')') +
        filterButton('done', '답변완료') +
      '</div>' +
      '<input type="search" data-input="inquiry-search" value="' + esc(state.inquirySearch) + '" placeholder="제목, 이름 또는 연락처 검색" aria-label="문의 검색" style="flex:1;min-width:220px;max-width:360px;' + S.input + '" />' +
    '</div>' +
    '<div id="inquiry-list-results">' + renderInquiryListResults() + '</div>';
  }

  function renderAdminEstimate(estimate) {
    if (!estimate) return '';
    var lines = (estimate.lines || []).map(function (line) {
      return '<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #F0F1F3;font-size:12.5px;"><span style="color:#374151;">' + esc(line.group) + ' · ' + esc(line.label) + ' ×' + esc(line.qty) + '</span><span style="flex:none;font-weight:700;color:#14263F;">' + esc(line.subtotal || '') + '</span></div>';
    }).join('') || '<div style="font-size:12.5px;color:#8A93A1;">담긴 품목이 없어요.</div>';
    return '<div><div style="font-size:12px;font-weight:700;color:#4B5563;margin-bottom:7px;">첨부 견적</div><div style="padding:14px 16px;border-radius:11px;background:#FFF9F5;border:1px solid #FFD9C4;"><div style="font-size:12.5px;font-weight:800;color:#14263F;margin-bottom:8px;">' + esc(estimate.tripInfo || '일정 미정') + '</div>' + lines + '<div style="display:flex;justify-content:space-between;gap:10px;padding-top:9px;font-size:13px;font-weight:800;color:#E85425;"><span>합계</span><span>' + esc(estimate.total || '-') + '</span></div></div></div>';
  }

  function renderInquiryDetail() {
    var q = findInquiryById(state.selectedInquiryId);
    if (!q) {
      state.inquiryView = 'list';
      state.selectedInquiryId = null;
      return renderInquiryList();
    }
    var done = q.status === '답변완료';
    var draft = state.answerDrafts[String(q.id)] !== undefined ? state.answerDrafts[String(q.id)] : (q.answer || '');
    return '<div style="display:flex;flex-direction:column;gap:18px;">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">' +
        '<div style="min-width:0;">' +
          '<span style="display:inline-block;margin-bottom:9px;padding:4px 9px;border-radius:6px;font-size:11px;font-weight:800;background:' + (done ? '#E9F7EF' : '#F0F1F3') + ';color:' + (done ? '#1F9254' : '#6B7280') + ';">' + esc(done ? '답변완료' : '답변대기') + '</span>' +
          '<div style="font-size:19px;font-weight:800;color:#14263F;line-height:1.4;overflow-wrap:anywhere;">' + (q.secret ? '<span aria-label="비밀글">🔒 </span>' : '') + esc(q.title) + '</div>' +
        '</div>' +
        '<span style="flex:none;font-size:12px;color:#8A93A1;font-weight:600;">' + esc(q.date) + '</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:9px;padding:14px;border-radius:12px;background:#F8F9FA;">' +
        '<div><span style="display:block;font-size:11.5px;font-weight:700;color:#8A93A1;margin-bottom:4px;">이름</span><span style="font-size:13.5px;font-weight:700;color:#14263F;overflow-wrap:anywhere;">' + esc(q.name && q.name.trim() ? q.name : '-') + '</span></div>' +
        '<div><span style="display:block;font-size:11.5px;font-weight:700;color:#8A93A1;margin-bottom:4px;">연락처</span><span style="font-size:13.5px;font-weight:700;color:#14263F;overflow-wrap:anywhere;">' + esc(q.contact && q.contact.trim() ? q.contact : '-') + '</span></div>' +
        '<div><span style="display:block;font-size:11.5px;font-weight:700;color:#8A93A1;margin-bottom:4px;">이메일</span><span style="font-size:13.5px;font-weight:700;color:#14263F;overflow-wrap:anywhere;">' + esc(q.email && q.email.trim() ? q.email : '-') + '</span></div>' +
      '</div>' +
      renderAdminEstimate(q.estimate) +
      '<div><div style="font-size:12px;font-weight:700;color:#4B5563;margin-bottom:7px;">문의 내용</div>' +
        '<div style="padding:14px 16px;border-radius:11px;background:#F5F6F8;font-size:13.5px;color:#374151;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;">' + esc(q.content && q.content.trim() ? q.content : '(등록된 문의 내용이 없어요)') + '</div></div>' +
      '<label style="display:flex;flex-direction:column;gap:7px;"><span style="font-size:12px;font-weight:700;color:#4B5563;">답변</span>' +
        '<textarea data-input="answer-draft" data-id="' + esc(q.id) + '" placeholder="답변을 입력해주세요" rows="7" style="' + S.input + 'line-height:1.65;resize:vertical;font-family:inherit;">' + esc(draft) + '</textarea></label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button data-action="save-answer" data-id="' + esc(q.id) + '" style="flex:1;min-width:150px;' + S.primaryBtn + '">' + (done ? '답변 수정' : '답변 등록') + '</button>' +
        '<button data-action="remove-inquiry" data-id="' + esc(q.id) + '" style="padding:12px 16px;border-radius:11px;border:1.5px solid #F3D9D6;background:#FDF3F2;color:#E0483E;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">삭제</button>' +
        '<button data-action="back-inquiry-list" style="padding:12px 16px;border-radius:11px;border:1.5px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">목록으로</button>' +
      '</div>' +
    '</div>';
  }

  function renderInquiryTab() {
    return state.inquiryView === 'detail' ? renderInquiryDetail() : renderInquiryList();
  }

  function findNoticeById(id) {
    return state.notices.find(function (n) { return String(n.id) === String(id); });
  }

  function clearNoticeForm() {
    state.noticeEditingId = null;
    state.noticeFormTag = '';
    state.noticeFormTitle = '';
    state.noticeFormBody = '';
    state.noticeFormPinned = false;
    state.noticeError = '';
    state.noticeFiles = [];
    state.noticePendingFiles = [];
  }

  function renderAll() {
    if (state.loading) {
      document.getElementById('pageTitle').textContent = '관리자 화면을 준비하고 있어요';
      document.getElementById('pageDesc').textContent = '서버에서 운영 데이터를 불러오는 중이에요.';
      document.getElementById('adminSummary').innerHTML = '';
      document.getElementById('tabBar').innerHTML = '';
      document.getElementById('panel').innerHTML = '<div style="padding:44px 20px;text-align:center;color:#8A93A1;font-size:14px;">잠시만 기다려주세요.</div>';
      document.getElementById('resetRow').style.display = 'none';
      return;
    }
    if (state.loadError) {
      document.getElementById('pageTitle').textContent = '관리자 데이터를 불러오지 못했어요';
      document.getElementById('pageDesc').textContent = '서버 연결을 확인하고 다시 시도해주세요.';
      document.getElementById('adminSummary').innerHTML = '';
      document.getElementById('tabBar').innerHTML = '';
      document.getElementById('panel').innerHTML = '<div style="padding:36px 20px;text-align:center;"><div style="color:#E0483E;font-size:13.5px;font-weight:700;margin-bottom:12px;">' + esc(state.loadError) + '</div><button data-action="retry-admin-load" style="padding:10px 16px;border-radius:10px;border:none;background:#14263F;color:#FFFFFF;font-weight:700;cursor:pointer;font-family:inherit;">다시 불러오기</button></div>';
      document.getElementById('resetRow').style.display = 'none';
      return;
    }
    var meta = pageMeta();
    document.getElementById('pageTitle').textContent = meta.title;
    document.getElementById('pageDesc').textContent = meta.desc;
    document.getElementById('adminSummary').innerHTML = renderAdminSummary();
    document.getElementById('tabBar').innerHTML = renderTabs();

    var panel = document.getElementById('panel');
    var tab = state.activeTab;
    if (tab === 'discount') panel.innerHTML = renderDiscountTab();
    else if (tab === 'notice') panel.innerHTML = renderNoticeTab();
    else if (tab === 'inquiry') panel.innerHTML = renderInquiryTab();
    else panel.innerHTML = renderCatalogTab();
    if (state.operationError) {
      panel.innerHTML = '<div role="alert" style="margin-bottom:14px;padding:11px 13px;border-radius:10px;background:#FDF3F2;color:#E0483E;font-size:12.5px;font-weight:700;line-height:1.5;">' + esc(state.operationError) + '</div>' + panel.innerHTML;
    }

    document.getElementById('resetRow').style.display = CATALOG_TABS.indexOf(tab) !== -1 ? '' : 'none';
    document.getElementById('resetModal').style.display = state.showResetConfirm ? 'flex' : 'none';
    var noticeDeleteModal = document.getElementById('noticeDeleteModal');
    if (noticeDeleteModal) noticeDeleteModal.style.display = state.noticeDeleteId !== null ? 'flex' : 'none';
  }

  // ── 동작 ────────────────────────────────────────────────────
  var actions = {
    'set-tab': function (el) {
      state.activeTab = el.dataset.tab;
      if (state.activeTab === 'notice') state.noticeView = 'list';
      if (state.activeTab === 'inquiry') state.inquiryView = 'list';
      renderAll();
    },
    'open-pending-inquiries': function () {
      state.activeTab = 'inquiry';
      state.inquiryView = 'list';
      state.inquiryFilter = 'pending';
      state.inquirySearch = '';
      state.inquiryPage = 1;
      state.selectedInquiryId = null;
      renderAll();
    },

    'toggle-enabled': function (el) {
      var s = el.dataset.section;
      state.discountConfig[s].enabled = !state.discountConfig[s].enabled;
      persistDiscount(true); renderAll();
    },
    'set-disc-type': function (el) {
      state.discountConfig[el.dataset.section].type = el.dataset.type;
      persistDiscount(true); renderAll();
    },
    'add-keyword': function () {
      var kw = (state.draftKeyword || '').trim();
      if (!kw) return;
      var exists = state.discountConfig.keywords.some(function (k) { return k.toLowerCase() === kw.toLowerCase(); });
      if (!exists) {
        state.discountConfig.keywords.push(kw);
        persistDiscount(true);
      }
      state.draftKeyword = '';
      renderAll();
    },
    'remove-keyword': function (el) {
      state.discountConfig.keywords.splice(Number(el.dataset.idx), 1);
      persistDiscount(true); renderAll();
    },

    'remove-item': async function (el) {
      var cat = state.activeTab;
      clearTimeout(catalogSaveTimers[cat + ':' + el.dataset.id]);
      try {
        await JSTStore.deleteCatalogItem(cat, el.dataset.id);
        state.catalog[cat] = state.catalog[cat].filter(function (it) { return it.id !== el.dataset.id; });
        state.operationError = ''; showFlash(); renderAll();
      } catch (error) { handleError(error); }
    },
    'move-item': async function (el) {
      var cat = state.activeTab;
      var items = state.catalog[cat] || [];
      var index = items.findIndex(function (it) { return it.id === el.dataset.id; });
      if (index < 0) return;
      var target = el.dataset.direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= items.length) return;
      var moved = items[index];
      items[index] = items[target];
      items[target] = moved;
      renderAll();
      try {
        state.catalog = await JSTStore.reorderCatalog(cat, items.map(function (item) { return item.id; }));
        state.operationError = ''; showFlash(); renderAll();
      } catch (error) {
        items[target] = items[index];
        items[index] = moved;
        handleError(error);
      }
    },
    'toggle-item-hidden': async function (el) {
      var cat = state.activeTab;
      var item = (state.catalog[cat] || []).find(function (it) { return it.id === el.dataset.id; });
      if (!item) return;
      clearTimeout(catalogSaveTimers[cat + ':' + item.id]);
      item.hidden = !item.hidden;
      renderAll();
      try {
        Object.assign(item, await JSTStore.updateCatalogItem(cat, item.id, item));
        state.operationError = ''; showFlash();
      } catch (error) { item.hidden = !item.hidden; handleError(error); }
    },
    'add-item': async function () {
      var cat = state.activeTab;
      var name = state.draftName.trim();
      var price = parseCatalogPrice(state.draftPrice);
      if (!name) { state.draftError = '이름을 입력해주세요'; renderAll(); return; }
      if (!String(state.draftPrice || '').replace(/[^0-9]/g, '')) { state.draftError = '올바른 가격을 입력해주세요'; renderAll(); return; }
      var item = {
        id: cat + '_' + Date.now(),
        name: name, desc: state.draftDesc.trim(), price: price,
        discountGeneral: 0, discountAffiliate: 0, hidden: false,
      };
      try {
        state.catalog[cat].push(await JSTStore.createCatalogItem(cat, item));
        state.draftName = ''; state.draftDesc = ''; state.draftPrice = ''; state.draftError = '';
        state.operationError = ''; showFlash(); renderAll();
      } catch (error) { handleError(error); }
    },
    'request-reset': function () { state.showResetConfirm = true; renderAll(); },
    'cancel-reset': function () { state.showResetConfirm = false; renderAll(); },
    'confirm-reset': async function () {
      state.showResetConfirm = false;
      renderAll();
      try {
        Object.keys(catalogSaveTimers).forEach(function (key) { clearTimeout(catalogSaveTimers[key]); });
        var defaults = JSTStore.defaultCatalog();
        for (var c = 0; c < CATALOG_TABS.length; c++) {
          var resetCat = CATALOG_TABS[c];
          var current = state.catalog[resetCat].slice();
          for (var d = 0; d < current.length; d++) await JSTStore.deleteCatalogItem(resetCat, current[d].id);
          for (var a = 0; a < defaults[resetCat].length; a++) await JSTStore.createCatalogItem(resetCat, defaults[resetCat][a]);
        }
        state.catalog = await JSTStore.loadAdminCatalog();
        state.operationError = ''; showFlash(); renderAll();
      } catch (error) { handleError(error, '기본 품목으로 되돌리지 못했어요. 다시 불러와 상태를 확인해주세요.'); }
    },

    'new-notice': function () {
      clearNoticeForm();
      state.noticeView = 'form';
      renderAll();
    },
    'edit-notice': function (el) {
      var notice = findNoticeById(el.dataset.id);
      if (!notice) return;
      state.noticeEditingId = notice.id;
      state.noticeFormTag = notice.tag || '';
      state.noticeFormTitle = notice.title || '';
      state.noticeFormBody = notice.body || '';
      state.noticeFormPinned = !!notice.pinned;
      state.noticeFiles = (notice.files || []).slice();
      state.noticePendingFiles = [];
      state.noticeError = '';
      state.noticeView = 'form';
      renderAll();
    },
    'cancel-notice-form': function () {
      clearNoticeForm();
      state.noticeView = 'list';
      renderAll();
    },
    'save-notice': async function () {
      if (state.saving) return;
      var title = (state.noticeFormTitle || '').trim();
      var body = (state.noticeFormBody || '').trim();
      if (!title) { state.noticeError = '제목을 입력해주세요'; renderAll(); return; }
      if (!body) { state.noticeError = '내용을 입력해주세요'; renderAll(); return; }
      if (state.noticeFiles.length + state.noticePendingFiles.length > 5) {
        state.noticeError = '첨부파일은 최대 5개까지 등록할 수 있어요'; renderAll(); return;
      }
      state.saving = true;
      state.noticeError = '';
      renderAll();
      try {
        var payload = {
          tag: (state.noticeFormTag || '').trim(), title: title, body: body,
          pinned: !!state.noticeFormPinned,
        };
        var saved;
        if (state.noticeEditingId !== null) saved = await JSTStore.updateNotice(state.noticeEditingId, payload);
        else saved = await JSTStore.createNotice(payload);
        state.noticeEditingId = saved.id;
        state.noticeFiles = (saved.files || []).slice();
        var savedIndex = state.notices.findIndex(function (notice) { return String(notice.id) === String(saved.id); });
        if (savedIndex >= 0) state.notices[savedIndex] = saved;
        else state.notices.unshift(saved);
        while (state.noticePendingFiles.length) {
          var uploaded = await JSTStore.uploadNoticeFile(saved.id, state.noticePendingFiles[0]);
          state.noticeFiles.push(uploaded);
          state.noticePendingFiles.shift();
          saved.files = state.noticeFiles.slice();
          state.notices[savedIndex] = saved;
        }
        saved.files = state.noticeFiles.slice();
        savedIndex = state.notices.findIndex(function (notice) { return String(notice.id) === String(saved.id); });
        state.notices[savedIndex] = saved;
        state.noticeSearch = '';
        state.noticePage = 1;
        state.operationError = '';
        clearNoticeForm();
        state.noticeView = 'list';
        showFlash();
      } catch (error) {
        if (error.status === 401) handleError(error);
        else state.noticeError = error.message || '공지를 저장하지 못했어요.';
      } finally {
        state.saving = false;
        renderAll();
      }
    },
    'notice-page': function (el) {
      state.noticePage = Math.max(1, Number(el.dataset.page) || 1);
      updateNoticeListResults();
    },
    'request-remove-notice': function (el) {
      state.noticeDeleteId = el.dataset.id;
      renderAll();
    },
    'cancel-remove-notice': function () {
      state.noticeDeleteId = null;
      renderAll();
    },
    'confirm-remove-notice': async function () {
      var deleteId = state.noticeDeleteId;
      state.noticeDeleteId = null;
      renderAll();
      try {
        await JSTStore.deleteNotice(deleteId);
        state.notices = state.notices.filter(function (n) { return String(n.id) !== String(deleteId); });
        state.operationError = ''; showFlash(); renderAll();
      } catch (error) { handleError(error); }
    },
    'remove-notice-file': async function (el) {
      if (state.noticeEditingId === null) return;
      try {
        await JSTStore.deleteNoticeFile(state.noticeEditingId, el.dataset.fileId);
        state.noticeFiles = state.noticeFiles.filter(function (file) { return String(file.id) !== String(el.dataset.fileId); });
        var notice = findNoticeById(state.noticeEditingId);
        if (notice) notice.files = state.noticeFiles.slice();
        state.operationError = ''; showFlash(); renderAll();
      } catch (error) { handleError(error); }
    },

    'set-inquiry-filter': function (el) {
      state.inquiryFilter = el.dataset.filter;
      state.inquiryPage = 1;
      renderAll();
    },
    'inquiry-page': function (el) {
      state.inquiryPage = Math.max(1, Number(el.dataset.page) || 1);
      updateInquiryListResults();
    },
    'open-inquiry': function (el) {
      var q = findInquiryById(el.dataset.id);
      if (!q) return;
      state.selectedInquiryId = q.id;
      state.inquiryView = 'detail';
      renderAll();
    },
    'back-inquiry-list': function () {
      state.inquiryView = 'list';
      state.selectedInquiryId = null;
      renderAll();
    },
    'save-answer': async function (el) {
      var id = String(el.dataset.id);
      var q = findInquiryById(id);
      if (!q) return;
      var draft = (state.answerDrafts[id] !== undefined ? state.answerDrafts[id] : (q.answer || '')).trim();
      try {
        var updated = await JSTStore.updateInquiry(id, { answer: draft, status: draft ? '답변완료' : '답변대기' });
        Object.assign(q, updated);
        state.answerDrafts[id] = draft;
        state.operationError = ''; showFlash(); renderAll();
      } catch (error) { handleError(error); }
    },
    'remove-inquiry': async function (el) {
      var id = String(el.dataset.id);
      try {
        await JSTStore.deleteInquiry(id);
        state.inquiries = state.inquiries.filter(function (x) { return String(x.id) !== id; });
        delete state.answerDrafts[id];
        state.inquiryView = 'list';
        state.selectedInquiryId = null;
        state.operationError = ''; showFlash(); renderAll();
      } catch (error) { handleError(error); }
    },
    'retry-admin-load': async function () { await init(); },
  };

  document.addEventListener('click', async function (e) {
    var el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) await actions[el.dataset.action](el);
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
      if (field === 'price') {
        it.price = parseCatalogPrice(v);
        el.value = formatCatalogPrice(v);
      }
      else if (field === 'discountGeneral' || field === 'discountAffiliate') it[field] = nonNegFloat(v);
      else it[field] = v;
      queueCatalogSave(cat, it);
    } else if (kind === 'fixed-item-discount') {
      var discountItem = (state.catalog[el.dataset.cat] || []).find(function (x) { return x.id === el.dataset.id; });
      if (!discountItem) return;
      discountItem[el.dataset.field] = nonNegFloat(v);
      queueCatalogSave(el.dataset.cat, discountItem);
    } else if (kind === 'disc-value') {
      var section = el.dataset.section;
      state.discountConfig[section].value = nonNegFloat(v);
      persistDiscount();
      updateDiscountDynamicText();
    } else if (kind === 'notice-search') {
      state.noticeSearch = v;
      state.noticePage = 1;
      updateNoticeListResults();
    } else if (kind === 'inquiry-search') {
      state.inquirySearch = v;
      state.inquiryPage = 1;
      updateInquiryListResults();
    } else if (kind === 'answer-draft') {
      state.answerDrafts[String(el.dataset.id)] = v;
    } else if (kind === 'draft-name') { state.draftName = v; state.draftError = ''; }
    else if (kind === 'draft-desc') { state.draftDesc = v; }
    else if (kind === 'draft-price') {
      state.draftPrice = formatCatalogPrice(v);
      el.value = state.draftPrice;
      state.draftError = '';
    }
    else if (kind === 'draft-keyword') { state.draftKeyword = v; }
    else if (kind === 'notice-form-tag') { state.noticeFormTag = v; }
    else if (kind === 'notice-form-title') { state.noticeFormTitle = v; state.noticeError = ''; }
    else if (kind === 'notice-form-body') { state.noticeFormBody = v; state.noticeError = ''; }
    else if (kind === 'notice-form-pinned') { state.noticeFormPinned = el.checked; }
    else if (kind === 'notice-files') {
      var selectedFiles = Array.from(el.files || []);
      if (state.noticeFiles.length + selectedFiles.length > 5) {
        state.noticeError = '기존 첨부를 포함해 최대 5개까지 선택할 수 있어요';
        state.noticePendingFiles = [];
      } else {
        state.noticePendingFiles = selectedFiles;
        state.noticeError = '';
      }
      renderAll();
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async function () {
    try { await JSTStore.logoutAdmin(); } catch (error) {}
    window.location.href = 'admin-login.html';
  });

  async function init() {
    state.loading = true;
    state.loadError = '';
    renderAll();
    try {
      await JSTStore.getAdminSession();
      var results = await Promise.all([
        JSTStore.loadAdminCatalog(), JSTStore.loadAdminDiscountConfig(),
        JSTStore.loadAdminNotices(), JSTStore.loadAdminInquiries(),
      ]);
      state.catalog = results[0];
      state.discountConfig = results[1];
      state.notices = results[2];
      state.inquiries = results[3];
      state.operationError = '';
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('admin-login.html?expired=1');
        return;
      }
      state.loadError = error.message || '관리자 데이터를 불러오지 못했어요.';
    } finally {
      state.loading = false;
      renderAll();
    }
  }

  renderAll();
  init();
})();
