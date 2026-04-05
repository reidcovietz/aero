"use strict";

// ─── Config ───────────────────────────────────────────────────────────────────
const CFG = {
  gameDuration:  30,    // starting seconds
  bonusEvery:    5,     // rings before +5 sec bonus
  bonusSeconds:  5,
  ringRadius:    5.5,   // ring inner radius
  ringTube:      0.55,
  cloudCount:    90,
  spawnRadius:   80,    // max distance to spawn ring from player
  spawnMinDist:  30,    // min distance
  spawnHeightMin:3,
  spawnHeightMax:28,
  speedBase:     22,
  speedBoost:    46,
  steerSens:     0.22,  // how strongly mouse steers
  mouseLerp:     0.08,  // smoothing factor
};

// ─── Skybox presets ───────────────────────────────────────────────────────────
const SKIES = {
  day:    { sky: '#8dd8f0', haze: '#c5e9f7', fog: [0.55, 0.84, 0.94], fogS: 110, fogE: 240 },
  golden: { sky: '#f4a44a', haze: '#fcd68a', fog: [0.97, 0.75, 0.45], fogS: 80, fogE: 200 },
  dusk:   { sky: '#4a3878', haze: '#c06090', fog: [0.5, 0.25, 0.5],   fogS: 70, fogE: 180 },
  night:  { sky: '#07091e', haze: '#1a2050', fog: [0.05, 0.06, 0.14], fogS: 60, fogE: 150 },
  storm:  { sky: '#2e3440', haze: '#5e6675', fog: [0.32, 0.36, 0.42], fogS: 60, fogE: 160 },
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $canvas       = document.getElementById('renderCanvas');
const $cursor       = document.getElementById('cursor');
const $hud          = document.getElementById('hud');
const $hudTime      = document.getElementById('hudTime');
const $hudScore     = document.getElementById('hudScore');
const $hudNextBonus = document.getElementById('hudNextBonus');
const $startScreen  = document.getElementById('startScreen');
const $gameOver     = document.getElementById('gameOverScreen');
const $finalScore   = document.getElementById('finalScore');
const $lbOverlay    = document.getElementById('lbOverlay');
const $lbBody       = document.getElementById('lbBody');
const $nameModal    = document.getElementById('nameModal');
const $nameInput    = document.getElementById('nameInput');
const $skyboxPicker = document.getElementById('skyboxPicker');
const $controlsHint = document.getElementById('controlsHint');
const $ringArrow    = document.getElementById('ringArrow');

// ─── Babylon core ─────────────────────────────────────────────────────────────
const engine = new BABYLON.Engine($canvas, true, { antialias: true });
const scene  = new BABYLON.Scene(engine);

scene.clearColor = new BABYLON.Color4(0.55, 0.84, 0.94, 1);
scene.fogMode   = BABYLON.Scene.FOGMODE_LINEAR;
scene.fogStart  = 110;
scene.fogEnd    = 240;
scene.fogColor  = new BABYLON.Color3(0.55, 0.84, 0.94);

// Camera — free-follow behind player
const camera = new BABYLON.FollowCamera('cam', new BABYLON.Vector3(0, 6, -20), scene);
camera.radius             = 14;
camera.heightOffset       = 4;
camera.rotationOffset     = 180;
camera.cameraAcceleration = 0.05;
camera.maxCameraSpeed     = 25;

// Lighting
const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.5, -1, -0.5), scene);
sun.intensity = 1.0;
const fill = new BABYLON.HemisphericLight('fill', new BABYLON.Vector3(0, 1, 0), scene);
fill.intensity = 0.7;
fill.diffuse  = new BABYLON.Color3(0.8, 0.93, 1.0);
fill.groundColor = new BABYLON.Color3(0.6, 0.8, 0.9);

// ─── Materials ────────────────────────────────────────────────────────────────
function glassyCloudMat() {
  const m = new BABYLON.StandardMaterial('cloud', scene);
  m.diffuseColor  = new BABYLON.Color3(0.96, 0.98, 1.0);
  m.specularColor = new BABYLON.Color3(0.6, 0.7, 0.8);
  m.specularPower = 32;
  m.alpha = 0.88;
  return m;
}

