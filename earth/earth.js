import * as THREE from 'https://esm.sh/three@0.160.0';

const cursor = document.getElementById('cursor');
const ring = document.getElementById('cursor-ring');
let mx = 0, my = 0, rx = 0, ry = 0;

document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

(function animCursor() {
  rx += (mx - rx) * 0.14;
  ry += (my - ry) * 0.14;
  cursor.style.left = mx + 'px';
  cursor.style.top = my + 'px';
  ring.style.left = rx + 'px';
  ring.style.top = ry + 'px';
  requestAnimationFrame(animCursor);
})();

document.querySelectorAll('a, button, .expand-btn, .tab-btn, .nav-pill, .orbit-cell, .nav-logo').forEach(el => {
  el.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
  el.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
});

document.getElementById('nav-logo').addEventListener('click', e => {
  e.preventDefault();
  window.location.reload();
});

const canvas = document.getElementById('globe-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.z = 380;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const TEXTURE_BASE = 'https://threejs.org/examples/textures/planets/';
const textureUrls = {
  day: TEXTURE_BASE + 'earth_atmos_2048.jpg',
  night: TEXTURE_BASE + 'earth_lights_2048.png',
  clouds: TEXTURE_BASE + 'earth_clouds_1024.png',
  bump: TEXTURE_BASE + 'earth_normal_2048.jpg'
};

const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
const loadTex = url => new Promise((res, rej) => texLoader.load(url, res, undefined, rej));

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function loadWithRetry(attempt) {
  const loaderEl = document.getElementById('loader');
  const loaderText = loaderEl.querySelector('.loader-text');
  if (attempt > 1) loaderText.textContent = 'Retrying... (' + (attempt - 1) + '/' + (MAX_RETRIES - 1) + ')';

  Promise.all([
    loadTex(textureUrls.day),
    loadTex(textureUrls.night),
    loadTex(textureUrls.clouds),
    loadTex(textureUrls.bump),
  ]).then(([dayTex, nightTex, cloudsTex, bumpTex]) => {

    setTimeout(() => document.getElementById('loader').classList.add('done'), 400);

    const earthGeo = new THREE.SphereGeometry(100, 128, 128);
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: dayTex },
        nightTexture: { value: nightTex },
        bumpTexture: { value: bumpTex },
        sunDirection: { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform sampler2D bumpTexture;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vec3 normal = normalize(vNormal);
          float bumpScale = 0.02;
          float bumpSample = texture2D(bumpTexture, vUv).r;
          vec3 bumpNormal = normalize(normal + (bumpSample - 0.5) * bumpScale * normal);
          float sunDot = dot(bumpNormal, sunDirection);
          float dayFactor = smoothstep(-0.15, 0.28, sunDot);
          vec4 dayColor = texture2D(dayTexture, vUv);
          vec4 nightColor = texture2D(nightTexture, vUv);
          nightColor.rgb *= 1.7;
          vec3 viewDir = normalize(cameraPosition - vPosition);
          vec3 halfDir = normalize(sunDirection + viewDir);
          float spec = pow(max(dot(bumpNormal, halfDir), 0.0), 90.0);
          vec4 finalColor = mix(nightColor, dayColor, dayFactor);
          float waterMask = clamp(1.0 - dayColor.r * 0.6 - dayColor.g * 0.3, 0.0, 1.0);
          finalColor.rgb += spec * waterMask * 0.45 * dayFactor;
          gl_FragColor = finalColor;
        }
      `,
    });

    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);

    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(101.8, 64, 64),
      new THREE.MeshPhongMaterial({ map: cloudsTex, transparent: true, opacity: 0.82, depthWrite: false })
    );
    scene.add(clouds);

    const makeGlow = (radius, color, side, intensity, power) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          glowColor: { value: new THREE.Color(color) },
          viewVector: { value: camera.position }
        },
        vertexShader: `
          uniform vec3 viewVector;
          varying float intensity;
          void main() {
            vec3 vN = normalize(normalMatrix * normal);
            vec3 vV = normalize(normalMatrix * viewVector);
            intensity = pow(${intensity.toFixed(2)} - dot(vN, vV), ${power.toFixed(1)});
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 glowColor;
          varying float intensity;
          void main() {
            gl_FragColor = vec4(glowColor * intensity, intensity * 0.85);
          }
        `,
        side,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), mat));
      return mat;
    };

    const atmMat = makeGlow(103.5, 0x1a6edc, THREE.FrontSide, 0.65, 3.0);
    const outerMat = makeGlow(110, 0x0a3a8c, THREE.BackSide, 0.4, 4.0);

    const sp = new Float32Array(14000 * 3);
    for (let i = 0; i < sp.length; i++) sp[i] = (Math.random() - 0.5) * 8000;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.75, transparent: true, opacity: 0.8 });
    scene.add(new THREE.Points(starGeo, starMat));

    const sun = new THREE.DirectionalLight(0xfff5e0, 2.4);
    sun.position.set(200, 60, 100);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x111133, 0.4));

    let dragging = false, px = 0, py = 0, vx = 0, vy = 0;
    let userActive = false, userTimer;
    let targetZ = 380;

    canvas.addEventListener('mousedown', e => {
      dragging = true; userActive = true;
      px = e.clientX; py = e.clientY;
      vx = vy = 0;
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - px, dy = e.clientY - py;
      vx = dy * 0.003; vy = dx * 0.003;
      earth.rotation.x += vx; earth.rotation.y += vy;
      clouds.rotation.x += vx; clouds.rotation.y += vy;
      px = e.clientX; py = e.clientY;
      updateCoords();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      clearTimeout(userTimer);
      userTimer = setTimeout(() => (userActive = false), 1200);
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      targetZ = Math.max(130, Math.min(700, targetZ + e.deltaY * 0.28));
      updateAlt();
    }, { passive: false });

    let lp = null;
    canvas.addEventListener('touchstart', e => {
      dragging = true; userActive = true;
      px = e.touches[0].clientX; py = e.touches[0].clientY;
    });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (lp) { targetZ = Math.max(130, Math.min(700, targetZ - (d - lp) * 0.8)); updateAlt(); }
        lp = d;
      } else if (dragging) {
        const ddx = e.touches[0].clientX - px, ddy = e.touches[0].clientY - py;
        earth.rotation.x += ddy * 0.003; earth.rotation.y += ddx * 0.003;
        clouds.rotation.x += ddy * 0.003; clouds.rotation.y += ddx * 0.003;
        px = e.touches[0].clientX; py = e.touches[0].clientY;
        updateCoords();
      }
    }, { passive: false });
    canvas.addEventListener('touchend', () => { dragging = false; lp = null; setTimeout(() => (userActive = false), 1200); });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const _coordRaycaster = new THREE.Raycaster();
    const _coordScreenCentre = new THREE.Vector2(0, 0);
    function updateCoords() {
      _coordRaycaster.setFromCamera(_coordScreenCentre, camera);
      const hits = _coordRaycaster.intersectObject(earth, false);
      if (hits.length > 0) {
        const localPt = earth.worldToLocal(hits[0].point.clone());
        const norm = localPt.clone().normalize();
        const lat = Math.asin(Math.max(-1, Math.min(1, norm.y))) * (180 / Math.PI);
        const lon = Math.atan2(norm.x, norm.z) * (180 / Math.PI);
        document.getElementById('lat-val').textContent = (lat >= 0 ? '+' : '') + lat.toFixed(2) + '\xb0';
        document.getElementById('lon-val').textContent = (lon >= 0 ? '+' : '') + lon.toFixed(2) + '\xb0';
      }
    }

    function updateAlt() {
      const distFromSurface = camera.position.distanceTo(earth.position) - 100;
      const km = Math.round(distFromSurface * 63.78);
      document.getElementById('alt-val').textContent = km.toLocaleString() + ' km';
    }
    updateAlt();

    let t = 0;
    (function animate() {
      requestAnimationFrame(animate);
      t += 0.005;
      if (!userActive) {
        earth.rotation.y += 0.0012;
        clouds.rotation.y += 0.0014;
      } else {
        vx *= 0.91; vy *= 0.91;
        earth.rotation.x += vx * 0.18; earth.rotation.y += vy * 0.18;
        clouds.rotation.x += vx * 0.18; clouds.rotation.y += vy * 0.18;
      }
      clouds.rotation.y += 0.00018;
      camera.position.z += (targetZ - camera.position.z) * 0.06;
      updateCoords();
      updateAlt();
      atmMat.uniforms.viewVector.value.copy(camera.position);
      outerMat.uniforms.viewVector.value.copy(camera.position);
      starMat.opacity = 0.68 + Math.sin(t * 1.1) * 0.1;
      renderer.render(scene, camera);
    })();

  }).catch(err => {
    console.error('Texture load attempt ' + attempt + ' failed:', err);
    if (attempt < MAX_RETRIES) {
      setTimeout(() => loadWithRetry(attempt + 1), RETRY_DELAY_MS);
    } else {
      const loaderEl = document.getElementById('loader');
      loaderEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:20px;text-align:center;padding:0 32px;">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="20" r="19" stroke="rgba(74,159,255,0.35)" stroke-width="1"/>
            <path d="M20 12v10M20 27v2" stroke="#4a9fff" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <p style="font-family:'Geist Mono',monospace;font-size:8px;letter-spacing:0.45em;text-transform:uppercase;color:rgba(240,238,234,0.6);">Texture load failed</p>
          <button id="retry-btn" style="font-family:'Geist Mono',monospace;font-size:8px;letter-spacing:0.38em;text-transform:uppercase;color:#4a9fff;padding:8px 20px;border:1px solid rgba(74,159,255,0.35);border-radius:100px;background:rgba(42,111,212,0.1);cursor:pointer;">Retry</button>
        </div>`;
      document.getElementById('retry-btn').addEventListener('click', () => {
        loaderEl.innerHTML = '<div class="loader-ring"></div><p class="loader-text">Initialising Luminar</p>';
        loadWithRetry(1);
      });
    }
  });
}

