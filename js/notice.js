/* 공지사항 페이지 로직 */
(function () {
  'use strict';
  JST.injectChrome('notice');

  var state = { selectedId: null, page: 1, notices: [], loading: true, error: '' };

  try {
    var id = parseInt(new URLSearchParams(window.location.search).get('id'), 10);
    if (!isNaN(id)) state.selectedId = id;
  } catch (e) {}

  function orderedNotices() {
    return state.notices.filter(function (n) { return !!n.pinned; })
      .concat(state.notices.filter(function (n) { return !n.pinned; }));
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) return '';
    var start = Math.max(1, Math.min(state.page - 2, totalPages - 4));
    var end = Math.min(totalPages, start + 4);
    var html = '<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:16px;flex-wrap:wrap;">' +
      '<button data-action="notice-page" data-page="' + Math.max(1, state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + ' aria-label="이전 페이지" style="width:36px;height:36px;border-radius:9px;border:1px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:800;cursor:' + (state.page === 1 ? 'not-allowed' : 'pointer') + ';opacity:' + (state.page === 1 ? '.42' : '1') + ';font-family:inherit;">◀</button>';
    for (var page = start; page <= end; page++) {
      var active = page === state.page;
      html += '<button data-action="notice-page" data-page="' + page + '"' + (active ? ' aria-current="page"' : '') + ' style="width:36px;height:36px;border-radius:9px;border:' + (active ? 'none' : '1px solid #E6E8EC') + ';background:' + (active ? '#14263F' : '#FFFFFF') + ';color:' + (active ? '#FFFFFF' : '#4B5563') + ';font-weight:800;cursor:pointer;font-family:inherit;">' + page + '</button>';
    }
    return html + '<button data-action="notice-page" data-page="' + Math.min(totalPages, state.page + 1) + '"' + (state.page === totalPages ? ' disabled' : '') + ' aria-label="다음 페이지" style="width:36px;height:36px;border-radius:9px;border:1px solid #E6E8EC;background:#FFFFFF;color:#4B5563;font-weight:800;cursor:' + (state.page === totalPages ? 'not-allowed' : 'pointer') + ';opacity:' + (state.page === totalPages ? '.42' : '1') + ';font-family:inherit;">▶</button></div>';
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
    return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
  }

  function renderFiles(files) {
    if (!files || !files.length) {
      return '<div style="display:flex;align-items:center;gap:9px;padding:13px 14px;border:1.5px dashed #D8DCE3;border-radius:11px;background:#FAFAFB;color:#A7AFBA;font-size:12.5px;font-weight:600;"><span aria-hidden="true" style="font-size:15px;">📎</span><span>등록된 첨부파일이 없어요.</span></div>';
    }
    return '<div style="display:flex;flex-direction:column;gap:8px;">' + files.map(function (file) {
      return '<a href="' + JST.esc(JST.apiUrl(file.downloadUrl)) + '" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #E6E8EC;border-radius:11px;background:#FFFFFF;color:#14263F;text-decoration:none;font-size:13px;font-weight:700;" download>' +
        '<span aria-hidden="true">📎</span><span style="flex:1;min-width:0;overflow-wrap:anywhere;">' + JST.esc(file.name) + '</span><span style="flex:none;color:#8A93A1;font-size:11.5px;">' + JST.esc(formatSize(file.size || 0)) + '</span></a>';
    }).join('') + '</div>';
  }

  function render() {
    var app = document.getElementById('app');
    if (state.loading) {
      app.innerHTML = '<div style="padding:48px 20px;text-align:center;color:#8A93A1;font-size:14px;">공지사항을 불러오고 있어요.</div>';
      return;
    }
    if (state.error) {
      app.innerHTML = '<div style="padding:40px 20px;text-align:center;border:1px solid #E6E8EC;border-radius:18px;background:#FFFFFF;"><div style="color:#E0483E;font-size:14px;font-weight:700;margin-bottom:12px;">' + JST.esc(state.error) + '</div><button data-action="retry" style="padding:10px 16px;border-radius:10px;border:none;background:#14263F;color:#FFFFFF;font-weight:700;cursor:pointer;font-family:inherit;">다시 불러오기</button></div>';
      return;
    }
    if (state.selectedId === null) {
      var notices = orderedNotices();
      var totalPages = Math.max(1, Math.ceil(notices.length / 10));
      state.page = Math.max(1, Math.min(state.page, totalPages));
      var pageNotices = notices.slice((state.page - 1) * 10, state.page * 10);
      var html = '<div style="margin-bottom:24px;"><div style="font-size:12.5px;font-weight:800;letter-spacing:.06em;color:#FF6A3D;text-transform:uppercase;margin-bottom:8px;">NOTICE</div><h1 style="margin:0 0 8px;font-size:clamp(24px,5vw,30px);font-weight:800;color:#14263F;letter-spacing:-0.02em;">공지사항</h1><p style="margin:0;font-size:15px;line-height:1.6;color:#4B5563;">운영 안내와 새로운 소식을 확인하세요.</p></div>';
      html += '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;overflow:hidden;">';
      pageNotices.forEach(function (n) {
        html += '<button data-action="open" data-id="' + JST.esc(n.id) + '" style="width:100%;display:flex;align-items:center;gap:10px;padding:16px clamp(14px,3vw,20px);background:none;border:none;border-bottom:1px solid #F0F1F3;cursor:pointer;text-align:left;font-family:inherit;">' +
          (n.pinned ? '<span title="상단 고정" aria-label="상단 고정" style="flex:none;font-size:14px;">📌</span>' : '') +
          (n.tag ? '<span style="flex:none;padding:4px 9px;border-radius:6px;background:#FFF3EC;color:#FF6A3D;font-size:11.5px;font-weight:800;">' + JST.esc(n.tag) + '</span>' : '') +
          '<span style="flex:1;min-width:0;font-size:14.5px;color:#14263F;font-weight:700;">' + JST.esc(n.title) + '</span><span style="flex:none;font-size:12.5px;color:#8A93A1;">' + JST.esc(n.date) + '</span><span style="flex:none;color:#C3C9D2;font-size:15px;">›</span></button>';
      });
      if (!pageNotices.length) html += '<div style="padding:24px;text-align:center;font-size:13px;color:#8A93A1;">등록된 공지사항이 없어요.</div>';
      app.innerHTML = html + '</div>' + renderPagination(totalPages);
      return;
    }

    var notice = state.notices.find(function (item) { return String(item.id) === String(state.selectedId); });
    if (!notice) {
      state.selectedId = null;
      render();
      return;
    }
    app.innerHTML = '<button data-action="back" style="display:inline-flex;align-items:center;gap:6px;padding:9px 4px;margin-bottom:16px;background:none;border:none;color:#4B5563;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">‹ 목록으로</button>' +
      '<div style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:18px;padding:clamp(20px,5vw,32px);">' +
        (notice.tag ? '<span style="display:inline-block;padding:4px 9px;border-radius:6px;background:#FFF3EC;color:#FF6A3D;font-size:11.5px;font-weight:800;margin-bottom:12px;">' + JST.esc(notice.tag) + '</span>' : '') +
        '<h1 style="margin:0 0 10px;font-size:clamp(20px,4.5vw,26px);font-weight:800;color:#14263F;letter-spacing:-0.02em;">' + JST.esc(notice.title) + '</h1><div style="font-size:13px;color:#8A93A1;font-weight:600;margin-bottom:20px;">' + JST.esc(notice.date) + '</div><div style="height:1px;background:#F0F1F3;margin-bottom:20px;"></div><p style="margin:0;font-size:15px;line-height:1.8;color:#374151;white-space:pre-wrap;">' + JST.esc(notice.body) + '</p>' +
        '<div style="margin-top:28px;padding-top:18px;border-top:1px solid #F0F1F3;"><div style="font-size:13px;font-weight:800;color:#14263F;margin-bottom:10px;">첨부파일</div>' + renderFiles(notice.files) + '</div></div>' +
      '<button data-action="back" style="margin-top:16px;padding:12px 20px;border-radius:11px;border:1.5px solid #E6E8EC;background:#FFFFFF;color:#14263F;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit;">목록으로 돌아가기</button>';
  }

  async function load() {
    state.loading = true;
    state.error = '';
    render();
    try {
      state.notices = await JST.loadNotices();
      if (state.selectedId !== null) {
        var detail = await JST.getNotice(state.selectedId);
        var index = state.notices.findIndex(function (item) { return String(item.id) === String(detail.id); });
        if (index >= 0) state.notices[index] = detail;
        else state.notices.unshift(detail);
      }
    } catch (error) {
      state.error = error.status === 404 ? '공지사항을 찾을 수 없어요.' : (error.message || '공지사항을 불러오지 못했어요.');
    } finally {
      state.loading = false;
      render();
    }
  }

  document.getElementById('app').addEventListener('click', async function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'open') {
      state.selectedId = Number(el.dataset.id);
      render();
      window.scrollTo(0, 0);
    } else if (el.dataset.action === 'back') {
      state.selectedId = null;
      render();
    } else if (el.dataset.action === 'notice-page') {
      state.page = Math.max(1, Number(el.dataset.page) || 1);
      render();
      window.scrollTo(0, 0);
    } else if (el.dataset.action === 'retry') {
      await load();
    }
  });

  load();
})();
