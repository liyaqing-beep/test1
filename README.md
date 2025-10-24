# Match‑3 (5×5) — Drag‑Snake, Cascades, and Live Glow

A lightweight, self‑contained match‑3 web game with a 5×5 board. Drag to snake across orthogonally adjacent tiles (no diagonals). Loops are allowed. On release, if the board has any valid match, connected clusters clear with animated cascades (fade, fall, refill); otherwise the move rolls back visually along the path.

## Features
- 5×5 board with animated cascades (fade, fall, refill)
- Drag‑snake input (orthogonal adjacency, loops allowed; one swap per entered cell)
- Matching rule: any 3+ line/column creates a valid match; then all same‑color tiles 4‑connected to any matched tile are cleared in that action
- Scoring: +10 points per match (each 4‑connected same‑color cluster cleared per wave)
- Press and hold: active tile enlarges by 15% and stays enlarged while dragging until release; invalid moves still roll back and shake the start tile
- Swap animation per step (base 90ms): left→right and top→down rotate clockwise; right→left and down→up rotate anti‑clockwise; per‑direction speed is adjustable in Timing Panel → Panel 3
- Live match preview glow: breathing, continuous outside halo (overlap merges) drawn via an overlay; recomputes geometry each frame during drag so it aligns with the enlarged tile outline; only visible while dragging and only when no animation is running
- Reset button to start over

## Visual Style
- Page background: `#F7F0E9`
- Board background: `#442222` with `24px` radius
- Tiles: circular, flat colors
  - `.tile.red    { --orb-color: #c17779; }`
  - `.tile.pink   { --orb-color: #fdb7b9; }`
  - `.tile.yellow { --orb-color: #f7e3db; }`
  - `.tile.green  { --orb-color: #badfd7; }`
  - `.tile.blue   { --orb-color: #60bfc1; }`
  - `.tile.orange { --orb-color: #E8A342; }`

## Controls
- Drag: press on a tile and snake through orthogonally adjacent tiles (tile enlarges 15% while held)
- Diagonal drags (between diagonal neighbors): routed as two swaps (horizontal first, then vertical)
  1) bottom‑left → top‑right: right, then up
  2) bottom‑right → top‑left: left, then up
  3) top‑left → bottom‑right: right, then down
  4) top‑right → bottom‑left: left, then down
- Release: if any match exists, the move succeeds and cascades resolve; otherwise the move rolls back along the path
- Reset: click Reset to re‑seed the board
- Game Mode: Off / Life / Color (dropdown above the board; default: Off)

## Game Modes

- Off
  - Drag tiles and keep swapping to create more matches!
  - Score: +10 per cleared cluster (unchanged).

- Life
  - Every successful match keeps you alive and scoring!
  - Life system behaves as described below; Score remains visible.

- Color
  - Goal: Transform the entire board into the designated Goal Color (goal tiles never clear).
  - Steps replace Score in the HUD.
    - Success move: +1 step; Failed move (with an actual swap): +2 steps.
  - Start of round: exactly 5 Goal Color tiles are seeded on the board.
  - Spawns: Goal 10%; remaining eligible colors share 90%. Non‑goal colors that reach 0 are permanently removed from spawns for the round.
  - Glow: live glow preview ignores matches consisting solely of the Goal Color.
  - Stalemate: if no single adjacent swap yields a match, non‑goal tiles shuffle (Goal tiles stay fixed) to ensure solvability.
  - One‑color‑left rule: if only one non‑goal color remains and a move would not clear all of it, the whole board (including Goal tiles) shuffles instead of clearing; counts as +1 step.
  - Win: when all tiles are the Goal Color, the board fades out and a “You Win!” modal appears with “Try Again”; pressing it picks a new Goal and reseeds a fresh round (with 5 Goal tiles).

## HUD and UI
- Game Mode: Dropdown (top, centered) with Off/Life/Color; default Off.
- Score vs Steps: Score shows in Off/Life; Steps shows in Color (+1 success, +2 failed with a swap).
- Life Bar: visible only in Life; hidden in Off/Color; starts after first successful match.
- Goal Indicator: visible only in Color; shows a colored dot and label (red→brown, pink→pink, yellow→white, green→mint blue, blue→turquoise, orange→orange).
- Rules Blurb: short mode-specific tip under the board with a subtle fade on mode changes.
- Win Overlay (Color): centered “You Win!” with “Try Again”; reseeds a new round on click.

