import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";

const cameraVideo = document.querySelector("#camera");
const gameCanvas = document.querySelector("#gameCanvas");
const analysisCanvas = document.querySelector("#analysisCanvas");
const analysis = analysisCanvas.getContext("2d", { willReadFrequently: true });
const skeletonCanvas = document.querySelector("#skeletonCanvas");
const skeleton = skeletonCanvas.getContext("2d");

const els = {
  missionTag: document.querySelector("#missionTag"),
  missionTitle: document.querySelector("#missionTitle"),
  missionHint: document.querySelector("#missionHint"),
  spokenLine: document.querySelector("#spokenLine"),
  leftMeter: document.querySelector("#leftMeter"),
  rightMeter: document.querySelector("#rightMeter"),
  speedMeter: document.querySelector("#speedMeter"),
  balanceMeter: document.querySelector("#balanceMeter"),
  notice: document.querySelector("#cameraNotice"),
  sparkLayer: document.querySelector("#sparkLayer"),
  stage: document.querySelector(".stage"),
  startCamera: document.querySelector("#startCamera"),
  scanArt: document.querySelector("#scanArt"),
  startGame: document.querySelector("#startGame"),
  resetGame: document.querySelector("#resetGame"),
  passGate: document.querySelector("#passGate"),
  fullscreen: document.querySelector("#fullscreen"),
  testPanel: document.querySelector("#testPanel"),
  adminToggle: document.querySelector("#adminToggle"),
  adminPanel: document.querySelector("#adminPanel"),
  adminPassword: document.querySelector("#adminPassword"),
  adminReset: document.querySelector("#adminReset"),
  adminClose: document.querySelector("#adminClose"),
  adminMsg: document.querySelector("#adminMsg"),
};

const testMode = new URLSearchParams(window.location.search).has("test");

const gates = [
  { name: "Ciao, Venezi!", x: 0.5, width: 0.3, y: 90, line: "Ciao, Venezi!" },
  { name: "Rialto Bridge", x: 0.34, width: 0.26, y: 230, line: "I row under the bridge!" },
  { name: "Glass Window", x: 0.68, width: 0.27, y: 380, line: "I see colorful glass!" },
  { name: "Pizza", x: 0.48, width: 0.31, y: 535, line: "Italy has pizza!" },
  { name: "Gondola!", x: 0.58, width: 0.27, y: 700, line: "I row a gondola!" },
];

// Z where a gate sits at the moment it is judged (progress === gate.y).
// Kept near the boat (z ~ 2.6) so a gate is passed as the boat reaches it,
// not while it is still far ahead.
const GATE_Z0 = 2.5;
// Extra half-width tolerance (in lane units) added to each gate opening.
const GATE_TOLERANCE = 0.2;

const state = {
  cameraReady: false,
  running: false,
  score: 0,
  gateIndex: 0,
  progress: 0,
  boatX: 0.5,
  speed: 0,
  turn: 0,
  rowLeft: 0,
  rowRight: 0,
  envLeft: 0,
  envRight: 0,
  strokeLeft: 0,
  strokeRight: 0,
  balance: 1,
  lastFrame: null,
  audio: null,
  testBoost: { left: 0, right: 0, brake: 0 },
  successCooldown: 0,
  shakeCooldown: 0,
  hasArt: false,
  delivered: false,
  musicLevel: 0,
};

// --- Rowing music: plays only while rowing; tempo tracks rowing speed. ---
// Drop your track at this path (or change the filename here).
const MUSIC_SRC = "./assets/rowing-music.m4a";
const rowMusic = new Audio(MUSIC_SRC);
rowMusic.loop = true;
rowMusic.preload = "auto";
let musicAvailable = true;
let musicPrimed = false;
rowMusic.addEventListener("error", () => {
  musicAvailable = false;
});

// --- Basilica-arrival music: an optional audio file, with a synth fallback. ---
const GATE_MUSIC_SRC = "./assets/gate-pass.mp3";
const gateMusic = new Audio(GATE_MUSIC_SRC);
gateMusic.preload = "auto";
let gateMusicAvailable = true;
gateMusic.addEventListener("error", () => {
  gateMusicAvailable = false;
});

// --- Spoken line per gate (played when that gate is passed). ---
// One file per gate, in the same order as the `gates` array above. Drop your
// recordings here; missing files are skipped automatically.
const GATE_LINE_SRCS = [
  "./assets/lines/gate-1.mp3", // Ciao, Venice!
  "./assets/lines/gate-2.mp3", // I row under the bridge.
  "./assets/lines/gate-3.mp3", // I see colorful glass.
  "./assets/lines/gate-4.mp3", // Italy has pizza.
  "./assets/lines/gate-5.mp3", // I made it to the museum!
];
const GATE_LINE_GAIN = 1.8; // WebAudio amplification so lines are nice and loud
const MUSIC_DUCK_VOLUME = 0.18; // rowing-music volume while a spoken line plays
let lineDuckUntil = 0; // performance.now() until which the music stays ducked

const gateLineAudios = GATE_LINE_SRCS.map((src) => {
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.volume = 1;
  audio._ok = true;
  audio._routed = false;
  audio.addEventListener("error", () => {
    audio._ok = false;
  });
  return audio;
});

// Route a spoken line through a WebAudio gain node so it can be louder than the
// raw file. Safe fallback: if the audio context is not running we skip routing
// and the clip just plays directly at normal volume.
function routeLineThroughGain(audio) {
  if (audio._routed || !state.audio || state.audio.state !== "running") return;
  try {
    const source = state.audio.createMediaElementSource(audio);
    const gain = state.audio.createGain();
    gain.gain.value = GATE_LINE_GAIN;
    source.connect(gain);
    gain.connect(state.audio.destination);
    audio._routed = true;
  } catch (error) {
    // leave it playing directly
  }
}

function playGateLine(index) {
  const audio = gateLineAudios[index];
  if (!audio || audio._ok === false) return;
  routeLineThroughGain(audio);
  try {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (error) {
    // ignore if the file is not ready / missing
    return;
  }
  // Duck the rowing music while the line plays (extended if lines overlap).
  const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 3.2;
  lineDuckUntil = Math.max(lineDuckUntil, performance.now() + dur * 1000 + 150);
}

function primeMusic() {
  if (musicPrimed) return;
  musicPrimed = true;
  // Unlock playback inside a user gesture, then pause until needed.
  if (musicAvailable) {
    rowMusic
      .play()
      .then(() => rowMusic.pause())
      .catch(() => {});
  }
  if (gateMusicAvailable) {
    gateMusic
      .play()
      .then(() => {
        gateMusic.pause();
        gateMusic.currentTime = 0;
      })
      .catch(() => {});
  }
  // Unlock the spoken-line clips too (play muted, then reset).
  gateLineAudios.forEach((audio) => {
    if (audio._ok === false) return;
    audio.muted = true;
    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      })
      .catch(() => {
        audio.muted = false;
      });
  });
}

function playArrivalMusic() {
  if (gateMusicAvailable) {
    try {
      gateMusic.currentTime = 0;
      gateMusic.play().catch(() => playGateFanfare());
      return;
    } catch (error) {
      // fall through to the synth fanfare
    }
  }
  playGateFanfare();
}

// Short ascending fanfare when no gate-pass audio file is present.
function playGateFanfare() {
  if (!state.audio) return;
  const now = state.audio.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const osc = state.audio.createOscillator();
    const gain = state.audio.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t = now + i * 0.1;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.13, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(gain);
    gain.connect(state.audio.destination);
    osc.start(t);
    osc.stop(t + 0.44);
  });
}

