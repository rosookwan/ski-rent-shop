/**
 * 홈 히어로: 스크롤 연동 스토리 (index.html의 .hero)
 * - 매장 사진을 간판(준스키타운) 클로즈업에서 시작해 스크롤 진행도에 따라 뒤로 빠지며 축소한다.
 * - 진행 구간마다 숙박·렌탈·리프트권·예약 패널이 나타난다. 품목·가격은 JST.loadCatalog()로 받는다.
 * - 로드 순서: config.js → store.js → site.js → home.js → hero.js
 */
(function () {
  'use strict';

  var hero = document.getElementById('hero');
  var photo = document.getElementById('heroPhoto');
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

  // ── 카메라: 간판 클로즈업 → 건물 전체 ───────────────────────
  var NW = 1538, NH = 1023;                 // 원본 사진 크기
  var SIGN = { x: 575 / NW, y: 255 / NH };  // 간판 "준스키타운" 글자 중심 (원본 비율 좌표)
  var BOX = 1.6, OFF = -0.3;                // 사진 요소는 화면의 160% 크기(contain), 좌상단 -30%

  function geo() {
    var W = window.innerWidth, H = window.innerHeight;
    var bw = W * BOX, bh = H * BOX;
    var cBox = Math.min(bw / NW, bh / NH);        // 요소 안에 contain으로 그려진 원본 배율
    var cover = Math.max(W / NW, H / NH);         // 화면을 꽉 채우는 배율 (데스크톱 끝 상태)
    var mobile = W < 900;
    return {
      W: W, H: H, cBox: cBox,
      x: OFF * W + (bw - NW * cBox) / 2 + SIGN.x * NW * cBox,   // 간판 중심의 화면 좌표(transform 전)
      y: OFF * H + (bh - NH * cBox) / 2 + SIGN.y * NH * cBox,
      n0: (mobile ? 1.2 : 2.8) * cover,                          // 시작: 간판 클로즈업
      n1: mobile ? W / NW : cover                                // 끝: 모바일은 건물 전체가 폭에 맞게
    };
  }

  function progress() {
    var span = hero.offsetHeight - window.innerHeight;
    return Math.min(1, Math.max(0, (window.scrollY - hero.offsetTop) / span));
  }
  function ease(x) { return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); }

  function goTo(idx) {
    var p = panels[idx], s = parseFloat(p.dataset.start), e = parseFloat(p.dataset.end);
    var mid = idx === 0 ? 0 : (s + e) / 2 - 0.02, span = hero.offsetHeight - window.innerHeight;
    window.scrollTo({ top: hero.offsetTop + mid * span, behavior: 'smooth' });
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action="go"]');
    if (el) goTo(parseInt(el.dataset.go, 10));
  });

  var shown = 0, active = -1, dotsOff = false;
  function frame() {
    var target = progress();
    shown += (target - shown) * (reduce ? 1 : 0.12);
    if (Math.abs(target - shown) < 0.0004) shown = target;

    // 사진: 간판 중심을 화면 중앙에 두고 시작 → 사진을 화면 중앙에 놓았을 때의 자리로 돌아가며 축소 (85% 지점 완료)
    var g = geo(), zp = ease(shown * 1.18);
    var n = g.n0 + (g.n1 - g.n0) * zp, S = n / g.cBox;
    var ex = g.W / 2 + (SIGN.x - 0.5) * NW * g.n1, ey = g.H / 2 + (SIGN.y - 0.5) * NH * g.n1;
    var gx = g.W / 2 + (ex - g.W / 2) * zp, gy = g.H / 2 + (ey - g.H / 2) * zp;
    photo.style.transformOrigin = (g.x - OFF * g.W) + 'px ' + (g.y - OFF * g.H) + 'px';
    photo.style.transform = 'translate(' + (gx - g.x) + 'px,' + (gy - g.y) + 'px) scale(' + S + ')';
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
      p.style.transform = 'translateY(' + ((1 - a) * 36 * dir) + 'px)';
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
      dots.forEach(function (d, i) { d.classList.toggle('on', i === cur); });
      navLinks.forEach(function (l) { l.classList.toggle('on', parseInt(l.dataset.go, 10) === cur); });
    }
    // 히어로를 지나면 점 네비 숨김
    var past = window.scrollY > hero.offsetTop + hero.offsetHeight - window.innerHeight * 0.6;
    if (past !== dotsOff) { dotsOff = past; dotsWrap.classList.toggle('off', past); }
    requestAnimationFrame(frame);
  }

  // ── 눈 ─────────────────────────────────────────────────────
  function startSnow() {
    var canvas = document.getElementById('heroSnow'), ctx = canvas.getContext('2d');
    var flakes = [], W = 0, H = 0, t = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function make(anywhere) {
      var d = Math.random();
      return { x: Math.random() * W, y: anywhere ? Math.random() * H : -10, r: 0.8 + d * 2.2, vy: 0.35 + d * 1.1, vx: (Math.random() - 0.5) * 0.4, a: 0.2 + d * 0.5, ph: Math.random() * 6.28 };
    }
    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes = [];
      for (var i = 0, n = Math.round(W * H / 11000); i < n; i++) flakes.push(make(true));
    }
    function draw() {
      if (window.scrollY > hero.offsetTop + hero.offsetHeight) { setTimeout(draw, 300); return; }
      t += 0.01; ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#FFFFFF';
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.y += f.vy; f.x += f.vx + Math.sin(t * 2 + f.ph) * 0.3;
        if (f.y > H + 10 || f.x < -10 || f.x > W + 10) flakes[i] = f = make(false);
        ctx.globalAlpha = f.a; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.28); ctx.fill();
      }
      ctx.globalAlpha = 1; requestAnimationFrame(draw);
    }
    window.addEventListener('resize', resize);
    resize(); draw();
  }

  renderCatalog();
  loadCatalog();
  frame();
  if (!reduce) startSnow();
})();
