const camera = document.querySelector("#camera");
const glassCanvas = document.querySelector("#glassCanvas");
const analysisCanvas = document.querySelector("#analysisCanvas");
const glass = glassCanvas.getContext("2d", { alpha: false });
const analysis = analysisCanvas.getContext("2d", { willReadFrequently: true });

const els = {
  score: document.querySelector("#score"),
  round: document.querySelector("#round"),
  missionTag: document.querySelector("#missionTag"),
  missionTitle: document.querySelector("#missionTitle"),
  missionHint: document.querySelector("#missionHint"),
  spokenLine: document.querySelector("#spokenLine"),
  redMeter: document.querySelector("#redMeter"),
  blueMeter: document.querySelector("#blueMeter"),
  goldMeter: document.querySelector("#goldMeter"),
  lightMeter: document.querySelector("#lightMeter"),
  notice: document.querySelector("#cameraNotice"),
  sparkLayer: document.querySelector("#sparkLayer"),
  stage: document.querySelector(".stage"),
  startCamera: document.querySelector("#startCamera"),
  startGame: document.querySelector("#startGame"),
  passMission: document.querySelector("#passMission"),
  nextMission: document.querySelector("#nextMission"),
  fullscreen: document.querySelector("#fullscreen"),
  testPanel: document.querySelector("#testPanel"),
  templateChooser: document.querySelector("#templateChooser"),
  templateGrid: document.querySelector("#templateGrid"),
  templateOverlay: document.querySelector("#templateOverlay"),
};

const testMode = new URLSearchParams(window.location.search).has("test");

const templates = [
  { id: "gem-window", name: "Gem Window", theme: "shapes", src: "./assets/templates/gem-window.png" },
  { id: "venice-simple", name: "Venice Gondola", theme: "Venice", src: "./assets/templates/venice-simple.png" },
  { id: "circle-diamond", name: "Circle Diamond", theme: "shapes", src: "./assets/templates/circle-diamond.png" },
  { id: "peace-dove", name: "Peace Dove", theme: "dove", src: "./assets/templates/peace-dove.png" },
  { id: "venice-bridge", name: "Venice Bridge", theme: "Venice", src: "./assets/templates/venice-bridge.png" },
  { id: "rose-window", name: "Rose Window", theme: "rose", src: "./assets/templates/rose-window.png" },
  { id: "italy-icons", name: "Italy Icons", theme: "Italy", src: "./assets/templates/italy-icons.png" },
];

const missions = [
  {
    tag: "Mission 1",
    title: "Align your window",
    hint: "Put the colored line art inside the glowing square. Let the black lines show clearly.",
    line: "I see the lines.",
    test: (stats) => stats.ink > 0.09 && stats.light > 0.26,
    spark: "#f8fbff",
  },
  {
    tag: "Mission 2",
    title: "Show the border colors",
    hint: "Move the artwork so the outside frame has color, not only white paper.",
    line: "This is the border.",
    test: (stats) => stats.borderColor > 0.18,
    spark: "#54a8ff",
  },
  {
    tag: "Mission 3",
    title: "Light up the main picture",
    hint: "Fill the center picture with color and hold it near the camera.",
    line: "I see the picture.",
    test: (stats) => stats.centerColor > 0.2,
    spark: "#ffd166",
  },
  {
    tag: "Mission 4",
    title: "Make Italy colors",
    hint: "Try to show green, white/bright, and red or another strong color contrast.",
    line: "Italy has green, white, and red.",
    test: (stats) => stats.italyColor > 0.28 || stats.colorVariety >= 3,
    spark: "#43d18f",
  },
  {
    tag: "Mission 5",
    title: "Let light pass through",
    hint: "Hold the colored artwork toward a brighter place so the window glows.",
    line: "Light goes through color.",
    test: (stats) => stats.light > 0.58 && stats.saturation > 0.18,
    spark: "#ffffff",
  },
  {
    tag: "Finale",
    title: "Museum pose",
    hint: "Hold still. The class will see your finished stained-glass window on the big screen.",
    line: "This is my glass art.",
    test: (stats) => stats.stillness > 0.82 && stats.ink > 0.06,
    spark: "#f9f8e8",
  },
];

