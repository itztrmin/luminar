const TEXTURE_URLS = [
  'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
  'https://raw.githubusercontent.com/turban/webgl-earth/master/images/2_no_clouds_4k.jpg',
];

const SPECULAR_URLS = [
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg',
];

const CLOUD_URLS = [
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_clouds_1024.png',
];

const BASE_ROTATION_SPEED = 0.00028;
const MIN_ZOOM = 1.4;
const MAX_ZOOM = 5.0;
const ZOOM_SPEED_EXPONENT = 1.8;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadImage(urls, onProgress) {
  return new Promise((resolve, reject) => {
    let index = 0;

    function attempt() {
      if (index >= urls.length) {
        reject(new Error('All texture sources exhausted'));
        return;
      }

      const url = urls[index++];
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => resolve(img);
      img.onerror = () => {
        if (onProgress) onProgress(-1, index);
        attempt();
      };

      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.onprogress = e => {
        if (e.lengthComputable && onProgress) {
          onProgress(e.loaded / e.total, 0);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          img.src = URL.createObjectURL(xhr.response);
        } else {
          if (onProgress) onProgress(-1, index);
          attempt();
        }
      };
      xhr.onerror = () => {
        if (onProgress) onProgress(-1, index);
        attempt();
      };
      xhr.send();
    }

    attempt();
  });
}

