# Venice Row Quest 3D

A bright, iPad-friendly motion game for the Italy unit in **International Culture & Hands-on Crafts Camp**.

Students stand in front of the iPad camera and make big rowing motions. A live camera + sensor-skeleton preview (MediaPipe Pose) sits in the corner of the screen. The game tracks each wrist and steers a colorful 3D gondola down a wide Venice canal, through five glowing gates, to a **Basilica** at the end — where each student's stained-glass artwork is permanently installed into a church window.

The 3D scene is built with Three.js and loaded from jsDelivr:

```js
https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js
```

Pose tracking uses MediaPipe Tasks Vision (also from jsDelivr).

## Rowing controls

- Row with **both arms** together → move **forward** (each stroke gives a surge, then the gondola glides).
- Row **only the right arm** → turn **left**.
- Row **only the left arm** → turn **right**.

The banks (houses, docks, moored boats) scroll toward you and recycle, so it feels like you are really moving forward. If MediaPipe Pose cannot load (offline), the game falls back to a simple left/right frame-difference motion detector, and the corner preview shows the camera without a skeleton.

## Stained-glass delivery quest

Each student holds their own stained-glass craft up to the camera (inside the dashed box in the corner preview) and taps **Scan**. The game captures:

- the **artwork** (center of the frame) → loaded as glowing cargo on the gondola, and
- the **student's face** (from the pose sensor) → shown as a round avatar on the rower.

The student then rows through the five canal gates to the **Basilica**. On arrival the artwork **flies up, spins, and locks into the next empty church window**, which lights up with their design.

### Permanent, sequential windows

- The church facade + bell tower hold **16 square window slots**.
- Each delivery fills the **next empty slot** and stays there; a gold frame marks where the next one will go.
- Filled windows are saved to the browser's **localStorage**, so they persist across page reloads on the same device/browser.

> Note: persistence is per-device / per-browser only. Sharing one church wall across multiple iPads would require a backend database.

## Admin panel (reset)

Tap the **⚙ gear** button (top-right) to open the admin panel. Enter the passcode and tap **Reset all windows** to clear every installed window and start over.

- Default passcode: `camp2026`
- Change it in `three-rowing.js` → `ADMIN_PASSWORD`.

## Audio

All audio files are optional — missing files are skipped automatically.

| Purpose | File | Behavior |
| --- | --- | --- |
| Rowing music | `assets/rowing-music.m4a` | Plays only while rowing; tempo tracks rowing speed (**0.25×–1.5×**). Resumes from its position (never restarts). |
| Basilica arrival music | `assets/gate-pass.mp3` | Plays when the gondola reaches the Basilica. Falls back to a built-in synth fanfare if the file is missing. |
| Gate spoken lines | `assets/lines/gate-1.mp3` … `gate-5.mp3` | One per gate, played when that gate is passed. See `assets/lines/README.txt`. |
| UI button + countdown sounds | `assets/ui/*.mp3` | Optional button-click and Start countdown clips. See `assets/ui/README.txt`. Built-in WebAudio beeps play if files are missing. |

Audio unlocks on the first button tap (Camera / Scan / Start), as required by mobile autoplay rules.

## Run Locally

Use a local web server:

```powershell
python -m http.server 5173
```

Open:

```text
http://localhost:5173/glass-art-game/
```

Teacher test page:

```text
http://localhost:5173/glass-art-game/teacher-test.html
```

Direct test mode:

```text
http://localhost:5173/glass-art-game/index.html?test=1
```

In test mode, tap Start, then tap Left, Right, Row, Boost, or Brake to simulate camera motion in the 3D scene.

## Teacher Flow

1. Open the site on the iPad and tap **Camera** to allow camera access.
2. Mirror or project the iPad screen.
3. The student holds their stained-glass artwork inside the dashed box in the corner preview and taps **Scan**.
4. Tap **Start** and wait for the large **3-2-1-GO** countdown.
5. Students row with big **two-arm** motions to move forward; **one arm** to turn.
6. The 3D gondola passes through each glowing gate, then continues to the Basilica.
7. On arrival the artwork is installed into the next church window and saved.
8. Tap **Reset** for the next student.
9. Use the **⚙ admin panel** to clear all windows at the end of the day / session.

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
- **Scenery scroll / recycle** — `SCENERY_PERIOD`, `SCENERY_NEAR`.
- **Church windows** — grid in `addChurch()` (facade 12 + tower 4 = 16 slots).
- **Music tempo range** — `updateMusic()` (`0.25 + level * 1.25`).
- **Admin passcode** — `ADMIN_PASSWORD`.

## Deploy

This is a static site. You can deploy the `glass-art-game` folder to GitHub Pages or Firebase Hosting.

Camera access requires HTTPS on real iPad devices. GitHub Pages and Firebase Hosting both provide HTTPS.
