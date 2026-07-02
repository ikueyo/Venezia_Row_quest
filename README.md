# Venice Row Quest 3D

A bright, iPad-friendly motion game for the Italy unit in **International Culture & Hands-on Crafts Camp**.

Students stand in front of the iPad camera and make big rowing motions. A live camera + sensor-skeleton preview (MediaPipe Pose) sits in the corner of the screen. The game tracks each wrist and steers a colorful 3D gondola down a wide Venice canal, through five glowing gates, to a **Basilica** at the end — where each student's stained-glass artwork is permanently installed into a church window.

The 3D scene is built with Three.js (plus its post-processing addons), loaded from jsDelivr via an **import map** declared in `index.html` / `gallery.html`:

```js
https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js
https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/
```

Pose tracking uses MediaPipe Tasks Vision (also from jsDelivr).

> Import maps require Safari 16.4+ / iPadOS 16.4+ (or any recent Chrome/Edge/Firefox).

## Rowing controls

- Row with **both arms** together → move **forward** (each stroke gives a surge, then the gondola glides).
- Row **only the right arm** → turn **left**.
- Row **only the left arm** → turn **right**.

The banks (houses, docks, moored boats) scroll toward you and recycle, so it feels like you are really moving forward. If MediaPipe Pose cannot load (offline), the game falls back to a simple left/right frame-difference motion detector, and the corner preview shows the camera without a skeleton.

## Visuals

The 3D scene runs through an **UnrealBloom + ACES filmic** post-processing chain, so the stained glass, gold trim and sun genuinely glow. The canal is set at **golden hour**: gradient sky dome, low sun, drifting clouds, sparkling water, oar-splash particles and a foam wake behind the gondola.

The canal is alive with (decorative, non-colliding) traffic: moored rowboats and **sailboats**, **oncoming gondolas** with gondoliers gliding along the banks, bobbing **fairway buoys**, and clusters of striped Venetian **mooring poles** (pali) near the docks.

## Stained-glass delivery quest

Each student holds their own stained-glass craft up to the camera (inside the dashed box in the corner preview) and taps **Scan**. The game captures:

- the **artwork** (center of the frame, 512px, un-mirrored so lettering reads correctly) → shown in a **preview card** with **Retake / Use it!** buttons and an optional **student name** field, then loaded as glowing cargo on the gondola, and
- the **student's face** (from the pose sensor) → shown as a round avatar on the rower.

The student then rows through the five canal gates to the **Basilica**. On arrival the camera **flies in toward the church**, the artwork **flies up, spins, and locks into the next empty church window**, bells ring, a beam of light pours from the window, and a banner shows the student's name. A small gold **nameplate** stays under the window.

### Permanent, sequential windows

- The church facade + bell tower hold **16 square window slots**.
- Each delivery fills the **next empty slot** and stays there; a gold frame marks where the next one will go.
- Filled windows (artwork **and** student names) are saved to the browser's **localStorage**, so they persist across page reloads on the same device/browser.

> Note: persistence is per-device / per-browser only. Sharing one church wall across multiple iPads would require a backend database.

## Art Gallery (gallery.html)

Tap the **🖼 button** (top-right) — or open `gallery.html` — to walk **inside the Basilica**: a 3D nave where every installed stained-glass window glows from within, with a tinted shaft of light, a pool of color on the marble floor, and the student's nameplate underneath. A rose window crowns the altar and dust motes float in the beams.

- The camera **tours the nave automatically**; drag to look around.
- **Tap a glowing window** to fly up to it and see the student's name; tap elsewhere to resume the tour.
- The gallery reads the same localStorage data as the game, so open it **on the same iPad / browser** that ran the deliveries.
- Great for the end-of-camp showcase: mirror the iPad to a projector and let it auto-tour.

## Admin panel (reset)

Tap the **⚙ gear** button (top-right) to open the admin panel. Enter the passcode and tap **Reset all windows** to clear every installed window and start over.

- Default passcode: `camp2026`
- Change it in `three-rowing.js` → `ADMIN_PASSWORD`.

## Audio

All audio files are optional — missing files are skipped automatically.

| Purpose | File | Behavior |
| --- | --- | --- |
| Rowing music | `assets/rowing-music.m4a` | Unlocks on the first button tap, stays alive silently, then fades in while rowing; tempo tracks rowing speed (**0.25×–1.5×**). |
| Basilica arrival music | `assets/gate-pass.mp3` | Plays when the gondola reaches the Basilica. Falls back to a built-in synth fanfare if the file is missing. |
| Gate spoken lines | `assets/lines/gate-1.mp3` … `gate-5.mp3` | One per gate, played when that gate is passed. See `assets/lines/README.txt`. |
| UI button + countdown sounds | `assets/ui/*.mp3` | Optional button-click and Start countdown clips. See `assets/ui/README.txt`. Built-in WebAudio beeps play if files are missing. |