const state = {
  cameraReady: false,
  demoTime: 0,
  lastFrame: null,
  currentMission: -1,
  score: 0,
  completed: new Set(),
  successCooldown: 0,
  audio: null,
  selectedTemplate: templates[0],
  lastStats: {
    ink: 0,
    borderColor: 0,
    centerColor: 0,
    italyColor: 0,
    red: 0,
    blue: 0,
    gold: 0,
    light: 0,
    saturation: 0,
    colorVariety: 0,
    stillness: 0,
  },
  testSignal: null,
  testSignalUntil: 0,
};

const testSignals = {
  align: { ink: 0.18, borderColor: 0.06, centerColor: 0.08, italyColor: 0.1, red: 0.02, blue: 0.02, gold: 0.02, light: 0.38, saturation: 0.16, colorVariety: 1, stillness: 0.56 },
  border: { ink: 0.17, borderColor: 0.34, centerColor: 0.11, italyColor: 0.18, red: 0.08, blue: 0.12, gold: 0.06, light: 0.42, saturation: 0.36, colorVariety: 2, stillness: 0.58 },
  center: { ink: 0.16, borderColor: 0.2, centerColor: 0.36, italyColor: 0.22, red: 0.08, blue: 0.08, gold: 0.12, light: 0.46, saturation: 0.44, colorVariety: 2, stillness: 0.62 },
  italy: { ink: 0.15, borderColor: 0.24, centerColor: 0.3, italyColor: 0.42, red: 0.16, blue: 0.04, gold: 0.04, light: 0.52, saturation: 0.5, colorVariety: 3, stillness: 0.64 },
  light: { ink: 0.13, borderColor: 0.22, centerColor: 0.28, italyColor: 0.32, red: 0.08, blue: 0.08, gold: 0.1, light: 0.76, saturation: 0.32, colorVariety: 3, stillness: 0.68 },
  still: { ink: 0.16, borderColor: 0.22, centerColor: 0.28, italyColor: 0.3, red: 0.08, blue: 0.08, gold: 0.08, light: 0.54, saturation: 0.34, colorVariety: 3, stillness: 0.95 },
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = glassCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (glassCanvas.width !== width || glassCanvas.height !== height) {
    glassCanvas.width = width;
    glassCanvas.height = height;
  }

  analysisCanvas.width = 180;
  analysisCanvas.height = 180;
}

function renderTemplates() {
  els.templateGrid.innerHTML = templates
    .map(
      (template) => `
        <button class="template-card" type="button" data-template-id="${template.id}">
          <img src="${template.src}" alt="${template.name}" />
          <span>
            <strong>${template.name}</strong>
            <span>${template.theme}</span>
          </span>
        </button>
      `,
    )
    .join("");
}

function selectTemplate(id) {
  state.selectedTemplate = templates.find((template) => template.id === id) || templates[0];
  els.templateOverlay.src = state.selectedTemplate.src;
  els.templateOverlay.alt = `${state.selectedTemplate.name} line art overlay`;
  els.templateChooser.classList.add("is-hidden");
  els.notice.innerHTML = `Template: <strong>${state.selectedTemplate.name}</strong>. Tap <strong>Camera</strong>, then hold the colored paper inside the glowing frame.`;
  els.missionTag.textContent = "Template";
  els.missionTitle.textContent = state.selectedTemplate.name;
  els.missionHint.textContent = "Press Start when the student is ready to show the finished artwork.";
  els.spokenLine.textContent = "I made a glass window.";
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    camera.srcObject = stream;
    await camera.play();
    state.cameraReady = true;
    els.notice.classList.add("is-hidden");
  } catch (error) {
    els.notice.innerHTML = "Camera is not available. Demo colors are running, so you can still test the game screen.";
    state.cameraReady = false;
  }
}

function startGame() {
  state.currentMission = 0;
  state.score = 0;
  state.completed.clear();
  state.successCooldown = 0;
  state.lastFrame = null;
  state.lastStats = {
    ink: 0,
    borderColor: 0,
    centerColor: 0,
    italyColor: 0,
    red: 0,
    blue: 0,
    gold: 0,
    light: 0,
    saturation: 0,
    colorVariety: 0,
    stillness: 0,
  };
  updateMission();
  updateScore();
  unlockAudio();
}

function nextMission() {
  if (state.currentMission < 0) {
    startGame();
    return;
  }

  state.currentMission = (state.currentMission + 1) % missions.length;
  state.successCooldown = 0;
  els.stage.classList.remove("is-success");
  updateMission();
}

function passMission() {
  completeMission(true);
}

