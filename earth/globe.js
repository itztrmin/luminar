import * as THREE from 'https://esm.sh/three@0.160.0';

const EARTH_RADIUS = 100;
const CLOUD_RADIUS = 101.8;
const STAR_COUNT = 14000;
const CAMERA_DEFAULT_Z = 380;
const CAMERA_MIN_Z = 130;
const CAMERA_MAX_Z = 700;
const AUTO_ROTATE_BASE = 0.0012;
const CLOUD_DRIFT = 0.00018;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

const TEXTURE_URLS = {
  day:    'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
  night:  'https://threejs.org/examples/textures/planets/earth_lights_2048.png',
  clouds: 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
  bump:   'https://threejs.org/examples/textures/planets/earth_normal_2048.jpg',
};

const VERTEX_SHADER_EARTH = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER_EARTH = `
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform sampler2D bumpTexture;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    float bumpSample = texture2D(bumpTexture, vUv).r;
    vec3 bumpNormal = normalize(normal + (bumpSample - 0.5) * 0.02 * normal);
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
`;

const VERTEX_SHADER_GLOW = (intensity, power) => `
  uniform vec3 viewVector;
  varying float intensity;
  void main() {
    vec3 vN = normalize(normalMatrix * normal);
    vec3 vV = normalize(normalMatrix * viewVector);
    intensity = pow(${intensity.toFixed(2)} - dot(vN, vV), ${power.toFixed(1)});
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER_GLOW = `
  uniform vec3 glowColor;
  varying float intensity;
  void main() {
    gl_FragColor = vec4(glowColor * intensity, intensity * 0.85);
  }
