/* 공지사항 페이지 로직 (NoticeBoard.dc.html 구현) */
(function () {
  'use strict';
  JST.injectChrome('notice');

  var state = { selectedId: null, visibleCount: 5, notices: JST.loadNotices() };

  try {
    var id = parseInt(new URLSearchParams(window.location.search).get('id'), 10);
    if (!isNaN(id)) state.selectedId = id;
  } catch (e) {}

  function orderedNotices() {
    return state.notices.filter(function (n) { return !!n.pinned; })
      .concat(state.notices.filter(function (n) { return !n.pinned; }));
  }

  function render() {
    var app = document.getElementById('app');
    if (state.selectedId === null) {
      var notices = orderedNotices();
      var html = '<div style="margin-bottom:24px;">' +
        '<div style="font-size:12.5px;font-weight:800;letter-spacing:.06em;color:#FF6A3D;text-transform:uppercase;margin-bottom:8px;">NOTICE</div>' +
        '<h1 style="margin:0 0 8px;font-size:clamp(24px,5vw,30px);font-weight:800;color:#14263F;letter-spacing:-0.02em;">공지사항</h1>' +
        '<p style="margin:0;font-size:15px;line-height:1.6;color:#4B5563;">운영 안내와 새로운 소식을 확인하세요.</p>' +
      '</div>';

      html += '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;overflow:hidden;">';
      notices.slice(0, state.visibleCount).forEach(function (n) {
        html += '<button data-action="open" data-id="' + JST.esc(n.id) + '" style="width:100%;display:flex;align-items:center;gap:10px;padding:16px clamp(14px,3vw,20px);background:none;border:none;border-bottom:1px solid #F0F1F3;cursor:pointer;text-align:left;font-family:inherit;">' +
          (n.pinned ? '<span title="상단 고정" aria-label="상단 고정" style="flex:none;font-size:14px;">📌</span>' : '') +
          (n.tag ? '<span style="flex:none;padding:4px 9px;border-radius:6px;background:#FFF3EC;color:#FF6A3D;font-size:11.5px;font-weight:800;">' + JST.esc(n.tag) + '</span>' : '') +
          '<span style="flex:1;min-width:0;font-size:14.5px;color:#14263F;font-weight:700;">' + JST.esc(n.title) + '</span>' +
          '<span style="flex:none;font-size:12.5px;color:#8A93A1;">' + JST.esc(n.date) + '</span>' +
          '<span style="flex:none;color:#C3C9D2;font-size:15px;">›</span>' +
        '</button>';
      });
      if (state.notices.length === 0) {
        html += '<div style="padding:24px;text-align:center;font-size:13px;color:#8A93A1;">등록된 공지사항이 없어요.</div>';
      }
      html += '</div>';

      if (state.visibleCount < notices.length) {
        html += '<button data-action="show-more" style="display:block;width:100%;margin-top:14px;padding:14px;border-radius:12px;border:1.5px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">더보기</button>';
      }
      app.innerHTML = html;
    } else {
      var n = null;
      for (var i = 0; i < state.notices.length; i++) if (state.notices[i].id === state.selectedId) n = state.notices[i];
      n = n || { tag: '', title: '', date: '', body: '' };
      app.innerHTML =
        '<button data-action="back" style="display:inline-flex;align-items:center;gap:6px;padding:9px 4px;margin-bottom:16px;background:none;border:none;color:#4B5563;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">‹ 목록으로</button>' +
        '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;padding:clamp(20px,5vw,32px);">' +
          (n.tag ? '<span style="display:inline-block;padding:4px 9px;border-radius:6px;background:#FFF3EC;color:#FF6A3D;font-size:11.5px;font-weight:800;margin-bottom:12px;">' + JST.esc(n.tag) + '</span>' : '') +
          '<h1 style="margin:0 0 10px;font-size:clamp(20px,4.5vw,26px);font-weight:800;color:#14263F;letter-spacing:-0.02em;">' + JST.esc(n.title) + '</h1>' +
          '<div style="font-size:13px;color:#8A93A1;font-weight:600;margin-bottom:20px;">' + JST.esc(n.date) + '</div>' +
          '<div style="height:1px;background:#F0F1F3;margin-bottom:20px;"></div>' +
          '<p style="margin:0;font-size:15px;line-height:1.8;color:#374151;white-space:pre-wrap;">' + JST.esc(n.body) + '</p>' +
        '</div>' +
        '<button data-action="back" style="margin-top:16px;padding:12px 20px;border-radius:11px;border:1.5px solid #E6E8EC;background:#FFFFFF;color:#14263F;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">목록으로 돌아가기</button>';
    }
  }

  document.getElementById('app').addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;
    if (a === 'open') { state.selectedId = isNaN(Number(el.dataset.id)) ? el.dataset.id : Number(el.dataset.id); render(); window.scrollTo(0, 0); }
    else if (a === 'back') { state.selectedId = null; render(); }
    else if (a === 'show-more') { state.visibleCount += 5; render(); }
  });

  window.addEventListener('storage', function (e) {
    if (!e || e.key === JST.KEYS.notices) { state.notices = JST.loadNotices(); render(); }
  });

  render();
})();