function updateMusic() {
  if (!musicAvailable) return;
  const rowPower = Math.max(state.envLeft, state.envRight);
  state.musicLevel = state.musicLevel * 0.9 + rowPower * 0.1;

  if (!state.running) {
    // Between runs: pause but KEEP the position, so it resumes (never restarts).
    if (!rowMusic.paused) rowMusic.pause();
    return;
  }

  // During a run keep the track playing continuously so it never jumps back to
  // the start; gate the volume and tempo by how hard the student is rowing.
  if (rowMusic.paused) rowMusic.play().catch(() => {});
  const rowing = state.musicLevel > 0.04;
  const level = Math.min(1, state.musicLevel);
  rowMusic.playbackRate = rowing ? 0.25 + level * 1.25 : 0.25;
  // Duck the music while a spoken gate line is playing so the voice stands out.
  const ducking = performance.now() < lineDuckUntil;
  const fullVolume = ducking ? MUSIC_DUCK_VOLUME : 1;
  rowMusic.volume = rowing ? fullVolume : 0;
}

// --- Pose sensor (MediaPipe) ---
let poseLandmarker = null;
let poseReady = false;
let lastPoseTime = -1;
let latestLandmarks = null;
const wristPrev = {};

async function initPose() {
  try {
    const vision = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
    );
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    );
    poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    poseReady = true;
  } catch (error) {
    poseReady = false;
    poseLandmarker = null;
  }
}

// Pose skeleton connections (MediaPipe BlazePose landmark indices).
const POSE_LINKS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28], [15, 17], [15, 19], [16, 18], [16, 20],
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fe3ff);
scene.fog = new THREE.Fog(0xbdeeff, 26, 96);

const renderCamera = new THREE.PerspectiveCamera(58, 1, 0.1, 160);
renderCamera.position.set(0, 5.9, 9.6);
renderCamera.lookAt(0, 0.6, -18);

const renderer = new THREE.WebGLRenderer({
  canvas: gameCanvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const world = new THREE.Group();
scene.add(world);

const gateGroups = [];
const otherBoats = [];
// Static scenery (houses, docks) that scrolls toward the boat and recycles.
const scenery = [];
const SCENERY_PERIOD = 160; // distance before a scenery item recycles to the back
const SCENERY_NEAR = 12; // recycle just behind the camera (out of view)

function wrapScenery(baseZ, scroll) {
  const z = baseZ + scroll;
  return (
    SCENERY_NEAR -
    (((SCENERY_NEAR - z) % SCENERY_PERIOD) + SCENERY_PERIOD) % SCENERY_PERIOD
  );
}
let boat;
let leftOar;
let rightOar;
let waterMesh;
let church;
// Ordered, permanently-fillable church windows (one per student).
const churchWindows = [];
let installedCount = 0;
let installTargetWindow = null;
let targetHighlight = null;

// Persistence + admin.
const STORAGE_KEY = "venice-church-windows-v1";
const ADMIN_PASSWORD = "camp2026"; // change to your own passcode
let savedArt = []; // dataURL per window slot, index-aligned with churchWindows
let cargoDataURL = null; // current student's scanned artwork as a dataURL
let rowerHead;
let rowerFace;
let cargoMesh;
let cargoGroup;
let cargoTexture = null;

// Stained-glass install celebration animation.
let installPiece = null;
let installActive = false;
let installStart = -1;
const installDur = 2.6;
const installFrom = new THREE.Vector3();
const installTo = new THREE.Vector3();

initScene();

function initScene() {
  const hemi = new THREE.HemisphereLight(0xfff6e0, 0x7fd4ff, 2.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4d0, 2.4);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 1024;
  sun.shadow.mapSize.height = 1024;
  scene.add(sun);

  const fillLight = new THREE.DirectionalLight(0xffc7ec, 0.7);
  fillLight.position.set(-12, 8, 6);
  scene.add(fillLight);

  const canal = new THREE.PlaneGeometry(24, 200, 36, 120);
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x36c6f0,
    roughness: 0.22,
    metalness: 0.12,
    transparent: true,
    opacity: 0.95,
  });
  waterMesh = new THREE.Mesh(canal, waterMaterial);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.z = -50;
  waterMesh.receiveShadow = true;
  world.add(waterMesh);

  addBuildings(-1);
  addBuildings(1);
  addDocks();
  addOtherBoats();
  addChurch();
  gates.forEach((gate, index) => addGate(gate, index));
  boat = createBoat();
  scene.add(boat);
  loadWindows();
}

function addBuildings(side) {
  // Warm Venetian palette mixed with cheerful colors, inspired by the Grand Canal.
  const palette = [
    0xff9e6d, 0xffd166, 0xf4a3c1, 0xa0e7c8, 0x9db8ff,
    0xffb3a0, 0xe8c6ff, 0xffc48c, 0xf6b3d0, 0xbfe9ff,
  ];
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a4b3a, roughness: 0.9 });
  const depth = 2.8;
  const count = 34;

  for (let i = 0; i < count; i += 1) {
    const z = -i * 4.0 - 5;
    // Two staggered rows per bank so the facades read as continuous and dense.
    for (let row = 0; row < 2; row += 1) {
      const width = 3.1 + ((i + row) % 3) * 0.55;
      const height =
        row === 0 ? 3.8 + ((i * 7 + row) % 5) * 0.7 : 5.4 + ((i * 5 + 1) % 4) * 0.95;
      const baseX = 8.8 + row * 3.0 + (i % 2) * 0.4;
      const x = side * baseX;
      const zPos = z + row * 2.0;
      const color = palette[(i * 2 + row) % palette.length];

      // One group per house so the whole facade (walls + roof + windows)
      // scrolls and recycles together.
      const houseGroup = new THREE.Group();
      houseGroup.position.set(x, 0, zPos);
      houseGroup.userData.baseZ = zPos;

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
      );
      building.position.set(0, height / 2 - 0.1, 0);
      building.castShadow = true;
      building.receiveShadow = true;
      houseGroup.add(building);

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.24, 0.36, depth + 0.24),
        roofMat,
      );
      roof.position.set(0, height + 0.02, 0);
      houseGroup.add(roof);

      // Grid of glowing windows on the canal-facing wall.
      const cols = 2;
      const rows = Math.max(2, Math.floor(height / 1.5));
      const wallX = -side * (width / 2 + 0.03);
      for (let c = 0; c < cols; c += 1) {
        const zc = -depth / 2 + (depth / (cols + 1)) * (c + 1);
        for (let w = 0; w < rows; w += 1) {
          const lit = (i + c + w) % 4 !== 0;
          const windowMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.34, 0.66, 0.05),
            new THREE.MeshStandardMaterial({
              color: lit ? 0xfff2c8 : 0x9fb7c4,
              emissive: lit ? 0xffcf6a : 0x223b45,
              emissiveIntensity: lit ? 0.55 : 0.1,
            }),
          );
          windowMesh.position.set(wallX, 1.0 + w * 1.25, zc);
          windowMesh.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
          houseGroup.add(windowMesh);
        }
      }

      world.add(houseGroup);
      scenery.push(houseGroup);
    }
  }
}

function addDocks() {
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x5b3828, roughness: 0.7 });
  for (let i = 0; i < 34; i += 1) {
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.3, 12), postMaterial);
      const z = -i * 4 - 3;
      post.position.set(side * 7.4, 0.6, z);
      post.castShadow = true;
      post.userData.baseZ = z;
      world.add(post);
      scenery.push(post);
    });
  }
}

