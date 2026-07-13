/**
 * 사용자 화면 공통 모듈: 헤더/푸터 (Header.dc.html / Footer.dc.html 구현)
 *
 * - 데이터 조회/저장은 전부 JSTStore(js/store.js)에 위임한다.
 * - 페이지 스크립트는 window.JST 하나만 쓰면 된다 (JSTStore 기능 포함).
 * - 로드 순서: store.js → site.js → 페이지 스크립트
 */
window.JST = (function () {
  'use strict';

  function logoSVG(size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none">' +
      '<path d="M2 18.5L7.5 9.5L11.5 18.5Z" fill="#FF6A3D" fill-opacity="0.5"/>' +
      '<path d="M6.5 18.5L14 4.5L22 18.5Z" fill="#FF6A3D"/>' +
      '<path d="M14 4.5L16.1 8.6L11.9 8.6Z" fill="#FFFFFF"/>' +
      '<circle cx="18.7" cy="6.3" r="1.3" fill="#FFFFFF"/>' +
    '</svg>';
  }

  /**
   * 상단 헤더. active: 'home' | 'notice' | 'inquiry' | 'selfcalc' | 'lodging' | 'visit'
   */
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

  /**
   * 하단 푸터. opts.hideMobileBar: 셀프견적처럼 자체 하단 바가 있는 페이지는 true.
   * 모바일 CTA 바의 표시 여부는 css/base.css의 .jst-mobile-* 클래스가 제어한다.
   */
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

  /** #siteHeader / #siteFooter 요소에 헤더·푸터를 주입한다. */
  function injectChrome(active, opts) {
    var h = document.getElementById('siteHeader');
    var f = document.getElementById('siteFooter');
    if (h) h.innerHTML = headerHTML(active);
    if (f) f.innerHTML = footerHTML(opts);
  }

  // JSTStore의 모든 기능 + 헤더/푸터를 하나의 네임스페이스로 노출
  return Object.assign({}, window.JSTStore, {
    headerHTML: headerHTML,
    footerHTML: footerHTML,
    injectChrome: injectChrome,
  });
})();
