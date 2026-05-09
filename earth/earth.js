import { initGlobe } from './globe.js';

const LOADER_STAGES = [
  'Connecting to telemetry',
  'Loading surface data',
  'Mapping cloud layers',
  'Calibrating atmosphere',
  'Rendering globe',
];

function setupLoader() {
  const el = document.getElementById('loader');
  const bar = el.querySelector('.loader-bar-fill');
  const stageLabel = el.querySelector('.loader-stage');
  const pct = el.querySelector('.loader-pct');
  const stageItems = el.querySelectorAll('.loader-stage-item');

  function setStage(index) {
    const i = Math.min(index, LOADER_STAGES.length - 1);
    stageItems.forEach((item, j) => {
      item.classList.toggle('active', j === i);
      item.classList.toggle('done', j < i);
    });
    if (stageLabel) stageLabel.textContent = LOADER_STAGES[i];
    const list = el.querySelector('.loader-stage-list');
    if (list) list.style.transform = `translateY(${-i * 16}px)`;
  }

  function setProgress(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const p = Math.round(clamped * 100);
    if (bar) bar.style.width = p + '%';
    if (pct) pct.textContent = p + '%';
    setStage(Math.floor(clamped * (LOADER_STAGES.length - 1)));
  }

  function showRetry(attempt) {
    if (stageLabel) stageLabel.textContent = 'Retrying connection\u2026 (' + attempt + '/2)';
    if (bar) bar.style.background = 'rgba(251,191,36,0.7)';
  }

  function showError() {
    el.innerHTML = `
      <div class="loader-error">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="17" stroke="rgba(74,159,255,0.3)" stroke-width="1"/>
          <path d="M18 10v10M18 24v2" stroke="#4a9fff" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <p class="loader-error-text">Texture load failed</p>
        <button id="retry-btn" class="loader-retry-btn">Retry connection</button>
      </div>
    `;
    document.getElementById('retry-btn').addEventListener('click', () => location.reload());
  }

  function dismiss() {
    setProgress(1);
    setTimeout(() => el.classList.add('done'), 300);
  }

  setStage(0);
  return { setProgress, showRetry, showError, dismiss };
}

function setupCursor() {
  const dot = document.getElementById('cursor');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  (function tick() {
    rx += (mx - rx) * 0.14;
    ry += (my - ry) * 0.14;
    dot.style.left = mx + 'px';
    dot.style.top = my + 'px';
    ring.style.left = rx + 'px';
    ring.style.top = ry + 'px';
    requestAnimationFrame(tick);
  })();

  document.querySelectorAll('a, button, .expand-btn, .tab-btn, .nav-pill, .orbit-cell, .nav-logo').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
  });
}

function setupCard() {
  const card = document.getElementById('terra-card');
  const toggle = document.getElementById('card-toggle');
  const expandBtn = document.getElementById('expand-btn');
  const globeCanvas = document.getElementById('globe-canvas');
  const footer = document.getElementById('footer-copyright');

  function triggerAtmBars() {
    setTimeout(() => {
      document.querySelectorAll('.atm-fill').forEach(bar => {
        bar.style.transform = 'scaleX(0)';
        setTimeout(() => { bar.style.transform = 'scaleX(' + parseFloat(bar.dataset.width) + ')'; }, 50);
      });
    }, 80);
  }

  function setExpanded(expanded) {
    if (expanded) {
      card.classList.add('expanded');
      const body = card.querySelector('.card-body');
      const header = card.querySelector('.card-header');
      const isMobile = window.innerWidth <= 600;
      const maxH = window.innerHeight * (isMobile ? 0.78 : 0.70);
      card.style.height = Math.min(header.offsetHeight + body.scrollHeight + 2, maxH) + 'px';
      globeCanvas.classList.add('card-open');
      triggerAtmBars();
    } else {
      card.style.height = card.querySelector('.card-header').offsetHeight + 'px';
      card.classList.remove('expanded');
      globeCanvas.classList.remove('card-open');
    }
  }

  toggle.addEventListener('click', () => setExpanded(!card.classList.contains('expanded')));
  expandBtn.addEventListener('click', e => {
    e.stopPropagation();
    setExpanded(!card.classList.contains('expanded'));
  });

  new MutationObserver(() => {
    if (!footer) return;
    const isExpanded = card.classList.contains('expanded');
    footer.style.opacity = isExpanded ? '0' : '1';
    footer.style.pointerEvents = isExpanded ? 'none' : 'auto';
  }).observe(card, { attributes: true, attributeFilter: ['class'] });
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'atmosphere') {
        setTimeout(() => {
          document.querySelectorAll('.atm-fill').forEach(bar => {
            bar.style.transform = 'scaleX(0)';
            setTimeout(() => { bar.style.transform = 'scaleX(' + parseFloat(bar.dataset.width) + ')'; }, 50);
          });
        }, 50);
      }
    });
  });
}