function makeSmallBoat(color) {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.5 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.8), hullMat);
  group.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 4), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.position.z = -1.1;
  group.add(bow);
  const stern = bow.clone();
  stern.rotation.x = -Math.PI / 2;
  stern.position.z = 1.1;
  group.add(stern);
  const person = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.11, 0.3, 6, 10),
    new THREE.MeshStandardMaterial({ color }),
  );
  person.position.y = 0.32;
  group.add(person);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf8e0c8 }),
  );
  head.position.y = 0.6;
  group.add(head);
  return group;
}

function addOtherBoats() {
  const colors = [0xff5d73, 0x2f9bff, 0x22c55e, 0xffcf33, 0x9d7bff, 0xff77c8, 0x17c3d6];
  const spots = [
    [-6.4, -22], [6.8, -34], [-7.2, -52], [5.9, -70],
    [7.4, -92], [-6.0, -108], [6.2, -126],
  ];
  spots.forEach(([x, z], i) => {
    const b = makeSmallBoat(colors[i % colors.length]);
    b.position.set(x, 0.28, z);
    b.rotation.y = x < 0 ? 0.5 : -0.5;
    b.userData.baseY = 0.28;
    b.userData.baseZ = z;
    b.userData.phase = i * 1.3;
    world.add(b);
    otherBoats.push(b);
  });
}

function addChurch() {
  const group = new THREE.Group();
  group.userData.baseZ = -140;
  group.position.set(0, 0, group.userData.baseZ);

  const cream = new THREE.MeshStandardMaterial({ color: 0xfff2d6, roughness: 0.7 });
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x7fd4c8, roughness: 0.35, metalness: 0.25 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0x5f3900,
    emissiveIntensity: 0.3,
    metalness: 0.4,
    roughness: 0.3,
  });
  const paleStone = new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.62 });
  const warmStone = new THREE.MeshStandardMaterial({ color: 0xe7cfa6, roughness: 0.76 });
  const roseStone = new THREE.MeshStandardMaterial({ color: 0xd78b76, roughness: 0.72 });
  const tealMosaic = new THREE.MeshStandardMaterial({
    color: 0x4fd0d6,
    emissive: 0x0c5962,
    emissiveIntensity: 0.45,
    metalness: 0.15,
    roughness: 0.38,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 5), cream);
  body.position.y = 3;
  body.castShadow = true;
  group.add(body);

  // Grand front steps and cornices make the Basilica read as the destination.
  [
    { y: 0.12, z: 3.05, w: 10.6, d: 1.05 },
    { y: 0.36, z: 2.82, w: 9.6, d: 0.78 },
    { y: 0.6, z: 2.62, w: 8.6, d: 0.56 },
  ].forEach((step) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(step.w, 0.24, step.d), warmStone);
    mesh.position.set(0, step.y, step.z);
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  [
    { y: 0.92, h: 0.26, w: 9.7 },
    { y: 6.08, h: 0.22, w: 9.55 },
  ].forEach((trim) => {
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(trim.w, trim.h, 0.36), paleStone);
    cornice.position.set(0, trim.y, 2.72);
    cornice.castShadow = true;
    group.add(cornice);
  });

  [-4.15, -2.25, 0, 2.25, 4.15].forEach((x) => {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.15, 18), paleStone);
    column.position.set(x, 3.48, 2.79);
    column.castShadow = true;
    group.add(column);

    [0.86, 6.08].forEach((y) => {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.34), goldMat);
      cap.position.set(x, y, 2.79);
      group.add(cap);
    });
  });

  const pedimentGeo = new THREE.BufferGeometry();
  pedimentGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([
      -4.75, 6.22, 2.74,
      4.75, 6.22, 2.74,
      0, 7.55, 2.74,
    ], 3),
  );
  pedimentGeo.computeVertexNormals();
  const pediment = new THREE.Mesh(
    pedimentGeo,
    new THREE.MeshStandardMaterial({ color: 0xffedc4, roughness: 0.58, side: THREE.DoubleSide }),
  );
  pediment.castShadow = true;
  group.add(pediment);

  const pedimentTrim = new THREE.Mesh(new THREE.BoxGeometry(9.7, 0.12, 0.18), goldMat);
  pedimentTrim.position.set(0, 6.22, 2.82);
  group.add(pedimentTrim);

  const medallion = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 36), tealMosaic);
  medallion.position.set(0, 5.72, 2.86);
  medallion.rotation.x = Math.PI / 2;
  group.add(medallion);

  const medallionRing = new THREE.Mesh(new THREE.TorusGeometry(0.61, 0.045, 10, 36), goldMat);
  medallionRing.position.set(0, 5.72, 2.91);
  group.add(medallionRing);

  // Fillable stained-glass windows: each student's artwork locks into the next
  // empty slot, in order and permanently. Square windows: facade 12 + tower 4 = 16.
  const winGeo = new THREE.BoxGeometry(1.0, 1.0, 0.06);
  function addSlot(x, y, z, rotY = 0) {
    const win = new THREE.Mesh(
      winGeo,
      new THREE.MeshStandardMaterial({
        color: 0xfff2c8,
        emissive: 0xffce63,
        emissiveIntensity: 0.6,
        side: THREE.DoubleSide,
      }),
    );
    win.position.set(x, y, z);
    if (rotY) win.rotation.y = rotY;
    group.add(win);
    churchWindows.push(win);
    return win;
  }

  // Front facade: 4 columns x 3 rows = 12 slots (door in the middle bottom).
  [-3.2, -1.3, 1.3, 3.2].forEach((wx) => {
    [1.5, 3.0, 4.5].forEach((wy) => addSlot(wx, wy, 2.53));
  });

  // Decorative (non-fillable) square windows on the side walls for richness.
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xfff2c8,
    emissive: 0xffce63,
    emissiveIntensity: 0.6,
  });
  [-1, 1].forEach((sx) => {
    [-1.6, 0, 1.6].forEach((wz) => {
      [1.5, 3.0, 4.5].forEach((wy) => {
        const win = new THREE.Mesh(winGeo, winMat);
        win.position.set(sx * 4.53, wy, wz);
        win.rotation.y = Math.PI / 2;
        group.add(win);
      });
    });
  });

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 1.4, 24), cream);
  drum.position.y = 6.7;
  group.add(drum);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat,
  );
  dome.position.y = 7.4;
  group.add(dome);
  const domeTop = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), goldMat);
  domeTop.position.y = 9.9;
  group.add(domeTop);

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const points = [];
    for (let j = 0; j <= 8; j += 1) {
      const t = j / 8;
      const phi = t * Math.PI / 2;
      const r = Math.cos(phi) * 2.43;
      points.push(new THREE.Vector3(Math.cos(angle) * r, 7.4 + Math.sin(phi) * 2.43, Math.sin(angle) * r));
    }
    const rib = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18, 0.025, 8, false),
      goldMat,
    );
    group.add(rib);
  }

  [-3.2, 3.2].forEach((dx) => {
    const sd = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      domeMat,
    );
    sd.position.set(dx, 6.1, 0.6);
    group.add(sd);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), goldMat);
    finial.position.set(dx, 7.2, 0.6);
    group.add(finial);
  });

  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.8, 10, 1.8), cream);
  tower.position.set(-6.2, 5, -0.6);
  tower.castShadow = true;
  group.add(tower);

  [-7.03, -5.37].forEach((x) => {
    const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.16, 9.7, 0.16), paleStone);
    pilaster.position.set(x, 5, 0.38);
    pilaster.castShadow = true;
    group.add(pilaster);
  });

  [1.25, 3.4, 5.2, 7.0, 8.8].forEach((y) => {
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 0.3), goldMat);
    ledge.position.set(-6.2, y, 0.42);
    group.add(ledge);
  });

  const towerRoof = new THREE.Mesh(
    new THREE.ConeGeometry(1.45, 2.2, 4),
    new THREE.MeshStandardMaterial({ color: 0xc0563f, roughness: 0.8 }),
  );
  towerRoof.position.set(-6.2, 11.1, -0.6);
  towerRoof.rotation.y = Math.PI / 4;
  group.add(towerRoof);

  const towerRoofCap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), goldMat);
  towerRoofCap.position.set(-6.2, 12.25, -0.6);
  group.add(towerRoofCap);

  // Bell-tower windows (front face), the last 4 fillable slots.
  [2.5, 4.3, 6.1, 7.9].forEach((wy) => addSlot(-6.2, wy, 0.33));

  // Ornate frames for the same 16 fillable slots. These are decorative trim
  // only; they never become install targets and do not change the window count.
  churchWindows.forEach((slot) => {
    const { x, y, z } = slot.position;
    [
      { dx: -0.58, dy: 0, w: 0.08, h: 1.22 },
      { dx: 0.58, dy: 0, w: 0.08, h: 1.22 },
      { dx: 0, dy: -0.58, w: 1.24, h: 0.08 },
      { dx: 0, dy: 0.58, w: 1.24, h: 0.08 },
    ].forEach((part) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(part.w, part.h, 0.05), goldMat);
      frame.position.set(x + part.dx, y + part.dy, z + 0.055);
      group.add(frame);
    });
  });

  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), goldMat);
  crossV.position.y = 10.6;
  group.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.12), goldMat);
  crossH.position.y = 10.78;
  group.add(crossH);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 3, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x6a3d2a, roughness: 0.6 }),
  );
  door.position.set(0, 1.5, 2.55);
  group.add(door);

  const doorArch = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.055, 10, 28, Math.PI), goldMat);
  doorArch.position.set(0, 3.0, 2.68);
  group.add(doorArch);

  [-0.86, 0.86].forEach((x) => {
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.62, 12), roseStone);
    torch.position.set(x, 2.35, 2.72);
    group.add(torch);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffcf33,
        emissive: 0xff8a00,
        emissiveIntensity: 0.85,
        roughness: 0.35,
      }),
    );
    flame.position.set(x, 2.75, 2.73);
    group.add(flame);
  });

  const label = makeTextSprite("Basilica");
  label.position.set(0, 12.6, 0);
  label.scale.set(5, 1.25, 1);
  group.add(label);

  // Gold frame that marks which window the next student will fill.
  targetHighlight = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.18, 0.05), goldMat);
  group.add(targetHighlight);

  world.add(group);
  church = group;
  updateTargetHighlight();
}

