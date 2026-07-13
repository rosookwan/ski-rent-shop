/** 개발·운영 API 주소 설정. 배포 환경은 같은 Origin의 /api를 사용한다. */
window.JSTConfig = (function () {
  'use strict';

  var hostname = window.location.hostname;
  var isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  var defaultBase = isLocal ? (window.location.protocol + '//' + hostname + ':8000') : '';
  var override = typeof window.JST_API_BASE === 'string' ? window.JST_API_BASE : '';

  return {
    API_BASE: (override || defaultBase).replace(/\/+$/, ''),
    IS_LOCAL: isLocal,
  };
})();
