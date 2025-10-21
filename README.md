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
- Release: if any match exists, the move succeeds and cascades resolve; otherwise the move rolls back along the path
- Reset: click Reset to re‑seed the board

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
  - Refill Base ms/row: base time per row for refill. Default: 50.
- Panel 2 — Collapse speed (within the playboard)
  - Collapse offset (ms/row): additive adjustment that only affects collapse (pre‑refill) inside the board (y 5 → 1). Positive slows; negative speeds up.
  - Collapse Base ms/row: base time per row for collapse. Default: 50.
- Panel 3 — Swapping speed
  - Adjust clockwise/counter‑clockwise swap duration by ±ms relative to the base 90ms.
  - Defaults: CW offset 0ms (90ms total), CCW offset +30ms (120ms total).
- Apply / Reset: Apply changes or reset to defaults listed above.

Defaults
- Panel 1 — Above‑board offset: 0; Refill Base: 50 ms/row
- Panel 2 — Collapse offset: 0; Collapse Base: 50 ms/row
- Panel 3 — Swapping speed: CW offset 0 ms; CCW offset +30 ms

Behavior
- Refills start from outside at y = 10 for each column x = 1..5 and are clipped until they enter the board area.
- Bottom rows start earliest and top rows latest per wave; all columns finish landing together (shared wave end time).
- Live glow preview starts at the brightest moment for a snappier visual and aligns to the pressed tile scale while dragging.

## Project Layout
- `src/index.html` — App HTML and UI scaffolding
- `src/styles.css` — Styles, board/tiles, glow overlay, swap clone styles, debug styles
- `src/main.js` — Game logic, drag‑snake input, swap animations, match finding + cascades, glow overlay, debug logging

## Run Locally
This is a static web app — no build step required.
- Easiest: open `src/index.html` in a browser
- Optional: serve the folder with any static file server (for consistent origin)
  - Python: `python3 -m http.server` then visit `http://localhost:8000/src/`

## Implementation Notes
- Initial board generation avoids starting matches
- Matching: find horizontal/vertical 3+ runs; union their seeds and expand to 4‑connected same‑color clusters (L/T supported; no diagonals)
- Cascades (per wave):
  - Fade matched tiles in place (~320ms)
  - Compute gravity plan from the cleared snapshot
  - Animate survivors falling (per‑row ~50ms by default, ease‑in‑out) with bottom‑first starts; spawns enter from above (start at y=10) and fall to their cells; landings are synchronized per wave
  - Commit the new board; repeat until stable
- Animations: Web Animations API
  - Drag swaps use serialized semicircle orbits (base 90ms each) with precise CW/CCW mapping; durations are adjustable per direction via Timing Panel (CW offset, CCW offset)
  - Fall/refill uses overlay clones so the grid remains stable; originals are hidden/unhidden with ref‑counts
  - Glow preview is drawn as a union halo overlay, starts bright, and is gated to display only when not swapping/falling; geometry recomputes each frame to align with the enlarged tile
- Accessibility: tiles are focusable via pointer and labeled; pointer events used for fluid drag on desktop/mobile

## License
For demo purposes; no license specified.