function ringMat() {
  const m = new BABYLON.StandardMaterial('ring', scene);
  m.diffuseColor  = new BABYLON.Color3(1.0, 0.88, 0.1);
  m.emissiveColor = new BABYLON.Color3(0.5, 0.35, 0.0);
  m.specularColor = new BABYLON.Color3(1.0, 1.0, 0.6);
  m.specularPower = 16;
  return m;
}

function playerMat() {
  const m = new BABYLON.StandardMaterial('player', scene);
  m.diffuseColor  = new BABYLON.Color3(0.12, 0.15, 0.22);
  m.specularColor = new BABYLON.Color3(0.4, 0.5, 0.6);
  m.specularPower = 64;
  return m;
}

const matCloud  = glassyCloudMat();
const matRing   = ringMat();
const matPlayer = playerMat();

// ─── State ────────────────────────────────────────────────────────────────────
const State = {
  running: false,
  score:   0,
  timeLeft:CFG.gameDuration,
  speed:   CFG.speedBase,
  player:  null,
  activeRing: null,
  clouds:  [],
  skyboxMesh: null,
  currentSky: 'day',
  _timerInterval: null,
  _pendingScore: 0,
};

// Mouse tracking — normalized -1..1 relative to center
const mouse = { x: 0, y: 0, rawX: 0, rawY: 0 };
window.addEventListener('mousemove', e => {
  const cx = window.innerWidth  / 2;
  const cy = window.innerHeight / 2;
  mouse.rawX = (e.clientX - cx) / cx;
  mouse.rawY = (e.clientY - cy) / cy;
  $cursor.style.left = e.clientX + 'px';
  $cursor.style.top  = e.clientY + 'px';
});

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup',   e => { keys[e.code] = false; });