function updateTargetHighlight() {
  if (!targetHighlight) return;
  const slot = churchWindows[installedCount];
  if (slot) {
    targetHighlight.visible = true;
    targetHighlight.position.copy(slot.position);
    targetHighlight.rotation.y = slot.rotation.y;
    // Sit the frame just in front of the window on its facing wall.
    targetHighlight.position.z += slot.rotation.y ? 0 : -0.02;
  } else {
    targetHighlight.visible = false; // all 16 fillable windows filled
  }
}

function fillWindow(slot, texture, glow) {
  slot.material.map = texture;
  slot.material.color.set(0xffffff);
  slot.material.emissive.set(0xffffff);
  slot.material.emissiveIntensity = glow;
  slot.material.needsUpdate = true;
}

function saveWindows() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ count: installedCount, art: savedArt }),
    );
  } catch (error) {
    // storage full or unavailable — persistence is best-effort
  }
}

function loadWindows() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (error) {
    data = null;
  }
  if (!data || !Array.isArray(data.art)) return;
  savedArt = data.art.slice(0, churchWindows.length);
  installedCount = Math.min(data.count || savedArt.length, churchWindows.length);

  const loader = new THREE.TextureLoader();
  savedArt.forEach((url, i) => {
    const slot = churchWindows[i];
    if (!url || !slot) return;
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      fillWindow(slot, tex, 0.85);
    });
  });
  updateTargetHighlight();
}

function resetAllWindows() {
  installedCount = 0;
  savedArt = [];
  churchWindows.forEach((slot) => {
    if (slot.material.map) {
      slot.material.map.dispose();
      slot.material.map = null;
    }
    slot.material.color.set(0xfff2c8);
    slot.material.emissive.set(0xffce63);
    slot.material.emissiveIntensity = 0.6;
    slot.material.needsUpdate = true;
  });
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // ignore
  }
  updateTargetHighlight();
  resetGame();
}

function addGate(gate, index) {
  const group = new THREE.Group();
  group.position.set(laneToX(gate.x), 0, -gate.y * 0.16 + GATE_Z0);
  group.userData.gate = gate;

  const activeMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xffb000,
    emissiveIntensity: 0.55,
    roughness: 0.4,
  });
  const inactiveMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8d7df,
    emissive: 0x24434c,
    emissiveIntensity: 0.12,
    roughness: 0.5,
  });

  // Opening matches the forgiving pass window (gate.width + tolerance), scaled
  // into world units the same way laneToX maps the boat's position.
  const width = (gate.width + GATE_TOLERANCE * 2) * 8.2;
  const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.4, 16), activeMaterial);
  const postR = postL.clone();
  postL.position.set(-width / 2, 1.2, 0);
  postR.position.set(width / 2, 1.2, 0);
  group.add(postL, postR);

  const archCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-width / 2, 2.35, 0),
    new THREE.Vector3(-width / 4, 3.15, 0),
    new THREE.Vector3(0, 3.35, 0),
    new THREE.Vector3(width / 4, 3.15, 0),
    new THREE.Vector3(width / 2, 2.35, 0),
  ]);
  const arch = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 32, 0.08, 12, false), activeMaterial);
  group.add(arch);

  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.06, 0.32),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x39c6d6,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.72,
    }),
  );
  marker.position.y = 0.08;
  group.add(marker);

  const label = makeTextSprite(gate.name);
  label.position.set(0, 3.8, 0);
  group.add(label);

  group.userData.activeMaterial = activeMaterial;
  group.userData.inactiveMaterial = inactiveMaterial;
  group.userData.parts = [postL, postR, arch];
  group.userData.index = index;
  world.add(group);
  gateGroups.push(group);
}

