// Venezia Glass Gallery — walk inside the Basilica and admire every student's
// stained-glass window from within, lit by golden shafts of light.
// Reads the same localStorage data the game writes (per-device persistence).
// A downloaded snapshot (see "Export for parents") embeds its data in
// window.__GALLERY_SNAPSHOT__ instead, so it works on any device with no
// localStorage at all.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const STORAGE_KEY = "venice-church-windows-v1";
const SLOT_TOTAL = 16;

const canvas = document.querySelector("#galleryCanvas");
const els = {
  windowCount: document.querySelector("#windowCount"),
  caption: document.querySelector("#caption"),
  captionName: document.querySelector("#captionName"),
  captionSlot: document.querySelector("#captionSlot"),
  captionClose: document.querySelector("#captionClose"),
  emptyNote: document.querySelector("#emptyNote"),
  hintText: document.querySelector("#hintText"),
  exportBtn: document.querySelector("#exportBtn"),
};

// --- Saved data ---
let saved = { count: 0, art: [], names: [] };
try {
  const data = window.__GALLERY_SNAPSHOT__ || JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (data && Array.isArray(data.art)) {
    saved.art = data.art.slice(0, SLOT_TOTAL);
    saved.names = Array.isArray(data.names) ? data.names.slice(0, SLOT_TOTAL) : [];
    saved.count = Math.min(data.count || saved.art.length, SLOT_TOTAL);
  }
} catch (error) {
  // unreadable storage — show the empty gallery
}
const filledCount = saved.art.filter(Boolean).length;
els.windowCount.textContent = `${filledCount} / ${SLOT_TOTAL}`;
if (filledCount === 0) els.emptyNote.hidden = false;

// --- Gallery background music (optional, same .m4a format as rowing-music). ---
// Drop a track at assets/gallery-music.m4a; a missing file is skipped silently.
// Mobile autoplay rules require a user gesture, so playback starts on the
// first tap/drag. iOS Safari ignores HTMLMediaElement.volume, so the track is
// routed through a WebAudio GainNode (same trick as the game page).
const GALLERY_MUSIC_SRC = "./assets/gallery-music.m4a";
const GALLERY_MUSIC_VOLUME = 0.55;
const galleryMusic = new Audio(GALLERY_MUSIC_SRC);
galleryMusic.loop = true;
galleryMusic.preload = "auto";
let galleryMusicAvailable = true;
let galleryMusicStarted = false;
galleryMusic.addEventListener("error", () => {
  galleryMusicAvailable = false;
});

let galleryMusicRouted = false;
function routeGalleryMusic() {
  // createMediaElementSource may only ever be called once per element, so
  // this must stay separate from the play-retry logic below.
  if (galleryMusicRouted) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(galleryMusic);
      const gain = ctx.createGain();
      gain.gain.value = GALLERY_MUSIC_VOLUME;
      source.connect(gain);
      gain.connect(ctx.destination);
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      galleryMusicRouted = true;
      return;
    }
  } catch (error) {
    // WebAudio routing unavailable — fall through to element volume.
  }
  galleryMusic.volume = GALLERY_MUSIC_VOLUME; // works everywhere except iOS
  galleryMusicRouted = true;
}

function startGalleryMusic() {
  if (galleryMusicStarted || !galleryMusicAvailable) return;
  galleryMusicStarted = true;
  routeGalleryMusic();
  galleryMusic.play().catch(() => {
    // Autoplay refused — clear the flag so the next tap can retry.
    galleryMusicStarted = false;
  });
}
window.addEventListener("pointerdown", startGalleryMusic);

// --- Renderer / scene ---
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x16121f);
scene.fog = new THREE.Fog(0x16121f, 26, 60);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);
camera.position.set(0, 3.4, 6);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.65, 0.5);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// --- Nave dimensions ---
const NAVE_HALF_W = 7.5; // walls at x = ±7.5
const NAVE_BACK = 9; // wall behind the entrance
const NAVE_FRONT = -26; // altar wall
const NAVE_H = 12;