loadWithRetry(1);

const card = document.getElementById('terra-card');
const toggle = document.getElementById('card-toggle');
const expandBtn = document.getElementById('expand-btn');
const globeCanvas = document.getElementById('globe-canvas');

function triggerAtmBars() {
  setTimeout(() => {
    document.querySelectorAll('.atm-fill').forEach(bar => {
      bar.style.transform = `scaleX(${parseFloat(bar.dataset.width)})`;
    });
  }, 80);
}

function setExpanded(expanded) {
  if (expanded) {
    card.classList.add('expanded');
    const body = card.querySelector('.card-body');
    const headerEl = card.querySelector('.card-header');
    const isMobile = window.innerWidth <= 600;
    const maxH = window.innerHeight * (isMobile ? 0.78 : 0.70);
    const targetH = headerEl.offsetHeight + body.scrollHeight + 2;
    card.style.transition = 'height 0.5s cubic-bezier(0.77, 0, 0.175, 1), border-color 0.3s, box-shadow 0.3s';
    card.style.height = Math.min(targetH, maxH) + 'px';
    globeCanvas.classList.add('card-open');
    triggerAtmBars();
  } else {
    const headerEl = card.querySelector('.card-header');
    card.style.transition = 'height 0.5s cubic-bezier(0.77, 0, 0.175, 1), border-color 0.3s, box-shadow 0.3s';
    card.style.height = headerEl.offsetHeight + 'px';
    card.classList.remove('expanded');
    globeCanvas.classList.remove('card-open');
  }
}

