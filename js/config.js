/** 개발·운영 API 주소 설정. GitHub Pages는 임시 HTTPS API 브리지를 사용한다. */
window.JSTConfig = (function () {
  'use strict';

  var hostname = window.location.hostname;
  var isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  var isGitHubPages = hostname === 'rosookwan.github.io' && window.location.pathname.indexOf('/ski-rent-shop/') === 0;
  var isBridgeHost = (hostname === 'www.tennisbracket.site' || hostname === 'tennisbracket.site') &&
    window.location.pathname.indexOf('/junski/') === 0;
  var defaultBase = '';
  if (isLocal) defaultBase = window.location.protocol + '//' + hostname + ':8000';
  else if (isGitHubPages) defaultBase = 'https://www.tennisbracket.site/junski-api';
  else if (isBridgeHost) defaultBase = '/junski-api';
  var override = typeof window.JST_API_BASE === 'string' ? window.JST_API_BASE : '';

  return {
    API_BASE: (override || defaultBase).replace(/\/+$/, ''),
    IS_LOCAL: isLocal,
    IS_GITHUB_PAGES: isGitHubPages,
    ADMIN_URL: isGitHubPages ? 'https://www.tennisbracket.site/junski/admin-login.html' : '',
  };
})();
