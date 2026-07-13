/* 홈 페이지 로직 (Home.dc.html 구현) */
(function () {
  'use strict';
  JST.injectChrome('home');

  // ── 일정·인원 플래너 ────────────────────────────────────────
  var state = { undecided: false, start: '', end: '', adult: 2, child: 0 };
  var previewState = { notices: [], inquiries: [], loading: true, error: '' };

  var S = {
    pillOn: 'flex:none;padding:7px 13px;border-radius:999px;background:#14263F;color:#FFFFFF;font-weight:700;font-size:12.5px;border:none;cursor:pointer;white-space:nowrap;font-family:inherit;',
    pillOff: 'flex:none;padding:7px 13px;border-radius:999px;background:#FFFFFF;color:#8A93A1;font-weight:600;font-size:12.5px;border:1.5px solid #E6E8EC;cursor:pointer;white-space:nowrap;font-family:inherit;',
    counterBtn: 'width:32px;height:32px;border-radius:9px;border:1.5px solid #E6E8EC;background:#FFFFFF;font-size:17px;font-weight:700;color:#14263F;cursor:pointer;font-family:inherit;',
  };

  function counterCard(title, subtitle, value, decAction, incAction) {
    return '<div style="border:1.5px solid #E6E8EC;border-radius:14px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
      '<div><div style="font-weight:700;font-size:14px;color:#14263F;">' + title + '</div>' +
      '<div style="font-size:11.5px;color:#8A93A1;font-weight:500;">' + subtitle + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex:none;">' +
        '<button data-action="' + decAction + '" style="' + S.counterBtn + '">−</button>' +
        '<span style="min-width:20px;text-align:center;font-weight:700;font-size:14.5px;color:#14263F;">' + value + '</span>' +
        '<button data-action="' + incAction + '" style="' + S.counterBtn + '">+</button>' +
      '</div>' +
    '</div>';
  }

  function renderPlanner() {
    var html = '<div style="margin-bottom:20px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">' +
        '<span style="font-size:14px;font-weight:700;color:#14263F;">여행 일정</span>' +
        '<button data-action="toggle-undecided" style="' + (state.undecided ? S.pillOn : S.pillOff) + '">일정 미정이에요</button>' +
      '</div>';
    if (state.undecided) {
      html += '<div style="font-size:13px;color:#8A93A1;">일정은 나중에 정해도 괜찮아요.</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">가는 날</label>' +
          '<input type="date" data-input="start" value="' + JST.esc(state.start) + '" style="padding:11px 12px;border-radius:11px;border:1.5px solid #E6E8EC;font-size:14px;color:#14263F;width:100%;font-family:inherit;" />' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">' +
          '<label style="font-size:12.5px;font-weight:700;color:#4B5563;">오는 날</label>' +
          '<input type="date" data-input="end" value="' + JST.esc(state.end) + '" style="padding:11px 12px;border-radius:11px;border:1.5px solid #E6E8EC;font-size:14px;color:#14263F;width:100%;font-family:inherit;" />' +
        '</div>' +
      '</div>';
    }
    html += '</div>';

    html += '<div style="margin-bottom:22px;">' +
      '<div style="font-size:14px;font-weight:700;color:#14263F;margin-bottom:10px;">인원</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">' +
        counterCard('대인', '만 14세 이상', state.adult, 'dec-adult', 'inc-adult') +
        counterCard('소인', '만 13세 이하', state.child, 'dec-child', 'inc-child') +
      '</div>' +
    '</div>';

    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
      '<button data-action="go-lodging" style="flex:1;min-width:200px;padding:14px;border-radius:12px;border:1.5px solid #14263F;background:#FFFFFF;color:#14263F;font-weight:700;font-size:14.5px;cursor:pointer;font-family:inherit;">숙박 선택으로 이어가기</button>' +
      '<button data-action="go-estimate" style="flex:1;min-width:200px;padding:14px;border-radius:12px;border:none;background:#FF6A3D;color:#FFFFFF;font-weight:800;font-size:14.5px;cursor:pointer;font-family:inherit;">숙박 건너뛰고 셀프견적으로</button>' +
    '</div>';

    document.getElementById('tripPlanner').innerHTML = html;
  }

  function saveTripInfo(target) {
    JST.saveTripInfo({ undecided: state.undecided, start: state.start, end: state.end, adult: state.adult, child: state.child });
    if (target.indexOf('#') === 0) window.location.hash = target.slice(1);
    else window.location.href = target;
  }

  var actions = {
    'toggle-undecided': function () { state.undecided = !state.undecided; renderPlanner(); },
    'inc-adult': function () { state.adult = Math.min(20, state.adult + 1); renderPlanner(); },
    'dec-adult': function () { state.adult = Math.max(1, state.adult - 1); renderPlanner(); },
    'inc-child': function () { state.child = Math.min(20, state.child + 1); renderPlanner(); },
    'dec-child': function () { state.child = Math.max(0, state.child - 1); renderPlanner(); },
    'go-lodging': function () { saveTripInfo('#lodging'); },
    'go-estimate': function () { saveTripInfo('estimate.html'); },
  };

  document.getElementById('tripPlanner').addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action]();
  });
  document.getElementById('tripPlanner').addEventListener('change', function (e) {
    var el = e.target.closest('[data-input]');
    if (!el) return;
    if (el.dataset.input === 'start') {
      state.start = el.value;
      if (state.end && state.end < state.start) state.end = state.start;
      renderPlanner();
    } else if (el.dataset.input === 'end') {
      state.end = el.value;
    }
  });

  // ── 게시판 미리보기 ─────────────────────────────────────────
  function rowStyle(isLast) {
    return 'display:flex;align-items:center;gap:8px;padding:11px 0;' + (isLast ? '' : 'border-bottom:1px solid #F0F1F3;') + 'text-decoration:none;';
  }

  function renderPreviews() {
    if (previewState.loading) {
      document.getElementById('noticePreview').innerHTML = '<div style="font-size:13px;color:#8A93A1;padding:8px 0;">공지사항을 불러오고 있어요.</div>';
      document.getElementById('inquiryPreview').innerHTML = '<div style="font-size:13px;color:#8A93A1;padding:8px 0;">문의 내역을 불러오고 있어요.</div>';
      return;
    }
    if (previewState.error) {
      var errorHtml = '<div style="font-size:13px;color:#E0483E;padding:8px 0;line-height:1.6;">' + JST.esc(previewState.error) + '<br><button data-action="retry-previews" style="margin-top:7px;padding:6px 10px;border-radius:8px;border:1px solid #E6E8EC;background:#FFFFFF;color:#14263F;font-weight:700;cursor:pointer;font-family:inherit;">다시 불러오기</button></div>';
      document.getElementById('noticePreview').innerHTML = errorHtml;
      document.getElementById('inquiryPreview').innerHTML = errorHtml;
      return;
    }
    var notices = previewState.notices.slice(0, 3);
    document.getElementById('noticePreview').innerHTML = notices.map(function (n, i) {
      return '<a href="notice.html?id=' + encodeURIComponent(n.id) + '" style="' + rowStyle(i === notices.length - 1) + '">' +
        (n.tag ? '<span style="flex:none;padding:3px 8px;border-radius:6px;background:#FFF3EC;color:#FF6A3D;font-size:11px;font-weight:800;">' + JST.esc(n.tag) + '</span>' : '') +
        '<span style="flex:1;min-width:0;font-size:14px;color:#14263F;font-weight:600;">' + JST.esc(n.title) + '</span>' +
        '<span style="flex:none;font-size:12px;color:#8A93A1;">' + JST.esc(n.date) + '</span>' +
      '</a>';
    }).join('') || '<div style="font-size:13px;color:#8A93A1;padding:8px 0;">등록된 공지사항이 없어요.</div>';

    var inquiries = previewState.inquiries.slice(0, 3);
    document.getElementById('inquiryPreview').innerHTML = inquiries.map(function (q, i) {
      var done = q.status === '답변완료';
      var shortDate = (q.date || '').length > 5 ? q.date.slice(5) : q.date;
      return '<a href="inquiry.html?id=' + encodeURIComponent(q.id) + '" style="' + rowStyle(i === inquiries.length - 1) + '">' +
        '<span style="flex:1;min-width:0;font-size:14px;color:#14263F;font-weight:600;">' + JST.esc(q.title) + '</span>' +
        '<span style="flex:none;padding:3px 8px;border-radius:6px;background:' + (done ? '#E9F7EF' : '#F0F1F3') + ';color:' + (done ? '#1F9254' : '#6B7280') + ';font-size:11px;font-weight:800;">' + JST.esc(q.status) + '</span>' +
        '<span style="flex:none;font-size:12px;color:#8A93A1;">' + JST.esc(shortDate) + '</span>' +
      '</a>';
    }).join('') || '<div style="font-size:13px;color:#8A93A1;padding:8px 0;">등록된 문의가 없어요.</div>';
  }

  async function refreshPreviews() {
    previewState.loading = true;
    previewState.error = '';
    renderPreviews();
    try {
      var results = await Promise.all([JST.loadNotices(), JST.loadInquiries()]);
      previewState.notices = results[0];
      previewState.inquiries = results[1];
    } catch (error) {
      previewState.error = error.message || '게시판 내용을 불러오지 못했어요.';
    } finally {
      previewState.loading = false;
      renderPreviews();
    }
  }

  document.addEventListener('click', function (e) {
    var retry = e.target.closest('[data-action="retry-previews"]');
    if (retry) refreshPreviews();
  });

  renderPlanner();
  refreshPreviews();
})();
