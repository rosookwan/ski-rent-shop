/* 문의게시판 로직 (InquiryBoard.dc.html 구현) */
(function () {
  'use strict';
  JST.injectChrome('inquiry');

  var esc = JST.esc, won = JST.won;

  function defaultFormState() {
    return {
      name: '', contact: '', email: '', title: '', content: '',
      secretChecked: true, password: '',
      formError: '', submitted: false,
      fromEstimate: false, attachedEstimate: null,
    };
  }

  var state = Object.assign({
    activeTab: 'list', selectedId: null, page: 1,
    viewPassword: '', viewPasswordError: '', unlockedInquiryIds: {},
    discountConfig: JST.defaultDiscountConfig(),
    catalog: JST.defaultCatalog(),
    inquiries: [], loading: true, loadError: '', detailLoading: false,
    submitting: false,
  }, defaultFormState());

  // URL 파라미터 처리 (?mode=write / ?from=estimate / ?id=N)
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'write') state.activeTab = 'write';
    else {
      var id = parseInt(params.get('id'), 10);
      if (!isNaN(id)) state.selectedId = id;
    }
    if (params.get('from') === 'estimate') {
      var est = JST.loadEstimate();
      if (est) {
        state.fromEstimate = true;
        state.attachedEstimate = est;
        state.title = '셀프견적 문의';
        if (est.email) state.email = est.email;
      }
    }
  } catch (e) {}

  function parseWon(str) {
    if (typeof str !== 'string') return 0;
    var n = parseInt(str.replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  function computeDiscountAmount(subtotalValue, qty, cfg, itemFixedOverride) {
    if (!cfg || !cfg.enabled) return 0;
    var amount;
    if (cfg.type === 'fixed') {
      var perUnit = (itemFixedOverride && itemFixedOverride > 0) ? itemFixedOverride : (cfg.value || 0);
      amount = perUnit * (qty || 1);
    } else {
      amount = subtotalValue * ((cfg.value || 0) / 100);
    }
    amount = Math.round(amount);
    return Math.max(0, Math.min(subtotalValue, amount));
  }

  function getDiscountMode(discount, affiliateType, affiliateName) {
    var name = (affiliateName || '').trim().toLowerCase();
    if (affiliateType === 'affiliate' && name && discount.affiliate && discount.affiliate.enabled) {
      var matched = (discount.keywords || []).some(function (k) {
        return k && name.indexOf(String(k).trim().toLowerCase()) !== -1;
      });
      if (matched) return 'affiliate';
    }
    if (discount.general && discount.general.enabled) return 'general';
    return 'none';
  }

  function estimatePayload(est) {
    if (!est) return null;
    return {
      tripInfo: est.tripInfo || '',
      affiliateType: est.affiliateType || 'none',
      affiliateName: est.affiliateName || '',
      lines: (est.lines || []).map(function (line) {
        return {
          group: line.group, label: line.label, qty: line.qty,
          subtotal: line.subtotal || '', subtotalValue: line.subtotalValue,
          cat: line.cat, itemId: line.itemId,
        };
      }),
      total: est.total || '', totalValue: est.totalValue,
      email: est.email || '', createdAt: est.createdAt || '',
    };
  }

  async function submit() {
    if (state.submitting) return;
    if (!state.name.trim()) { state.formError = '이름을 입력해주세요'; render(); return; }
    if (!state.title.trim()) { state.formError = '제목을 입력해주세요'; render(); return; }
    if (!state.fromEstimate && !state.content.trim()) { state.formError = '내용을 입력해주세요'; render(); return; }
    if (state.secretChecked && !state.password.trim()) { state.formError = '비밀글 비밀번호를 입력해주세요'; render(); return; }
    if (state.secretChecked && state.password.trim().length < 4) { state.formError = '비밀글 비밀번호는 4자 이상 입력해주세요'; render(); return; }
    state.submitting = true;
    state.formError = '';
    render();
    try {
      var created = await JST.createInquiry({
        name: state.name.trim(), contact: state.contact.trim(), email: state.email.trim(),
        title: state.title.trim(), content: state.content.trim(), secret: state.secretChecked,
        password: state.secretChecked ? state.password.trim() : '',
        estimate: state.fromEstimate ? estimatePayload(state.attachedEstimate) : null,
      });
      state.inquiries.unshift({
        id: created.id, title: state.title.trim(), date: created.date,
        status: created.status, secret: state.secretChecked, name: maskName(state.name),
      });
      if (state.fromEstimate) {
        JST.clearEstimateDraft();
        JST.clearEstimate();
      }
      state.page = 1;
      state.submitted = true;
      window.scrollTo(0, 0);
    } catch (error) {
      state.formError = error.status === 422 ? '입력 내용을 다시 확인해주세요.' : (error.message || '문의를 등록하지 못했어요.');
    } finally {
      state.submitting = false;
      render();
    }
  }

  // ── 렌더링 ──────────────────────────────────────────────────
  function statusBadge(status, pad) {
    var done = status === '답변완료';
    return '<span style="flex:none;padding:' + (pad || '3px 9px') + ';border-radius:6px;font-size:11.5px;font-weight:800;background:' +
      (done ? '#E9F7EF' : '#F0F1F3') + ';color:' + (done ? '#1F9254' : '#6B7280') + ';">' + esc(status) + '</span>';
  }

  function findInquiryById(id) {
    return state.inquiries.find(function (q) { return String(q.id) === String(id); });
  }

  function replaceInquiry(detail) {
    var index = state.inquiries.findIndex(function (item) { return String(item.id) === String(detail.id); });
    if (index >= 0) state.inquiries[index] = detail;
    else state.inquiries.unshift(detail);
  }

  async function openInquiry(id) {
    var inquiry = findInquiryById(id);
    if (!inquiry) return;
    state.selectedId = inquiry.id;
    state.viewPassword = '';
    state.viewPasswordError = '';
    if (inquiry.secret) {
      render();
      window.scrollTo(0, 0);
      return;
    }
    state.detailLoading = true;
    render();
    try {
      replaceInquiry(await JST.getInquiry(inquiry.id));
    } catch (error) {
      state.loadError = error.message || '문의 내용을 불러오지 못했어요.';
    } finally {
      state.detailLoading = false;
      render();
      window.scrollTo(0, 0);
    }
  }

  function maskName(name) {
    var chars = Array.from(String(name || '').trim());
    if (chars.length <= 1) return chars.join('');
    if (chars.length === 2) return chars[0] + '*';
    return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1];
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) return '';
    var start = Math.max(1, Math.min(state.page - 2, totalPages - 4));
    var end = Math.min(totalPages, start + 4);
    var html = '<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:16px;flex-wrap:wrap;">' +
      '<button data-action="inquiry-page" data-page="' + Math.max(1, state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + ' aria-label="이전 페이지" style="width:36px;height:36px;border-radius:9px;border:1px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:800;cursor:' + (state.page === 1 ? 'not-allowed' : 'pointer') + ';opacity:' + (state.page === 1 ? '.42' : '1') + ';font-family:inherit;">◀</button>';
    for (var page = start; page <= end; page++) {
      var active = page === state.page;
      html += '<button data-action="inquiry-page" data-page="' + page + '"' + (active ? ' aria-current="page"' : '') + ' style="width:36px;height:36px;border-radius:9px;border:' + (active ? 'none' : '1px solid #E6E8EC') + ';background:' + (active ? '#14263F' : '#FFFFFF') + ';color:' + (active ? '#FFFFFF' : '#4B5563') + ';font-weight:800;cursor:pointer;font-family:inherit;">' + page + '</button>';
    }
    html += '<button data-action="inquiry-page" data-page="' + Math.min(totalPages, state.page + 1) + '"' + (state.page === totalPages ? ' disabled' : '') + ' aria-label="다음 페이지" style="width:36px;height:36px;border-radius:9px;border:1px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:800;cursor:' + (state.page === totalPages ? 'not-allowed' : 'pointer') + ';opacity:' + (state.page === totalPages ? '.42' : '1') + ';font-family:inherit;">▶</button>' +
    '</div>';
    return html;
  }

  function renderTabs() {
    if (state.selectedId !== null) return '';
    function tabBtn(action, label, on) {
      return on
        ? '<button data-action="' + action + '" style="flex:none;padding:10px 18px;border-radius:11px;background:#14263F;color:#FFFFFF;font-weight:700;font-size:14px;border:none;cursor:pointer;font-family:inherit;">' + label + '</button>'
        : '<button data-action="' + action + '" style="flex:none;padding:10px 18px;border-radius:11px;background:#FFFFFF;color:#4B5563;font-weight:600;font-size:14px;border:1.5px solid #E6E8EC;cursor:pointer;font-family:inherit;">' + label + '</button>';
    }
    return '<div style="display:flex;gap:8px;margin-bottom:20px;">' +
      tabBtn('set-tab-list', '목록', state.activeTab === 'list') +
      tabBtn('set-tab-write', '글쓰기', state.activeTab === 'write') +
    '</div>';
  }

  function renderList() {
    var totalPages = Math.max(1, Math.ceil(state.inquiries.length / 10));
    state.page = Math.max(1, Math.min(state.page, totalPages));
    var pageInquiries = state.inquiries.slice((state.page - 1) * 10, state.page * 10);
    var html = '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;overflow:hidden;">';
    pageInquiries.forEach(function (q) {
      var maskedName = maskName(q.name);
      html += '<button data-action="open" data-id="' + esc(q.id) + '" style="width:100%;display:flex;align-items:center;gap:10px;padding:16px clamp(14px,3vw,20px);background:none;border:none;border-bottom:1px solid #F0F1F3;cursor:pointer;text-align:left;font-family:inherit;">' +
        (q.secret ? '<span style="flex:none;font-size:13px;">🔒</span>' : '') +
        '<span style="flex:1;min-width:0;">' +
          '<span style="display:block;font-size:14.5px;color:#14263F;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(q.title) + '</span>' +
          (maskedName ? '<span style="display:block;margin-top:3px;font-size:11.5px;color:#8A93A1;font-weight:600;">' + esc(maskedName) + '</span>' : '') +
        '</span>' +
        statusBadge(q.status) +
        '<span style="flex:none;font-size:12.5px;color:#8A93A1;">' + esc(q.date) + '</span>' +
        '<span style="flex:none;color:#C3C9D2;font-size:15px;">›</span>' +
      '</button>';
    });
    if (pageInquiries.length === 0) {
      html += '<div style="padding:24px;text-align:center;font-size:13px;color:#8A93A1;">등록된 문의가 없어요.</div>';
    }
    html += '</div>' + renderPagination(totalPages);
    return html;
  }

  function renderDetail() {
    var q = findInquiryById(state.selectedId);
    if (!q) q = { title: '', date: '', status: '', secret: false, content: '', answer: '' };
    var bodyText = (q.content && q.content.trim()) ? q.content : '등록된 문의 내용이 없어요.';
    var hasAnswer = !!(q.answer && q.answer.trim());
    var maskedName = maskName(q.name);
    var html =
      '<button data-action="back" style="display:inline-flex;align-items:center;gap:6px;padding:9px 4px;margin-bottom:16px;background:none;border:none;color:#4B5563;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">‹ 목록으로</button>' +
      '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;padding:clamp(20px,5vw,32px);">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
          statusBadge(q.status, '4px 9px') +
          (q.secret ? '<span style="font-size:13px;">🔒 비밀글</span>' : '') +
        '</div>' +
        '<h1 style="margin:0 0 10px;font-size:clamp(19px,4.5vw,24px);font-weight:800;color:#14263F;letter-spacing:-0.02em;">' + esc(q.title) + '</h1>' +
        '<div style="font-size:13px;color:#8A93A1;font-weight:600;margin-bottom:20px;">' + esc(q.date) + (maskedName ? ' · 작성자 ' + esc(maskedName) : '') + '</div>' +
        '<div style="height:1px;background:#F0F1F3;margin-bottom:20px;"></div>' +
        '<p style="margin:0;font-size:15px;line-height:1.8;color:#374151;white-space:pre-wrap;">' + esc(bodyText) + '</p>';
    if (hasAnswer) {
      html += '<div style="margin-top:20px;padding:16px;border-radius:14px;background:#F5F6F8;">' +
        '<div style="font-size:12px;font-weight:800;color:#14263F;margin-bottom:8px;">답변</div>' +
        '<p style="margin:0;font-size:14.5px;line-height:1.8;color:#374151;white-space:pre-wrap;">' + esc(q.answer) + '</p>' +
      '</div>';
    }
    html += '</div>' +
      '<button data-action="back" style="margin-top:16px;padding:12px 20px;border-radius:11px;border:1.5px solid #E6E8EC;background:#FFFFFF;color:#14263F;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">목록으로 돌아가기</button>';
    return html;
  }

  function renderPasswordPrompt() {
    var q = findInquiryById(state.selectedId);
    if (!q) return renderDetail();
    var maskedName = maskName(q.name);
    return '<button data-action="back" style="display:inline-flex;align-items:center;gap:6px;padding:9px 4px;margin-bottom:16px;background:none;border:none;color:#4B5563;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">‹ 목록으로</button>' +
      '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;padding:clamp(20px,5vw,32px);">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' + statusBadge(q.status, '4px 9px') + '<span style="font-size:13px;">🔒 비밀글</span></div>' +
        '<h1 style="margin:0 0 10px;font-size:clamp(19px,4.5vw,24px);font-weight:800;color:#14263F;letter-spacing:-0.02em;">' + esc(q.title) + '</h1>' +
        '<div style="font-size:13px;color:#8A93A1;font-weight:600;margin-bottom:22px;">' + esc(q.date) + (maskedName ? ' · 작성자 ' + esc(maskedName) : '') + '</div>' +
        '<div style="padding:18px;border-radius:14px;background:#F5F6F8;">' +
          '<div style="font-size:15px;font-weight:800;color:#14263F;margin-bottom:6px;">비밀글이에요</div>' +
          '<p style="margin:0 0 14px;font-size:13.5px;color:#4B5563;line-height:1.6;">작성할 때 설정한 비밀번호를 입력해주세요.</p>' +
          '<div style="display:flex;gap:8px;max-width:360px;">' +
            '<input type="password" data-input="view-password" value="' + esc(state.viewPassword) + '" placeholder="비밀번호" aria-label="비밀글 비밀번호" style="flex:1;min-width:0;padding:11px 12px;border-radius:10px;border:1.5px solid #E6E8EC;font-size:14px;color:#14263F;font-family:inherit;" />' +
            '<button data-action="verify-password" style="flex:none;padding:11px 17px;border-radius:10px;border:none;background:#14263F;color:#FFFFFF;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">확인</button>' +
          '</div>' +
          (state.viewPasswordError ? '<div style="margin-top:9px;font-size:12.5px;color:#E0483E;font-weight:600;">' + esc(state.viewPasswordError) + '</div>' : '') +
        '</div>' +
      '</div>';
  }

  function renderEstimateBox() {
    var est = state.attachedEstimate;
    if (!state.fromEstimate) return '';
    var rawLines = est && est.lines ? est.lines : [];
    var discount = state.discountConfig;
    var affiliateType = est ? (est.affiliateType || (est.affiliate && est.affiliate !== '해당없음' ? 'affiliate' : 'none')) : 'none';
    var affiliateName = est ? (est.affiliateName || (est.affiliate && est.affiliate !== '해당없음' ? est.affiliate : '')) : '';
    var mode = getDiscountMode(discount, affiliateType, affiliateName);
    var cfg = mode === 'affiliate' ? discount.affiliate : (mode === 'general' ? discount.general : null);
    var discountLabel = mode === 'affiliate' ? '제휴 할인가' : '할인가';
    var badgeBg = mode === 'affiliate' ? '#14263F' : '#FFF3EC';
    var badgeColor = mode === 'affiliate' ? '#FFFFFF' : '#FF6A3D';
    var catalog = state.catalog;

    var totalOriginal = 0, totalDiscount = 0;
    var linesHTML = rawLines.map(function (l) {
      var subtotalValue = typeof l.subtotalValue === 'number' ? l.subtotalValue : parseWon(l.subtotal);
      var itemOverride = 0;
      if (l.cat && l.itemId && catalog[l.cat]) {
        catalog[l.cat].forEach(function (x) {
          if (x.id === l.itemId) itemOverride = (mode === 'affiliate' ? x.discountAffiliate : x.discountGeneral) || 0;
        });
      }
      var discAmount = cfg ? computeDiscountAmount(subtotalValue, l.qty, cfg, itemOverride) : 0;
      var hasDiscount = discAmount > 0;
      var finalValue = subtotalValue - discAmount;
      totalOriginal += subtotalValue;
      totalDiscount += discAmount;
      var right = '';
      if (hasDiscount) {
        right += '<div style="display:flex;align-items:center;gap:6px;">' +
          '<span style="font-size:10.5px;font-weight:800;color:' + badgeColor + ';background:' + badgeBg + ';padding:2px 6px;border-radius:5px;white-space:nowrap;">' + discountLabel + '</span>' +
          '<span style="font-size:11.5px;color:#C3C9D2;text-decoration:line-through;white-space:nowrap;">' + won(subtotalValue) + '</span>' +
        '</div>';
      }
      right += '<span style="font-size:13.5px;font-weight:700;color:#14263F;white-space:nowrap;">' + (hasDiscount ? won(finalValue) : esc(l.subtotal || won(subtotalValue))) + '</span>';
      if (hasDiscount) {
        right += '<span style="font-size:11px;font-weight:700;color:#1F9254;white-space:nowrap;">' + won(discAmount) + ' 할인</span>';
      }
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #FBEAE0;">' +
        '<span style="font-size:13.5px;color:#14263F;font-weight:600;">' + esc(l.group) + ' · ' + esc(l.label) + ' ×' + esc(l.qty) + '</span>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:none;">' + right + '</div>' +
      '</div>';
    }).join('');
    if (rawLines.length === 0) {
      totalOriginal = est ? (typeof est.totalValue === 'number' ? est.totalValue : parseWon(est.total)) : 0;
      linesHTML = '<div style="padding:6px 0;font-size:13px;color:#8A93A1;">담은 품목이 없어요.</div>';
    }
    var estimateHasDiscount = totalDiscount > 0;
    var finalTotal = totalOriginal - totalDiscount;

    var totalRight = '';
    if (estimateHasDiscount) {
      totalRight += '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="font-size:10.5px;font-weight:800;color:' + badgeColor + ';background:' + badgeBg + ';padding:2px 7px;border-radius:5px;white-space:nowrap;">' + discountLabel + '</span>' +
        '<span style="font-size:12px;color:#C3C9D2;text-decoration:line-through;white-space:nowrap;">' + won(totalOriginal) + '</span>' +
      '</div>';
    }
    totalRight += '<span style="font-size:17px;font-weight:800;color:#E85425;white-space:nowrap;">' + won(finalTotal) + '</span>';
    if (estimateHasDiscount) {
      totalRight += '<span style="font-size:11.5px;font-weight:700;color:#1F9254;white-space:nowrap;">' + won(totalDiscount) + ' 할인 적용</span>';
    }

    return '<div>' +
      '<div style="font-size:12.5px;font-weight:800;color:#E85425;margin-bottom:8px;">셀프견적에서 이어졌어요</div>' +
      '<div style="border:1px solid #FFD9C4;background:#FFF9F5;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
          '<span style="font-size:13px;font-weight:800;color:#14263F;">견적 내역</span>' +
          '<span style="font-size:12px;color:#8A93A1;">' + esc(est ? est.tripInfo : '') + '</span>' +
        '</div>' +
        (mode === 'affiliate'
          ? '<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;background:#14263F;color:#FFFFFF;font-size:11.5px;font-weight:700;width:fit-content;">' +
            esc(affiliateName ? ('제휴업체 할인 적용 중 · ' + affiliateName) : '제휴업체 할인 적용 중') + '</div>'
          : '') +
        '<div>' + linesHTML + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1.5px solid #E85425;gap:10px;">' +
          '<span style="font-size:13px;font-weight:700;color:#14263F;">합계</span>' +
          '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">' + totalRight + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderWrite() {
    if (state.submitted) {
      return '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;padding:36px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;">' +
        '<div style="width:48px;height:48px;border-radius:999px;background:#E9F7EF;display:flex;align-items:center;justify-content:center;font-size:22px;color:#1F9254;">✓</div>' +
        '<div style="font-size:17px;font-weight:800;color:#14263F;">문의가 등록되었어요</div>' +
        '<p style="margin:0;font-size:13.5px;color:#8A93A1;line-height:1.6;">확인 후 순차적으로 답변드릴게요.</p>' +
        '<button data-action="back-from-submit" style="margin-top:8px;padding:11px 20px;border-radius:11px;border:1.5px solid #14263F;background:#FFFFFF;color:#14263F;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">목록으로 돌아가기</button>' +
      '</div>';
    }
    var inputStyle = 'padding:12px 14px;border-radius:11px;border:1.5px solid #E6E8EC;font-size:14px;color:#14263F;width:100%;';
    var contentLabel = state.fromEstimate ? '추가로 남길 말씀 (선택)' : '내용';
    var contentPlaceholder = state.fromEstimate ? '궁금한 점이나 요청사항이 있으면 적어주세요' : '문의하실 내용을 자유롭게 남겨주세요';
    var html = '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;padding:clamp(18px,4vw,26px);display:flex;flex-direction:column;gap:16px;">' +
      renderEstimateBox() +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">이름 <span style="color:#E85425;">*</span></label>' +
          '<input type="text" data-input="name" value="' + esc(state.name) + '" placeholder="이름을 알려주세요" style="' + inputStyle + '" />' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">연락처</label>' +
          '<input type="text" data-input="contact" value="' + esc(state.contact) + '" placeholder="010-0000-0000" style="' + inputStyle + '" />' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">' +
        '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">이메일 (선택)</label>' +
        '<input type="email" data-input="email" value="' + esc(state.email) + '" placeholder="[email protected]" style="' + inputStyle + '" />' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">' +
        '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">제목</label>' +
        '<input type="text" data-input="title" value="' + esc(state.title) + '" placeholder="문의 제목을 입력해주세요" style="' + inputStyle + '" />' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">' +
        '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">' + contentLabel + '</label>' +
        '<textarea data-input="content" placeholder="' + contentPlaceholder + '" rows="6" style="' + inputStyle + 'line-height:1.6;resize:vertical;">' + esc(state.content) + '</textarea>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:#14263F;cursor:pointer;">' +
        '<input type="checkbox" data-input="secret" ' + (state.secretChecked ? 'checked' : '') + ' style="width:17px;height:17px;" />' +
        '비밀글로 등록할게요' +
      '</label>' +
      (state.secretChecked
        ? '<div style="display:flex;flex-direction:column;gap:6px;max-width:220px;">' +
            '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">비밀번호</label>' +
            '<input type="password" data-input="password" value="' + esc(state.password) + '" placeholder="숫자 4자리" style="' + inputStyle + '" />' +
          '</div>'
        : '') +
      (state.formError ? '<div style="font-size:12.5px;color:#E0483E;">' + esc(state.formError) + '</div>' : '') +
      '<button data-action="submit"' + (state.submitting ? ' disabled' : '') + ' style="margin-top:4px;padding:15px;border-radius:13px;background:#FF6A3D;color:#FFFFFF;font-weight:800;font-size:15px;border:none;cursor:' + (state.submitting ? 'wait' : 'pointer') + ';opacity:' + (state.submitting ? '.65' : '1') + ';font-family:inherit;">' + (state.submitting ? '등록하고 있어요…' : '문의 등록하기') + '</button>' +
    '</div>';
    return html;
  }

  function render() {
    var app = document.getElementById('app');
    if (state.loading) {
      app.innerHTML = '<div style="padding:48px 20px;text-align:center;color:#8A93A1;font-size:14px;">문의 내역을 불러오고 있어요.</div>';
      return;
    }
    if (state.loadError) {
      app.innerHTML = '<div style="padding:40px 20px;text-align:center;border:1px solid #E6E8EC;border-radius:18px;background:#FFFFFF;"><div style="color:#E0483E;font-size:14px;font-weight:700;margin-bottom:12px;">' + esc(state.loadError) + '</div><button data-action="retry-load" style="padding:10px 16px;border-radius:10px;border:none;background:#14263F;color:#FFFFFF;font-weight:700;cursor:pointer;font-family:inherit;">다시 불러오기</button></div>';
      return;
    }
    var html = renderTabs();
    var selected = state.selectedId !== null ? findInquiryById(state.selectedId) : null;
    var unlocked = selected && state.unlockedInquiryIds[String(selected.id)];
    if (state.detailLoading) html += '<div style="padding:40px 20px;text-align:center;color:#8A93A1;font-size:14px;">문의 내용을 불러오고 있어요.</div>';
    else if (selected && selected.secret && !unlocked) html += renderPasswordPrompt();
    else if (state.selectedId !== null) html += renderDetail();
    else if (state.activeTab === 'write') html += renderWrite();
    else html += renderList();
    app.innerHTML = html;
  }

  var actions = {
    'set-tab-list': function () { state.activeTab = 'list'; state.selectedId = null; state.viewPassword = ''; state.viewPasswordError = ''; render(); },
    'set-tab-write': function () { state.activeTab = 'write'; render(); },
    'open': async function (el) {
      var v = Number(el.dataset.id);
      await openInquiry(isNaN(v) ? el.dataset.id : v);
    },
    'back': function () { state.selectedId = null; state.viewPassword = ''; state.viewPasswordError = ''; render(); },
    'verify-password': async function () {
      if (!state.viewPassword.trim()) {
        state.viewPasswordError = '비밀번호를 입력해주세요';
        render();
        return;
      }
      state.detailLoading = true;
      render();
      try {
        var detail = await JST.verifyInquiryPassword(state.selectedId, state.viewPassword.trim());
        replaceInquiry(detail);
        state.unlockedInquiryIds[String(state.selectedId)] = true;
        state.viewPassword = '';
        state.viewPasswordError = '';
      } catch (error) {
        state.viewPasswordError = error.status === 403 ? '비밀번호가 일치하지 않아요' : (error.message || '확인하지 못했어요.');
      } finally {
        state.detailLoading = false;
        render();
      }
    },
    'inquiry-page': function (el) { state.page = Math.max(1, Number(el.dataset.page) || 1); render(); window.scrollTo(0, 0); },
    'submit': async function () { await submit(); },
    'retry-load': async function () { await init(); },
    'back-from-submit': function () {
      Object.assign(state, defaultFormState(), { activeTab: 'list', selectedId: null, page: 1 });
      render();
    },
  };

  document.getElementById('app').addEventListener('click', async function (e) {
    var el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) await actions[el.dataset.action](el);
  });

  document.getElementById('app').addEventListener('input', function (e) {
    var el = e.target.closest('[data-input]');
    if (!el) return;
    var k = el.dataset.input;
    if (k === 'name') { state.name = el.value; state.formError = ''; }
    else if (k === 'contact') state.contact = el.value;
    else if (k === 'email') state.email = el.value;
    else if (k === 'title') { state.title = el.value; state.formError = ''; }
    else if (k === 'content') { state.content = el.value; state.formError = ''; }
    else if (k === 'password') { state.password = el.value; state.formError = ''; }
    else if (k === 'view-password') { state.viewPassword = el.value; state.viewPasswordError = ''; }
  });

  document.getElementById('app').addEventListener('change', function (e) {
    var el = e.target.closest('[data-input="secret"]');
    if (!el) return;
    state.secretChecked = el.checked;
    render();
  });

  async function init() {
    state.loading = true;
    state.loadError = '';
    render();
    try {
      var results = await Promise.all([JST.loadInquiries(), JST.loadDiscountConfig(), JST.loadCatalog()]);
      state.inquiries = results[0];
      state.discountConfig = results[1];
      state.catalog = results[2];
      if (state.selectedId !== null) {
        var selected = findInquiryById(state.selectedId);
        if (selected && !selected.secret) replaceInquiry(await JST.getInquiry(selected.id));
      }
    } catch (error) {
      state.loadError = error.message || '문의 내역을 불러오지 못했어요.';
    } finally {
      state.loading = false;
      render();
    }
  }

  init();
})();