Audio unlocks on the first button tap (Camera / Scan / Start), as required by mobile autoplay rules.

## Run Locally

Start a local web server **from this project folder**:

```powershell
python -m http.server 5173
```

Open:

```text
http://localhost:5173/index.html
```

Art gallery:

```text
http://localhost:5173/gallery.html
```

Direct test mode:

```text
http://localhost:5173/index.html?test=1
```

> If you start the server from a parent folder instead, prefix the paths with
> the folder name, e.g. `http://localhost:5173/Venezia_Row_quest/index.html?test=1`.

In test mode, tap Start, then tap **Left / Right / Row / Boost / Brake** to simulate camera motion in the 3D scene, or tap **Finish** to jump straight to the Basilica arrival (with a scanned artwork loaded, this plays the full install ceremony).

## Teacher Flow

1. Open the site on the iPad and tap **Camera** to allow camera access.
2. Mirror or project the iPad screen.
3. The student holds their stained-glass artwork inside the dashed box in the corner preview and taps **Scan**.
4. A preview card appears — check the capture, type the **student's name**, then tap **Use it!** (or **Retake**).
5. Tap **Start** and wait for the large **3-2-1-GO** countdown.
6. Students row with big **two-arm** motions to move forward; **one arm** to turn.
7. The 3D gondola passes through each glowing gate, then continues to the Basilica.
8. On arrival the install ceremony plays and the artwork + name are saved into the next church window.
9. Tap **Reset** for the next student.
10. Open **🖼 gallery.html** for the showcase; use the **⚙ admin panel** to clear all windows at the end of the day / session.

## Gates & Spoken Lines

| Gate | Line |
| --- | --- |
| Ciao Gate | Ciao, Venice! |
| Rialto Bridge | I row under the bridge. |
| Glass Window | I see colorful glass. |
| Pizza Stop | Italy has pizza. |
| Museum Dock | I made it to the museum! |

## Tuning cheatsheet (`three-rowing.js`)

- **Rowing feel** — `applyControls()`: forward drive `drive * 0.09`, glide `speed * 0.986`; steering gain `0.016` and turn cap `0.018`.
- **Motion sensitivity** — `POSE_MOTION_DEADZONE`, `POSE_MOTION_GAIN`, `ROW_SMOOTHING`, and `STROKE_ENVELOPE_DECAY`. Raise deadzone / smoothing to reduce twitching; lower them to make the boat respond faster.
- **Gate difficulty** — `GATE_TOLERANCE` (pass window) and `GATE_Z0` (where a gate is judged, near the boat).
- **Brightness / glow** — `renderer.toneMappingExposure` (overall), `bloomPass` args (strength, radius, threshold), window glow in the two `fillWindow(..., 0.75)` calls, empty-slot `emissiveIntensity 0.35` in `addChurch()`.
- **Water sparkle** — `sparkleTexture.repeat` (dot size) and the water material's `emissiveIntensity 0.3`.
- **Install ceremony** — camera offset in `startInstall()` (`ceremony.pos`), hold time `ceremony.holdUntil = time + 3.4` in `finishInstall()`, beam length/opacity in `spawnWindowBeam()`.
- **Canal traffic** — spots, colors and gondola `drift` speeds in `addOtherBoats()`.
- **Scenery scroll / recycle** — `SCENERY_PERIOD`, `SCENERY_NEAR`.
- **Church windows** — grid in `addChurch()` (facade 12 + tower 4 = 16 slots).
- **Music tempo range** — `updateMusic()` (`0.25 + level * 1.25`).
- **Admin passcode** — `ADMIN_PASSWORD`.

Gallery tuning lives in `gallery.js`: bloom in `bloomPass`, tour path in `updateCamera()`, light-shaft tint/opacity in `buildSlot()`, window layout in `slotPlacements()`.

## Deploy

This is a static site. Pushing to `main` auto-deploys the repo root to **GitHub Pages** via `.github/workflows/pages.yml`:

```text
https://ikueyo.github.io/Venezia_Row_quest/
https://ikueyo.github.io/Venezia_Row_quest/gallery.html
```

Camera access requires HTTPS on real iPad devices, so always use the deployed URL (not plain HTTP) for camera + motion play.
