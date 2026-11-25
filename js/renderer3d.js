import * as THREE from '../vendor/three.module.min.js';
import {
  STONE_R,
  HALF_W,
  NEAR_Z,
  FAR_Z,
  RELEASE_Z,
  HOG_Z,
  TEE_Z,
  BACK_Z,
  HOUSE_R,
  RING_RADII,
  currentTeam
} from './engine.js';

const TAU = Math.PI * 2;
const TEAM_COLOR = { carter: 0x3346d3, white: 0xd61f4a };
const TEAM_HEX = { carter: '#3346d3', white: '#d61f4a' };
const STONE_H = 0.2;

function createArenaEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x8a96a3);
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.6, 2.9), side: THREE.DoubleSide })
  );
  ceiling.position.y = 16;
  ceiling.rotation.x = Math.PI / 2;
  env.add(ceiling);
  for (let i = -2; i <= 2; i++) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 4.6, 4.8), side: THREE.DoubleSide })
    );
    strip.position.set(i * 5, 15, 0);
    strip.rotation.x = Math.PI / 2;
    env.add(strip);
  }
  const warm = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 5),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 2.0), side: THREE.DoubleSide })
  );
  warm.position.set(16, 5, 6);
  warm.lookAt(0, 0, 0);
  env.add(warm);
  const rt = pmrem.fromScene(env, 0.03);
  pmrem.dispose();
  return rt.texture;
}

