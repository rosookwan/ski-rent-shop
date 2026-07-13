/* 셀프견적 로직 (SelfEstimate.dc.html 구현) */
(function () {
  'use strict';
  JST.injectChrome('selfcalc', { hideMobileBar: true });

  var esc = JST.esc, won = JST.won;
  var catalog = JST.loadCatalog();

  function defaultState() {
    return {
      affiliateType: 'none', affiliateName: '',
      scheduleUndecided: false, startDate: '', endDate: '',
      adult: 2, child: 0,
      liftQty: {}, activeLiftDayIndex: 0,
      equipmentQty: {}, clothingQty: {}, safetyQty: {}, activeRentalDayIndex: 0,
      activeRentalTab: 'equipment',
      email: '', emailSending: false, emailSent: false, emailError: '',
      sheetOpen: false, confirmOpen: false, showResetConfirm: false,
    };
  }

  var state = defaultState();
  state.isMobile = window.innerWidth < 900;

  // 홈에서 넘어온 일정·인원 프리필
  var tripInfo = JST.loadTripInfo();
  if (tripInfo) {
    state.scheduleUndecided = !!tripInfo.undecided;
    state.startDate = tripInfo.start || '';
    state.endDate = tripInfo.end || '';
    state.adult = tripInfo.adult || state.adult;
    if (typeof tripInfo.child === 'number') state.child = tripInfo.child;
  }

  var S = {
    pillOn: 'flex:none;padding:7px 13px;border-radius:999px;background:#14263F;color:#FFFFFF;font-weight:700;font-size:12.5px;border:none;cursor:pointer;white-space:nowrap;font-family:inherit;',
    pillOff: 'flex:none;padding:7px 13px;border-radius:999px;background:#FFFFFF;color:#8A93A1;font-weight:600;font-size:12.5px;border:1.5px solid #E6E8EC;cursor:pointer;white-space:nowrap;font-family:inherit;',
    counterBtn: 'width:32px;height:32px;border-radius:9px;border:1.5px solid #E6E8EC;background:#FFFFFF;font-size:17px;font-weight:700;color:#14263F;cursor:pointer;font-family:inherit;',
    dayOn: 'flex:none;white-space:nowrap;padding:9px 15px;border-radius:11px;background:#14263F;color:#FFFFFF;font-weight:700;font-size:13.5px;border:none;cursor:pointer;font-family:inherit;',
    dayOff: 'flex:none;white-space:nowrap;padding:9px 15px;border-radius:11px;background:#FFFFFF;color:#4B5563;font-weight:600;font-size:13.5px;border:1.5px solid #E6E8EC;cursor:pointer;font-family:inherit;',
    tabOn: 'flex:none;padding:9px 16px;border-radius:11px;background:#14263F;color:#FFFFFF;font-weight:700;font-size:13.5px;border:none;cursor:pointer;font-family:inherit;white-space:nowrap;',
    tabOff: 'flex:none;padding:9px 16px;border-radius:11px;background:#FFFFFF;color:#4B5563;font-weight:600;font-size:13.5px;border:1.5px solid #E6E8EC;cursor:pointer;font-family:inherit;white-space:nowrap;',
  };

  // ── 날짜 계산 ───────────────────────────────────────────────
  function getDays() {
    if (state.scheduleUndecided || !state.startDate) return [{ key: 'flat', label: '전체' }];
    var dow = ['일', '월', '화', '수', '목', '금', '토'];
    var start = new Date(state.startDate + 'T00:00:00');
    if (isNaN(start.getTime())) return [{ key: 'flat', label: '전체' }];
    var end = state.endDate ? new Date(state.endDate + 'T00:00:00') : start;
    if (isNaN(end.getTime()) || end < start) end = start;
    var days = [];
    var cur = new Date(start.getTime());
    var guard = 0;
    while (cur.getTime() <= end.getTime() && guard < 14) {
      var m = cur.getMonth() + 1, d = cur.getDate(), w = dow[cur.getDay()];
      days.push({
        key: cur.getFullYear() + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
        label: m + '/' + d + '(' + w + ')',
      });
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return days.length ? days : [{ key: 'flat', label: '전체' }];
  }

  function getTripInfoLabel(days) {
    var sched;
    if (state.scheduleUndecided || !state.startDate) sched = '일정 미정';
    else if (days.length > 1) sched = days[0].label + ' – ' + days[days.length - 1].label + ' · ' + (days.length - 1) + '박' + days.length + '일';
    else sched = days[0].label + ' · 당일';
    var people = state.child > 0 ? ('대인 ' + state.adult + ' · 소인 ' + state.child) : ('대인 ' + state.adult);
    return sched + ' · ' + people;
  }

  function getSummaryLines(days) {
    var lines = [];
    days.forEach(function (day) {
      catalog.lift.filter(function (t) { return !t.hidden; }).forEach(function (t) {
        var qty = state.liftQty[day.key + '__' + t.id] || 0;
        if (qty > 0) {
          var dayPart = day.key === 'flat' ? '' : (day.label + ' · ');
          lines.push({
            group: '리프트권', label: dayPart + t.name, qty: qty,
            subtotalFormatted: won(t.price * qty), subtotalValue: t.price * qty,
            cat: 'lift', itemId: t.id,
          });
        }
      });
    });
    var catLabels = { equipment: '장비 렌탈', clothing: '의류 렌탈', safety: '안전장비' };
    days.forEach(function (day) {
      ['equipment', 'clothing', 'safety'].forEach(function (cat) {
        catalog[cat].filter(function (it) { return !it.hidden; }).forEach(function (it) {
          var qty = state[cat + 'Qty'][day.key + '__' + it.id] || 0;
          if (qty > 0) {
            var dayPart = day.key === 'flat' ? '' : (day.label + ' · ');
            lines.push({
              group: catLabels[cat], label: dayPart + it.name, qty: qty,
              subtotalFormatted: won(it.price * qty), subtotalValue: it.price * qty,
              cat: cat, itemId: it.id,
            });
          }
        });
      });
    });
    return lines;
  }

  // ── 렌더링 ──────────────────────────────────────────────────
  function counterRow(name, desc, qty, decAttr, incAttr) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #F0F1F3;">' +
      '<div style="min-width:0;">' +
        '<div style="font-weight:700;font-size:14.5px;color:#14263F;">' + esc(name) + '</div>' +
        '<div style="font-size:12.5px;color:#8A93A1;margin-top:2px;">' + esc(desc) + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;flex:none;">' +
        '<button ' + decAttr + ' style="' + S.counterBtn + '">−</button>' +
        '<span style="min-width:22px;text-align:center;font-weight:700;font-size:14.5px;color:#14263F;">' + qty + '</span>' +
        '<button ' + incAttr + ' style="' + S.counterBtn + '">+</button>' +
      '</div>' +
    '</div>';
  }

  function renderTrip() {
    var html = '<div style="margin-bottom:24px;">' +
      '<div style="font-size:14px;font-weight:700;color:#14263F;margin-bottom:10px;">제휴업체로 예약하셨나요?</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">';
    function radioBtn(action, checked, label) {
      return '<button data-action="' + action + '" style="display:flex;align-items:center;gap:10px;padding:13px 14px;border-radius:14px;border:1.5px solid #E6E8EC;background:#FFFFFF;cursor:pointer;text-align:left;font-family:inherit;">' +
        '<span style="width:20px;height:20px;border-radius:999px;border:1.5px solid #D8DCE3;flex:none;display:flex;align-items:center;justify-content:center;">' +
        (checked ? '<span style="width:10px;height:10px;border-radius:999px;background:#FF6A3D;"></span>' : '') +
        '</span>' +
        '<span style="font-size:13.5px;font-weight:600;color:#14263F;">' + label + '</span>' +
      '</button>';
    }
    html += radioBtn('affiliate-none', state.affiliateType !== 'affiliate', '아니요, 직접예약·일반문의예요');
    html += radioBtn('affiliate-partner', state.affiliateType === 'affiliate', '네, 제휴업체 예약이에요');
    html += '</div>';
    if (state.affiliateType === 'affiliate') {
      html += '<input type="text" data-input="affiliate-name" value="' + esc(state.affiliateName) + '" placeholder="제휴업체명을 알려주세요" style="margin-top:10px;width:100%;padding:12px 14px;border-radius:12px;border:1.5px solid #E6E8EC;font-size:14px;color:#14263F;font-family:inherit;" />';
    }
    html += '</div>';

    html += '<div style="margin-bottom:24px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">' +
        '<span style="font-size:14px;font-weight:700;color:#14263F;">여행 일정</span>' +
        '<button data-action="toggle-undecided" style="' + (state.scheduleUndecided ? S.pillOn : S.pillOff) + '">일정 미정이에요</button>' +
      '</div>';
    if (state.scheduleUndecided) {
      html += '<div style="font-size:13px;color:#8A93A1;">일정은 나중에 정해도 괜찮아요.</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">가는 날</label>' +
          '<input type="date" data-input="start-date" value="' + esc(state.startDate) + '" style="padding:11px 12px;border-radius:11px;border:1.5px solid #E6E8EC;font-size:14px;color:#14263F;width:100%;font-family:inherit;" />' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">오는 날</label>' +
          '<input type="date" data-input="end-date" value="' + esc(state.endDate) + '" style="padding:11px 12px;border-radius:11px;border:1.5px solid #E6E8EC;font-size:14px;color:#14263F;width:100%;font-family:inherit;" />' +
        '</div>' +
      '</div>';
    }
    html += '</div>';

    html += '<div>' +
      '<div style="font-size:14px;font-weight:700;color:#14263F;margin-bottom:10px;">인원</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">' +
        '<div style="border:1.5px solid #E6E8EC;border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
          '<div><div style="font-weight:700;font-size:14px;color:#14263F;">대인</div><div style="font-size:11.5px;color:#8A93A1;font-weight:500;">만 14세 이상</div></div>' +
          '<div style="display:flex;align-items:center;gap:8px;flex:none;">' +
            '<button data-action="dec-adult" style="' + S.counterBtn + '">−</button>' +
            '<span style="min-width:20px;text-align:center;font-weight:700;font-size:14.5px;color:#14263F;">' + state.adult + '</span>' +
            '<button data-action="inc-adult" style="' + S.counterBtn + '">+</button>' +
          '</div>' +
        '</div>' +
        '<div style="border:1.5px solid #E6E8EC;border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
          '<div><div style="font-weight:700;font-size:14px;color:#14263F;">소인</div><div style="font-size:11.5px;color:#8A93A1;font-weight:500;">만 13세 이하</div></div>' +
          '<div style="display:flex;align-items:center;gap:8px;flex:none;">' +
            '<button data-action="dec-child" style="' + S.counterBtn + '">−</button>' +
            '<span style="min-width:20px;text-align:center;font-weight:700;font-size:14.5px;color:#14263F;">' + state.child + '</span>' +
            '<button data-action="inc-child" style="' + S.counterBtn + '">+</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.getElementById('tripSection').innerHTML = html;
  }

  function dayTabsHTML(days, activeIdx, selectAction, applyAllAction) {
    if (days.length <= 1) return '';
    var html = '<div style="display:flex;gap:8px;overflow-x:auto;margin-bottom:10px;padding-bottom:2px;scrollbar-width:none;">';
    days.forEach(function (d, i) {
      html += '<button data-action="' + selectAction + '" data-idx="' + i + '" style="' + (i === activeIdx ? S.dayOn : S.dayOff) + '">' + esc(d.label) + '</button>';
    });
    html += '</div>' +
      '<button data-action="' + applyAllAction + '" style="margin-bottom:16px;padding:8px 14px;border-radius:10px;border:1px dashed #D8DCE3;background:none;color:#4B5563;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;">모든 날짜에 똑같이 적용</button>';
    return html;
  }

  function renderLift() {
    var days = getDays();
    var activeIdx = Math.min(state.activeLiftDayIndex, days.length - 1);
    var helper;
    if (state.scheduleUndecided || !state.startDate) helper = '여행 일정을 정하면 날짜별로 나눠 담을 수 있어요. 지금은 전체 기준으로 담아주세요.';
    else if (days.length === 1) helper = '이용하실 리프트권을 담아주세요.';
    else helper = '담을 날짜를 먼저 고른 뒤 리프트권을 선택해주세요.';

    var html = '<p style="margin:0 0 16px;font-size:13px;color:#8A93A1;line-height:1.6;">' + helper + '</p>';
    html += dayTabsHTML(days, activeIdx, 'select-lift-day', 'apply-all-lift');

    var day = days[activeIdx];
    html += '<div>';
    catalog.lift.filter(function (t) { return !t.hidden; }).forEach(function (t) {
      var qty = state.liftQty[day.key + '__' + t.id] || 0;
      html += counterRow(t.name, t.desc, qty,
        'data-action="lift-qty" data-id="' + esc(t.id) + '" data-delta="-1"',
        'data-action="lift-qty" data-id="' + esc(t.id) + '" data-delta="1"');
    });
    html += '</div>';
    document.getElementById('liftSection').innerHTML = html;
  }

  function renderRental() {
    var days = getDays();
    var activeIdx = Math.min(state.activeRentalDayIndex, days.length - 1);
    var helper;
    if (state.scheduleUndecided || !state.startDate) helper = '여행 일정을 정하면 날짜별로 나눠 담을 수 있어요. 지금은 전체 기준으로 담아주세요.';
    else if (days.length === 1) helper = '필요한 만큼 담아주세요. 사이즈는 방문하시면 맞춰드려요.';
    else helper = '담을 날짜를 먼저 고른 뒤 필요한 만큼 담아주세요. 사이즈는 방문하시면 맞춰드려요.';

    var html = '<p style="margin:0 0 16px;font-size:13px;color:#8A93A1;line-height:1.6;">' + helper + '</p>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">' +
      '<button data-action="rental-tab" data-tab="equipment" style="' + (state.activeRentalTab === 'equipment' ? S.tabOn : S.tabOff) + '">장비</button>' +
      '<button data-action="rental-tab" data-tab="clothing" style="' + (state.activeRentalTab === 'clothing' ? S.tabOn : S.tabOff) + '">의류</button>' +
      '<button data-action="rental-tab" data-tab="safety" style="' + (state.activeRentalTab === 'safety' ? S.tabOn : S.tabOff) + '">안전장비</button>' +
    '</div>';
    html += dayTabsHTML(days, activeIdx, 'select-rental-day', 'apply-all-rental');

    var day = days[activeIdx];
    var cat = state.activeRentalTab;
    html += '<div>';
    catalog[cat].filter(function (it) { return !it.hidden; }).forEach(function (it) {
      var qty = state[cat + 'Qty'][day.key + '__' + it.id] || 0;
      html += counterRow(it.name, it.desc, qty,
        'data-action="rental-qty" data-id="' + esc(it.id) + '" data-delta="-1"',
        'data-action="rental-qty" data-id="' + esc(it.id) + '" data-delta="1"');
    });
    html += '</div>';
    document.getElementById('rentalSection').innerHTML = html;
  }

  function summaryLinesHTML(lines) {
    var html = '';
    lines.forEach(function (l) {
      html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid #F0F1F3;">' +
        '<div style="min-width:0;">' +
          '<div style="font-size:11.5px;color:#8A93A1;font-weight:600;margin-bottom:1px;">' + esc(l.group) + '</div>' +
          '<div style="font-size:13.5px;color:#14263F;font-weight:600;">' + esc(l.label) + ' ×' + l.qty + '</div>' +
        '</div>' +
      '</div>';
    });
    return html;
  }

  function emailBoxHTML(placeholder) {
    return '<div style="display:flex;gap:8px;">' +
      '<input type="email" data-input="email" value="' + esc(state.email) + '" placeholder="' + placeholder + '" style="flex:1;min-width:0;padding:11px 12px;border-radius:11px;border:1.5px solid #E6E8EC;font-size:13.5px;font-family:inherit;color:#14263F;" />' +
      '<button data-action="send-email" style="flex:none;padding:11px 16px;border-radius:11px;border:1.5px solid #14263F;background:#FFFFFF;color:#14263F;font-weight:700;font-size:13.5px;cursor:pointer;white-space:nowrap;font-family:inherit;">받기</button>' +
    '</div>' +
    (state.emailError ? '<div style="font-size:12px;color:#E0483E;">' + esc(state.emailError) + '</div>' : '') +
    (state.emailSent ? '<div style="font-size:12px;color:#1F9254;">입력하신 이메일로 보내드렸어요.</div>' : '');
  }

  function renderSidebar() {
    var el = document.getElementById('sidebar');
    if (state.isMobile) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    var days = getDays();
    var lines = getSummaryLines(days);
    var html = '<div style="width:380px;flex:none;position:sticky;top:140px;background:#FFFFFF;border:1px solid #E6E8EC;border-radius:20px;padding:22px;display:flex;flex-direction:column;gap:14px;max-height:calc(100vh - 168px);overflow-y:auto;">' +
      '<div>' +
        '<div style="font-size:12px;font-weight:800;letter-spacing:.05em;color:#FF6A3D;text-transform:uppercase;margin-bottom:6px;">ESTIMATE</div>' +
        '<h3 style="margin:0;font-size:18px;font-weight:800;color:#14263F;">선택한 견적</h3>' +
        '<div style="font-size:12.5px;color:#8A93A1;margin-top:6px;">' + esc(getTripInfoLabel(days)) + '</div>' +
      '</div>' +
      '<div style="border-top:1px solid #F0F1F3;padding-top:4px;">' +
        summaryLinesHTML(lines) +
        (lines.length === 0 ? '<div style="padding:18px 0;text-align:center;color:#8A93A1;font-size:13px;line-height:1.6;">아직 담은 항목이 없어요.<br/>위에서 필요한 걸 골라보세요.</div>' : '') +
      '</div>' +
      '<div style="padding-top:10px;border-top:1.5px solid #14263F;">' +
        '<span style="font-size:12.5px;font-weight:600;color:#8A93A1;line-height:1.6;">정확한 금액은 문의 등록 후 확인하실 수 있어요.</span>' +
      '</div>' +
      '<div style="height:1px;background:#F0F1F3;"></div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<label style="font-size:12.5px;font-weight:700;color:#14263F;">견적을 이메일로도 받아보세요</label>' +
        emailBoxHTML('example@email.com') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:2px;">' +
        '<button data-action="open-confirm" style="width:100%;padding:15px;border-radius:13px;background:#FF6A3D;color:#FFFFFF;font-weight:800;font-size:15px;border:none;cursor:pointer;font-family:inherit;">이 견적으로 문의하기</button>' +
        '<button data-action="request-reset" style="width:100%;padding:8px;background:none;border:none;color:#8A93A1;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit;">초기화</button>' +
      '</div>' +
      '<div style="font-size:11px;color:#C3C9D2;line-height:1.6;">품목과 수량만 담아주시면, 정확한 금액은 문의 등록 후 안내드려요.</div>' +
    '</div>';
    el.innerHTML = html;
  }

  function renderMobileBar() {
    var el = document.getElementById('mobileBar');
    if (!state.isMobile) { el.innerHTML = ''; return; }
    var days = getDays();
    var lines = getSummaryLines(days);
    var itemCount = lines.reduce(function (a, l) { return a + l.qty; }, 0);
    var html = '<div style="height:78px;"></div>' +
      '<div style="position:fixed;left:0;right:0;bottom:0;z-index:60;background:#FFFFFF;border-top:1px solid #E6E8EC;border-radius:18px 18px 0 0;box-shadow:0 -12px 32px rgba(20,38,63,.14);">';
    if (state.sheetOpen) {
      html += '<div style="animation:jstFadeIn .18s ease both;max-height:52vh;overflow-y:auto;padding:16px clamp(14px,4vw,24px) 4px;">' +
        '<div style="font-size:12.5px;color:#8A93A1;margin-bottom:10px;">' + esc(getTripInfoLabel(days)) + '</div>' +
        summaryLinesHTML(lines) +
        (lines.length === 0 ? '<div style="padding:14px 0;text-align:center;color:#8A93A1;font-size:13px;line-height:1.6;">아직 담은 항목이 없어요.</div>' : '') +
      '</div>' +
      '<div style="padding:14px clamp(14px,4vw,24px);border-top:1px solid #E6E8EC;display:flex;flex-direction:column;gap:10px;">' +
        emailBoxHTML('이메일로 받아보실래요?') +
        '<button data-action="request-reset" style="align-self:center;background:none;border:none;color:#8A93A1;font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit;">초기화</button>' +
      '</div>';
    }
    html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px clamp(14px,4vw,24px);padding-bottom:calc(13px + env(safe-area-inset-bottom));">' +
      '<button data-action="toggle-sheet" style="flex:1;min-width:0;text-align:left;background:none;border:none;padding:0;display:flex;flex-direction:column;gap:2px;cursor:pointer;font-family:inherit;">' +
        '<span style="font-size:10.5px;color:#8A93A1;font-weight:600;">담은 항목</span>' +
        '<span style="font-size:15.5px;font-weight:800;color:#14263F;">' + (itemCount > 0 ? (itemCount + '개 담음') : '아직 담은 항목이 없어요') + '</span>' +
      '</button>' +
      '<button data-action="open-confirm" style="flex:none;background:#FF6A3D;color:#FFFFFF;font-weight:800;font-size:14px;padding:13px 16px;border-radius:12px;border:none;cursor:pointer;font-family:inherit;white-space:nowrap;">문의하기</button>' +
    '</div></div>';
    el.innerHTML = html;
  }

  function renderModals() {
    var el = document.getElementById('modals');
    var html = '';
    if (state.showResetConfirm) {
      html += '<div style="position:fixed;inset:0;z-index:80;background:rgba(20,38,63,.45);display:flex;align-items:center;justify-content:center;padding:20px;">' +
        '<div style="animation:jstFadeIn .18s ease both;width:min(92vw,360px);background:#FFFFFF;border-radius:18px;padding:24px;display:flex;flex-direction:column;gap:16px;">' +
          '<div>' +
            '<div style="font-size:16px;font-weight:800;color:#14263F;margin-bottom:6px;">정말 초기화할까요?</div>' +
            '<div style="font-size:13.5px;color:#4B5563;line-height:1.6;">지금까지 고른 내용이 모두 사라져요.</div>' +
          '</div>' +
          '<div style="display:flex;gap:10px;">' +
            '<button data-action="cancel-reset" style="flex:1;padding:12px;border-radius:11px;border:1.5px solid #E6E8EC;background:#FFFFFF;color:#14263F;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">취소</button>' +
            '<button data-action="confirm-reset" style="flex:1;padding:12px;border-radius:11px;border:none;background:#E0483E;color:#FFFFFF;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">초기화</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }
    if (state.confirmOpen) {
      var days = getDays();
      var lines = getSummaryLines(days);
      html += '<div style="position:fixed;inset:0;z-index:80;background:rgba(20,38,63,.45);display:flex;align-items:center;justify-content:center;padding:20px;">' +
        '<div style="animation:jstFadeIn .18s ease both;width:min(92vw,480px);max-height:85vh;overflow-y:auto;background:#FFFFFF;border-radius:20px;padding:26px;display:flex;flex-direction:column;gap:14px;">' +
          '<div>' +
            '<div style="font-size:12px;font-weight:800;letter-spacing:.05em;color:#FF6A3D;text-transform:uppercase;margin-bottom:6px;">CONFIRM</div>' +
            '<h3 style="margin:0 0 6px;font-size:19px;font-weight:800;color:#14263F;">이 내용으로 문의할까요?</h3>' +
            '<div style="font-size:13px;color:#8A93A1;">' + esc(getTripInfoLabel(days)) + '</div>' +
          '</div>' +
          '<div style="border-top:1px solid #F0F1F3;">' +
            summaryLinesHTML(lines) +
            (lines.length === 0 ? '<div style="padding:14px 0;text-align:center;color:#8A93A1;font-size:13px;">아직 담은 항목이 없어요.</div>' : '') +
          '</div>' +
          '<div style="padding-top:8px;border-top:1.5px solid #14263F;">' +
            '<span style="font-size:12.5px;font-weight:600;color:#8A93A1;">정확한 금액은 문의 등록 후 확인하실 수 있어요.</span>' +
          '</div>' +
          '<div style="font-size:12px;color:#8A93A1;line-height:1.6;">확인을 누르면 문의게시판 글쓰기로 이동하고, 담은 항목이 자동으로 채워져요.</div>' +
          '<div style="display:flex;gap:10px;">' +
            '<button data-action="close-confirm" style="flex:1;padding:13px;border-radius:12px;border:1.5px solid #E6E8EC;background:#FFFFFF;color:#14263F;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">취소</button>' +
            '<button data-action="submit-to-inquiry" style="flex:1.4;padding:13px;border-radius:12px;border:none;background:#FF6A3D;color:#FFFFFF;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;">문의게시판으로 이어가기</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }
    el.innerHTML = html;
  }

  function renderAll() {
    renderTrip();
    renderLift();
    renderRental();
    renderSidebar();
    renderMobileBar();
    renderModals();
  }

  // ── 동작 ────────────────────────────────────────────────────
  function sendEmail() {
    var email = (state.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      state.emailError = '이메일 주소를 다시 확인해주세요';
      renderSidebar(); renderMobileBar();
      return;
    }
    state.emailSending = true;
    state.emailError = '';
    setTimeout(function () {
      state.emailSending = false;
      state.emailSent = true;
      renderSidebar(); renderMobileBar();
    }, 900);
  }

  function submitToInquiry() {
    var days = getDays();
    var lines = getSummaryLines(days);
    var total = lines.reduce(function (a, l) { return a + l.subtotalValue; }, 0);
    var payload = {
      tripInfo: getTripInfoLabel(days),
      affiliateType: state.affiliateType,
      affiliateName: state.affiliateName || '',
      affiliate: state.affiliateType === 'affiliate' ? (state.affiliateName || '제휴업체') : '해당없음',
      lines: lines.map(function (l) {
        return { group: l.group, label: l.label, qty: l.qty, subtotal: l.subtotalFormatted, subtotalValue: l.subtotalValue, cat: l.cat, itemId: l.itemId };
      }),
      total: won(total),
      totalValue: total,
      email: state.email || '',
      createdAt: new Date().toISOString(),
    };
    JST.saveEstimate(payload);
    window.location.href = 'inquiry.html?mode=write&from=estimate';
  }

  var actions = {
    'affiliate-none': function () { state.affiliateType = 'none'; renderAll(); },
    'affiliate-partner': function () { state.affiliateType = 'affiliate'; renderAll(); },
    'toggle-undecided': function () { state.scheduleUndecided = !state.scheduleUndecided; renderAll(); },
    'inc-adult': function () { state.adult = Math.min(20, state.adult + 1); renderAll(); },
    'dec-adult': function () { state.adult = Math.max(1, state.adult - 1); renderAll(); },
    'inc-child': function () { state.child = Math.min(20, state.child + 1); renderAll(); },
    'dec-child': function () { state.child = Math.max(0, state.child - 1); renderAll(); },

    'select-lift-day': function (el) { state.activeLiftDayIndex = Number(el.dataset.idx); renderAll(); },
    'apply-all-lift': function () {
      var days = getDays();
      var idx = Math.min(state.activeLiftDayIndex, days.length - 1);
      var srcKey = days[idx].key + '__';
      catalog.lift.filter(function (t) { return !t.hidden; }).forEach(function (t) {
        var v = state.liftQty[srcKey + t.id] || 0;
        days.forEach(function (d) { state.liftQty[d.key + '__' + t.id] = v; });
      });
      renderAll();
    },
    'lift-qty': function (el) {
      var days = getDays();
      var day = days[Math.min(state.activeLiftDayIndex, days.length - 1)];
      var key = day.key + '__' + el.dataset.id;
      state.liftQty[key] = Math.max(0, (state.liftQty[key] || 0) + Number(el.dataset.delta));
      renderAll();
    },

    'rental-tab': function (el) { state.activeRentalTab = el.dataset.tab; renderAll(); },
    'select-rental-day': function (el) { state.activeRentalDayIndex = Number(el.dataset.idx); renderAll(); },
    'apply-all-rental': function () {
      var days = getDays();
      var idx = Math.min(state.activeRentalDayIndex, days.length - 1);
      var srcKey = days[idx].key + '__';
      ['equipment', 'clothing', 'safety'].forEach(function (cat) {
        catalog[cat].filter(function (it) { return !it.hidden; }).forEach(function (it) {
          var v = state[cat + 'Qty'][srcKey + it.id] || 0;
          days.forEach(function (d) { state[cat + 'Qty'][d.key + '__' + it.id] = v; });
        });
      });
      renderAll();
    },
    'rental-qty': function (el) {
      var days = getDays();
      var day = days[Math.min(state.activeRentalDayIndex, days.length - 1)];
      var cat = state.activeRentalTab;
      var key = day.key + '__' + el.dataset.id;
      state[cat + 'Qty'][key] = Math.max(0, (state[cat + 'Qty'][key] || 0) + Number(el.dataset.delta));
      renderAll();
    },

    'send-email': function () { sendEmail(); },
    'toggle-sheet': function () { state.sheetOpen = !state.sheetOpen; renderMobileBar(); },
    'open-confirm': function () { state.confirmOpen = true; renderModals(); },
    'close-confirm': function () { state.confirmOpen = false; renderModals(); },
    'submit-to-inquiry': function () { submitToInquiry(); },
    'request-reset': function () { state.showResetConfirm = true; renderModals(); },
    'cancel-reset': function () { state.showResetConfirm = false; renderModals(); },
    'confirm-reset': function () {
      var isMobile = state.isMobile;
      state = defaultState();
      state.isMobile = isMobile;
      renderAll();
    },
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-input]');
    if (!el) return;
    var k = el.dataset.input;
    if (k === 'affiliate-name') state.affiliateName = el.value;
    else if (k === 'email') { state.email = el.value; state.emailSent = false; state.emailError = ''; }
  });

  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-input]');
    if (!el) return;
    var k = el.dataset.input;
    if (k === 'start-date') {
      state.startDate = el.value;
      if (state.endDate && state.endDate < state.startDate) state.endDate = state.startDate;
      renderAll();
    } else if (k === 'end-date') {
      state.endDate = el.value;
      renderAll();
    }
  });

  window.addEventListener('resize', function () {
    var isMobile = window.innerWidth < 900;
    if (isMobile !== state.isMobile) { state.isMobile = isMobile; renderAll(); }
  });

  window.addEventListener('storage', function (e) {
    if (!e || e.key === JST.KEYS.catalog) { catalog = JST.loadCatalog(); renderAll(); }
  });

  renderAll();
})();
