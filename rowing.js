const camera = document.querySelector("#camera");
const gameCanvas = document.querySelector("#gameCanvas");
const analysisCanvas = document.querySelector("#analysisCanvas");
const ctx = gameCanvas.getContext("2d");
const analysis = analysisCanvas.getContext("2d", { willReadFrequently: true });

const els = {
  score: document.querySelector("#score"),
  gate: document.querySelector("#gate"),
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
  startGame: document.querySelector("#startGame"),
  resetGame: document.querySelector("#resetGame"),
  passGate: document.querySelector("#passGate"),
  fullscreen: document.querySelector("#fullscreen"),
  testPanel: document.querySelector("#testPanel"),
};

const testMode = new URLSearchParams(window.location.search).has("test");

const gates = [
  { name: "Ciao Gate", x: 0.5, width: 0.26, y: 90, line: "Ciao, Venice!" },
  { name: "Rialto Bridge", x: 0.35, width: 0.22, y: 230, line: "I row under the bridge." },
  { name: "Glass Window", x: 0.68, width: 0.24, y: 380, line: "I see colorful glass." },
  { name: "Pizza Stop", x: 0.48, width: 0.28, y: 535, line: "Italy has pizza." },
  { name: "Museum Dock", x: 0.58, width: 0.24, y: 700, line: "I made it to the museum!" },
];

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
  balance: 1,
  lastFrame: null,
  audio: null,
  testBoost: { left: 0, right: 0, brake: 0 },
  successCooldown: 0,
  shakeCooldown: 0,
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = gameCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (gameCanvas.width !== width || gameCanvas.height !== height) {
    gameCanvas.width = width;
    gameCanvas.height = height;
  }

  analysisCanvas.width = 96;
  analysisCanvas.height = 72;
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
    camera.srcObject = stream;
    await camera.play();
    state.cameraReady = true;
    els.notice.classList.add("is-hidden");
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
  state.speed = 0.01;
  state.turn = 0;
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
  updateMission(true);
  updateHud();
  els.notice.innerHTML = "Tap Camera, then Start. Row with big left-right paddle motions in front of the iPad.";
  els.notice.classList.remove("is-hidden");
}

function passGate() {
  if (!state.running) startGame();
  completeGate(true);
}

function updateMission(reset = false) {
  if (reset) {
    els.missionTag.textContent = "Ready";
    els.missionTitle.textContent = "Venice Row Quest";
    els.missionHint.textContent = "Move your arms like rowing. Left and right motion steers the gondola through the canal gates.";
    els.spokenLine.textContent = "Row, row, row!";
    return;
  }

  const gate = gates[state.gateIndex];
  if (!gate) {
    els.missionTag.textContent = "Bravo";
    els.missionTitle.textContent = "You reached the museum dock";
    els.missionHint.textContent = "Take a museum pose with your stained-glass work.";
    els.spokenLine.textContent = "I made it to the museum!";
    return;
  }

  els.missionTag.textContent = `Gate ${state.gateIndex + 1}/${gates.length}`;
  els.missionTitle.textContent = gate.name;
  els.missionHint.textContent = "Row forward and steer the gondola through the glowing opening.";
  els.spokenLine.textContent = gate.line;
}