function createBoat() {
  const group = new THREE.Group();
  group.position.set(0, 0.35, 2.6);

  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x120d10, roughness: 0.45, metalness: 0.08 });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0x5f3900,
    emissiveIntensity: 0.22,
    roughness: 0.34,
  });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.26, 3.2), hullMaterial);
  hull.scale.x = 0.62;
  hull.castShadow = true;
  group.add(hull);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.95, 4), hullMaterial);
  bow.rotation.x = Math.PI / 2;
  bow.position.z = -1.98;
  bow.castShadow = true;
  group.add(bow);

  const stern = bow.clone();
  stern.rotation.x = -Math.PI / 2;
  stern.position.z = 1.98;
  group.add(stern);

  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 2.7), trimMaterial);
  trim.position.y = 0.22;
  trim.castShadow = true;
  group.add(trim);

  const rowerMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fbff, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.45, 8, 16), rowerMaterial);
  body.position.set(0, 0.66, 0.15);
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xf3ddc8, roughness: 0.7 }),
  );
  head.position.set(0, 1.13, 0.15);
  head.castShadow = true;
  group.add(head);
  rowerHead = head;

  // Billboard sprite that shows the scanned student face (always faces camera).
  rowerFace = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthTest: false }),
  );
  rowerFace.position.set(0, 1.15, 0.15);
  rowerFace.scale.set(0.62, 0.62, 1);
  rowerFace.visible = false;
  rowerFace.renderOrder = 5;
  group.add(rowerFace);

  // Cargo frame that will carry the student's scanned stained-glass artwork.
  cargoGroup = new THREE.Group();
  cargoGroup.position.set(0, 0.85, -1.0);
  const cargoFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 0.09),
    new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0x5f3900,
      emissiveIntensity: 0.25,
      metalness: 0.35,
      roughness: 0.35,
    }),
  );
  cargoGroup.add(cargoFrame);
  cargoMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.98, 0.98),
    new THREE.MeshStandardMaterial({
      color: 0x2b3a44,
      emissive: 0x223b45,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
    }),
  );
  cargoMesh.position.z = 0.06;
  cargoGroup.add(cargoMesh);
  cargoGroup.visible = false;
  group.add(cargoGroup);

  const oarMaterial = new THREE.MeshStandardMaterial({ color: 0xf5dca0, roughness: 0.38 });
  leftOar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 12), oarMaterial);
  rightOar = leftOar.clone();
  leftOar.position.set(-0.7, 0.72, 0.15);
  rightOar.position.set(0.7, 0.72, 0.15);
  leftOar.rotation.z = Math.PI / 1.5;
  rightOar.rotation.z = -Math.PI / 1.5;
  leftOar.castShadow = true;
  rightOar.castShadow = true;
  group.add(leftOar, rightOar);

  return group;
}

function makeTextSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(5, 12, 18, 0.72)";
  context.roundRect(12, 24, 488, 80, 16);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "700 42px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4.2, 1.05, 1);
  return sprite;
}

function laneToX(value) {
  return (value - 0.5) * 8.2;
}

function resize() {
  const rect = gameCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  renderCamera.aspect = width / height;
  renderCamera.updateProjectionMatrix();
  analysisCanvas.width = 96;
  analysisCanvas.height = 72;

  const panelRect = skeletonCanvas.getBoundingClientRect();
  const sw = Math.max(1, Math.floor(panelRect.width));
  const sh = Math.max(1, Math.floor(panelRect.height));
  if (skeletonCanvas.width !== sw || skeletonCanvas.height !== sh) {
    skeletonCanvas.width = sw;
    skeletonCanvas.height = sh;
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    cameraVideo.srcObject = stream;
    await cameraVideo.play();
    state.cameraReady = true;
    els.notice.classList.add("is-hidden");
    if (!poseLandmarker) initPose();
  } catch (error) {
    state.cameraReady = false;
    els.notice.innerHTML = "Camera is not available here. Use Test Mode, or deploy with HTTPS for iPad camera access.";
  }
}

function startGame() {
  state.running = true;
  state.score = 0;
  state.gateIndex = 0;
  state.progress = 0;
  state.boatX = 0.5;
  state.speed = 0.012;
  state.turn = 0;
  state.envLeft = 0;
  state.envRight = 0;
  state.lastFrame = null;
  updateMission();
  updateHud();
  unlockAudio();
  els.notice.classList.add("is-hidden");
}

function resetGame() {
  state.running = false;
  state.score = 0;
  state.gateIndex = 0;
  state.progress = 0;
  state.boatX = 0.5;
  state.speed = 0;
  state.turn = 0;
  state.rowLeft = 0;
  state.rowRight = 0;
  state.envLeft = 0;
  state.envRight = 0;
  state.delivered = false;

  // Cancel any in-flight install animation.
  installActive = false;
  if (installPiece) {
    scene.remove(installPiece);
    installPiece.geometry.dispose();
    installPiece.material.dispose();
    installPiece = null;
  }

  // Windows already installed by previous students stay filled permanently;
  // reset only clears the boat's current cargo state.
  if (cargoGroup) cargoGroup.visible = state.hasArt;
  updateTargetHighlight();

  updateMission(true);
  updateHud();
  els.notice.innerHTML = "Tap Camera, then Scan your stained-glass artwork, then row with BOTH arms toward the Basilica. Row one arm to turn.";
  els.notice.classList.remove("is-hidden");
}

function passGate() {
  if (!state.running) startGame();
  completeGate(true);
}

// Capture the student's artwork (center of frame) and head (from pose) and
// place them on the gondola as cargo + rower avatar.
function captureScan() {
  if (!state.cameraReady || cameraVideo.readyState < 2) {
    els.notice.innerHTML = "Start the camera first, hold your stained-glass artwork up to fill the frame, then tap Scan.";
    els.notice.classList.remove("is-hidden");
    return;
  }
  const vw = cameraVideo.videoWidth || 640;
  const vh = cameraVideo.videoHeight || 480;

  // Artwork: central square region where the student holds the piece.
  const artSize = Math.min(vw, vh) * 0.6;
  const artCanvas = document.createElement("canvas");
  artCanvas.width = 256;
  artCanvas.height = 256;
  const actx = artCanvas.getContext("2d");
  actx.translate(256, 0);
  actx.scale(-1, 1);
  actx.drawImage(cameraVideo, (vw - artSize) / 2, (vh - artSize) / 2, artSize, artSize, 0, 0, 256, 256);
  cargoDataURL = artCanvas.toDataURL("image/jpeg", 0.75); // for localStorage
  cargoTexture = new THREE.CanvasTexture(artCanvas);
  cargoTexture.colorSpace = THREE.SRGBColorSpace;
  cargoMesh.material.map = cargoTexture;
  cargoMesh.material.color.set(0xffffff);
  cargoMesh.material.emissive.set(0xffffff);
  cargoMesh.material.emissiveIntensity = 0.35;
  cargoMesh.material.needsUpdate = true;
  cargoGroup.visible = true;

  // Head: bounding box around head/face landmarks, else top-center fallback.
  let fx = vw * 0.32;
  let fy = vh * 0.06;
  let fw = vw * 0.36;
  let fh = vh * 0.4;
  const lms = latestLandmarks;
  if (lms) {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    let ok = false;
    for (let idx = 0; idx <= 10; idx += 1) {
      const lm = lms[idx];
      if (!lm) continue;
      ok = true;
      minX = Math.min(minX, lm.x);
      maxX = Math.max(maxX, lm.x);
      minY = Math.min(minY, lm.y);
      maxY = Math.max(maxY, lm.y);
    }
    if (ok) {
      const padX = (maxX - minX) * 0.6 + 0.04;
      const padY = (maxY - minY) * 1.0 + 0.05;
      fx = Math.max(0, minX - padX) * vw;
      fy = Math.max(0, minY - padY) * vh;
      fw = Math.min(1, maxX - minX + padX * 2) * vw;
      fh = Math.min(1, maxY - minY + padY * 2) * vh;
    }
  }
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = 160;
  faceCanvas.height = 160;
  const fctx = faceCanvas.getContext("2d");
  // Circular mask so the avatar reads as a head, with a bright ring.
  fctx.save();
  fctx.beginPath();
  fctx.arc(80, 80, 76, 0, Math.PI * 2);
  fctx.clip();
  // Mirror to match the selfie preview the student sees.
  fctx.translate(160, 0);
  fctx.scale(-1, 1);
  fctx.drawImage(cameraVideo, fx, fy, fw, fh, 0, 0, 160, 160);
  fctx.restore();
  fctx.lineWidth = 8;
  fctx.strokeStyle = "#ffd166";
  fctx.beginPath();
  fctx.arc(80, 80, 76, 0, Math.PI * 2);
  fctx.stroke();
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  rowerFace.material.map = faceTex;
  rowerFace.material.needsUpdate = true;
  rowerFace.visible = true;

  state.hasArt = true;
  state.delivered = false;
  if (!state.running) startGame();
  els.missionTag.textContent = "Cargo ready";
  els.missionTitle.textContent = "Artwork loaded on the gondola";
  els.missionHint.textContent = "Row with BOTH arms to the Basilica at the end and install your stained glass.";
  els.spokenLine.textContent = "I carry my glass art to the church!";
  els.notice.classList.add("is-hidden");
  playChime();
  burstSparks("#7fd4ff");
}

