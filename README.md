# Match‑3 (5×5) — Drag‑Snake, Cascades, and Live Glow

A lightweight, self‑contained match‑3 web game with a 5×5 board. Drag to snake across orthogonally adjacent tiles (no diagonals). Loops are allowed. On release, if the board has any valid match, connected clusters clear with animated cascades (fade, fall, refill); otherwise the move rolls back visually along the path.

## Features
- 5×5 board with animated cascades (fade, fall, refill)
- Drag‑snake input (orthogonal adjacency, loops allowed; one swap per entered cell)
- Matching rule: any 3+ line/column creates a valid match; then all same‑color tiles 4‑connected to any matched tile are cleared in that action
- Scoring: +10 points per cleared tile (per cascade wave)
- Invalid move: rolls back along the exact path with semicircle swap animations, then a brief shake on the start tile
- Swap animation per step (90ms): left→right and top→down rotate clockwise around the midpoint; right→left and down→up rotate anti‑clockwise; direction logic is strictly enforced
- Live match preview glow: breathing, continuous outside halo (overlap merges) drawn via an overlay; only visible while dragging and only when no animation is running
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

## Controls
- Drag: press on a tile and snake through orthogonally adjacent tiles
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
  - Animate survivors falling (per‑row ~100ms, ease‑in‑out), spawns enter from above and fall to their cells
  - Commit the new board; repeat until stable
- Animations: Web Animations API
  - Drag swaps use serialized semicircle orbits (90ms each) to avoid overlap artifacts, with precise CW/CCW mapping
  - Fall/refill uses overlay clones so the grid remains stable; originals are hidden/unhidden with ref‑counts
  - Glow preview is drawn as a union halo overlay and gated to display only when not swapping/falling
- Accessibility: tiles are focusable via pointer and labeled; pointer events used for fluid drag on desktop/mobile

## License
For demo purposes; no license specified.