## Life Meter (Game Mode: Life)
- Purpose: Keep scoring as-is, survive by maintaining Life > 0.
- Placement: The life bar shows above the board (matches board width) when Life mode is selected.
- Start: The meter is inactive until your first successful match; on that first match it starts at 60 life and decay begins.
- Decay: −5 life per second (max 60). Decay ticks chain only after each drop (gains/penalties do not reset the next tick). Pauses while the tab is hidden.
- Gains (apply per cascade wave, right after matched tiles fade out):
  - 3–5 tiles (same‑color cluster): +5 life per match
  - 6–7 tiles: +15 life per match
  - 8+ tiles: +30 life per match
  - Multi‑match bonus: if 2+ clusters clear in the same wave, double that wave’s total life gain
- Penalty: A failed move (no match) costs −20 life, but only after the meter has started. No penalty if you didn’t actually swap any tile (tap without moving doesn’t count).
- Boundaries: Life clamps to [0, 60]. Reaching 0 shows a Game Over overlay; press Reset to start again.

## Coordinate System
- External/logical (x, y): origin at bottom‑left, 1‑based; `x` increases → right, `y` increases → up
- Internal (r, c): origin at top‑left, 0‑based; `r` increases → down, `c` increases → right
- Mapping: `x = c + 1`, `y = SIZE − r` and `r = SIZE − y`, `c = x − 1`

## Debug Panel
A fixed panel can be toggled next to the board for cascade introspection.
- Toggle: Show Debug / Hide Debug
- Clear: Clear Logs (visible only when logs exist)
- Logs each cascade wave as “Action N” including:
  - Found match seeds (as `(x,y)` using the external coordinate system)
  - Expanded clear set (connected same‑color cluster)
  - Snapshots: Before clear, After clear (committed), After collapse+refill (committed)

## Timing Panel
Foldable controls for animation timing, mirrored on the left side of the board.
- Toggle: Show Panel / Hide Panel
- Panel 1 — Falling speed (above the playboard)
  - Above‑board offset (ms/row): additive adjustment for refill tiles before entering the board (logical y 10 → 5). Positive slows; negative speeds up.
  - Refill Base ms/row: base time per row for refill. Default: 30.
- Panel 2 — Collapse speed (within the playboard)
  - Collapse offset (ms/row): additive adjustment that only affects collapse (pre‑refill) inside the board (y 5 → 1). Positive slows; negative speeds up.
  - Collapse Base ms/row: base time per row for collapse. Default: 30.
- Panel 3 — Swapping speed
  - Adjust clockwise/counter‑clockwise swap duration by ±ms relative to the base 90ms.
  - Defaults: CW offset 0ms (90ms total), CCW offset +35ms (125ms total).
- Apply / Reset: Apply changes or reset to defaults listed above.

Defaults
- Panel 1 — Above‑board offset: 0; Refill Base: 30 ms/row
- Panel 2 — Collapse offset: 0; Collapse Base: 30 ms/row
- Panel 3 — Swapping speed: CW offset 0 ms; CCW offset +35 ms

Behavior
- Refills start from outside at y = 10 for each column x = 1..5 and are clipped until they enter the board area.
- Bottom rows start earliest and top rows latest per wave; all columns finish landing together (shared wave end time).
- Live glow preview starts at the brightest moment for a snappier visual and aligns to the pressed tile scale while dragging.

## Project Layout
- `src/index.html` — App HTML and UI scaffolding
- `src/styles.css` — Styles, board/tiles, glow overlay, swap clone styles, debug styles
- `src/main.js` — Game logic, drag‑snake input, swap animations, match finding + cascades, glow overlay, debug logging

## Development & Local Hosting
This is a static web app — no build step required.

Quick start (terminal)
- `make dev` — serves the repo root on your LAN (defaults to port 8000). The script prints both Local and Network URLs; open the Network URL on your iPhone.
- Custom port: `make dev DEV_PORT=9000`

Manual alternative
- From the repo root: `python3 -m http.server 8000`
- Visit `http://localhost:8000/src/` on the same machine, or `http://<your-mac-ip>:8000/src/` from your phone.