// --- Lights ---
scene.add(new THREE.HemisphereLight(0x7a7aa0, 0x241a28, 0.55));
[[-0, 7.5, -3], [0, 7.5, -12], [0, 7.5, -20]].forEach(([x, y, z]) => {
  const light = new THREE.PointLight(0xffc98a, 26, 30, 2);
  light.position.set(x, y, z);
  scene.add(light);
});
const altarGlow = new THREE.PointLight(0xffd9a0, 30, 26, 2);
altarGlow.position.set(0, 5, -23.5);
scene.add(altarGlow);

// --- Interior shell ---
function makeFloorTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  const tones = ["#c9b699", "#8f6a5e"];
  const cell = 64;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      ctx.fillStyle = tones[(x + y) % 2];
      ctx.fillRect(x * cell, y * cell, cell, cell);
      // Subtle marble veins.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(x * cell + Math.random() * cell, y * cell);
      ctx.quadraticCurveTo(
        x * cell + Math.random() * cell,
        y * cell + cell * 0.5,
        x * cell + Math.random() * cell,
        y * cell + cell,
      );
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 7);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(NAVE_HALF_W * 2, NAVE_BACK - NAVE_FRONT),
  new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.42, metalness: 0.08 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, (NAVE_BACK + NAVE_FRONT) / 2);
scene.add(floor);

const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5e5570, roughness: 0.85 });
const wallGeo = new THREE.PlaneGeometry(NAVE_BACK - NAVE_FRONT, NAVE_H);
[-1, 1].forEach((side) => {
  const wall = new THREE.Mesh(wallGeo, stoneMat);
  wall.position.set(side * NAVE_HALF_W, NAVE_H / 2, (NAVE_BACK + NAVE_FRONT) / 2);
  wall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  scene.add(wall);
});
const endWallGeo = new THREE.PlaneGeometry(NAVE_HALF_W * 2, NAVE_H);
const altarWall = new THREE.Mesh(endWallGeo, stoneMat);
altarWall.position.set(0, NAVE_H / 2, NAVE_FRONT);
scene.add(altarWall);
const backWall = new THREE.Mesh(endWallGeo, stoneMat);
backWall.position.set(0, NAVE_H / 2, NAVE_BACK);
backWall.rotation.y = Math.PI;
scene.add(backWall);
const ceiling = new THREE.Mesh(
  new THREE.PlaneGeometry(NAVE_HALF_W * 2, NAVE_BACK - NAVE_FRONT),
  new THREE.MeshStandardMaterial({ color: 0x241d33, roughness: 0.9 }),
);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.set(0, NAVE_H, (NAVE_BACK + NAVE_FRONT) / 2);
scene.add(ceiling);

// Columns give the nave rhythm and depth. Their z positions sit exactly
// BETWEEN the window slots (windows at z = 1, -4, -9, ...) so no column ever
// blocks the view of an artwork.
const columnMat = new THREE.MeshStandardMaterial({ color: 0x6f6584, roughness: 0.7 });
const columnGeo = new THREE.CylinderGeometry(0.42, 0.5, NAVE_H, 18);
[-1.5, -6.5, -11.5, -16.5, -21.5].forEach((z) => {
  [-1, 1].forEach((side) => {
    const column = new THREE.Mesh(columnGeo, columnMat);
    column.position.set(side * (NAVE_HALF_W - 0.9), NAVE_H / 2, z);
    scene.add(column);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.28, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xd9b46a, roughness: 0.4, metalness: 0.3 }),
    );
    cap.position.set(side * (NAVE_HALF_W - 0.9), NAVE_H - 0.6, z);
    scene.add(cap);
  });
});

// --- Rose window above the altar (decorative centerpiece) ---
function makeRoseTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 512, 512);
  const cx = 256;
  const cy = 256;
  const petals = ["#ff5d73", "#ffcf33", "#22c55e", "#2f9bff", "#9d7bff", "#ff77c8", "#17c3d6", "#ff9e6d"];
  for (let ring = 3; ring >= 1; ring -= 1) {
    const r = ring * 80;
    const count = ring * 8;
    for (let i = 0; i < count; i += 1) {
      const a0 = (i / count) * Math.PI * 2;
      const a1 = ((i + 1) / count) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * (r - 78), cy + Math.sin(a0) * (r - 78));
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = petals[(i + ring) % petals.length];
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#181228";
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fillStyle = "#fff3c4";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#181228";
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const rose = new THREE.Mesh(
  new THREE.CircleGeometry(1.9, 48),
  new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: makeRoseTexture(),
    emissiveIntensity: 1.05,
    transparent: true,
  }),
);
rose.position.set(0, 9.1, NAVE_FRONT + 0.08);
scene.add(rose);

