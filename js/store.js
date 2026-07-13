/**
 * 데이터 계층. 서버 공유 데이터는 API, 페이지 간 임시 전달 데이터만 localStorage를 사용한다.
 */
window.JSTStore = (function () {
  'use strict';

  var KEYS = {
    estimate: 'jst_estimate',
    estimateDraft: 'jst_estimate_draft',
    tripInfo: 'jst_trip_info',
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }

  function todayDateStr() {
    var d = new Date();
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }

  function loadRaw(key, fallback, validate) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (!validate || validate(parsed)) return parsed;
      }
    } catch (e) {}
    return fallback;
  }

  function saveRaw(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function removeRaw(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function defaultCatalog() {
    return {
      lift: [
        { id: 'full', name: '종일권', desc: '09:00–17:00', price: 55000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'am', name: '오전권', desc: '09:00–13:00', price: 40000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'pm', name: '오후권', desc: '13:00–17:00', price: 40000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'night', name: '야간권', desc: '18:30–22:00', price: 35000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
      ],
      equipment: [
        { id: 'ski_set', name: '스키 풀세트', desc: '스키+폴+부츠', price: 25000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'board_set', name: '보드 풀세트', desc: '보드+부츠', price: 28000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'ski_pole', name: '스키+폴', desc: '부츠 제외', price: 18000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
      ],
      clothing: [
        { id: 'jacket', name: '상의 자켓', desc: '상의만', price: 15000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'pants', name: '하의 팬츠', desc: '하의만', price: 15000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'set', name: '상하의 세트', desc: '자켓+팬츠', price: 25000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'glove', name: '장갑', desc: '프리사이즈', price: 5000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
      ],
      safety: [
        { id: 'helmet', name: '헬멧', desc: '전 사이즈', price: 8000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'wrist', name: '손목보호대', desc: '프리사이즈', price: 5000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'goggle', name: '고글', desc: 'UV 코팅', price: 7000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
        { id: 'hip', name: '힙 프로텍터', desc: '프리사이즈', price: 6000, discountGeneral: 0, discountAffiliate: 0, hidden: false },
      ],
    };
  }

  function defaultDiscountConfig() {
    return {
      general: { enabled: true, type: 'percent', value: 5 },
      affiliate: { enabled: true, type: 'percent', value: 12 },
      keywords: ['여행사', '패키지', '제휴'],
    };
  }

  function mergeDiscountConfig(raw) {
    var def = defaultDiscountConfig();
    if (!raw || typeof raw !== 'object') return def;
    return {
      general: Object.assign({}, def.general, raw.general || {}),
      affiliate: Object.assign({}, def.affiliate, raw.affiliate || {}),
      keywords: Array.isArray(raw.keywords) ? raw.keywords : def.keywords,
    };
  }

  function ApiError(message, status, details) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status || 0;
    this.details = details || null;
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function apiUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    var normalized = path.charAt(0) === '/' ? path : '/' + path;
    return (window.JSTConfig ? window.JSTConfig.API_BASE : '') + normalized;
  }

  function responseMessage(payload, fallback) {
    if (payload && typeof payload.detail === 'string') return payload.detail;
    return fallback;
  }

  async function request(path, options) {
    var opts = Object.assign({ method: 'GET', credentials: 'include', cache: 'no-store' }, options || {});
    opts.headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (Object.prototype.hasOwnProperty.call(opts, 'json')) {
      opts.body = JSON.stringify(opts.json);
      opts.headers['Content-Type'] = 'application/json';
      delete opts.json;
    }
    var response;
    try {
      response = await fetch(apiUrl(path), opts);
    } catch (error) {
      throw new ApiError('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.', 0, error);
    }
    if (response.status === 204) return null;
    var payload = null;
    var contentType = response.headers.get('content-type') || '';
    try {
      payload = contentType.indexOf('application/json') !== -1 ? await response.json() : await response.text();
    } catch (e) {}
    if (!response.ok) {
      throw new ApiError(responseMessage(payload, '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.'), response.status, payload);
    }
    return payload;
  }

  function queryString(params) {
    var query = new URLSearchParams();
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== '') query.set(key, value);
    });
    var encoded = query.toString();
    return encoded ? '?' + encoded : '';
  }

  async function loadCatalog() { return request('/api/catalog'); }
  async function loadDiscountConfig() { return mergeDiscountConfig(await request('/api/discounts')); }
  async function loadNotices() {
    var result = await request('/api/notices?page=1&pageSize=100');
    return result.items;
  }
  async function getNotice(id) { return request('/api/notices/' + encodeURIComponent(id)); }
  async function loadInquiries() {
    var result = await request('/api/inquiries?page=1&pageSize=100');
    return result.items;
  }
  async function getInquiry(id) { return request('/api/inquiries/' + encodeURIComponent(id)); }
  async function verifyInquiryPassword(id, password) {
    return request('/api/inquiries/' + encodeURIComponent(id) + '/verify', {
      method: 'POST', json: { password: password },
    });
  }
  async function createInquiry(payload) {
    return request('/api/inquiries', { method: 'POST', json: payload });
  }

  async function loginAdmin(loginId, password) {
    return request('/api/admin/auth/login', { method: 'POST', json: { loginId: loginId, password: password } });
  }
  async function logoutAdmin() { return request('/api/admin/auth/logout', { method: 'POST' }); }
  async function getAdminSession() { return request('/api/admin/auth/session'); }

  async function loadAdminCatalog() { return request('/api/admin/catalog'); }
  async function loadAdminDiscountConfig() { return mergeDiscountConfig(await request('/api/admin/discounts')); }
  async function loadAdminNotices() {
    var result = await request('/api/admin/notices?page=1&pageSize=100');
    return result.items;
  }
  async function loadAdminInquiries() {
    var result = await request('/api/admin/inquiries?page=1&pageSize=100');
    return result.items;
  }
  async function createNotice(payload) { return request('/api/admin/notices', { method: 'POST', json: payload }); }
  async function updateNotice(id, payload) {
    return request('/api/admin/notices/' + encodeURIComponent(id), { method: 'PUT', json: payload });
  }
  async function deleteNotice(id) {
    return request('/api/admin/notices/' + encodeURIComponent(id), { method: 'DELETE' });
  }
  async function uploadNoticeFile(id, file) {
    var form = new FormData();
    form.append('file', file, file.name);
    return request('/api/admin/notices/' + encodeURIComponent(id) + '/files', { method: 'POST', body: form });
  }
  async function deleteNoticeFile(noticeId, fileId) {
    return request('/api/admin/notices/' + encodeURIComponent(noticeId) + '/files/' + encodeURIComponent(fileId), { method: 'DELETE' });
  }
  async function saveDiscountConfig(config) {
    return request('/api/admin/discounts', { method: 'PUT', json: config });
  }
  async function createCatalogItem(category, item) {
    return request('/api/admin/catalog/' + encodeURIComponent(category), { method: 'POST', json: item });
  }
  async function updateCatalogItem(category, id, item) {
    var payload = Object.assign({}, item);
    delete payload.id;
    return request('/api/admin/catalog/' + encodeURIComponent(category) + '/' + encodeURIComponent(id), { method: 'PUT', json: payload });
  }
  async function deleteCatalogItem(category, id) {
    return request('/api/admin/catalog/' + encodeURIComponent(category) + '/' + encodeURIComponent(id), { method: 'DELETE' });
  }
  async function reorderCatalog(category, itemIds) {
    return request('/api/admin/catalog/' + encodeURIComponent(category) + '/order', { method: 'PUT', json: { itemIds: itemIds } });
  }
  async function updateInquiry(id, payload) {
    return request('/api/admin/inquiries/' + encodeURIComponent(id), { method: 'PATCH', json: payload });
  }
  async function deleteInquiry(id) {
    return request('/api/admin/inquiries/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  function loadEstimate() { return loadRaw(KEYS.estimate, null); }
  function saveEstimate(payload) { saveRaw(KEYS.estimate, payload); }
  function clearEstimate() { removeRaw(KEYS.estimate); }
  function loadEstimateDraft() {
    return loadRaw(KEYS.estimateDraft, null, function (draft) {
      return !!draft && typeof draft === 'object' &&
        draft.liftQty && draft.equipmentQty && draft.clothingQty && draft.safetyQty;
    });
  }
  function saveEstimateDraft(draft) { saveRaw(KEYS.estimateDraft, draft); }
  function clearEstimateDraft() { removeRaw(KEYS.estimateDraft); }
  function loadTripInfo() { return loadRaw(KEYS.tripInfo, null); }
  function saveTripInfo(info) { saveRaw(KEYS.tripInfo, info); }

  return {
    KEYS: KEYS,
    ApiError: ApiError,
    apiUrl: apiUrl,
    esc: esc,
    won: won,
    todayDateStr: todayDateStr,
    defaultCatalog: defaultCatalog,
    defaultDiscountConfig: defaultDiscountConfig,
    mergeDiscountConfig: mergeDiscountConfig,
    loadCatalog: loadCatalog,
    loadDiscountConfig: loadDiscountConfig,
    loadNotices: loadNotices,
    getNotice: getNotice,
    loadInquiries: loadInquiries,
    getInquiry: getInquiry,
    verifyInquiryPassword: verifyInquiryPassword,
    createInquiry: createInquiry,
    loginAdmin: loginAdmin,
    logoutAdmin: logoutAdmin,
    getAdminSession: getAdminSession,
    loadAdminCatalog: loadAdminCatalog,
    loadAdminDiscountConfig: loadAdminDiscountConfig,
    loadAdminNotices: loadAdminNotices,
    loadAdminInquiries: loadAdminInquiries,
    createNotice: createNotice,
    updateNotice: updateNotice,
    deleteNotice: deleteNotice,
    uploadNoticeFile: uploadNoticeFile,
    deleteNoticeFile: deleteNoticeFile,
    saveDiscountConfig: saveDiscountConfig,
    createCatalogItem: createCatalogItem,
    updateCatalogItem: updateCatalogItem,
    deleteCatalogItem: deleteCatalogItem,
    reorderCatalog: reorderCatalog,
    updateInquiry: updateInquiry,
    deleteInquiry: deleteInquiry,
    loadEstimate: loadEstimate,
    saveEstimate: saveEstimate,
    clearEstimate: clearEstimate,
    loadEstimateDraft: loadEstimateDraft,
    saveEstimateDraft: saveEstimateDraft,
    clearEstimateDraft: clearEstimateDraft,
    loadTripInfo: loadTripInfo,
    saveTripInfo: saveTripInfo,
  };
})();