Find your Mac IP
- Wi‑Fi: `ipconfig getifaddr en0`
- Default interface: `ipconfig getifaddr $(route -n get default | awk '/interface:/{print $2}')`

Notes
- Serve the repo root so both `src/` and `assets/` resolve.
- iOS service workers require HTTPS; over plain HTTP the game runs fine but offline/PWA features are disabled.

## iPhone Support
The game is mobile‑friendly and now includes a PWA manifest and service worker so it can be added to the Home Screen and played full‑screen on iPhone.

What’s included
- iOS meta + manifest: `src/index.html:5` adds `viewport-fit=cover`, Apple meta, and links `src/manifest.webmanifest`.
- Offline/install: a basic service worker `src/sw.js` caches core assets for offline play.
- Mobile polish: responsive tile sizing and iOS touch tweaks in `src/styles.css`.

Play on iPhone (as a website)
- Host the repo (any static hosting over HTTPS), then open the URL in Safari on iPhone.
- Tap the Share button → Add to Home Screen.
- Launch from the Home Screen for a full‑screen experience.

Local install to Home Screen
- Serve from the repo root (so `src/` and `assets/` are siblings), e.g. `python3 -m http.server`.
- Visit `http://<your-ip>:8000/src/` in Safari, then Add to Home Screen.

Debugging on iPhone
- Enable on iPhone: Settings → Safari → Advanced → Web Inspector → On.
- Enable on Mac: Safari → Settings → Advanced → check “Show Develop menu in menu bar”.
- Connect iPhone via USB, open the page on iPhone, then on Mac Safari: Develop → [Your iPhone] → select the page to view console, network, and elements.

App Store (native wrapper) — optional
- Use Capacitor to wrap the web app in a native shell:
  1) `npm init -y && npm i -D @capacitor/cli && npm i @capacitor/core @capacitor/ios`
  2) `npx cap init match3 com.example.match3 --web-dir=src`
  3) `npx cap add ios`
  4) `npx cap open ios` and configure signing, icons, orientations in Xcode.
  5) Build/run on a device, then prepare for App Store submission.

Notes for iOS
- Icons: add `assets/icon-192.png`, `assets/icon-512.png`, and `assets/icon-180.png` (Apple touch icon). Update sizes as needed in `src/manifest.webmanifest` and the `<link rel="apple-touch-icon">` in `src/index.html:8`.
- Safe areas: the layout uses `viewport-fit=cover` and respects notches via CSS safe‑area insets.
- Gestures: the board has `touch-action: none` to prevent scroll/zoom while dragging.

Mobile input parity
- Touch drag now mirrors desktop behavior. We track `pointermove` globally, capture the pointer on press, and map finger position to the tile under your finger (with a fallback hit‑test when originals are temporarily hidden during animations).
  - Pointer capture and move handler: `src/main.js:350`, `src/main.js:373`.
  - Hit‑test fallback: `src/main.js:380`.

## Implementation Notes
- Initial board generation avoids starting matches
- Matching: find horizontal/vertical 3+ runs; union their seeds and expand to 4‑connected same‑color clusters (L/T supported; no diagonals)
- Cascades (per wave):
  - Fade matched tiles in place (~320ms); Life gains are computed and applied immediately after this fade for that wave
  - Compute gravity plan from the cleared snapshot
  - Animate survivors falling (per‑row ~50ms by default, ease‑in‑out) with bottom‑first starts; spawns enter from above (start at y=10) and fall to their cells; landings are synchronized per wave
  - Commit the new board; repeat until stable
- Animations: Web Animations API
  - Drag swaps use serialized semicircle orbits (base 90ms each) with precise CW/CCW mapping; durations are adjustable per direction via Timing Panel (CW offset, CCW offset)
  - Fall/refill uses overlay clones so the grid remains stable; originals are hidden/unhidden with ref‑counts
  - Glow preview is drawn as a union halo overlay, starts bright, and is gated to display only when not swapping/falling; geometry recomputes each frame to align with the enlarged tile
- Accessibility: tiles are focusable via pointer and labeled; pointer events used for fluid drag on desktop/mobile
 - Diagonal drag routing: when dragging to a diagonal neighbor, the move is executed as two swaps by first moving horizontally toward the target cell, then vertically toward it; backtracking is preserved if the first hop equals the previous cell.

## License
For demo purposes; no license specified.