// --- Window slots ---
// Fill order matches the game (slot 0 first): alternate left/right down the
// nave, then the last four on the altar wall around the rose window.
function slotPlacements() {
  const placements = [];
  const zs = [1, -4, -9, -14, -19, -23.5];
  for (let i = 0; i < 12; i += 1) {
    const side = i % 2 === 0 ? -1 : 1; // even → left wall, odd → right wall
    const z = zs[Math.floor(i / 2)];
    placements.push({
      pos: new THREE.Vector3(side * (NAVE_HALF_W - 0.12), 5.3, z),
      rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2,
    });
  }
  [[-3.6, 4.2], [3.6, 4.2], [-3.6, 7.6], [3.6, 7.6]].forEach(([x, y]) => {
    placements.push({
      pos: new THREE.Vector3(x, y, NAVE_FRONT + 0.12),
      rotY: 0,
    });
  });
  return placements;
}

function makeLeadedPlaceholderTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#2a3040";
  ctx.fillRect(0, 0, 256, 256);
  const cell = 64;
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      ctx.fillStyle = `rgba(120, 150, 200, ${0.08 + ((x + y) % 3) * 0.05})`;
      ctx.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6);
    }
  }
  ctx.strokeStyle = "#141824";
  ctx.lineWidth = 6;
  for (let i = 0; i <= 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(256, i * cell);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const placeholderTex = makeLeadedPlaceholderTexture();

function makeShaftTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}
const shaftTex = makeShaftTexture();

function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.75)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const glowTex = makeGlowTexture();

function makeNamePlateTexture(text) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.beginPath();
  ctx.roundRect(10, 22, 492, 84, 20);
  ctx.fillStyle = "rgba(20, 14, 34, 0.88)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffd166";
  ctx.stroke();
  ctx.fillStyle = "#ffe9b0";
  ctx.font = "800 52px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 18), 256, 65);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Average color of an artwork (slightly saturated) tints its light shaft.
function averageColor(img) {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, 8, 8);
  const data = ctx.getImageData(0, 0, 8, 8).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = data.length / 4;
  const color = new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
  const hsl = {};
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.min(1, hsl.s * 1.6 + 0.15), Math.min(0.72, hsl.l * 1.25 + 0.18));
  return color;
}

const goldMat = new THREE.MeshStandardMaterial({
  color: 0xffd166,
  emissive: 0x3d2800,
  emissiveIntensity: 0.5,
  metalness: 0.45,
  roughness: 0.3,
});

const pickables = [];
const slots = [];

function buildSlot(index, placement) {
  const group = new THREE.Group();
  group.position.copy(placement.pos);
  group.rotation.y = placement.rotY;
  scene.add(group);

  const url = saved.art[index] || null;
  const name = (saved.names[index] || "").trim();

  const artMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: placeholderTex,
    emissiveIntensity: url ? 1.1 : 0.22,
  });
  const art = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), artMat);
  art.userData.slotIndex = index;
  group.add(art);
  pickables.push(art);

  // Gold frame.
  [
    { x: -1.22, y: 0, w: 0.14, h: 2.6 },
    { x: 1.22, y: 0, w: 0.14, h: 2.6 },
    { x: 0, y: -1.22, w: 2.6, h: 0.14 },
    { x: 0, y: 1.22, w: 2.6, h: 0.14 },
  ].forEach((part) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(part.w, part.h, 0.1), goldMat);
    bar.position.set(part.x, part.y, 0.02);
    group.add(bar);
  });

  const slot = { group, art, index, filled: Boolean(url), name, shaft: null, glow: null };
  slots.push(slot);
  if (!url) return;

  // Nameplate under the window.
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.48),
    new THREE.MeshBasicMaterial({ map: makeNamePlateTexture(name || `Artist ${index + 1}`), transparent: true }),
  );
  plate.position.set(0, -1.72, 0.06);
  group.add(plate);

  // Artwork texture + tinted light shaft once the image decodes.
  const img = new Image();
  img.onload = () => {
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    artMat.emissiveMap = tex;
    artMat.needsUpdate = true;

    const tint = averageColor(img);
    const shaft = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 6.4),
      new THREE.MeshBasicMaterial({
        map: shaftTex,
        color: tint,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    shaft.geometry.translate(0, -3.2, 0);
    shaft.rotation.x = -0.62;
    // Start just below the window frame so the beam never washes out the glass.
    shaft.position.set(0, -1.2, 0.3);
    shaft.renderOrder = 2;
    group.add(shaft);
    slot.shaft = shaft;

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 4.6),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: tint,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, -placement.pos.y + 0.04, 3.5);
    glow.renderOrder = 2;
    group.add(glow);
    slot.glow = glow;
  };
  img.src = url;
}

