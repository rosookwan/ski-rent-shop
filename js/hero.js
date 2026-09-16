/**
 * 홈 히어로: 스크롤 연동 스토리 (index.html의 .hero)
 * - 스크롤 위치에 맞춰 영상 프레임을 이동한다. 스크롤을 멈추면 정지하고 위로 올리면 되감긴다.
 * - 진행 구간마다 숙박·렌탈·리프트권·예약 패널이 나타난다. 품목·가격은 JST.loadCatalog()로 받는다.
 * - 로드 순서: config.js → store.js → site.js → home.js → hero.js
 */
(function () {
  'use strict';

  var hero = document.getElementById('hero');
  var video = document.getElementById('heroVideo');
  var bar = document.getElementById('heroBar');
  var dotsWrap = document.getElementById('heroDots');
  var panels = Array.prototype.slice.call(hero.querySelectorAll('.panel'));
  var dots = Array.prototype.slice.call(dotsWrap.querySelectorAll('button'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('#heroNav a[data-go]'));
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 품목·가격 (카탈로그) ─────────────────────────────────────
  var catalog = JST.defaultCatalog();

  function priceLabel(item) { return Math.round(item.price).toLocaleString('ko-KR'); }

  function renderCatalog() {
    var rental = ['equipment', 'clothing', 'safety'].reduce(function (acc, cat) {
      return acc.concat((catalog[cat] || []).filter(function (it) { return !it.hidden; }));
    }, []);
    document.getElementById('heroRentalChips').innerHTML = rental.map(function (it) {
      return '<span class="chip">' + JST.esc(it.name) + ' <b>' + priceLabel(it) + '</b></span>';
    }).join('');
    document.getElementById('heroLiftCards').innerHTML = (catalog.lift || []).filter(function (t) { return !t.hidden; }).map(function (t) {
      return '<div class="card"><div class="t"><span>' + JST.esc(t.name) + '</span><b>' + priceLabel(t) + '</b></div><div class="d">' + JST.esc(t.desc) + '</div></div>';
    }).join('');
  }

  async function loadCatalog() {
    try {
      var loaded = await JST.loadCatalog();
      if (loaded && loaded.lift) catalog = loaded;
    } catch (e) {
      // API를 못 받으면 기본 카탈로그를 그대로 표시한다.
    }
    renderCatalog();
  }

  function progress() {
    var span = hero.offsetHeight - window.innerHeight;
    return Math.min(1, Math.max(0, (window.scrollY - hero.offsetTop) / span));
  }
  function ease(x) { return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); }

  function goTo(idx) {
    var p = panels[idx], s = parseFloat(p.dataset.start), e = parseFloat(p.dataset.end);
    var mid = idx === 0 ? 0 : (s + e) / 2 - 0.02, span = hero.offsetHeight - window.innerHeight;
    window.scrollTo({ top: hero.offsetTop + mid * span, behavior: reduce ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action="go"]');
    if (el) goTo(parseInt(el.dataset.go, 10));
  });

  var shown = progress(), active = -1, dotsOff = false, lastFrame = 0;
  var videoEnabled = false, videoProgress = 0;
  function frame(now) {
    var elapsed = lastFrame ? Math.min(now - lastFrame, 50) : 1000 / 60;
    lastFrame = now;
    var target = progress();
    // 화면 주사율과 관계없이 약 180ms의 완충으로 휠·터치 입력을 따라간다.
    // 영상과 문구에 같은 진행률을 사용해 장면 전환이 서로 어긋나지 않게 한다.
    var blend = reduce ? 1 : 1 - Math.exp(-elapsed / 180);
    shown += (target - shown) * blend;
    if (Math.abs(target - shown) < 0.0004) shown = target;
    videoProgress = shown;
    seekVideo();

    bar.style.width = (shown * 100) + '%';

    // 패널: 구간 앞 22%에서 들어오고 뒤 22%에서 나감
    var cur = -1;
    panels.forEach(function (p, i) {
      var s = parseFloat(p.dataset.start), e = parseFloat(p.dataset.end), w = (e - s) * 0.22;
      var a = ease((shown - s) / w) * ease((e - shown) / w);
      if (i === 0) a = ease((e - shown) / w);
      if (i === panels.length - 1) a = ease((shown - s) / w);
      var dir = shown < (s + e) / 2 ? 1 : -1;
      p.style.opacity = a;
      p.style.transform = 'translateY(' + (reduce ? 0 : (1 - a) * 36 * dir) + 'px)';
      p.classList.toggle('on', a > 0.5);
      if (shown >= s && shown <= e) cur = i;
    });
    if (cur < 0) {
      cur = panels.reduce(function (best, p, i) {
        var mid = (parseFloat(p.dataset.start) + parseFloat(p.dataset.end)) / 2;
        return Math.abs(mid - shown) < Math.abs(best.d) ? { i: i, d: mid - shown } : best;
      }, { i: 0, d: 9 }).i;
    }
    if (cur !== active) {
      active = cur;
      hero.classList.toggle('hero--details', cur > 0);
      dots.forEach(function (d, i) { d.classList.toggle('on', i === cur); });
      navLinks.forEach(function (l) { l.classList.toggle('on', parseInt(l.dataset.go, 10) === cur); });
    }
    // 히어로를 지나면 점 네비 숨김
    var past = window.scrollY > hero.offsetTop + hero.offsetHeight - window.innerHeight * 0.6;
    if (past !== dotsOff) { dotsOff = past; dotsWrap.classList.toggle('off', past); }
    requestAnimationFrame(frame);
  }

  // ── 영상: 스크롤 위치 → 재생 시점 (자동 재생 없음) ────────
  function seekVideo() {
    if (!videoEnabled || video.readyState < 2 || video.seeking ||
        !Number.isFinite(video.duration)) return;
    // 24fps 영상의 마지막 실제 프레임까지만 탐색한다.
    var end = Math.max(0, video.duration - 1 / 24);
    var time = Math.round(videoProgress * end * 24) / 24;
    if (Math.abs(video.currentTime - time) < 1 / 48) return;
    video.currentTime = time;
  }

  function startVideo() {
    var connection = navigator.connection;
    // 동작 줄이기·데이터 절약 사용자는 정적인 포스터를 본다.
    if (reduce || (connection && connection.saveData)) return;
    videoEnabled = true;
    video.addEventListener('loadeddata', function () {
      video.classList.add('is-ready');
      seekVideo();
    });
    video.addEventListener('canplay', seekVideo);
    video.addEventListener('seeked', function () {
      // 탐색 중 추가 스크롤이 들어오면 가장 최근 위치로 이어서 이동한다.
      video.classList.add('is-ready');
      seekVideo();
    });
    video.addEventListener('error', function () {
      videoEnabled = false;
      video.classList.remove('is-ready');
    });
    video.muted = true;
    video.preload = 'auto';
    video.src = window.matchMedia('(max-width: 899px)').matches ?
      video.dataset.mobileSrc : video.dataset.src;
    video.load();
  }

  renderCatalog();
  loadCatalog();
  requestAnimationFrame(frame);
  startVideo();
})();