`;

function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  return renderer;
}

function createCamera() {
  const cam = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
  cam.position.z = CAMERA_DEFAULT_Z;
  return cam;
}

function createGlowMesh(scene, camera, radius, hexColor, side, intensity, power) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(hexColor) },
      viewVector: { value: camera.position.clone() },
    },
    vertexShader: VERTEX_SHADER_GLOW(intensity, power),
    fragmentShader: FRAGMENT_SHADER_GLOW,
    side,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 64), mat));
  return mat;
}

function createStarField(scene) {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < positions.length; i++) {
    positions[i] = (Math.random() - 0.5) * 8000;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.75, transparent: true, opacity: 0.8 });
  scene.add(new THREE.Points(geo, mat));
  return mat;
}

function createEarthMesh(dayTex, nightTex, bumpTex) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      dayTexture:   { value: dayTex },
      nightTexture: { value: nightTex },
      bumpTexture:  { value: bumpTex },
      sunDirection: { value: new THREE.Vector3(1, 0.3, 0.5).normalize() },
    },
    vertexShader: VERTEX_SHADER_EARTH,
    fragmentShader: FRAGMENT_SHADER_EARTH,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 128, 128), mat);
}

function createCloudMesh(cloudsTex) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(CLOUD_RADIUS, 64, 64),
    new THREE.MeshPhongMaterial({ map: cloudsTex, transparent: true, opacity: 0.82, depthWrite: false })
  );
}

function zoomToRotationScale(cameraZ) {
  const t = (cameraZ - CAMERA_MIN_Z) / (CAMERA_MAX_Z - CAMERA_MIN_Z);
  return Math.max(0.08, Math.min(1.0, t));
}

function setupInteraction(canvas, camera, earth, clouds, onCoordUpdate, onAltUpdate) {
  let dragging = false;
  let prevX = 0, prevY = 0;
  let velX = 0, velY = 0;
  let userActive = false;
  let userTimer = null;
  let targetZ = CAMERA_DEFAULT_Z;
  let lastPinchDist = null;

  function rotationScale() {
    return zoomToRotationScale(targetZ);
  }

  function applyDelta(dx, dy) {
    const scale = rotationScale();
    const rx = dy * 0.003 * scale;
    const ry = dx * 0.003 * scale;
    earth.rotation.x += rx;
    earth.rotation.y += ry;
    clouds.rotation.x += rx;
    clouds.rotation.y += ry;
    velX = rx;
    velY = ry;
    onCoordUpdate();
  }

  canvas.addEventListener('mousedown', e => {
    dragging = true;
    userActive = true;
    prevX = e.clientX;
    prevY = e.clientY;
    velX = velY = 0;
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    applyDelta(e.clientX - prevX, e.clientY - prevY);
    prevX = e.clientX;
    prevY = e.clientY;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    clearTimeout(userTimer);
    userTimer = setTimeout(() => { userActive = false; }, 1200);
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    targetZ = Math.max(CAMERA_MIN_Z, Math.min(CAMERA_MAX_Z, targetZ + e.deltaY * 0.28));
    onAltUpdate(targetZ);
  }, { passive: false });

  canvas.addEventListener('touchstart', e => {
    dragging = true;
    userActive = true;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
    lastPinchDist = null;
  });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastPinchDist !== null) {
        targetZ = Math.max(CAMERA_MIN_Z, Math.min(CAMERA_MAX_Z, targetZ - (dist - lastPinchDist) * 0.8));
        onAltUpdate(targetZ);
      }
      lastPinchDist = dist;
    } else if (dragging) {
      applyDelta(e.touches[0].clientX - prevX, e.touches[0].clientY - prevY);
      prevX = e.touches[0].clientX;
      prevY = e.touches[0].clientY;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    dragging = false;
    lastPinchDist = null;
    setTimeout(() => { userActive = false; }, 1200);
  });

  return {
    get isDragging() { return dragging; },
    get userActive() { return userActive; },
    get targetZ() { return targetZ; },
    get velX() { return velX; },
    get velY() { return velY; },
    setVel(x, y) { velX = x; velY = y; },
    rotationScale,
  };
}

function setupCoordReadout(camera, earth) {
  const raycaster = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);

  return function update() {
    raycaster.setFromCamera(screenCenter, camera);
    const hits = raycaster.intersectObject(earth, false);
    if (!hits.length) return;
    const local = earth.worldToLocal(hits[0].point.clone()).normalize();
    const lat = Math.asin(Math.max(-1, Math.min(1, local.y))) * (180 / Math.PI);
    const lon = Math.atan2(local.x, local.z) * (180 / Math.PI);
    const fmt = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '\u00b0';
    document.getElementById('lat-val').textContent = fmt(lat);
    document.getElementById('lon-val').textContent = fmt(lon);
  };
}

function setupAltReadout(camera, earth) {
  return function update(targetZ) {
    const dist = (targetZ ?? camera.position.z) - EARTH_RADIUS;
    const km = Math.round(dist * 63.78);
    document.getElementById('alt-val').textContent = km.toLocaleString() + ' km';
  };
}

export function initGlobe(onProgress, onReady) {
  const canvas = document.getElementById('globe-canvas');
  const scene = new THREE.Scene();
  const camera = createCamera();
  const renderer = createRenderer(canvas);

  const texLoader = new THREE.TextureLoader();
  texLoader.setCrossOrigin('anonymous');

  function loadTexture(url) {
    return new Promise((resolve, reject) => texLoader.load(url, resolve, undefined, reject));
  }

  function attempt(retryCount) {
    const urls = Object.values(TEXTURE_URLS);
    let loaded = 0;

    const promises = urls.map(url =>
      loadTexture(url).then(tex => {
        loaded++;
        onProgress(loaded / urls.length);
        return tex;
      })
    );

    Promise.all(promises).then(([dayTex, nightTex, cloudsTex, bumpTex]) => {
      const earth = createEarthMesh(dayTex, nightTex, bumpTex);
      const clouds = createCloudMesh(cloudsTex);
      scene.add(earth);
      scene.add(clouds);

      const atmMat = createGlowMesh(scene, camera, 103.5, 0x1a6edc, THREE.FrontSide, 0.65, 3.0);
      const outerMat = createGlowMesh(scene, camera, 110, 0x0a3a8c, THREE.BackSide, 0.4, 4.0);
      const starMat = createStarField(scene);

      const sun = new THREE.DirectionalLight(0xfff5e0, 2.4);
      sun.position.set(200, 60, 100);
      scene.add(sun);
      scene.add(new THREE.AmbientLight(0x111133, 0.4));

      const updateCoords = setupCoordReadout(camera, earth);
      const updateAlt = setupAltReadout(camera, earth);

      updateAlt(CAMERA_DEFAULT_Z);

      const interaction = setupInteraction(canvas, camera, earth, clouds, updateCoords, updateAlt);

      window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });

      let tick = 0;
      function animate() {
        requestAnimationFrame(animate);
        tick += 0.005;

        const scale = interaction.rotationScale();

        if (!interaction.userActive) {
          const autoSpeed = AUTO_ROTATE_BASE * scale;
          earth.rotation.y += autoSpeed;
          clouds.rotation.y += autoSpeed * 1.08;
        } else {
          const dampedVX = interaction.velX * 0.91;
          const dampedVY = interaction.velY * 0.91;
          interaction.setVel(dampedVX, dampedVY);
          earth.rotation.x += dampedVX * 0.18;
          earth.rotation.y += dampedVY * 0.18;
          clouds.rotation.x += dampedVX * 0.18;
          clouds.rotation.y += dampedVY * 0.18;
        }

        clouds.rotation.y += CLOUD_DRIFT;
        camera.position.z += (interaction.targetZ - camera.position.z) * 0.06;

        updateCoords();

        atmMat.uniforms.viewVector.value.copy(camera.position);
        outerMat.uniforms.viewVector.value.copy(camera.position);
        starMat.opacity = 0.68 + Math.sin(tick * 1.1) * 0.1;

        renderer.render(scene, camera);
      }

      animate();
      onReady();

    }).catch(err => {
      console.error('Texture load failed (attempt ' + retryCount + '):', err);
      if (retryCount < MAX_RETRIES) {
        onProgress(-1, retryCount);
        setTimeout(() => attempt(retryCount + 1), RETRY_DELAY);
      } else {
        onProgress(-2);
      }
    });
  }

  attempt(1);
}