slotPlacements().forEach((placement, index) => buildSlot(index, placement));

// --- Floating dust motes ---
const DUST_COUNT = 240;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST_COUNT * 3);
for (let i = 0; i < DUST_COUNT; i += 1) {
  dustPos[i * 3] = (Math.random() - 0.5) * NAVE_HALF_W * 1.8;
  dustPos[i * 3 + 1] = 0.5 + Math.random() * (NAVE_H - 2);
  dustPos[i * 3 + 2] = NAVE_FRONT + 2 + Math.random() * (NAVE_BACK - NAVE_FRONT - 4);
}
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({
    color: 0xffe9c0,
    size: 0.055,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
scene.add(dust);

// --- Camera: auto tour + drag to look + tap to focus a window ---
const lookSmooth = new THREE.Vector3(0, 4, -6);
const posGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
let tourT = 0;
let userYaw = 0;
let userPitch = 0;
let lastInteract = -Infinity;
let focusIndex = -1;

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let pointerDown = null;

canvas.addEventListener("pointerdown", (event) => {
  pointerDown = {
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    t: performance.now(),
    moved: 0,
  };
  lastInteract = performance.now();
});
canvas.addEventListener("pointermove", (event) => {
  if (!pointerDown) return;
  const dx = event.clientX - pointerDown.lastX;
  const dy = event.clientY - pointerDown.lastY;
  pointerDown.lastX = event.clientX;
  pointerDown.lastY = event.clientY;
  pointerDown.moved += Math.abs(dx) + Math.abs(dy);
  if (focusIndex < 0) {
    userYaw -= dx * 0.0035;
    userPitch = Math.max(-0.5, Math.min(0.6, userPitch - dy * 0.0025));
  }
  lastInteract = performance.now();
});
window.addEventListener("pointerup", (event) => {
  if (!pointerDown) return;
  const wasTap = pointerDown.moved < 8 && performance.now() - pointerDown.t < 500;
  pointerDown = null;
  lastInteract = performance.now();
  if (!wasTap) return;

  pointerNDC.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  const hit = hits[0];
  if (hit && slots[hit.object.userData.slotIndex]?.filled) {
    focusWindow(hit.object.userData.slotIndex);
  } else if (focusIndex >= 0) {
    unfocusWindow();
  }
});

function focusWindow(index) {
  focusIndex = index;
  const slot = slots[index];
  els.captionName.textContent = slot.name || `Artist ${index + 1}`;
  els.captionSlot.textContent = `Stained-glass window ${index + 1} of ${SLOT_TOTAL}`;
  els.caption.hidden = false;
  els.hintText.textContent = "Tap anywhere else to keep exploring";
}

function unfocusWindow() {
  focusIndex = -1;
  els.caption.hidden = true;
  els.hintText.textContent = "Tap a glowing window to admire it · drag to look around";
}

els.captionClose.addEventListener("click", unfocusWindow);

// --- Export a standalone snapshot for parents to view from home. ---
// A snapshot is just this same page's HTML with the current window data baked
// into a <script> tag ahead of gallery.js (see the data-loading block up
// top), so it needs no localStorage of its own — upload it anywhere on the
// same site (next to gallery.js) and share the link. Exporting from a
// snapshot is hidden: re-exporting an already-baked copy would just embed
// the same frozen data again under a new name.
if (window.__GALLERY_SNAPSHOT__ && els.exportBtn) {
  els.exportBtn.hidden = true;
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export"
  );
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function exportGallerySnapshot() {
  const input = window.prompt(
    "這次夏令營梯次的名稱？（會顯示在檔名與標題上）",
    "Season 1",
  );
  if (input === null) return;
  const title = input.trim() || "Venezia Glass Gallery";

  let html;
  try {
    const res = await fetch("./gallery.html");
    html = await res.text();
  } catch (error) {
    window.alert("匯出失敗：無法讀取 gallery.html。");
    return;
  }

  // Escape "<" so a stray "</script>" inside base64 art data can't break out
  // of the tag early.
  const dataJson = JSON.stringify(saved).replace(/</g, "\\u003c");
  const dataScript = `<script>window.__GALLERY_SNAPSHOT__ = ${dataJson};</script>\n    `;
  const escapedTitle = escapeHtml(title);

  html = html
    .replace(
      '<script type="module" src="./gallery.js"></script>',
      `${dataScript}<script type="module" src="./gallery.js"></script>`,
    )
    .replace(
      "<title>Venezia Glass Gallery</title>",
      `<title>${escapedTitle} — Venezia Glass Gallery</title>`,
    )
    .replace("<p>Summer Camp &middot; Italy Unit</p>", `<p>${escapedTitle}</p>`)
    // Parents don't need a way back into the live class game.
    .replace(/\s*<a class="back-link"[^>]*>[^<]*<\/a>/, "");

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `venezia-gallery-${slugify(title)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

if (els.exportBtn) {
  els.exportBtn.addEventListener("click", () => {
    exportGallerySnapshot().catch(() => window.alert("匯出失敗，請再試一次。"));
  });
}

const slotNormal = new THREE.Vector3();
const slotWorld = new THREE.Vector3();

function updateCamera(dt) {
  const now = performance.now();
  if (focusIndex >= 0) {
    const slot = slots[focusIndex];
    slot.art.getWorldPosition(slotWorld);
    slotNormal.set(Math.sin(slot.group.rotation.y), 0, Math.cos(slot.group.rotation.y));
    posGoal.copy(slotWorld).addScaledVector(slotNormal, 5.2);
    posGoal.y = Math.max(2.6, slotWorld.y - 0.7);
    lookGoal.copy(slotWorld);
    camera.position.lerp(posGoal, 1 - Math.pow(0.06, dt));
    lookSmooth.lerp(lookGoal, 1 - Math.pow(0.02, dt));
  } else {
    const auto = now - lastInteract > 8000;
    tourT += dt * (auto ? 1 : 0.12);
    if (auto) {
      userYaw *= 0.985;
      userPitch *= 0.985;
    }
    const yaw = Math.sin(tourT * 0.021) * 0.62 + userYaw;
    const pitch = 0.08 + userPitch;
    posGoal.set(
      Math.sin(tourT * 0.03) * 2.0,
      3.4,
      -8.5 + Math.sin(tourT * 0.024) * 13.0,
    );
    lookGoal
      .set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
      .multiplyScalar(10)
      .add(posGoal);
    camera.position.lerp(posGoal, 1 - Math.pow(0.1, dt));
    lookSmooth.lerp(lookGoal, 1 - Math.pow(0.02, dt));
  }
  camera.lookAt(lookSmooth);
}

// --- Resize / loop ---
let lastW = 0;
let lastH = 0;
function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  if (width === lastW && height === lastH) return;
  lastW = width;
  lastH = height;
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let prevNow = 0;
function frame(now) {
  const dt = Math.min(0.05, prevNow ? (now - prevNow) / 1000 : 0.016);
  prevNow = now;
  const time = now / 1000;

  dust.rotation.y = time * 0.006;
  dust.position.y = Math.sin(time * 0.18) * 0.18;

  // Gentle breathing of the light shafts.
  slots.forEach((slot, i) => {
    if (slot.shaft) slot.shaft.material.opacity = 0.2 + Math.sin(time * 0.6 + i) * 0.05;
    if (slot.glow) slot.glow.material.opacity = 0.34 + Math.sin(time * 0.6 + i) * 0.09;
  });

  updateCamera(dt);
  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