function updateMission() {
  const mission = missions[state.currentMission];
  if (!mission) return;

  els.missionTag.textContent = `${mission.tag} - ${state.selectedTemplate.name}`;
  els.missionTitle.textContent = mission.title;
  els.missionHint.textContent = mission.hint;
  els.spokenLine.textContent = mission.line;
  els.round.textContent = `${state.currentMission + 1}/${missions.length}`;
}

function updateScore() {
  els.score.textContent = String(state.score);
  els.round.textContent =
    state.currentMission >= 0 ? `${state.currentMission + 1}/${missions.length}` : `0/${missions.length}`;
}

function unlockAudio() {
  if (state.audio) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  state.audio = new AudioContext();
}

function playChime() {
  if (!state.audio) return;
  const now = state.audio.currentTime;
  const notes = [523.25, 659.25, 783.99];

  notes.forEach((frequency, index) => {
    const osc = state.audio.createOscillator();
    const gain = state.audio.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + index * 0.08);
    gain.gain.linearRampToValueAtTime(0.09, now + index * 0.08 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.34);
    osc.connect(gain);
    gain.connect(state.audio.destination);
    osc.start(now + index * 0.08);
    osc.stop(now + index * 0.08 + 0.36);
  });
}

function completeMission(manual = false) {
  if (state.currentMission < 0) return;
  if (state.completed.has(state.currentMission) && !manual) return;

  state.completed.add(state.currentMission);
  state.score += manual ? 50 : 100;
  state.successCooldown = 70;
  els.stage.classList.add("is-success");
  updateScore();
  playChime();
  burstSparks(missions[state.currentMission].spark);

  window.setTimeout(() => {
    if (state.currentMission === missions.length - 1) {
      els.missionTag.textContent = "Bravo";
      els.missionTitle.textContent = "Your window is in the museum";
      els.missionHint.textContent = "Say it together: This is my glass art.";
      els.spokenLine.textContent = "Italy has art. I can make it.";
    } else {
      nextMission();
    }
  }, 1300);
}

function burstSparks(color) {
  const count = 28;
  const rect = els.sparkLayer.getBoundingClientRect();
  for (let i = 0; i < count; i += 1) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.left = `${rect.width * (0.28 + Math.random() * 0.44)}px`;
    spark.style.top = `${rect.height * (0.32 + Math.random() * 0.26)}px`;
    spark.style.setProperty("--spark-color", color);
    spark.style.setProperty("--spark-x", `${(Math.random() - 0.5) * 360}px`);
    spark.style.setProperty("--spark-y", `${(Math.random() - 0.5) * 240}px`);
    els.sparkLayer.appendChild(spark);
    spark.addEventListener("animationend", () => spark.remove(), { once: true });
  }
}

function drawCameraToAnalysis() {
  const side = Math.min(camera.videoWidth || 1, camera.videoHeight || 1);
  const sx = ((camera.videoWidth || side) - side) / 2;
  const sy = ((camera.videoHeight || side) - side) / 2;
  analysis.save();
  analysis.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
  analysis.translate(analysisCanvas.width, 0);
  analysis.scale(-1, 1);
  analysis.drawImage(camera, sx, sy, side, side, 0, 0, analysisCanvas.width, analysisCanvas.height);
  analysis.restore();
}

