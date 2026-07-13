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
    activeTab: 'list', selectedId: null,
    discountConfig: JST.loadDiscountConfig(),
    catalog: JST.loadCatalog(),
    inquiries: JST.loadInquiries(),
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
      var raw = localStorage.getItem('jst_estimate');
      if (raw) {
        var est = JSON.parse(raw);
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

  function submit() {
    if (!state.title.trim()) { state.formError = '제목을 입력해주세요'; render(); return; }
    if (!state.fromEstimate && !state.content.trim()) { state.formError = '내용을 입력해주세요'; render(); return; }
    if (state.secretChecked && !state.password.trim()) { state.formError = '비밀글 비밀번호를 입력해주세요'; render(); return; }
    var est = state.attachedEstimate;
    var content = state.content.trim();
    if (state.fromEstimate && est) {
      var lines = (est.lines || []).map(function (l) {
        return l.group + ' · ' + l.label + ' ×' + l.qty + ' (' + l.subtotal + ')';
      }).join('\n');
      content = '[셀프견적 첨부]\n' + est.tripInfo + '\n' + lines + '\n합계: ' + est.total + (content ? ('\n\n' + content) : '');
    }
    var record = {
      id: Date.now(),
      title: state.title.trim(),
      date: JST.todayDateStr(),
      status: '답변대기',
      secret: state.secretChecked,
      password: state.secretChecked ? state.password.trim() : '',
      name: state.name.trim(),
      contact: state.contact.trim(),
      email: state.email.trim(),
      content: content,
      answer: '',
    };
    state.inquiries = [record].concat(state.inquiries);
    try { localStorage.setItem('jst_inquiries', JSON.stringify(state.inquiries)); } catch (e) {}
    state.submitted = true;
    state.formError = '';
    render();
    window.scrollTo(0, 0);
  }

  // ── 렌더링 ──────────────────────────────────────────────────
  function statusBadge(status, pad) {
    var done = status === '답변완료';
    return '<span style="flex:none;padding:' + (pad || '3px 9px') + ';border-radius:6px;font-size:11.5px;font-weight:800;background:' +
      (done ? '#E9F7EF' : '#F0F1F3') + ';color:' + (done ? '#1F9254' : '#6B7280') + ';">' + esc(status) + '</span>';
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
    var html = '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;overflow:hidden;">';
    state.inquiries.forEach(function (q) {
      html += '<button data-action="open" data-id="' + esc(q.id) + '" style="width:100%;display:flex;align-items:center;gap:10px;padding:16px clamp(14px,3vw,20px);background:none;border:none;border-bottom:1px solid #F0F1F3;cursor:pointer;text-align:left;font-family:inherit;">' +
        (q.secret ? '<span style="flex:none;font-size:13px;">🔒</span>' : '') +
        '<span style="flex:1;min-width:0;font-size:14.5px;color:#14263F;font-weight:700;">' + esc(q.title) + '</span>' +
        statusBadge(q.status) +
        '<span style="flex:none;font-size:12.5px;color:#8A93A1;">' + esc(q.date) + '</span>' +
        '<span style="flex:none;color:#C3C9D2;font-size:15px;">›</span>' +
      '</button>';
    });
    if (state.inquiries.length === 0) {
      html += '<div style="padding:24px;text-align:center;font-size:13px;color:#8A93A1;">등록된 문의가 없어요.</div>';
    }
    html += '</div>';
    return html;
  }

  function renderDetail() {
    var q = null;
    state.inquiries.forEach(function (x) { if (x.id === state.selectedId) q = x; });
    if (!q) q = { title: '', date: '', status: '', secret: false, content: '', answer: '' };
    var bodyText = q.secret
      ? '비밀글로 등록된 문의입니다. 작성자만 확인할 수 있어요.'
      : ((q.content && q.content.trim()) ? q.content : '등록된 문의 내용이 없어요.');
    var hasAnswer = !q.secret && !!(q.answer && q.answer.trim());
    var html =
      '<button data-action="back" style="display:inline-flex;align-items:center;gap:6px;padding:9px 4px;margin-bottom:16px;background:none;border:none;color:#4B5563;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">‹ 목록으로</button>' +
      '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;padding:clamp(20px,5vw,32px);">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
          statusBadge(q.status, '4px 9px') +
          (q.secret ? '<span style="font-size:13px;">🔒 비밀글</span>' : '') +
        '</div>' +
        '<h1 style="margin:0 0 10px;font-size:clamp(19px,4.5vw,24px);font-weight:800;color:#14263F;letter-spacing:-0.02em;">' + esc(q.title) + '</h1>' +
        '<div style="font-size:13px;color:#8A93A1;font-weight:600;margin-bottom:20px;">' + esc(q.date) + '</div>' +
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
          '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">이름</label>' +
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
      '<button data-action="submit" style="margin-top:4px;padding:15px;border-radius:13px;background:#FF6A3D;color:#FFFFFF;font-weight:800;font-size:15px;border:none;cursor:pointer;font-family:inherit;">문의 등록하기</button>' +
    '</div>';
    return html;
  }

  function render() {
    var app = document.getElementById('app');
    var html = renderTabs();
    if (state.selectedId !== null) html += renderDetail();
    else if (state.activeTab === 'write') html += renderWrite();
    else html += renderList();
    app.innerHTML = html;
  }

  var actions = {
    'set-tab-list': function () { state.activeTab = 'list'; state.selectedId = null; render(); },
    'set-tab-write': function () { state.activeTab = 'write'; render(); },
    'open': function (el) {
      var v = Number(el.dataset.id);
      state.selectedId = isNaN(v) ? el.dataset.id : v;
      render(); window.scrollTo(0, 0);
    },
    'back': function () { state.selectedId = null; render(); },
    'submit': function () { submit(); },
    'back-from-submit': function () {
      Object.assign(state, defaultFormState(), { activeTab: 'list', selectedId: null });
      render();
    },
  };

  document.getElementById('app').addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  document.getElementById('app').addEventListener('input', function (e) {
    var el = e.target.closest('[data-input]');
    if (!el) return;
    var k = el.dataset.input;
    if (k === 'name') state.name = el.value;
    else if (k === 'contact') state.contact = el.value;
    else if (k === 'email') state.email = el.value;
    else if (k === 'title') { state.title = el.value; state.formError = ''; }
    else if (k === 'content') { state.content = el.value; state.formError = ''; }
    else if (k === 'password') { state.password = el.value; state.formError = ''; }
  });

  document.getElementById('app').addEventListener('change', function (e) {
    var el = e.target.closest('[data-input="secret"]');
    if (!el) return;
    state.secretChecked = el.checked;
    render();
  });

  window.addEventListener('storage', function (e) {
    if (!e || e.key === 'jst_inquiries') { state.inquiries = JST.loadInquiries(); render(); }
    if (!e || e.key === 'jst_discount_config') { state.discountConfig = JST.loadDiscountConfig(); render(); }
    if (!e || e.key === 'jst_catalog') { state.catalog = JST.loadCatalog(); render(); }
  });

  render();
})();