function updateHud() {
  els.score.textContent = String(state.score);
  els.gate.textContent = `${Math.min(state.gateIndex, gates.length)}/${gates.length}`;
  els.leftMeter.style.width = `${Math.min(100, state.rowLeft * 160)}%`;
  els.rightMeter.style.width = `${Math.min(100, state.rowRight * 160)}%`;
  els.speedMeter.style.width = `${Math.min(100, state.speed * 520)}%`;
  els.balanceMeter.style.width = `${Math.min(100, state.balance * 100)}%`;
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
  const gate = gates[state.gateIndex];
  if (!gate) return;
  state.score += manual ? 50 : 100;
  state.gateIndex += 1;
  state.successCooldown = 70;
  state.stageFlash = gate.name;
  state.progress += 24;
  state.speed = Math.max(state.speed, 0.035);
  els.stage.classList.add("is-success");
  playChime();
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
  if (state.cameraReady && camera.readyState >= 2) {
    analysis.save();
    analysis.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
    analysis.translate(analysisCanvas.width, 0);
    analysis.scale(-1, 1);
    analysis.drawImage(camera, 0, 0, analysisCanvas.width, analysisCanvas.height);
    analysis.restore();
    return;
  }

  const width = analysisCanvas.width;
  const height = analysisCanvas.height;
  analysis.fillStyle = "#132b35";
  analysis.fillRect(0, 0, width, height);
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
  const scale = 1 / 52;
  return {
    left: Math.min(1, (left / Math.max(1, leftSamples)) * scale),
    right: Math.min(1, (right / Math.max(1, rightSamples)) * scale),
  };
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

  state.rowLeft = state.rowLeft * 0.78 + left * 0.22;
  state.rowRight = state.rowRight * 0.78 + right * 0.22;
  const rowPower = Math.min(1, state.rowLeft + state.rowRight);
  const steering = (state.rowRight - state.rowLeft) * 0.035;

  if (state.running) {
    state.speed = Math.min(0.22, state.speed * 0.985 + rowPower * 0.012);
    state.turn = state.turn * 0.8 + steering;
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
    const half = gate.width / 2;
    if (state.boatX >= gate.x - half && state.boatX <= gate.x + half) {
      completeGate();
    } else if (state.shakeCooldown <= 0) {
      state.score = Math.max(0, state.score - 10);
      state.speed *= 0.45;
      state.progress = gate.y - 26;
      state.shakeCooldown = 55;
      els.missionHint.textContent = "You missed the opening. Row and steer back to the glowing gate.";
      updateHud();
    }
  }

  if (state.gateIndex >= gates.length) {
    state.running = false;
    state.speed *= 0.9;
  }
}

function worldToScreenY(worldY, height) {
  return height * 0.72 - (worldY - state.progress) * 1.55;
}

function drawScene(time) {
  const width = gameCanvas.width;
  const height = gameCanvas.height;
  ctx.clearRect(0, 0, width, height);

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#102230");
  sky.addColorStop(0.42, "#19414a");
  sky.addColorStop(1, "#063241");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  drawBuildings(width, height, time);
  drawWater(width, height, time);
  drawGates(width, height, time);
  drawBoat(width, height, time);
  drawMotionZones(width, height);
}