function checkDelivery() {
  if (state.delivered || !church) return;
  if (state.gateIndex >= gates.length && church.position.z > -7) {
    deliverArt();
  }
}

function deliverArt() {
  state.delivered = true;
  state.running = false;
  state.score += 150;
  playArrivalMusic();
  playChime();
  els.stage.classList.add("is-success");
  state.successCooldown = 200;
  updateHud();

  if (state.hasArt && cargoTexture) {
    // Fly the stained glass off the boat, spinning, up into the church window.
    els.missionTag.textContent = "Installing";
    els.missionTitle.textContent = "Delivering the stained glass...";
    els.missionHint.textContent = "Watch it rise and lock into the Basilica window!";
    els.spokenLine.textContent = "Here comes my glass art!";
    startInstall();
  } else {
    els.missionTag.textContent = "Bravo";
    els.missionTitle.textContent = "You reached the Basilica";
    els.missionHint.textContent = "Tap Scan with your stained-glass artwork next time to install it here.";
    els.spokenLine.textContent = "I made it to the church!";
    burstSparks("#ffd166");
  }
}

function startInstall() {
  // Lock onto the next empty window; it stays filled permanently.
  installTargetWindow = churchWindows[Math.min(installedCount, churchWindows.length - 1)];
  if (cargoGroup) cargoGroup.getWorldPosition(installFrom);
  else installFrom.copy(boat.position);
  installTargetWindow.getWorldPosition(installTo);

  installPiece = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({
      map: cargoTexture,
      emissive: 0xffffff,
      emissiveIntensity: 0.45,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  installPiece.position.copy(installFrom);
  scene.add(installPiece);
  if (cargoGroup) cargoGroup.visible = false; // handed off to the flying piece
  installActive = true;
  installStart = -1;
}

function updateInstall(time) {
  if (!installActive || !installPiece) return;
  if (installStart < 0) installStart = time;
  const p = Math.min(1, (time - installStart) / installDur);
  const ease = p * p * (3 - 2 * p); // smoothstep

  installPiece.position.lerpVectors(installFrom, installTo, ease);
  installPiece.position.y += Math.sin(p * Math.PI) * 2.4; // arc upward
  installPiece.rotation.y = p * Math.PI * 4; // two full spins, ends facing front
  installPiece.rotation.z = Math.sin(p * Math.PI) * 0.4;
  // Settle to match the square target window (~1.0 x 1.0), with a mid-flight puff.
  installPiece.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.15);
  installPiece.material.emissiveIntensity = 0.45 + Math.sin(p * Math.PI) * 0.6;

  if (p >= 1) finishInstall();
}

function finishInstall() {
  installActive = false;
  if (installPiece) {
    scene.remove(installPiece);
    installPiece.geometry.dispose();
    installPiece.material.dispose();
    installPiece = null;
  }
  if (installTargetWindow) {
    fillWindow(installTargetWindow, cargoTexture, 0.85);
    const idx = churchWindows.indexOf(installTargetWindow);
    if (idx >= 0 && cargoDataURL) savedArt[idx] = cargoDataURL;
  }
  // This window is now permanently taken; advance to the next empty one.
  installedCount = Math.min(installedCount + 1, churchWindows.length);
  installTargetWindow = null;
  updateTargetHighlight();
  saveWindows();

  els.missionTag.textContent = "Bravo";
  els.missionTitle.textContent = `Stained glass installed! (${installedCount}/${churchWindows.length})`;
  els.missionHint.textContent = "Your artwork now glows in the Basilica window. Ciao, Venezia!";
  els.spokenLine.textContent = "I installed my glass art in the church!";
  playChime();
  burstSparks("#ffd166");
  burstSparks("#7fd4ff");
  els.stage.classList.add("is-success");
  state.successCooldown = 160;
}

function updateMission(reset = false) {
  if (reset) {
    els.missionTag.textContent = "Ready";
    els.missionTitle.textContent = "Venice Row Quest 3D";
    els.missionHint.textContent = "Row with BOTH arms to go forward. Right arm only turns left, left arm only turns right.";
    els.spokenLine.textContent = "Row, row, row!";
    return;
  }

  const gate = gates[state.gateIndex];
  if (!gate) {
    els.missionTag.textContent = "Final leg";
    els.missionTitle.textContent = "Head to the Basilica";
    els.missionHint.textContent = state.hasArt
      ? "All gates cleared! Row with both arms to the church and install your stained glass."
      : "All gates cleared! Row with both arms to the church at the end of the canal.";
    els.spokenLine.textContent = "To the church!";
    return;
  }

  els.missionTag.textContent = `Gate ${state.gateIndex + 1}/${gates.length}`;
  els.missionTitle.textContent = gate.name;
  els.missionHint.textContent = "Row with both arms to go forward; row one arm to steer through the glowing 3D gate.";
  els.spokenLine.textContent = gate.line;
}

function updateHud() {
  els.leftMeter.style.width = `${Math.min(100, state.rowLeft * 160)}%`;
  els.rightMeter.style.width = `${Math.min(100, state.rowRight * 160)}%`;
  els.speedMeter.style.width = `${Math.min(100, state.speed * 520)}%`;
  els.balanceMeter.style.width = `${Math.min(100, state.balance * 100)}%`;
}

function unlockAudio() {
  primeMusic();
  if (state.audio) {
    if (state.audio.state === "suspended") state.audio.resume().catch(() => {});
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  state.audio = new AudioContext();
  if (state.audio.state === "suspended") state.audio.resume().catch(() => {});
}

function playChime() {
  if (!state.audio) return;
  const now = state.audio.currentTime;
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const osc = state.audio.createOscillator();
    const gain = state.audio.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + index * 0.08);
    gain.gain.linearRampToValueAtTime(0.08, now + index * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.36);
    osc.connect(gain);
    gain.connect(state.audio.destination);
    osc.start(now + index * 0.08);
    osc.stop(now + index * 0.08 + 0.38);
  });
}

function completeGate(manual = false) {
  const passedIndex = state.gateIndex;
  const gate = gates[passedIndex];
  if (!gate) return;
  state.score += manual ? 50 : 100;
  state.gateIndex += 1;
  state.successCooldown = 70;
  state.speed = Math.max(state.speed, 0.04);
  els.stage.classList.add("is-success");
  playChime();
  playGateLine(passedIndex); // spoken line for the gate just passed
  burstSparks("#ffd166");
  updateMission();
  updateHud();
}