// ─── Game object ──────────────────────────────────────────────────────────────
const Game = window.Game = {

  start() {
    State.score    = 0;
    State.timeLeft = CFG.gameDuration;
    State.speed    = CFG.speedBase;
    State.running  = true;

    $startScreen.classList.add('hidden');
    $gameOver.classList.add('hidden');
    $hud.classList.remove('hidden');
    $skyboxPicker.classList.remove('hidden');
    $controlsHint.classList.remove('hidden');
    $ringArrow.style.display = 'block';

    this._buildWorld();
    this._startTimer();
    this._updateHUD();
  },

  end() {
    State.running  = false;
    State._pendingScore = State.score;
    clearInterval(State._timerInterval);

    $hud.classList.add('hidden');
    $skyboxPicker.classList.add('hidden');
    $controlsHint.classList.add('hidden');
    $ringArrow.style.display = 'none';

    $finalScore.textContent = State.score;
    $gameOver.classList.remove('hidden');

    maybePromptName(State.score);
  },

  _buildWorld() {
    this._clearWorld();

    // ── Player bird ──────────────────────────────────────────────────────────
    const root = new BABYLON.TransformNode('player', scene);
    const body = BABYLON.MeshBuilder.CreateBox('body',
      { width: 1.4, height: 0.5, depth: 2.8 }, scene);
    body.material = matPlayer;

    const wL = BABYLON.MeshBuilder.CreateBox('wL', { width: 4.2, height: 0.18, depth: 1.0 }, scene);
    wL.position.set(-2.0, 0, 0.3); wL.rotation.z = 0.18; wL.material = matPlayer;

    const wR = BABYLON.MeshBuilder.CreateBox('wR', { width: 4.2, height: 0.18, depth: 1.0 }, scene);
    wR.position.set(2.0, 0, 0.3); wR.rotation.z = -0.18; wR.material = matPlayer;

    const tail = BABYLON.MeshBuilder.CreateBox('tail', { width: 1.0, height: 0.28, depth: 1.0 }, scene);
    tail.position.set(0, 0.05, -1.4); tail.material = matPlayer;

    const nose = BABYLON.MeshBuilder.CreateBox('nose', { width: 0.55, height: 0.35, depth: 0.8 }, scene);
    nose.position.set(0, 0, 1.5); nose.material = matPlayer;

    [body, wL, wR, tail, nose].forEach(m => m.parent = root);
    root.position.set(0, 12, 0);
    State.player = root;
    camera.lockedTarget = root;

    // ── Cloud spheres ────────────────────────────────────────────────────────
    State.clouds = [];
    for (let i = 0; i < CFG.cloudCount; i++) {
      this._spawnCloud(i, true);
    }

    // ── First ring ───────────────────────────────────────────────────────────
    State.activeRing = null;
    this._spawnRing();

    // ── Skybox ───────────────────────────────────────────────────────────────
    this.setSkybox(State.currentSky);
  },

  _spawnCloud(index, initial) {
    const r = 2.2 + Math.random() * 4.5;
    // Group of 2-4 overlapping spheres per cloud puff
    const count = 2 + Math.floor(Math.random() * 3);
    const cx = (Math.random() - 0.5) * 200;
    const cy = Math.random() * 28;
    const cz = initial
      ? Math.random() * 400 - 50
      : (State.player ? State.player.position.z + 60 + Math.random() * 140 : Math.random() * 400);

    for (let j = 0; j < count; j++) {
      const s = BABYLON.MeshBuilder.CreateSphere('cloud_' + index + '_' + j,
        { diameter: r * (0.6 + Math.random() * 0.8), segments: 7 }, scene);
      s.material = matCloud;
      s.position.set(
        cx + (Math.random() - 0.5) * r * 2,
        cy + (Math.random() - 0.5) * r * 0.6,
        cz + (Math.random() - 0.5) * r * 1.5,
      );
      s._cloudGroup = index;
      State.clouds.push(s);
    }
  },

  _spawnRing() {
    if (State.activeRing) {
      State.activeRing.dispose();
      State.activeRing = null;
    }

    const p = State.player ? State.player.position : new BABYLON.Vector3(0, 12, 0);
    const angle  = Math.random() * Math.PI * 2;
    const dist   = CFG.spawnMinDist + Math.random() * (CFG.spawnRadius - CFG.spawnMinDist);
    const rx = p.x + Math.sin(angle) * dist;
    const rz = p.z + Math.cos(angle) * dist;
    const ry = CFG.spawnHeightMin + Math.random() * (CFG.spawnHeightMax - CFG.spawnHeightMin);

    const torus = BABYLON.MeshBuilder.CreateTorus('ring', {
      diameter: CFG.ringRadius * 2,
      thickness: CFG.ringTube,
      tessellation: 40,
    }, scene);
    torus.material = matRing;
    torus.position.set(rx, ry, rz);
    torus.rotation.x = Math.PI / 2;

    State.activeRing = torus;
  },

  _clearWorld() {
    if (State.player) {
      State.player.getChildMeshes().forEach(m => m.dispose());
      State.player.dispose();
      State.player = null;
    }
    if (State.activeRing) {
      State.activeRing.dispose();
      State.activeRing = null;
    }
    State.clouds.forEach(c => c.dispose());
    State.clouds = [];
    if (State.skyboxMesh) { State.skyboxMesh.dispose(); State.skyboxMesh = null; }
  },

  setSkybox(key) {
    State.currentSky = key;
    const s = SKIES[key] || SKIES.day;

    if (State.skyboxMesh) State.skyboxMesh.dispose();
    const sphere = BABYLON.MeshBuilder.CreateSphere('sky', {
      diameter: 1000, segments: 8,
      sideOrientation: BABYLON.Mesh.BACKSIDE,
    }, scene);
    const m = new BABYLON.StandardMaterial('skyMat', scene);
    m.emissiveColor = BABYLON.Color3.FromHexString(s.sky);
    m.backFaceCulling = false;
    m.disableLighting = true;
    sphere.material = m;
    sphere.infiniteDistance = true;
    State.skyboxMesh = sphere;

    const [fr, fg, fb] = s.fog;
    scene.fogColor   = new BABYLON.Color3(fr, fg, fb);
    scene.clearColor = new BABYLON.Color4(fr, fg, fb, 1);
    scene.fogStart   = s.fogS;
    scene.fogEnd     = s.fogE;

    // Tint clouds for night/storm
    if (key === 'night' || key === 'storm') {
      matCloud.diffuseColor  = new BABYLON.Color3(0.5, 0.55, 0.65);
      matCloud.emissiveColor = new BABYLON.Color3(0.06, 0.06, 0.1);
    } else if (key === 'dusk') {
      matCloud.diffuseColor  = new BABYLON.Color3(0.98, 0.82, 0.75);
      matCloud.emissiveColor = new BABYLON.Color3(0.1, 0.04, 0.04);
    } else {
      matCloud.diffuseColor  = new BABYLON.Color3(0.96, 0.98, 1.0);
      matCloud.emissiveColor = new BABYLON.Color3(0, 0, 0);
    }
  },

  _startTimer() {
    clearInterval(State._timerInterval);
    State._timerInterval = setInterval(() => {
      if (!State.running) return;
      State.timeLeft -= 1;
      this._updateHUD();
      if (State.timeLeft <= 0) this.end();
    }, 1000);
  },

  _updateHUD() {
    $hudTime.textContent      = Math.max(0, Math.ceil(State.timeLeft));
    $hudScore.textContent     = State.score;
    const toBonus = CFG.bonusEvery - (State.score % CFG.bonusEvery);
    $hudNextBonus.textContent = toBonus;
  },
};