function drawDemoToAnalysis(time) {
  const width = analysisCanvas.width;
  const height = analysisCanvas.height;
  const hue = (time * 28) % 360;
  const gradient = analysis.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue}, 84%, 58%)`);
  gradient.addColorStop(0.34, `hsl(${(hue + 92) % 360}, 80%, 56%)`);
  gradient.addColorStop(0.7, `hsl(${(hue + 188) % 360}, 76%, 54%)`);
  gradient.addColorStop(1, `hsl(${(hue + 266) % 360}, 82%, 62%)`);
  analysis.fillStyle = gradient;
  analysis.fillRect(0, 0, width, height);

  analysis.globalAlpha = 0.7;
  for (let i = 0; i < 9; i += 1) {
    analysis.fillStyle = `hsl(${(hue + i * 36) % 360}, 92%, 62%)`;
    analysis.beginPath();
    analysis.arc(
      width * ((i % 3) / 2) + Math.sin(time + i) * 18,
      height * (Math.floor(i / 3) / 2) + Math.cos(time * 0.8 + i) * 12,
      18 + Math.sin(time + i) * 8,
      0,
      Math.PI * 2,
    );
    analysis.fill();
  }
  analysis.globalAlpha = 1;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    if (max === g) h = (b - r) / d + 2;
    if (max === b) h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s, l };
}

function analyzeFrame() {
  const frame = analysis.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
  const data = frame.data;
  const width = analysisCanvas.width;
  const height = analysisCanvas.height;
  let ink = 0;
  let borderColor = 0;
  let centerColor = 0;
  let italyColor = 0;
  let red = 0;
  let blue = 0;
  let gold = 0;
  let green = 0;
  let violet = 0;
  let bright = 0;
  let sat = 0;
  let motion = 0;
  let samples = 0;
  let borderSamples = 0;
  let centerSamples = 0;

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const { h, s, l } = rgbToHsl(r, g, b);
      const nx = x / width;
      const ny = y / height;
      const inBorder = nx < 0.18 || nx > 0.82 || ny < 0.18 || ny > 0.82;
      const inCenter = nx > 0.28 && nx < 0.72 && ny > 0.28 && ny < 0.72;

      if (l < 0.18) ink += 1;

      if (s > 0.23 && l > 0.16) {
        if (h < 24 || h > 338) red += 1;
        if (h >= 190 && h <= 255) blue += 1;
        if (h >= 32 && h <= 72) gold += 1;
        if (h >= 88 && h <= 160) green += 1;
        if (h >= 268 && h <= 324) violet += 1;
        if (inBorder) borderColor += 1;
        if (inCenter) centerColor += 1;
      }

      if ((h >= 88 && h <= 160 && s > 0.22) || ((h < 24 || h > 338) && s > 0.22) || l > 0.78) {
        italyColor += 1;
      }

      if (inBorder) borderSamples += 1;
      if (inCenter) centerSamples += 1;
      bright += l;
      sat += s;
      samples += 1;

      if (state.lastFrame) {
        motion +=
          Math.abs(r - state.lastFrame.data[i]) +
          Math.abs(g - state.lastFrame.data[i + 1]) +
          Math.abs(b - state.lastFrame.data[i + 2]);
      }
    }
  }

  state.lastFrame = frame;

  const colorBuckets = [red, blue, gold, green, violet].filter((value) => value / samples > 0.04).length;
  return {
    ink: ink / samples,
    borderColor: borderColor / Math.max(1, borderSamples),
    centerColor: centerColor / Math.max(1, centerSamples),
    italyColor: italyColor / samples,
    red: red / samples,
    blue: blue / samples,
    gold: gold / samples,
    light: bright / samples,
    saturation: sat / samples,
    colorVariety: colorBuckets,
    stillness: state.lastFrame ? Math.max(0, 1 - motion / (samples * 74)) : 0,
  };
}

function updateMeters(stats) {
  els.redMeter.style.width = `${Math.min(100, stats.ink * 520)}%`;
  els.blueMeter.style.width = `${Math.min(100, stats.borderColor * 330)}%`;
  els.goldMeter.style.width = `${Math.min(100, stats.centerColor * 330)}%`;
  els.lightMeter.style.width = `${Math.min(100, stats.light * 125)}%`;
}

function applyTestSignal(name) {
  if (!testSignals[name]) return;
  if (state.currentMission < 0) startGame();
  state.testSignal = name;
  state.testSignalUntil = performance.now() + 1100;
  state.lastStats = { ...testSignals[name] };
  updateMeters(state.lastStats);
  checkMission(state.lastStats);
}

function mixStats(next) {
  if (testMode && state.testSignal && performance.now() < state.testSignalUntil) {
    return { ...testSignals[state.testSignal] };
  }

  if (testMode && state.testSignal && performance.now() >= state.testSignalUntil) {
    state.testSignal = null;
  }

  const previous = state.lastStats;
  const mixed = {};
  Object.keys(previous).forEach((key) => {
    mixed[key] = previous[key] * 0.74 + next[key] * 0.26;
  });
  mixed.colorVariety = next.colorVariety;
  state.lastStats = mixed;
  return mixed;
}

function drawGlass(stats, time) {
  const width = glassCanvas.width;
  const height = glassCanvas.height;
  const cell = Math.max(48, Math.floor(Math.min(width, height) / 8));
  const cols = Math.ceil(width / cell) + 1;
  const rows = Math.ceil(height / cell) + 1;
  const image = analysis.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);

  glass.fillStyle = "#071018";
  glass.fillRect(0, 0, width, height);

  for (let y = -1; y < rows; y += 1) {
    for (let x = -1; x < cols; x += 1) {
      const cx = x * cell + cell / 2;
      const cy = y * cell + cell / 2;
      const sampleX = Math.max(0, Math.min(analysisCanvas.width - 1, Math.floor((cx / width) * analysisCanvas.width)));
      const sampleY = Math.max(0, Math.min(analysisCanvas.height - 1, Math.floor((cy / height) * analysisCanvas.height)));
      const idx = (sampleY * analysisCanvas.width + sampleX) * 4;
      const r = image.data[idx];
      const g = image.data[idx + 1];
      const b = image.data[idx + 2];
      const glow = 0.62 + stats.light * 0.55;
      const wobble = Math.sin(time * 1.4 + x * 0.9 + y * 0.7) * cell * 0.1;

      glass.beginPath();
      glass.moveTo(cx, cy - cell * 0.62 + wobble);
      glass.lineTo(cx + cell * 0.58, cy - cell * 0.25);
      glass.lineTo(cx + cell * 0.5, cy + cell * 0.45 + wobble);
      glass.lineTo(cx - cell * 0.14, cy + cell * 0.62);
      glass.lineTo(cx - cell * 0.62, cy + cell * 0.16 - wobble);
      glass.closePath();
      glass.fillStyle = `rgba(${Math.min(255, r * glow + 14)}, ${Math.min(255, g * glow + 14)}, ${Math.min(255, b * glow + 14)}, 0.9)`;
      glass.fill();
      glass.strokeStyle = "rgba(245, 248, 255, 0.35)";
      glass.lineWidth = Math.max(2, width / 520);
      glass.stroke();
    }
  }

  const beam = glass.createRadialGradient(width * 0.5, height * 0.44, 10, width * 0.5, height * 0.44, width * 0.62);
  beam.addColorStop(0, `rgba(255, 255, 245, ${0.18 + stats.light * 0.18})`);
  beam.addColorStop(0.55, `rgba(255, 255, 245, ${0.04 + stats.light * 0.07})`);
  beam.addColorStop(1, "rgba(255, 255, 245, 0)");
  glass.fillStyle = beam;
  glass.fillRect(0, 0, width, height);

  glass.strokeStyle = "rgba(255, 255, 255, 0.5)";
  glass.lineWidth = Math.max(3, width / 360);
  for (let i = 0; i < 9; i += 1) {
    const pos = (i + 1) / 10;
    glass.beginPath();
    glass.moveTo(width * pos + Math.sin(time + i) * 14, 0);
    glass.lineTo(width * (1 - pos * 0.46), height);
    glass.stroke();
  }
}

function checkMission(stats) {
  if (state.currentMission < 0 || state.successCooldown > 0) return;
  if (testMode && !state.testSignal) return;
  if (!state.cameraReady && !testMode) return;
  const mission = missions[state.currentMission];
  if (mission.test(stats)) completeMission();
}

function frame(now) {
  resize();
  const time = now / 1000;

  if (state.cameraReady && camera.readyState >= 2) {
    drawCameraToAnalysis();
  } else {
    state.demoTime += 0.016;
    drawDemoToAnalysis(time);
  }

  const stats = mixStats(analyzeFrame());
  updateMeters(stats);
  drawGlass(stats, time);

  if (state.successCooldown > 0) {
    state.successCooldown -= 1;
    if (state.successCooldown <= 0) els.stage.classList.remove("is-success");
  }

  checkMission(stats);
  requestAnimationFrame(frame);
}

els.startCamera.addEventListener("click", () => {
  unlockAudio();
  startCamera();
});
els.startGame.addEventListener("click", startGame);
els.passMission.addEventListener("click", passMission);
els.nextMission.addEventListener("click", nextMission);
els.fullscreen.addEventListener("click", () => {
  unlockAudio();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

els.templateGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-template-id]");
  if (!button) return;
  selectTemplate(button.dataset.templateId);
});

if (testMode) {
  els.testPanel.hidden = false;
  els.notice.innerHTML = "Test Mode is on. Choose a template, tap Start, then use the test buttons to simulate the camera.";
  els.testPanel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-test-signal]");
    if (!button) return;
    unlockAudio();
    applyTestSignal(button.dataset.testSignal);
  });
}

window.addEventListener("resize", resize);
renderTemplates();
selectTemplate(templates[0].id);
els.templateChooser.classList.remove("is-hidden");
resize();
updateScore();
requestAnimationFrame(frame);