function drawBuildings(width, height, time) {
  const horizon = height * 0.28;
  ctx.fillStyle = "rgba(255, 209, 102, 0.18)";
  ctx.beginPath();
  ctx.arc(width * 0.78, height * 0.14, height * 0.08, 0, Math.PI * 2);
  ctx.fill();

  for (let side = 0; side < 2; side += 1) {
    const dir = side === 0 ? -1 : 1;
    const baseX = side === 0 ? 0 : width;
    for (let i = 0; i < 6; i += 1) {
      const depth = i / 6;
      const buildingW = width * (0.08 + depth * 0.025);
      const buildingH = height * (0.18 + depth * 0.12);
      const x = baseX + dir * (i * buildingW * 0.72);
      const y = horizon + depth * height * 0.18;
      ctx.fillStyle = i % 2 ? "#b86d55" : "#d8a661";
      ctx.fillRect(side === 0 ? x : x - buildingW, y, buildingW, buildingH);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      for (let w = 0; w < 3; w += 1) {
        ctx.fillRect((side === 0 ? x : x - buildingW) + buildingW * (0.2 + w * 0.24), y + buildingH * 0.24, buildingW * 0.1, buildingH * 0.22);
      }
    }
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = Math.max(2, width / 420);
  for (let i = 0; i < 7; i += 1) {
    const y = horizon + i * height * 0.065 + Math.sin(time + i) * 3;
    ctx.beginPath();
    ctx.moveTo(width * 0.18, y);
    ctx.quadraticCurveTo(width * 0.5, y + height * 0.04, width * 0.82, y);
    ctx.stroke();
  }
}

function drawWater(width, height, time) {
  const canal = ctx.createLinearGradient(0, height * 0.28, 0, height);
  canal.addColorStop(0, "#1d7181");
  canal.addColorStop(1, "#083440");
  ctx.fillStyle = canal;
  ctx.beginPath();
  ctx.moveTo(width * 0.34, height * 0.26);
  ctx.lineTo(width * 0.66, height * 0.26);
  ctx.lineTo(width * 0.96, height);
  ctx.lineTo(width * 0.04, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(2, width / 640);
  for (let i = 0; i < 18; i += 1) {
    const y = height * 0.34 + i * height * 0.045;
    const wave = Math.sin(time * 1.8 + i) * width * 0.018;
    ctx.beginPath();
    ctx.moveTo(width * 0.18, y);
    ctx.bezierCurveTo(width * 0.34 + wave, y - 12, width * 0.66 - wave, y + 12, width * 0.82, y);
    ctx.stroke();
  }
}

function drawGates(width, height, time) {
  gates.forEach((gate, index) => {
    const y = worldToScreenY(gate.y, height);
    if (y < -120 || y > height + 120) return;
    const laneCenter = width * (0.2 + gate.x * 0.6);
    const laneWidth = width * gate.width * 0.62;
    const glow = index === state.gateIndex ? 0.85 : 0.34;

    ctx.save();
    ctx.globalAlpha = glow;
    ctx.strokeStyle = index === state.gateIndex ? "#ffd166" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(5, width / 160);
    ctx.beginPath();
    ctx.moveTo(laneCenter - laneWidth / 2, y);
    ctx.quadraticCurveTo(laneCenter, y - height * 0.12, laneCenter + laneWidth / 2, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 209, 102, 0.15)";
    ctx.fillRect(laneCenter - laneWidth / 2, y - 12, laneWidth, 24);
    ctx.restore();

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = `${Math.max(18, width / 48)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText(gate.name, laneCenter, y - height * 0.13);
  });
}

function drawBoat(width, height, time) {
  const x = width * (0.2 + state.boatX * 0.6);
  const y = height * 0.78;
  const boatW = Math.min(width, height) * 0.2;
  const boatH = boatW * 0.28;
  const lean = state.turn * 45;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, boatH * 0.72, boatW * 0.52, boatH * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#171116";
  ctx.beginPath();
  ctx.moveTo(-boatW * 0.55, -boatH * 0.08);
  ctx.quadraticCurveTo(0, boatH * 0.5, boatW * 0.58, -boatH * 0.08);
  ctx.quadraticCurveTo(boatW * 0.18, boatH * 0.95, -boatW * 0.5, boatH * 0.16);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = Math.max(3, width / 300);
  ctx.beginPath();
  ctx.moveTo(-boatW * 0.5, -boatH * 0.02);
  ctx.quadraticCurveTo(0, boatH * 0.34, boatW * 0.52, -boatH * 0.02);
  ctx.stroke();

  ctx.strokeStyle = "#f8fbff";
  ctx.lineWidth = Math.max(4, width / 220);
  ctx.beginPath();
  ctx.moveTo(boatW * 0.05, -boatH * 0.35);
  ctx.lineTo(boatW * 0.36, -boatH * 1.28 + Math.sin(time * 6) * 8);
  ctx.stroke();

  ctx.fillStyle = "#f8fbff";
  ctx.beginPath();
  ctx.arc(-boatW * 0.06, -boatH * 0.42, boatH * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-boatW * 0.12, -boatH * 0.32, boatW * 0.12, boatH * 0.46);

  ctx.restore();
}

function drawMotionZones(width, height) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#4da7ff";
  ctx.fillRect(0, 0, width * 0.18, height);
  ctx.fillStyle = "#16a36a";
  ctx.fillRect(width * 0.82, 0, width * 0.18, height);
  ctx.restore();
}

function frame(now) {
  resize();
  const time = now / 1000;

  drawCameraFrame();
  const motion = readMotion();
  applyControls(motion);
  checkGates();
  drawScene(time);
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

if (testMode) {
  els.testPanel.hidden = false;
  els.notice.innerHTML = "Test Mode is on. Tap Start, then use Left, Right, Row, Boost, and Brake to test the gondola.";
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