toggle.addEventListener('click', () => setExpanded(!card.classList.contains('expanded')));
expandBtn.addEventListener('click', e => {
  e.stopPropagation();
  setExpanded(!card.classList.contains('expanded'));
});

const footerEl = document.getElementById('footer-copyright');
const observer = new MutationObserver(() => {
  if (footerEl) {
    footerEl.style.opacity = card.classList.contains('expanded') ? '0' : '1';
    footerEl.style.pointerEvents = card.classList.contains('expanded') ? 'none' : 'auto';
  }
});
observer.observe(card, { attributes: true, attributeFilter: ['class'] });

(function () {
  const selector = document.getElementById('planetSelector');
  const trigger = document.getElementById('planetTrigger');
  const triggerLabel = document.getElementById('planetTriggerLabel');

  function openDropdown() {
    selector.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('dropdown-open');
  }
  function closeDropdown() {
    selector.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('dropdown-open');
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation();
    selector.classList.contains('open') ? closeDropdown() : openDropdown();
  });
  document.addEventListener('click', e => { if (!selector.contains(e.target)) closeDropdown(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDropdown(); });

  const observer2 = new MutationObserver(() => {
    if (selector.classList.contains('open')) {
      document.querySelectorAll('.planet-item').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(6px)';
        setTimeout(() => {
          el.style.transition = 'opacity 0.22s ease, transform 0.22s ease, background 0.18s';
          el.style.opacity = '1';
          el.style.transform = 'translateX(0)';
        }, 40 + i * 30);
      });
    }
  });
  observer2.observe(selector, { attributes: true, attributeFilter: ['class'] });

  document.querySelectorAll('.planet-item').forEach(item => {
    item.addEventListener('click', () => {
      const route = item.dataset.route;
      const label = item.dataset.label;
      closeDropdown();
      triggerLabel.textContent = label;
      launchStarBlast(route);
    });
  });
})();

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

  const stars = Array.from({ length: 200 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * (maxR - 60);
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, angle, dist, size: 0.4 + Math.random() * 1.1, bright: 0.3 + Math.random() * 0.5 };
  });

  const warpLines = stars.map(s => ({
    angle: s.angle,
    speed: 18 + Math.random() * 38,
    width: 0.5 + Math.random() * 1.0,
    bright: 0.55 + Math.random() * 0.45,
    color: Math.random() < 0.3 ? [120, 190, 255] : Math.random() < 0.55 ? [200, 228, 255] : [255, 255, 255],
  }));

  const easeIn  = t => t * t * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const clamp01 = t => Math.max(0, Math.min(1, t));

  const T_GATHER = 380, T_WARP = 480, T_FLASH = 140;
  const T_TOTAL = T_GATHER + T_WARP + T_FLASH;
  let startTime = null, redirectDone = false;

  function tick(ts) {
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;

    ctx.clearRect(0, 0, W, H);

    const tGather = clamp01(elapsed / T_GATHER);
    const tWarp   = clamp01((elapsed - T_GATHER) / T_WARP);
    const tFlash  = clamp01((elapsed - T_GATHER - T_WARP) / T_FLASH);

    const bgDark = easeIn(clamp01(tWarp * 1.4));
    ctx.fillStyle = `rgba(0, 1, 8, ${0.92 + bgDark * 0.08})`;
    ctx.fillRect(0, 0, W, H);

    if (tGather < 1 || tWarp === 0) {
      const gatherEased = easeIn(tGather);
      stars.forEach(s => {
        const newDist = s.dist * (1 - gatherEased * 0.18);
        const px = cx + Math.cos(s.angle) * newDist;
        const py = cy + Math.sin(s.angle) * newDist;
        const alpha = s.bright * (1 - tWarp * 3);
        if (alpha <= 0) return;
        ctx.beginPath();
        ctx.arc(px, py, s.size * (1 - gatherEased * 0.25), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 225, 255, ${alpha})`;
        ctx.fill();
      });
    }

    if (tWarp > 0) {
      const warpEased = easeOut(tWarp);
      if (tWarp < 0.6) {
        const glowAlpha = (1 - tWarp / 0.6) * 0.35;
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
        gr.addColorStop(0, `rgba(74, 140, 255, ${glowAlpha})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      }
      warpLines.forEach(l => {
        const tipDist = warpEased * (maxR * 1.3) * (l.speed / 56);
        const tailDist = Math.max(0, easeOut(clamp01(tWarp - 0.12)) * (maxR * 1.3) * (l.speed / 56));
        const lineLen = tipDist - tailDist;
        if (tipDist <= 2 || lineLen <= 0) return;
        const x1 = cx + Math.cos(l.angle) * tailDist;
        const y1 = cy + Math.sin(l.angle) * tailDist;
        const x2 = cx + Math.cos(l.angle) * Math.min(tipDist, maxR * 1.2);
        const y2 = cy + Math.sin(l.angle) * Math.min(tipDist, maxR * 1.2);
        const exitFade = clamp01(1 - (tipDist - maxR * 0.7) / (maxR * 0.5));
        const alpha = l.bright * exitFade;
        if (alpha <= 0.01) return;
        const [r, g, b] = l.color;
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.35, `rgba(${r},${g},${b},${alpha * 0.6})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},${alpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = l.width * (1 + warpEased * 0.5);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });
    }

    if (tFlash > 0) {
      const flashAlpha = tFlash < 0.4 ? tFlash / 0.4 : 1 - (tFlash - 0.4) / 0.6;
      ctx.fillStyle = `rgba(210, 235, 255, ${flashAlpha * 0.82})`;
      ctx.fillRect(0, 0, W, H);
      if (tFlash > 0.3) {
        ctx.fillStyle = `rgba(0, 1, 8, ${(tFlash - 0.3) / 0.7})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    if (elapsed > T_GATHER + T_WARP + T_FLASH * 0.4 && !redirectDone) {
      redirectDone = true;
      setTimeout(() => { window.location.href = window.location.origin + route; }, 60);
    }

    if (elapsed < T_TOTAL + 100) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

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
          setTimeout(() => { bar.style.transform = `scaleX(${parseFloat(bar.dataset.width)})`; }, 50);
        });
      }, 50);
    }
  });
});

window.addEventListener('pageshow', e => {
  if (e.persisted) window.location.reload();
});