function createIceTexture(maxAniso) {
  const w = 512;
  const h = 2048;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#f3f7fb');
  g.addColorStop(0.5, '#f7fafd');
  g.addColorStop(1, '#eef3f8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Pebble: thousands of tiny frozen droplets.
  const rand = (() => {
    let s = 1337;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  for (let i = 0; i < 26000; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 0.5 + rand() * 1.3;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(170,192,214,0.16)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // Faint skate & stone tracks down the centre.
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const x = w * 0.5 + (rand() - 0.5) * w * 0.55;
    ctx.strokeStyle = `rgba(150,170,195,${0.05 + rand() * 0.07})`;
    ctx.beginPath();
    ctx.moveTo(x, rand() * h * 0.3);
    ctx.bezierCurveTo(x + (rand() - 0.5) * 40, h * 0.4, x + (rand() - 0.5) * 60, h * 0.7, x + (rand() - 0.5) * 80, h);
    ctx.stroke();
  }
  // Soft vignette near the boards.
  const edge = ctx.createLinearGradient(0, 0, w, 0);
  edge.addColorStop(0, 'rgba(120,140,165,0.16)');
  edge.addColorStop(0.08, 'rgba(120,140,165,0)');
  edge.addColorStop(0.92, 'rgba(120,140,165,0)');
  edge.addColorStop(1, 'rgba(120,140,165,0.16)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createGraniteTexture(maxAniso) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7d8189';
  ctx.fillRect(0, 0, 512, 128);
  let s = 99;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    const v = rand();
    ctx.fillStyle = v > 0.7 ? 'rgba(235,236,240,0.55)' : v > 0.35 ? 'rgba(40,42,48,0.45)' : 'rgba(150,120,110,0.3)';
    ctx.fillRect(rand() * 512, rand() * 128, 1 + rand() * 2.2, 1 + rand() * 2.2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createFaceTexture(team, maxAniso) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const half = size / 2;
  const paintBase = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, TAU);
    ctx.fillStyle = TEAM_HEX[team];
    ctx.fill();
    ctx.beginPath();
    ctx.arc(half, half, half - 52, 0, TAU);
    ctx.fillStyle = '#f4f6fb';
    ctx.fill();
  };
  paintBase();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;

  const img = new Image();
  img.onload = () => {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const crop = team === 'carter'
      ? { sx: iw * 0.14, sy: ih * 0.06, sw: iw * 0.72, sh: ih * 0.72 }
      : { sx: iw * 0.17, sy: ih * 0.24, sw: iw * 0.66, sh: ih * 0.48 };
    paintBase();
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 58, 0, TAU);
    ctx.clip();
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 58, 58, size - 116, size - 116);
    ctx.restore();
    tex.needsUpdate = true;
  };
  img.src = team === 'carter' ? 'assets/carter-normal.jpg' : 'assets/carter-white.jpg';
  return tex;
}

function stoneProfile() {
  const pts = [];
  const r = STONE_R;
  pts.push(new THREE.Vector2(0.0001, 0));
  pts.push(new THREE.Vector2(r * 0.62, 0));
  pts.push(new THREE.Vector2(r * 0.86, 0.018));
  pts.push(new THREE.Vector2(r * 0.98, 0.055));
  pts.push(new THREE.Vector2(r, 0.1));
  pts.push(new THREE.Vector2(r * 0.98, 0.145));
  pts.push(new THREE.Vector2(r * 0.88, 0.185));
  pts.push(new THREE.Vector2(r * 0.7, STONE_H));
  pts.push(new THREE.Vector2(0.0001, STONE_H));
  return pts;
}

export class CurlingRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdfe6ec);
    this.scene.fog = new THREE.Fog(0xdfe6ec, 26, 60);
    this.scene.environment = createArenaEnv(this.renderer);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
    this.camPos = new THREE.Vector3(0, 3.6, RELEASE_Z + 5.4);
    this.camLook = new THREE.Vector3(0, 0, TEE_Z + 1.5);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // Overhead house camera for the corner inset.
    this.houseCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
    this.houseCam.position.set(0, 12, TEE_Z);
    this.houseCam.up.set(0, 0, -1);
    this.houseCam.lookAt(0, 0, TEE_Z);
    this.insetRect = null;

    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.faceTex = {
      carter: createFaceTexture('carter', this.maxAniso),
      white: createFaceTexture('white', this.maxAniso)
    };
    this.graniteTex = createGraniteTexture(this.maxAniso);

    this.setupLights();
    this.buildSheet();
    this.buildStoneAssets();
    this.buildAimGuides();

    this.stoneMeshes = new Map();
    this.dying = [];
    this.ripples = [];
    this.shards = [];
    this.frost = [];
    this.countRings = [];
    this.handStone = this.makeStoneMesh('carter');
    this.scene.add(this.handStone);
    this.handTeam = 'carter';
    this.sweepPhase = 0;

    this.resize();
  }

  setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xf7fbff, 0xb8c4d0, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(5, 14, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 4;
    this.scene.add(key);
    this.scene.add(key.target);
    this.keyLight = key;
  }

  buildSheet() {
    const len = NEAR_Z - FAR_Z;
    const midZ = (NEAR_Z + FAR_Z) / 2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 120),
      new THREE.MeshStandardMaterial({ color: 0xc9d3dc, roughness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Neighbouring sheets fade off into the arena.
    for (const side of [-1, 1]) {
      const n = new THREE.Mesh(
        new THREE.PlaneGeometry(HALF_W * 2, len),
        new THREE.MeshStandardMaterial({ color: 0xe6edf3, roughness: 0.3 })
      );
      n.rotation.x = -Math.PI / 2;
      n.position.set(side * (HALF_W * 2 + 0.5), -0.005, midZ);
      n.receiveShadow = true;
      this.scene.add(n);
    }

    const ice = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_W * 2, len),
      new THREE.MeshPhysicalMaterial({
        map: createIceTexture(this.maxAniso),
        roughness: 0.16,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        envMapIntensity: 0.6
      })
    );
    ice.rotation.x = -Math.PI / 2;
    ice.position.set(0, 0, midZ);
    ice.receiveShadow = true;
    this.scene.add(ice);

    // House rings (painted under the ice).
    const ringColors = [0x3346d3, 0xf4f7fb, 0xd61f4a, 0xf4f7fb];
    RING_RADII.forEach((r, i) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(r, 96),
        new THREE.MeshStandardMaterial({
          color: ringColors[i],
          roughness: 0.35,
          transparent: true,
          opacity: i === 1 || i === 3 ? 0.96 : 0.86,
          polygonOffset: true,
          polygonOffsetFactor: -1 - i,
          polygonOffsetUnits: -1 - i
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.002 + i * 0.001, TEE_Z);
      m.receiveShadow = true;
      this.scene.add(m);
    });

    const lineMat = (color, opacity = 0.75) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
    const addLine = (w, d, x, z, mat) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.007, z);
      this.scene.add(m);
    };
    const dark = lineMat(0x283040, 0.55);
    addLine(HALF_W * 2, 0.035, 0, TEE_Z, dark);
    addLine(HALF_W * 2, 0.035, 0, BACK_Z, dark);
    addLine(0.03, len - 1.2, 0, midZ - 0.3, lineMat(0x283040, 0.28));
    addLine(HALF_W * 2, 0.1, 0, HOG_Z, lineMat(0xd61f4a, 0.8));
    addLine(HALF_W * 2, 0.1, 0, RELEASE_Z - 0.5, lineMat(0xd61f4a, 0.35));

    // Hack (foothold) behind the release point.
    const hack = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.06, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x1d2230, roughness: 0.6 })
    );
    hack.position.set(0, 0.03, NEAR_Z - 1.1);
    hack.castShadow = true;
    this.scene.add(hack);

    // Boards.
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x3346d3, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, len), boardMat);
      b.position.set(side * (HALF_W + 0.08), 0.14, midZ);
      b.castShadow = true;
      b.receiveShadow = true;
      this.scene.add(b);
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.05, len), stripeMat);
      st.position.set(side * (HALF_W + 0.08), 0.22, midZ);
      this.scene.add(st);
    }
    for (const z of [FAR_Z - 0.08, NEAR_Z + 0.08]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + 0.32, 0.34, 0.16), boardMat);
      b.position.set(0, 0.17, z);
      b.castShadow = true;
      b.receiveShadow = true;
      this.scene.add(b);
    }
  }

  buildStoneAssets() {
    this.stoneGeo = new THREE.LatheGeometry(stoneProfile(), 48);
    this.graniteMat = new THREE.MeshPhysicalMaterial({
      map: this.graniteTex,
      roughness: 0.32,
      metalness: 0.02,
      clearcoat: 0.8,
      clearcoatRoughness: 0.18
    });
    this.bandGeo = new THREE.CylinderGeometry(STONE_R * 1.004, STONE_R * 1.004, 0.075, 48, 1, true);
    this.bandMat = {
      carter: new THREE.MeshPhysicalMaterial({ color: TEAM_COLOR.carter, roughness: 0.3, clearcoat: 1 }),
      white: new THREE.MeshPhysicalMaterial({ color: TEAM_COLOR.white, roughness: 0.3, clearcoat: 1 })
    };
    this.faceGeo = new THREE.CircleGeometry(STONE_R * 0.7, 48);
    this.faceMat = {
      carter: new THREE.MeshStandardMaterial({ map: this.faceTex.carter, roughness: 0.4 }),
      white: new THREE.MeshStandardMaterial({ map: this.faceTex.white, roughness: 0.4 })
    };
    this.shadowDiscGeo = new THREE.CircleGeometry(STONE_R * 1.12, 32);
    this.shadowDiscMat = new THREE.MeshBasicMaterial({ color: 0x1b2a3d, transparent: true, opacity: 0.12, depthWrite: false });
  }

  makeStoneMesh(team) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.stoneGeo, this.graniteMat);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const band = new THREE.Mesh(this.bandGeo, this.bandMat[team]);
    band.position.y = 0.1;
    g.add(band);
    const face = new THREE.Mesh(this.faceGeo, this.faceMat[team]);
    face.rotation.x = -Math.PI / 2;
    face.position.y = STONE_H + 0.002;
    g.add(face);
    const contact = new THREE.Mesh(this.shadowDiscGeo, this.shadowDiscMat);
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.004;
    g.add(contact);
    g.userData.team = team;
    g.userData.face = face;
    return g;
  }

  setHandTeam(team) {
    if (this.handTeam === team) return;
    this.scene.remove(this.handStone);
    this.handStone = this.makeStoneMesh(team);
    this.scene.add(this.handStone);
    this.handTeam = team;
  }

  buildAimGuides() {
    // Skip's broom: where the thrower aims.
    const broom = new THREE.Group();
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.3, 10),
      new THREE.MeshStandardMaterial({ color: 0x1d2230, roughness: 0.5 })
    );
    stick.position.y = 0.65;
    stick.rotation.z = 0.22;
    stick.castShadow = true;
    broom.add(stick);
    this.broomHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.07, 0.16),
      new THREE.MeshStandardMaterial({ color: TEAM_COLOR.carter, roughness: 0.6 })
    );
    this.broomHead.position.set(0.14, 0.035, 0);
    this.broomHead.castShadow = true;
    broom.add(this.broomHead);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.26, 40),
      new THREE.MeshBasicMaterial({ color: 0x1d2230, transparent: true, opacity: 0.45, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    broom.add(ring);
    this.scene.add(broom);
    this.broom = broom;

    const pts = [];
    for (let i = 0; i <= 40; i++) pts.push(new THREE.Vector3(0, 0.02, -i * 0.2));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.aimLine = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({ color: 0x1d2230, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.5 })
    );
    this.aimLine.computeLineDistances();
    this.scene.add(this.aimLine);

    // Sweepers' brush heads.
    const brushMat = new THREE.MeshStandardMaterial({ color: TEAM_COLOR.carter, roughness: 0.7 });
    this.brushes = [0, 1].map(() => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.12), brushMat);
      b.castShadow = true;
      b.visible = false;
      this.scene.add(b);
      return b;
    });

    this.shardGeo = new THREE.BoxGeometry(0.045, 0.045, 0.045);
    this.shardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, transparent: true });
    this.frostGeo = new THREE.PlaneGeometry(0.08, 0.08);
    this.frostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  }

  spawnRipple(x, z, color, maxScale = 1.6) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.28, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015, z);
    this.scene.add(m);
    this.ripples.push({ mesh: m, t: 0, max: maxScale });
  }

  spawnShards(x, z, count, speed = 1) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.shardGeo, this.shardMat.clone());
      m.position.set(x, 0.1, z);
      const a = Math.random() * TAU;
      const v = (0.8 + Math.random() * 1.8) * speed;
      this.scene.add(m);
      this.shards.push({ mesh: m, vx: Math.cos(a) * v, vy: 1 + Math.random() * 1.6, vz: Math.sin(a) * v, t: 0 });
    }
  }

  spawnFrost(x, z) {
    const m = new THREE.Mesh(this.frostGeo, this.frostMat.clone());
    m.rotation.x = -Math.PI / 2;
    m.position.set(x + (Math.random() - 0.5) * 0.5, 0.02, z + (Math.random() - 0.5) * 0.2);
    m.scale.setScalar(0.6 + Math.random());
    this.scene.add(m);
    this.frost.push({ mesh: m, t: 0 });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.9;
    this.camera.fov = this.portrait ? 58 : 40;
    this.camera.updateProjectionMatrix();

    const s = Math.round(Math.min(w, h) * (this.portrait ? 0.34 : 0.27));
    const pad = Math.round(Math.max(14, Math.min(w, h) * 0.025));
    this.insetRect = { x: w - s - pad, y: this.portrait || w < 760 ? 84 : pad, size: s };
    const half = HOUSE_R + 0.5;
    this.houseCam.left = -half;
    this.houseCam.right = half;
    this.houseCam.top = half;
    this.houseCam.bottom = -half;
    this.houseCam.updateProjectionMatrix();
  }

  syncStones(state, dt, reducedMotion) {
    const alive = new Set();
    for (const s of state.stones) {
      alive.add(s.id);
      let mesh = this.stoneMeshes.get(s.id);
      if (!mesh) {
        mesh = this.makeStoneMesh(s.team);
        this.scene.add(mesh);
        this.stoneMeshes.set(s.id, mesh);
      }
      mesh.position.set(s.x, 0, s.z);
      mesh.rotation.y = reducedMotion ? 0 : -s.angle;
    }
    for (const [id, mesh] of this.stoneMeshes) {
      if (!alive.has(id)) {
        this.stoneMeshes.delete(id);
        this.dying.push({ mesh, t: 0 });
      }
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const k = Math.max(0, 1 - d.t / 0.45);
      d.mesh.scale.setScalar(Math.max(0.001, k));
      d.mesh.position.y = (1 - k) * 0.25;
      if (d.t >= 0.45) {
        this.scene.remove(d.mesh);
        this.dying.splice(i, 1);
      }
    }
  }

  clearAllStones() {
    for (const [, mesh] of this.stoneMeshes) this.dying.push({ mesh, t: 0 });
    this.stoneMeshes.clear();
  }

  setCountRings(state, ids) {
    for (const r of this.countRings) this.scene.remove(r);
    this.countRings = [];
    for (const id of ids || []) {
      const s = state.stones.find((st) => st.id === id);
      if (!s) continue;
      const m = new THREE.Mesh(
        new THREE.RingGeometry(STONE_R * 1.15, STONE_R * 1.42, 40),
        new THREE.MeshBasicMaterial({ color: s.team === 'carter' ? 0x5b6cff : 0xff4d73, transparent: true, opacity: 0.9, depthWrite: false })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(s.x, 0.02, s.z);
      this.scene.add(m);
      this.countRings.push(m);
    }
  }

  updateCamera(state, dt, reducedMotion) {
    const p = state.phase;
    const shooter = state.stones.find((s) => s.id === state.shooterId);
    const aiming = p === 'aim' || p === 'charge' || p === 'ai';

    // Smoothed focus point (the stone being delivered) and a 0..1 blend toward the house view.
    let fx = state.broomX * 0.15;
    let fz = RELEASE_Z + 0.6;
    let blendTarget = 0;
    if (p === 'travel' && shooter) {
      fx = shooter.x;
      fz = shooter.z;
      blendTarget = 1 - THREE.MathUtils.smoothstep(shooter.z, TEE_Z + 3.5, TEE_Z + 8.5);
    } else if (!aiming) {
      fz = TEE_Z;
      blendTarget = 1;
    }
    if (this.focus === undefined) this.focus = { x: fx, z: fz, blend: blendTarget };
    const fr = 1 - Math.exp(-(reducedMotion ? 30 : 9) * dt);
    const br = 1 - Math.exp(-(reducedMotion ? 30 : 2.6) * dt);
    this.focus.x += (fx - this.focus.x) * fr;
    this.focus.z += (fz - this.focus.z) * fr;
    this.focus.blend += (blendTarget - this.focus.blend) * br;

    const f = this.focus;
    const ch = this.portrait ? 3.6 : 2.9;
    const cb = this.portrait ? 5.6 : 4.4;
    const chasePos = new THREE.Vector3(f.x * 0.5, ch, f.z + cb);
    const chaseLook = new THREE.Vector3(f.x * 0.4, 0, f.z - 4.5);
    const housePos = new THREE.Vector3(0, this.portrait ? 10.5 : 7.4, TEE_Z + (this.portrait ? 6.2 : 5.4));
    const houseLook = new THREE.Vector3(0, 0, TEE_Z - 0.2);
    const b = THREE.MathUtils.smoothstep(f.blend, 0, 1);
    this.camPos.copy(chasePos).lerp(housePos, b);
    this.camLook.copy(chaseLook).lerp(houseLook, b);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.keyLight.position.set(this.camLook.x + 5, 14, this.camLook.z + 4);
    this.keyLight.target.position.set(this.camLook.x, 0, this.camLook.z);
  }

  render(state, dt, reducedMotion = false) {
    while (state.fx.length > 0) {
      const fx = state.fx.shift();
      if (fx.type === 'impact') {
        this.spawnRipple(fx.x, fx.z, 0x9fb4d0, 1.2 + Math.min(1.2, fx.speed * 0.2));
        if (!reducedMotion) this.spawnShards(fx.x, fx.z, Math.min(16, 4 + Math.round(fx.speed * 2.5)), 0.6 + fx.speed * 0.15);
      } else if (fx.type === 'out' || fx.type === 'hog') {
        this.spawnRipple(fx.x, fx.z, TEAM_COLOR[fx.team], 1.4);
      } else if (fx.type === 'newEnd') {
        this.clearAllStones();
        this.setCountRings(state, []);
      } else if (fx.type === 'endScored') {
        this.setCountRings(state, fx.counting);
        for (const id of fx.counting) {
          const s = state.stones.find((st) => st.id === id);
          if (s) this.spawnRipple(s.x, s.z, TEAM_COLOR[s.team], 2.2);
        }
      } else if (fx.type === 'launch') {
        this.spawnRipple(0, RELEASE_Z, TEAM_COLOR[fx.team], 1.3);
      }
    }

    this.syncStones(state, dt, reducedMotion);

    // Stone in hand + aim guides.
    const team = currentTeam(state);
    const aiming = state.phase === 'aim' || state.phase === 'charge' || state.phase === 'ai';
    this.setHandTeam(team);
    this.handStone.visible = aiming;
    this.broom.visible = aiming;
    this.aimLine.visible = aiming && team === 'carter';
    if (aiming) {
      const pull = state.phase === 'charge' ? state.power * 0.55 : 0;
      this.handStone.position.set(0, 0, RELEASE_Z + pull);
      this.broom.position.set(state.broomX, 0, TEE_Z);
      this.broomHead.material.color.setHex(TEAM_COLOR[team]);
      if (!reducedMotion) this.broomHead.position.x = 0.14 + Math.sin(performance.now() / 260) * 0.05;
      const dx = state.broomX;
      const dz = TEE_Z - RELEASE_Z;
      this.aimLine.position.set(0, 0, RELEASE_Z);
      this.aimLine.rotation.y = -Math.atan2(dx, -dz);
    }
    for (const r of this.countRings) r.visible = state.phase === 'endScore';

    // Sweepers.
    const shooter = state.stones.find((s) => s.id === state.shooterId);
    const sweeping = state.sweeping && shooter && state.phase === 'travel';
    this.sweepPhase += dt * (sweeping ? 18 : 0);
    this.brushes.forEach((b, i) => {
      b.visible = !!sweeping;
      if (sweeping) {
        const sp = Math.hypot(shooter.vx, shooter.vz) || 1;
        const ux = shooter.vx / sp;
        const uz = shooter.vz / sp;
        const ahead = 0.55 + i * 0.32;
        const wiggle = Math.sin(this.sweepPhase + i * Math.PI) * 0.16;
        b.position.set(shooter.x + ux * ahead - uz * wiggle, 0.035, shooter.z + uz * ahead + ux * wiggle);
        b.rotation.y = Math.atan2(ux, uz);
        if (!reducedMotion && Math.random() < 0.6) this.spawnFrost(b.position.x, b.position.z);
      }
    });

    // Particles.
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dt;
      const k = r.t / 0.7;
      r.mesh.scale.setScalar(1 + k * r.max * 2);
      r.mesh.material.opacity = Math.max(0, 0.8 * (1 - k));
      if (k >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.ripples.splice(i, 1);
      }
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t += dt;
      s.vy -= 9 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y = Math.max(0.02, s.mesh.position.y + s.vy * dt);
      s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.x += dt * 8;
      s.mesh.material.opacity = Math.max(0, 1 - s.t / 0.8);
      if (s.t > 0.8) {
        this.scene.remove(s.mesh);
        s.mesh.material.dispose();
        this.shards.splice(i, 1);
      }
    }
    for (let i = this.frost.length - 1; i >= 0; i--) {
      const f = this.frost[i];
      f.t += dt;
      f.mesh.material.opacity = Math.max(0, 0.75 * (1 - f.t / 0.6));
      if (f.t > 0.6) {
        this.scene.remove(f.mesh);
        f.mesh.material.dispose();
        this.frost.splice(i, 1);
      }
    }

    this.updateCamera(state, dt, reducedMotion);

    // Main view.
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // House inset (hidden while the main camera already looks down on the house).
    this.insetVisible = !this.focus || this.focus.blend < 0.5;
    if (this.insetVisible && this.insetRect) {
      const { x, y, size } = this.insetRect;
      const glY = h - y - size;
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(x, glY, size, size);
      this.renderer.setViewport(x, glY, size, size);
      this.renderer.setClearColor(0xdfe6ec, 1);
      this.renderer.clear();
      this.renderer.render(this.scene, this.houseCam);
      this.renderer.setScissorTest(false);
    }
  }
}