// ─── Game loop ────────────────────────────────────────────────────────────────
let _lastT = performance.now();

scene.registerBeforeRender(() => {
  const now = performance.now();
  const dt  = Math.min((now - _lastT) / 1000, 0.05);
  _lastT = now;

  // Smooth mouse
  mouse.x += (mouse.rawX - mouse.x) * CFG.mouseLerp / dt * dt * 10;
  mouse.y += (mouse.rawY - mouse.y) * CFG.mouseLerp / dt * dt * 10;

  // Skybox always follows player
  if (State.skyboxMesh && State.player) {
    State.skyboxMesh.position.copyFrom(State.player.position);
  }

  if (!State.running || !State.player) return;

  const p = State.player;

  // Speed
  const boosting = keys['Space'] || keys['ShiftLeft'];
  const targetSpd = boosting ? CFG.speedBoost : CFG.speedBase;
  State.speed += (targetSpd - State.speed) * Math.min(dt * 5, 1);

  // Forward
  p.position.z += State.speed * dt;

  // Steer from mouse position (pointer acts as a target in the sky)
  // mx, my in -1..1; steer toward where mouse points
  const sx = mouse.rawX * CFG.steerSens * State.speed;
  const sy = -mouse.rawY * CFG.steerSens * State.speed * 0.6;

  p.position.x += sx * dt;
  p.position.y += sy * dt;

  // Clamp altitude
  p.position.y = Math.max(1, Math.min(32, p.position.y));

  // Bank / pitch visual
  const targetRoll  = -mouse.rawX * 0.55;
  const targetPitch =  mouse.rawY * 0.3;
  p.rotation.z += (targetRoll  - p.rotation.z) * Math.min(dt * 7, 1);
  p.rotation.x += (targetPitch - p.rotation.x) * Math.min(dt * 7, 1);

  // ── Ring HUD arrow ──────────────────────────────────────────────────────
  if (State.activeRing) {
    updateRingArrow(p.position, State.activeRing.position);
  }

  // ── Ring collision ──────────────────────────────────────────────────────
  if (State.activeRing) {
    const ring = State.activeRing;
    const dz = p.position.z - ring.position.z;
    if (Math.abs(dz) < 2.0) {
      const dx = p.position.x - ring.position.x;
      const dy = p.position.y - ring.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CFG.ringRadius - 0.5) {
        // Scored!
        State.score += 1;

        // Every bonusEvery rings → +5 sec
        if (State.score % CFG.bonusEvery === 0) {
          State.timeLeft += CFG.bonusSeconds;
          flashBonusText('+5 sec!');
        }

        Game._updateHUD();
        // Flash ring gold then spawn next
        ring.visibility = 0;
        setTimeout(() => Game._spawnRing(), 50);
      }
    }

    // If ring is far behind — recycle
    if (ring.position.z < p.position.z - 40) {
      Game._spawnRing();
    }
  }

  // ── Recycle clouds behind player ─────────────────────────────────────────
  const seenGroups = new Set();
  for (const c of State.clouds) {
    if (c.position.z < p.position.z - 80) {
      // Move whole group forward
      if (!seenGroups.has(c._cloudGroup)) {
        seenGroups.add(c._cloudGroup);
        const nx = (Math.random() - 0.5) * 200;
        const nz = p.position.z + 100 + Math.random() * 160;
        const ny = Math.random() * 28;
        // Find all siblings
        State.clouds
          .filter(s => s._cloudGroup === c._cloudGroup)
          .forEach(s => {
            const ox = s.position.x - c.position.x;
            const oy = s.position.y - c.position.y;
            const oz = s.position.z - c.position.z;
            s.position.set(nx + ox, ny + oy, nz + oz);
          });
      }
    }
  }
});