function burstSparks(color) {
  const rect = els.sparkLayer.getBoundingClientRect();
  for (let i = 0; i < 26; i += 1) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.left = `${rect.width * (0.35 + Math.random() * 0.3)}px`;
    spark.style.top = `${rect.height * (0.34 + Math.random() * 0.24)}px`;
    spark.style.setProperty("--spark-color", color);
    spark.style.setProperty("--x", `${(Math.random() - 0.5) * 340}px`);
    spark.style.setProperty("--y", `${(Math.random() - 0.5) * 240}px`);
    els.sparkLayer.appendChild(spark);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
  }
}

function drawCameraFrame() {
  if (state.cameraReady && cameraVideo.readyState >= 2) {
    analysis.save();
    analysis.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
    analysis.translate(analysisCanvas.width, 0);
    analysis.scale(-1, 1);
    analysis.drawImage(cameraVideo, 0, 0, analysisCanvas.width, analysisCanvas.height);
    analysis.restore();
    return;
  }
  analysis.fillStyle = "#132b35";
  analysis.fillRect(0, 0, analysisCanvas.width, analysisCanvas.height);
}

function readMotion() {
  const frame = analysis.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
  const data = frame.data;
  let left = 0;
  let right = 0;
  let leftSamples = 0;
  let rightSamples = 0;
  const width = analysisCanvas.width;
  const height = analysisCanvas.height;

  if (!state.lastFrame) {
    state.lastFrame = frame;
    return { left: 0, right: 0 };
  }

  for (let y = 8; y < height - 8; y += 3) {
    for (let x = 4; x < width - 4; x += 3) {
      const i = (y * width + x) * 4;
      const diff =
        Math.abs(data[i] - state.lastFrame.data[i]) +
        Math.abs(data[i + 1] - state.lastFrame.data[i + 1]) +
        Math.abs(data[i + 2] - state.lastFrame.data[i + 2]);
      if (x < width / 2) {
        left += diff;
        leftSamples += 1;
      } else {
        right += diff;
        rightSamples += 1;
      }
    }
  }

  state.lastFrame = frame;
  const scale = 1 / 74;
  const deadzone = 0.05;
  return {
    left: Math.min(1, Math.max(0, (left / Math.max(1, leftSamples)) * scale - deadzone)),
    right: Math.min(1, Math.max(0, (right / Math.max(1, rightSamples)) * scale - deadzone)),
  };
}

function runPose(nowMs) {
  let motion = { left: 0, right: 0 };
  let stamp = nowMs;
  if (stamp <= lastPoseTime) stamp = lastPoseTime + 1;
  let result;
  try {
    result = poseLandmarker.detectForVideo(cameraVideo, stamp);
  } catch (error) {
    return null;
  }
  lastPoseTime = stamp;
  latestLandmarks = (result.landmarks && result.landmarks[0]) || null;
  drawSkeleton(latestLandmarks);
  if (latestLandmarks) motion = poseMotion(latestLandmarks);
  return motion;
}

// Derive left/right rowing activity from wrist vertical/horizontal speed.
// Landmark 15 = left wrist, 16 = right wrist (raw image space).
function poseMotion(landmarks) {
  let left = 0;
  let right = 0;
  [15, 16].forEach((idx) => {
    const lm = landmarks[idx];
    if (!lm || (lm.visibility !== undefined && lm.visibility < 0.3)) {
      wristPrev[idx] = null;
      return;
    }
    const prev = wristPrev[idx];
    if (prev) {
      const speed = Math.hypot(lm.x - prev.x, lm.y - prev.y);
      // Deadzone removes small jitter so the sensor is less twitchy,
      // then a gentle gain scales a real stroke up to ~1.
      const activity = Math.min(1, Math.max(0, speed - 0.008) * 10);
      // Mirror x so it matches the mirrored preview / player's own view.
      const screenX = 1 - lm.x;
      if (screenX < 0.5) left += activity;
      else right += activity;
    }
    wristPrev[idx] = { x: lm.x, y: lm.y };
  });
  return { left: Math.min(1, left), right: Math.min(1, right) };
}

function drawSkeleton(landmarks) {
  const w = skeletonCanvas.width;
  const h = skeletonCanvas.height;
  skeleton.clearRect(0, 0, w, h);
  if (!landmarks) return;
  const px = (lm) => (1 - lm.x) * w;
  const py = (lm) => lm.y * h;

  skeleton.lineWidth = Math.max(2, w * 0.02);
  skeleton.lineCap = "round";
  skeleton.strokeStyle = "rgba(57, 255, 214, 0.95)";
  skeleton.shadowColor = "rgba(57, 255, 214, 0.6)";
  skeleton.shadowBlur = 6;
  POSE_LINKS.forEach(([a, b]) => {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!la || !lb) return;
    skeleton.beginPath();
    skeleton.moveTo(px(la), py(la));
    skeleton.lineTo(px(lb), py(lb));
    skeleton.stroke();
  });

  skeleton.shadowBlur = 0;
  skeleton.fillStyle = "#ffd166";
  landmarks.forEach((lm) => {
    if (lm.visibility !== undefined && lm.visibility < 0.3) return;
    skeleton.beginPath();
    skeleton.arc(px(lm), py(lm), Math.max(2.5, w * 0.013), 0, Math.PI * 2);
    skeleton.fill();
  });
}

function applyControls(motion) {
  let left = motion.left;
  let right = motion.right;

  if (testMode) {
    left = Math.max(left, state.testBoost.left);
    right = Math.max(right, state.testBoost.right);
    if (state.testBoost.brake > 0) state.speed *= 0.8;
    state.testBoost.left *= 0.86;
    state.testBoost.right *= 0.86;
    state.testBoost.brake *= 0.82;
  }

  // Smoothed values drive the on-screen meters and oar animation.
  state.rowLeft = state.rowLeft * 0.74 + left * 0.26;
  state.rowRight = state.rowRight * 0.74 + right * 0.26;

  // Peak-hold envelopes: a stroke jumps the envelope up instantly and it
  // decays over ~0.15s. This lets a single pull register even though the two
  // arms rarely peak on the exact same frame, so "both arms" rowing works.
  state.envLeft = Math.max(state.envLeft * 0.86, left);
  state.envRight = Math.max(state.envRight * 0.86, right);

  // Forward drive needs BOTH arms; a deadzone means a genuine two-arm stroke.
  const bothPower = Math.min(state.envLeft, state.envRight);
  const drive = Math.max(0, bothPower - 0.12);
  // Steering from the imbalance: left arm only -> turn right (+x),
  // right arm only -> turn left (-x). Kept gentle so the boat drifts across
  // rather than snapping side to side.
  const steering = (state.envLeft - state.envRight) * 0.010;

  if (state.running) {
    // Real-rowing feel: each stroke gives a forward surge, then the gondola
    // glides on the water (light drag) until the next pull.
    state.speed = state.speed * 0.986 + drive * 0.09;
    state.speed = Math.min(0.3, state.speed);
    // Smooth the turn and cap how fast the boat can slide across the canal.
    state.turn = state.turn * 0.85 + steering * 0.15;
    state.turn = Math.max(-0.018, Math.min(0.018, state.turn));
    state.boatX = Math.max(0.14, Math.min(0.86, state.boatX + state.turn));
    state.progress += state.speed;
  } else {
    state.speed *= 0.92;
  }

  state.balance = Math.max(0, 1 - Math.abs(state.boatX - 0.5) * 2.35);
}