function createStarfield(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const count = Math.floor((W * H) / 900);
  const stars = Array.from({ length: count }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: 0.3 + Math.random() * 0.9,
    a: 0.2 + Math.random() * 0.7,
  }));

  ctx.clearRect(0, 0, W, H);
  stars.forEach(s => {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(210, 228, 255, ${s.a})`;
    ctx.fill();
  });
}

export function initGlobe(onProgress, onReady) {
  const canvas = document.getElementById('globe-canvas');
  const ctx = canvas.getContext('2d');

  let W, H, cx, cy, radius;
  let earthImg = null;
  let cloudImg = null;
  let specImg = null;

  let rotX = 23.44 * (Math.PI / 180);
  let rotY = 0;
  let rotZ = 0;

  let zoomLevel = 1.0;
  let targetZoom = 1.0;

  let isDragging = false;
  let lastMX = 0;
  let lastMY = 0;
  let velX = 0;
  let velY = 0;

  let cloudOffset = 0;
  let frameId = null;
  let lastTime = null;

  const starCanvas = document.createElement('canvas');
  const coordBadge = {
    lat: document.getElementById('lat-val'),
    lon: document.getElementById('lon-val'),
    alt: document.getElementById('alt-val'),
  };

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cx = W / 2;
    cy = H / 2;
    starCanvas.width = W;
    starCanvas.height = H;
    createStarfield(starCanvas);
  }

  function getEffectiveRadius() {
    const base = Math.min(W, H) * 0.36;
    return base * zoomLevel;
  }

  function getRotationSpeed() {
    const t = clamp((zoomLevel - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM), 0, 1);
    const factor = 1 - Math.pow(t, ZOOM_SPEED_EXPONENT) * 0.94;
    return BASE_ROTATION_SPEED * factor;
  }

  function latLonFromRotation() {
    const lat = -(rotX - 23.44 * (Math.PI / 180)) * (180 / Math.PI);
    const lon = ((rotY % (Math.PI * 2)) / (Math.PI * 2)) * 360;
    const normalised = ((lon % 360) + 360) % 360;
    const signed = normalised > 180 ? normalised - 360 : normalised;
    return { lat, lon: signed };
  }

  function updateCoordBadge() {
    if (!coordBadge.lat) return;
    const { lat, lon } = latLonFromRotation();
    const altKm = Math.round(400 + (zoomLevel - 1) * 600);
    coordBadge.lat.textContent = (lat >= 0 ? '+' : '') + lat.toFixed(2) + '°';
    coordBadge.lon.textContent = (lon >= 0 ? '+' : '') + lon.toFixed(2) + '°';
    coordBadge.alt.textContent = altKm + ' km';
  }

  function drawGlobe(ts) {
    const dt = lastTime ? clamp((ts - lastTime) / 16.67, 0, 4) : 1;
    lastTime = ts;

    zoomLevel += (targetZoom - zoomLevel) * 0.1 * dt;

    if (!isDragging) {
      rotY += getRotationSpeed() * dt;
      velX *= Math.pow(0.94, dt);
      velY *= Math.pow(0.94, dt);
      rotX += velX * dt;
      rotY += velY * dt;
      rotX = clamp(rotX, -Math.PI / 2.5, Math.PI / 2.5);
    }

    cloudOffset += 0.00008 * dt;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(starCanvas, 0, 0);

    radius = getEffectiveRadius();

    drawAtmosphericGlow(cx, cy, radius);
    drawEarth(cx, cy, radius);
    if (cloudImg) drawClouds(cx, cy, radius);
    drawAtmosphericRim(cx, cy, radius);
    drawTerminator(cx, cy, radius);
    drawCoordLines(cx, cy, radius);
    drawGlint(cx, cy, radius);

    updateCoordBadge();
    frameId = requestAnimationFrame(drawGlobe);
  }

  function drawAtmosphericGlow(x, y, r) {
    const grad = ctx.createRadialGradient(x, y, r * 0.88, x, y, r * 1.22);
    grad.addColorStop(0, 'rgba(40, 100, 220, 0.28)');
    grad.addColorStop(0.5, 'rgba(30, 80, 180, 0.1)');
    grad.addColorStop(1, 'rgba(0, 20, 80, 0)');
    ctx.beginPath();
    ctx.arc(x, y, r * 1.22, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function drawAtmosphericRim(x, y, r) {
    const grad = ctx.createRadialGradient(x, y, r * 0.92, x, y, r * 1.06);
    grad.addColorStop(0, 'rgba(80, 160, 255, 0)');
    grad.addColorStop(0.6, 'rgba(80, 160, 255, 0.12)');
    grad.addColorStop(1, 'rgba(40, 100, 220, 0.22)');
    ctx.beginPath();
    ctx.arc(x, y, r * 1.06, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function drawEarth(x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    if (earthImg) {
      const iW = earthImg.naturalWidth || earthImg.width;
      const iH = earthImg.naturalHeight || earthImg.height;
      const aspect = iW / iH;

      const drawH = r * 2;
      const drawW = drawH * aspect;

      const totalWidth = drawW;
      const normY = (rotX / (Math.PI / 2)) * 0.5 + 0.5;
      const offsetX = ((rotY / (Math.PI * 2)) % 1) * totalWidth;
      const offsetY = (normY - 0.5) * drawH * 0.5;

      const startX = x - r - offsetX;
      const startY = y - r + offsetY;

      ctx.drawImage(earthImg, startX, startY, drawW, drawH);
      ctx.drawImage(earthImg, startX + totalWidth, startY, drawW, drawH);
      ctx.drawImage(earthImg, startX - totalWidth, startY, drawW, drawH);
    } else {
      const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      grad.addColorStop(0, '#1e4080');
      grad.addColorStop(0.5, '#0d2a5c');
      grad.addColorStop(1, '#061428');
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const shadeGrad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.05, x, y, r * 1.1);
    shadeGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
    shadeGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
    shadeGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = shadeGrad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    ctx.restore();
  }

  function drawClouds(x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    const cW = cloudImg.naturalWidth || cloudImg.width;
    const cH = cloudImg.naturalHeight || cloudImg.height;
    const aspect = cW / cH;
    const drawH = r * 2;
    const drawW = drawH * aspect;

    const totalWidth = drawW;
    const normY = (rotX / (Math.PI / 2)) * 0.5 + 0.5;
    const offsetX = (((rotY + cloudOffset) / (Math.PI * 2)) % 1) * totalWidth;
    const offsetY = (normY - 0.5) * drawH * 0.5;

    const startX = x - r - offsetX;
    const startY = y - r + offsetY;

    ctx.globalAlpha = 0.55;
    ctx.drawImage(cloudImg, startX, startY, drawW, drawH);
    ctx.drawImage(cloudImg, startX + totalWidth, startY, drawW, drawH);
    ctx.drawImage(cloudImg, startX - totalWidth, startY, drawW, drawH);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawTerminator(x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    const shadowX = x + r * 0.3;
    const grad = ctx.createRadialGradient(shadowX, y, r * 0.3, shadowX, y, r * 1.3);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0)');
    grad.addColorStop(0.72, 'rgba(0,3,18,0.35)');
    grad.addColorStop(1, 'rgba(0,3,18,0.88)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  function drawCoordLines(x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;

    for (let lat = -60; lat <= 60; lat += 30) {
      const yOffset = (lat / 90) * r;
      const halfW = Math.sqrt(Math.max(0, r * r - yOffset * yOffset));
      ctx.beginPath();
      ctx.ellipse(x, y + yOffset, halfW, halfW * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let lon = 0; lon < 360; lon += 45) {
      const angle = (lon / 360) * Math.PI * 2 - rotY;
      const cosA = Math.cos(angle);
      if (cosA < -0.2) continue;
      const scaleX = Math.abs(cosA) * r;
      ctx.beginPath();
      ctx.ellipse(x + r * cosA * 0.5, y, scaleX * 0.12, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGlint(x, y, r) {
    const gx = x - r * 0.38;
    const gy = y - r * 0.42;
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.55);
    grad.addColorStop(0, 'rgba(255,255,255,0.09)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.03)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  function setupInteraction() {
    canvas.addEventListener('mousedown', e => {
      isDragging = true;
      lastMX = e.clientX;
      lastMY = e.clientY;
      velX = 0;
      velY = 0;
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - lastMX;
      const dy = e.clientY - lastMY;
      velY = dx * 0.006;
      velX = dy * 0.006;
      rotY += velY;
      rotX = clamp(rotX + velX, -Math.PI / 2.5, Math.PI / 2.5);
      lastMX = e.clientX;
      lastMY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      canvas.style.cursor = '';
    });

    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastMX = e.touches[0].clientX;
        lastMY = e.touches[0].clientY;
        velX = 0;
        velY = 0;
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
      if (!isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - lastMX;
      const dy = e.touches[0].clientY - lastMY;
      velY = dx * 0.006;
      velX = dy * 0.006;
      rotY += velY;
      rotX = clamp(rotX + velX, -Math.PI / 2.5, Math.PI / 2.5);
      lastMX = e.touches[0].clientX;
      lastMY = e.touches[0].clientY;
    }, { passive: true });

    canvas.addEventListener('touchend', () => { isDragging = false; });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.12 : -0.12;
      targetZoom = clamp(targetZoom + delta, MIN_ZOOM / zoomLevel * zoomLevel, MAX_ZOOM);
      targetZoom = clamp(targetZoom, 1.0, MAX_ZOOM);
    }, { passive: false });
  }

  function start() {
    resize();
    window.addEventListener('resize', resize);
    setupInteraction();
    frameId = requestAnimationFrame(drawGlobe);
  }

  async function load() {
    start();

    onProgress(0.05);

    let retryCount = 0;

    async function tryLoad() {
      try {
        onProgress(0.15);

        const earthPromise = loadImage(TEXTURE_URLS, (ratio, attempt) => {
          if (ratio === -1) {
            retryCount++;
            if (retryCount <= 2) onProgress(-1, retryCount);
          } else {
            onProgress(0.15 + ratio * 0.55);
          }
        });

        const cloudPromise = loadImage(CLOUD_URLS).catch(() => null);
        const specPromise = loadImage(SPECULAR_URLS).catch(() => null);

        earthImg = await earthPromise;
        onProgress(0.72);

        [cloudImg, specImg] = await Promise.all([cloudPromise, specPromise]);
        onProgress(0.95);

        setTimeout(() => { onProgress(1); setTimeout(onReady, 300); }, 200);
      } catch {
        if (retryCount < 2) {
          retryCount++;
          onProgress(-1, retryCount);
          setTimeout(tryLoad, 1200);
        } else {
          onProgress(-2);
        }
      }
    }

    await tryLoad();
  }

  load();

  return {
    stop() { if (frameId) cancelAnimationFrame(frameId); },
    setZoom(z) { targetZoom = clamp(z, 1.0, MAX_ZOOM); },
  };
}