// ─── Ring arrow indicator ─────────────────────────────────────────────────────
function updateRingArrow(playerPos, ringPos) {
  // Project ring into screen space
  const screenPos = BABYLON.Vector3.Project(
    ringPos,
    BABYLON.Matrix.Identity(),
    scene.getTransformMatrix(),
    camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
  );

  const W = window.innerWidth;
  const H = window.innerHeight;
  const margin = 48;

  // If ring is on screen, show arrow near it
  if (screenPos.x > margin && screenPos.x < W - margin &&
      screenPos.y > margin && screenPos.y < H - margin && screenPos.z < 1) {
    // Arrow near the ring on screen
    $ringArrow.style.left = (screenPos.x - 22) + 'px';
    $ringArrow.style.top  = (screenPos.y - 50) + 'px';
    $ringArrow.style.transform = 'rotate(180deg)'; // pointing down toward ring
    $ringArrow.style.opacity = '0.85';
  } else {
    // Ring is off screen — place arrow at screen edge pointing toward it
    const cx = W / 2, cy = H / 2;
    const dx = screenPos.x - cx;
    const dy = screenPos.y - cy;
    const angle = Math.atan2(dy, dx); // angle from center to ring

    const edgeX = cx + Math.cos(angle) * (Math.min(cx, cy) - margin);
    const edgeY = cy + Math.sin(angle) * (Math.min(cx, cy) - margin);

    $ringArrow.style.left      = (edgeX - 22) + 'px';
    $ringArrow.style.top       = (edgeY - 22) + 'px';
    // Arrow points toward the ring
    $ringArrow.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
    $ringArrow.style.opacity   = '1';
  }
}

// ─── Bonus flash ──────────────────────────────────────────────────────────────
function flashBonusText(text) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', left: '50%', top: '40%',
    transform: 'translateX(-50%)',
    fontSize: '2rem', fontWeight: '900',
    color: '#ffe234',
    textShadow: '0 2px 12px rgba(255,200,0,0.6), 0 1px 0 rgba(255,255,255,0.5)',
    fontFamily: 'Nunito, sans-serif',
    pointerEvents: 'none', zIndex: 9000,
    transition: 'opacity 0.8s, transform 0.8s',
    opacity: '1',
  });
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-40px)';
  });
  setTimeout(() => el.remove(), 900);
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
const API = '/api';

async function fetchLeaderboard() {
  try {
    const r = await fetch(`${API}/leaderboard`);
    return await r.json();
  } catch { return []; }
}

function renderLeaderboard(entries) {
  $lbBody.innerHTML = entries.slice(0, 10).map((e, i) => `
    <tr>
      <td class="lb-rank">${i + 1}</td>
      <td>${esc(e.name)}</td>
      <td class="lb-score">${e.score}</td>
    </tr>
  `).join('');
  if (!entries.length) {
    $lbBody.innerHTML = '<tr><td colspan="3" style="text-align:center;opacity:0.5;padding:20px">No scores yet — be first!</td></tr>';
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function showLeaderboard() {
  $lbOverlay.classList.remove('hidden');
  const data = await fetchLeaderboard();
  renderLeaderboard(data);
}
function hideLeaderboard() { $lbOverlay.classList.add('hidden'); }
window.showLeaderboard = showLeaderboard;
window.hideLeaderboard = hideLeaderboard;

async function maybePromptName(score) {
  if (score === 0) return;
  try {
    const data = await fetchLeaderboard();
    const tenthScore = data.length < 10 ? 0 : (data[9]?.score ?? 0);
    if (score > tenthScore) {
      $nameInput.value = '';
      $nameModal.classList.remove('hidden');
    }
  } catch { /* backend offline */ }
}

async function submitScore() {
  const name = ($nameInput.value.trim() || 'Anonymous').slice(0, 20);
  $nameModal.classList.add('hidden');
  try {
    await fetch(`${API}/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score: State._pendingScore }),
    });
  } catch { /* offline */ }
}
window.submitScore = submitScore;
$nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitScore(); });

// ─── Render loop ──────────────────────────────────────────────────────────────
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