function checkGates() {
  if (!state.running || state.gateIndex >= gates.length || state.successCooldown > 0) return;

  const gate = gates[state.gateIndex];
  if (state.progress >= gate.y) {
    // Pass when the boat HULL (oars excluded) reaches the gate opening.
    // hullHalf = hull world half-width (1.45 * 0.62 / 2) mapped to lane units.
    const hullHalf = 0.055;
    const openHalf = gate.width / 2 + GATE_TOLERANCE;
    if (Math.abs(state.boatX - gate.x) <= openHalf + hullHalf) {
      completeGate();
    } else if (state.shakeCooldown <= 0) {
      // Gentle nudge back so a miss never turns into a stuck bounce loop.
      state.score = Math.max(0, state.score - 10);
      state.speed *= 0.6;
      state.progress = gate.y - 12;
      state.shakeCooldown = 45;
      els.missionHint.textContent = "Almost! Steer toward the glowing gate and row through.";
      updateHud();
    }
  }
}

// One oar's rowing cycle. side = +1 (left) / -1 (right).
// Drive half (blade in water, sweeping backward) vs recovery half (lifted,
// swinging forward) so the oar visibly "catches" and pulls the water.
function updateOar(oar, side, phase, power) {
  const sweepAmp = 0.5 + power * 0.7;
  const sweep = -Math.cos(phase) * sweepAmp; // forward (catch) -> back (finish)
  const s = Math.sin(phase);
  const inWater = Math.max(0, s); // 0..1 during the power stroke
  const inAir = Math.max(0, -s); // 0..1 during the recovery
  oar.rotation.x = sweep;
  // Base tilt (~120deg from vertical) makes each oar slope OUTWARD and DOWN so
  // the blade sits in the water. Power stroke dips it deeper; recovery lifts it.
  oar.rotation.z = side * (Math.PI / 1.5 + inWater * 0.16 - inAir * 0.45);
}

function updateThree(time) {
  const boatX = laneToX(state.boatX);
  boat.position.x += (boatX - boat.position.x) * 0.18;
  boat.rotation.z = -state.turn * 6 + Math.sin(time * 0.4) * 0.015;
  boat.rotation.y = -state.turn * 12;
  boat.position.y = 0.35 + Math.sin(time * 0.5) * 0.02;

  // Oar stroke cycle: catch -> power (blade sweeps back, low in the water)
  // -> release -> recovery (blade lifts and swings forward through the air).
  state.strokeLeft += 0.05 + state.rowLeft * 1.0;
  state.strokeRight += 0.05 + state.rowRight * 1.0;
  updateOar(leftOar, 1, state.strokeLeft, state.rowLeft);
  updateOar(rightOar, -1, state.strokeRight, state.rowRight);

  waterMesh.position.z = -50 + (state.progress * 0.16) % 8;

  // Scroll the banks toward the boat and recycle them behind the camera so it
  // feels like the gondola is really moving forward.
  const scroll = state.progress * 0.16;
  scenery.forEach((item) => {
    item.position.z = wrapScenery(item.userData.baseZ, scroll);
  });

  if (church) {
    church.position.z = church.userData.baseZ + state.progress * 0.16;
    church.rotation.y = Math.sin(time * 0.2) * 0.008;
  }

  updateInstall(time);

  otherBoats.forEach((b) => {
    b.position.z = wrapScenery(b.userData.baseZ, scroll);
    b.position.y = b.userData.baseY + Math.sin(time * 1.6 + b.userData.phase) * 0.05;
    b.rotation.z = Math.sin(time * 1.2 + b.userData.phase) * 0.05;
  });

  gateGroups.forEach((group, index) => {
    group.position.z = -gates[index].y * 0.16 + GATE_Z0 + state.progress * 0.16;
    const active = index === state.gateIndex;
    group.userData.parts.forEach((part) => {
      part.material = active ? group.userData.activeMaterial : group.userData.inactiveMaterial;
    });
    group.visible = group.position.z < 11 && group.position.z > -85;
    group.rotation.y = Math.sin(time + index) * 0.02;
  });

  renderCamera.position.x += (boat.position.x * 0.22 - renderCamera.position.x) * 0.04;
  renderCamera.lookAt(boat.position.x * 0.35, 0.6, -17);

  const positions = waterMesh.geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    positions.setZ(i, Math.sin(x * 1.8 + time * 1.4) * 0.06 + Math.cos(y * 0.5 + time * 1.8) * 0.04);
  }
  positions.needsUpdate = true;
  waterMesh.geometry.computeVertexNormals();
}

function frame(now) {
  resize();
  const time = now / 1000;

  let motion = null;
  const cameraLive = state.cameraReady && cameraVideo.readyState >= 2;
  if (poseReady && cameraLive) {
    motion = runPose(now);
  }
  if (!motion) {
    // Fallback: frame-difference motion when pose is unavailable.
    drawCameraFrame();
    motion = readMotion();
    if (!poseReady) skeleton.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
  }
  applyControls(motion);
  checkGates();
  checkDelivery();
  updateThree(time);
  updateMusic();
  renderer.render(scene, renderCamera);
  updateHud();

  if (state.successCooldown > 0) {
    state.successCooldown -= 1;
    if (state.successCooldown <= 0) els.stage.classList.remove("is-success");
  }
  if (state.shakeCooldown > 0) state.shakeCooldown -= 1;

  requestAnimationFrame(frame);
}

els.startCamera.addEventListener("click", () => {
  unlockAudio();
  startCamera();
});
els.scanArt.addEventListener("click", () => {
  unlockAudio();
  captureScan();
});
els.startGame.addEventListener("click", startGame);
els.resetGame.addEventListener("click", resetGame);
els.passGate.addEventListener("click", passGate);
els.fullscreen.addEventListener("click", () => {
  unlockAudio();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

els.adminToggle.addEventListener("click", () => {
  const opening = els.adminPanel.hidden;
  els.adminPanel.hidden = !opening;
  if (opening) {
    els.adminMsg.textContent = "";
    els.adminPassword.value = "";
    els.adminPassword.focus();
  }
});
els.adminClose.addEventListener("click", () => {
  els.adminPanel.hidden = true;
});
els.adminReset.addEventListener("click", () => {
  if (els.adminPassword.value === ADMIN_PASSWORD) {
    resetAllWindows();
    els.adminMsg.style.color = "var(--green)";
    els.adminMsg.textContent = "All church windows were reset.";
    els.adminPassword.value = "";
  } else {
    els.adminMsg.style.color = "var(--red)";
    els.adminMsg.textContent = "Wrong passcode.";
  }
});
els.adminPassword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") els.adminReset.click();
});

if (testMode) {
  els.testPanel.hidden = false;
  els.notice.innerHTML = "Test Mode is on. Tap Start, then use Left, Right, Row, Boost, and Brake to test the 3D gondola.";
  els.testPanel.addEventListener("click", (event) => {
    const action = event.target.closest("[data-test-action]")?.dataset.testAction;
    if (!action) return;
    unlockAudio();
    if (action === "left") state.testBoost.left = 1;
    if (action === "right") state.testBoost.right = 1;
    if (action === "row") {
      state.testBoost.left = 0.82;
      state.testBoost.right = 0.82;
    }
    if (action === "boost") {
      state.speed = Math.max(state.speed, 0.16);
      state.testBoost.left = 0.9;
      state.testBoost.right = 0.9;
    }
    if (action === "brake") state.testBoost.brake = 1;
  });
}

window.addEventListener("resize", resize);
resize();
resetGame();
requestAnimationFrame(frame);