function setupPlanetDropdown() {
  const selector = document.getElementById('planetSelector');
  const trigger = document.getElementById('planetTrigger');
  const triggerLabel = document.getElementById('planetTriggerLabel');

  function open() {
    selector.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('dropdown-open');
  }

  function close() {
    selector.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('dropdown-open');
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    selector.classList.contains('open') ? close() : open();
  });

  document.addEventListener('click', e => { if (!selector.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  new MutationObserver(() => {
    if (!selector.classList.contains('open')) return;
    document.querySelectorAll('.planet-item').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(6px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.22s ease, transform 0.22s ease, background 0.18s';
        el.style.opacity = '1';
        el.style.transform = 'translateX(0)';
      }, 40 + i * 28);
    });
  }).observe(selector, { attributes: true, attributeFilter: ['class'] });

  document.querySelectorAll('.planet-item').forEach(item => {
    item.addEventListener('click', () => {
      const route = item.dataset.route;
      close();
      triggerLabel.textContent = item.dataset.label;
      launchStarBlast(route);
    });
  });
}

function launchStarBlast(route) {
  const overlay = document.getElementById('starblast');
  const cvs = document.getElementById('starblast-canvas');
  const ctx = cvs.getContext('2d');

  cvs.width = window.innerWidth;
  cvs.height = window.innerHeight;

  const W = cvs.width, H = cvs.height;
  const cx = W / 2, cy = H / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  overlay.style.opacity = '1';
  overlay.classList.add('active');

  const easeIn = t => t * t * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const clamp = t => Math.max(0, Math.min(1, t));

  const stars = Array.from({ length: 200 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * (maxR - 60);
    return { angle, dist, size: 0.4 + Math.random() * 1.1, bright: 0.3 + Math.random() * 0.5 };
  });

  const warpLines = stars.map(s => ({
    angle: s.angle,
    speed: 18 + Math.random() * 38,
    width: 0.5 + Math.random() * 1.0,
    bright: 0.55 + Math.random() * 0.45,
    color: Math.random() < 0.3 ? [120, 190, 255] : Math.random() < 0.55 ? [200, 228, 255] : [255, 255, 255],
  }));

  const T_GATHER = 380, T_WARP = 480, T_FLASH = 140;
  const T_TOTAL = T_GATHER + T_WARP + T_FLASH;
  let start = null, redirected = false;

  function tick(ts) {
    if (!start) start = ts;
    const elapsed = ts - start;

    const tGather = clamp(elapsed / T_GATHER);
    const tWarp = clamp((elapsed - T_GATHER) / T_WARP);
    const tFlash = clamp((elapsed - T_GATHER - T_WARP) / T_FLASH);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,1,8,' + (0.92 + easeIn(clamp(tWarp * 1.4)) * 0.08) + ')';
    ctx.fillRect(0, 0, W, H);

    if (tGather < 1 || tWarp === 0) {
      const g = easeIn(tGather);
      stars.forEach(s => {
        const d = s.dist * (1 - g * 0.18);
        const alpha = s.bright * (1 - tWarp * 3);
        if (alpha <= 0) return;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(s.angle) * d, cy + Math.sin(s.angle) * d, s.size * (1 - g * 0.25), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,225,255,' + alpha + ')';
        ctx.fill();
      });
    }

    if (tWarp > 0) {
      const we = easeOut(tWarp);
      if (tWarp < 0.6) {
        const ga = (1 - tWarp / 0.6) * 0.35;
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
        gr.addColorStop(0, 'rgba(74,140,255,' + ga + ')');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      }
      warpLines.forEach(l => {
        const tip = we * (maxR * 1.3) * (l.speed / 56);
        const tail = Math.max(0, easeOut(clamp(tWarp - 0.12)) * (maxR * 1.3) * (l.speed / 56));
        if (tip <= 2 || tip - tail <= 0) return;
        const x1 = cx + Math.cos(l.angle) * tail;
        const y1 = cy + Math.sin(l.angle) * tail;
        const x2 = cx + Math.cos(l.angle) * Math.min(tip, maxR * 1.2);
        const y2 = cy + Math.sin(l.angle) * Math.min(tip, maxR * 1.2);
        const alpha = l.bright * clamp(1 - (tip - maxR * 0.7) / (maxR * 0.5));
        if (alpha <= 0.01) return;
        const [r, g, b] = l.color;
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
        grad.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha * 0.6) + ')');
        grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')');
        ctx.strokeStyle = grad;
        ctx.lineWidth = l.width * (1 + we * 0.5);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });
    }

    if (tFlash > 0) {
      const fa = tFlash < 0.4 ? tFlash / 0.4 : 1 - (tFlash - 0.4) / 0.6;
      ctx.fillStyle = 'rgba(210,235,255,' + (fa * 0.82) + ')';
      ctx.fillRect(0, 0, W, H);
      if (tFlash > 0.3) {
        ctx.fillStyle = 'rgba(0,1,8,' + ((tFlash - 0.3) / 0.7) + ')';
        ctx.fillRect(0, 0, W, H);
      }
    }

    if (elapsed > T_GATHER + T_WARP + T_FLASH * 0.4 && !redirected) {
      redirected = true;
      setTimeout(() => { window.location.href = window.location.origin + route; }, 60);
    }

    if (elapsed < T_TOTAL + 100) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

document.getElementById('nav-logo').addEventListener('click', e => {
  e.preventDefault();
  window.location.reload();
});

window.addEventListener('pageshow', e => {
  if (e.persisted) window.location.reload();
});

const loader = setupLoader();
setupCursor();
setupCard();
setupTabs();
setupPlanetDropdown();

initGlobe(
  (ratio, retryAttempt) => {
    if (ratio === -1) {
      loader.showRetry(retryAttempt);
    } else if (ratio === -2) {
      loader.showError();
    } else {
      loader.setProgress(ratio);
    }
  },
  () => loader.dismiss()
);