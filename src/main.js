"use strict";

(function () {
  const SIZE = 5;
  const COLOR_NAMES = ["red", "pink", "yellow", "green", "blue"]; // indices 0..4

  // State
  let board = createInitialBoard(SIZE);
  let score = 0;
  let dragging = false;
  let path = []; // array of {r,c}
  let pathSet = new Set(); // set of "r,c"
  let startPos = null;
  let glowEpoch = 0;
  let glowSet = new Set(); // current preview glow cells as "r,c"
  const hideCounts = new WeakMap();
  const SWAP_MS = 90; // sped up by 100% (half duration)
  let swapAnimChain = Promise.resolve();
  let reverting = false;
  let activeSwaps = 0; // number of in-flight visual swap animations

  // Elements
  const boardEl = document.getElementById("board");
  const scoreEl = document.getElementById("score");
  const resetBtn = document.getElementById("reset");
  const debugToggleEl = document.getElementById("debug-toggle");
  const debugClearEl = document.getElementById("debug-clear");
  const debugPanelEl = document.getElementById("debug-panel");
  let debugEnabled = false;
  let debugActionCount = 0;

  // Build grid once
  const tileEls = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  buildGrid();
  // Overlay for continuous outside glow
  const glowOverlayEl = document.createElement("div");
  glowOverlayEl.className = "glow-overlay";
  boardEl.appendChild(glowOverlayEl);
  draw();
  updateScore(0);
  setupDebugUI();

  // Events
  resetBtn.addEventListener("click", () => {
    dragging = false;
    clearTrail();
    score = 0;
    updateScore(0);
    board = createInitialBoard(SIZE);
    draw();
    if (debugEnabled) {
      debugPanelEl.innerHTML = "";
      debugActionCount = 0;
      updateClearButtonVisibility();
    }
  });

  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", positionDebugUI);
  window.addEventListener("scroll", positionDebugUI, { passive: true });

  // --- UI construction ---
  function buildGrid() {
    boardEl.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.dataset.r = String(r);
        tile.dataset.c = String(c);
        tile.setAttribute("role", "button");
        tile.setAttribute("aria-label", `Tile ${r + 1},${c + 1}`);
        tile.addEventListener("pointerdown", onPointerDown);
        tile.addEventListener("pointerenter", onTileEnter);
        boardEl.appendChild(tile);
        tileEls[r][c] = tile;
      }
    }
  }

  // --- Debug UI ---
  function setupDebugUI() {
    if (!debugToggleEl || !debugPanelEl) return;
    debugToggleEl.style.display = "block";
    if (debugClearEl) debugClearEl.style.display = "none";
    debugToggleEl.textContent = "Show Debug";
    debugPanelEl.style.display = "none";
    debugToggleEl.addEventListener("click", () => {
      debugEnabled = !debugEnabled;
      debugToggleEl.textContent = debugEnabled ? "Hide Debug" : "Show Debug";
      debugPanelEl.style.display = debugEnabled ? "block" : "none";
      positionDebugUI();
    });
    if (debugClearEl) {
      debugClearEl.textContent = "Clear Logs";
      debugClearEl.addEventListener("click", () => {
        debugPanelEl.innerHTML = "";
        debugActionCount = 0;
        updateClearButtonVisibility();
      });
    }
    positionDebugUI();
    updateClearButtonVisibility();
  }

  function positionDebugUI() {
    if (!debugToggleEl || !debugPanelEl) return;
    const rect = boardEl.getBoundingClientRect();
    const margin = 16;
    const left = Math.round(rect.right + margin);
    const top = Math.max(8, Math.round(rect.top));
    debugToggleEl.style.left = left + "px";
    debugToggleEl.style.top = top + "px";
    // Place Clear button to the right of toggle
    const gap = 8;
    if (debugClearEl) {
      const toggleW = debugToggleEl.offsetWidth || 110;
      debugClearEl.style.left = Math.round(left + toggleW + gap) + "px";
      debugClearEl.style.top = top + "px";
    }
    // Panel under buttons aligned with left edge
    const toggleHeight = 36;
    debugPanelEl.style.left = left + "px";
    debugPanelEl.style.top = Math.round(top + toggleHeight + 8) + "px";
  }

  // --- Input handlers ---
  function onPointerDown(e) {
    if (reverting) return;
    const tile = e.target.closest(".tile");
    if (!tile) return;
    e.preventDefault();
    const r = parseInt(tile.dataset.r, 10);
    const c = parseInt(tile.dataset.c, 10);
    dragging = true;
    path = [{ r, c }];
    pathSet = new Set([key({ r, c })]);
    startPos = { r, c };
    boardEl.classList.add("dragging");
    refreshTrail();
    updateGlowPreview();
  }

  function onTileEnter(e) {
    if (!dragging) return;
    const tile = e.target.closest(".tile");
    if (!tile) return;
    const r = parseInt(tile.dataset.r, 10);
    const c = parseInt(tile.dataset.c, 10);
    const pos = { r, c };

    const last = path[path.length - 1];
    if (last.r === r && last.c === c) return; // same cell

    if (!isAdjacent(last, pos)) return; // only orthogonal moves

    // Backtrack one step if re-entering the previous cell
    if (path.length >= 2) {
      const prev = path[path.length - 2];
      if (prev.r === r && prev.c === c) {
        // schedule visual animation (capture pre-swap colors), then swap state immediately
        const colorA = COLOR_NAMES[board[last.r][last.c]];
        const colorB = COLOR_NAMES[board[prev.r][prev.c]];
        scheduleSwapAnimation(last, prev, colorA, colorB);
        swap(last, prev);
        path.pop();
        pathSet.delete(key(last));
        draw();
        refreshTrail();
        updateGlowPreview();
        return;
      }
    }

    const k = key(pos);

    // Step forward: schedule animation (capture pre-swap colors), then swap state immediately
    const colorA = COLOR_NAMES[board[last.r][last.c]];
    const colorB = COLOR_NAMES[board[pos.r][pos.c]];
    scheduleSwapAnimation(last, pos, colorA, colorB);
    swap(last, pos);
    path.push(pos);
    pathSet.add(k);
    draw();
    refreshTrail();
    updateGlowPreview();
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    boardEl.classList.remove("dragging");
    clearTrail();
    clearGlowPreview();

    // Check for any matches
    const anyCleared = resolveMatchesAndCascades();
    if (anyCleared === 0) {
      // No match -> visually roll back along the path
      reverting = true;
      const savedPath = path.slice();
      const savedStart = startPos ? { r: startPos.r, c: startPos.c } : null;
      (async () => {
        try {
          await swapAnimChain.catch(() => {});
          await animateRevertPath(savedPath);
          draw();
          if (savedStart) {
            const el = tileEls[savedStart.r][savedStart.c];
            el.classList.add("shake");
            setTimeout(() => el.classList.remove("shake"), 320);
          }
        } finally {
          reverting = false;
          path = [];
          pathSet.clear();
          startPos = null;
        }
      })();
    } else {
      // On success, just clear the path state now
      path = [];
      pathSet.clear();
      startPos = null;
    }
  }

  // --- Board logic ---
  function createInitialBoard(n) {
    const b = Array.from({ length: n }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        let t;
        do {
          t = rngTile();
        } while (
          (c >= 2 && t === b[r][c - 1] && t === b[r][c - 2]) ||
          (r >= 2 && t === b[r - 1][c] && t === b[r - 2][c])
        );
        b[r][c] = t;
      }
    }
    return b;
  }

  function rngTile() {
    return Math.floor(Math.random() * COLOR_NAMES.length);
  }

  function key(p) {
    return `${p.r},${p.c}`;
  }

  function isAdjacent(a, b) {
    const dr = Math.abs(a.r - b.r);
    const dc = Math.abs(a.c - b.c);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  }

  function swap(a, b) {
    const t = board[a.r][a.c];
    board[a.r][a.c] = board[b.r][b.c];
    board[b.r][b.c] = t;
  }

  function revertPath() {
    for (let i = path.length - 1; i > 0; i--) {
      swap(path[i], path[i - 1]);
    }
  }

  function findMatches(b) {
    const n = b.length;
    const mark = Array.from({ length: n }, () => Array(n).fill(false));

    // Horizontal runs
    for (let r = 0; r < n; r++) {
      let runLen = 1;
      for (let c = 1; c < n; c++) {
        if (b[r][c] === b[r][c - 1]) runLen++;
        else {
          if (runLen >= 3) {
            for (let k = 0; k < runLen; k++) mark[r][c - 1 - k] = true;
          }
          runLen = 1;
        }
      }
      if (runLen >= 3) {
        for (let k = 0; k < runLen; k++) mark[r][n - 1 - k] = true;
      }
    }

    // Vertical runs
    for (let c = 0; c < n; c++) {
      let runLen = 1;
      for (let r = 1; r < n; r++) {
        if (b[r][c] === b[r - 1][c]) runLen++;
        else {
          if (runLen >= 3) {
            for (let k = 0; k < runLen; k++) mark[r - 1 - k][c] = true;
          }
          runLen = 1;
        }
      }
      if (runLen >= 3) {
        for (let k = 0; k < runLen; k++) mark[n - 1 - k][c] = true;
      }
    }

    const matches = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mark[r][c]) matches.push({ r, c });
      }
    }
    return matches;
  }

  function resolveMatchesAndCascades() {
    let totalCleared = 0;
    let localActionCount = 0;
    while (true) {
      const matches = findMatches(board);
      if (matches.length === 0) break;
      const boardBefore = debugEnabled ? cloneBoard(board) : null;
      const toClear = expandConnectedSameColor(board, matches);
      totalCleared += toClear.length;

      for (const { r, c } of toClear) {
        board[r][c] = null;
      }
      const boardAfterClear = debugEnabled ? cloneBoard(board) : null;

      // Collapse per column and refill
      for (let c = 0; c < SIZE; c++) {
        const col = [];
        for (let r = SIZE - 1; r >= 0; r--) {
          const v = board[r][c];
          if (v !== null && v !== undefined) col.push(v);
        }
        let idx = 0;
        for (let r = SIZE - 1; r >= 0; r--) {
          if (idx < col.length) {
            board[r][c] = col[idx++];
          } else {
            board[r][c] = rngTile();
          }
        }
      }

      if (debugEnabled) {
        const boardAfterCollapse = cloneBoard(board);
        logDebugAction(++debugActionCount, matches, toClear, boardBefore, boardAfterClear, boardAfterCollapse);
      }
      localActionCount++;
    }

    if (totalCleared > 0) updateScore(score + totalCleared * 10);
    draw();
    return totalCleared;
  }

  function cloneBoard(b) { return b.map(row => row.slice()); }
  function rcToXY(r, c) { return { x: c + 1, y: SIZE - r }; }
  function snapshotBoard(b) {
    const initial = (v) => {
      const name = COLOR_NAMES[v] || "?";
      return v === null || v === undefined ? "." : name[0].toUpperCase();
    };
    return b.map(row => row.map(v => initial(v)).join(" ")).join("\n");
  }
  function logDebugAction(n, seeds, toClear, before, afterClear, afterCollapse) {
    const action = document.createElement("div");
    action.className = "action";
    const seedsStr = seeds.map(({r,c}) => { const {x,y}=rcToXY(r,c); return `(${x},${y})`; }).join(", ");
    const clearStr = toClear.map(({r,c}) => { const {x,y}=rcToXY(r,c); return `(${x},${y})`; }).join(", ");
    action.innerHTML = `
      <h4>Action ${n}</h4>
      <div><strong>Found matches:</strong> ${seedsStr || '(none)'}</div>
      <div><strong>Expanded clear:</strong> ${clearStr || '(none)'}</div>
      <div><strong>Before clear</strong></div>
      <pre>${escapeHtml(snapshotBoard(before))}</pre>
      <div><strong>After clear (committed)</strong></div>
      <pre>${escapeHtml(snapshotBoard(afterClear))}</pre>
      <div><strong>After collapse+refill committed</strong></div>
      <pre>${escapeHtml(snapshotBoard(afterCollapse))}</pre>
    `;
    debugPanelEl.appendChild(action);
    debugPanelEl.scrollTop = debugPanelEl.scrollHeight;
    updateClearButtonVisibility();
  }
  function escapeHtml(s) { return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
  function updateClearButtonVisibility() {
    if (!debugClearEl) return;
    const hasLogs = (debugActionCount > 0) || (debugPanelEl && debugPanelEl.children && debugPanelEl.children.length > 0);
    debugClearEl.style.display = hasLogs ? "block" : "none";
  }

  // Live glow preview for any current matches (expanded by color clusters)
  function updateGlowPreview() {
    // Rule: show breathing glow only when there's no tile swapping
    if (!dragging || activeSwaps > 0) { clearGlowPreview(); return; }
    const seeds = findMatches(board);
    const nextSet = new Set();
    if (seeds.length > 0) {
      const full = expandConnectedSameColor(board, seeds);
      for (const p of full) nextSet.add(key(p));
    }

    // Compare membership
    let changed = nextSet.size !== glowSet.size;
    if (!changed) {
      for (const k of nextSet) {
        if (!glowSet.has(k)) { changed = true; break; }
      }
    }

    if (changed) {
      glowEpoch = 1 - glowEpoch;
      boardEl.classList.toggle("glow-epoch-0", glowEpoch === 0);
      boardEl.classList.toggle("glow-epoch-1", glowEpoch === 1);

      // Rebuild overlay dots for a continuous outside glow
      while (glowOverlayEl.firstChild) glowOverlayEl.removeChild(glowOverlayEl.firstChild);
      const br = boardEl.getBoundingClientRect();
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const k = `${r},${c}`;
          if (!nextSet.has(k)) continue;
          const el = tileEls[r][c];
          const rect = el.getBoundingClientRect();
          const dot = document.createElement("div");
          dot.className = "glow-dot";
          dot.style.left = rect.left - br.left + "px";
          dot.style.top = rect.top - br.top + "px";
          dot.style.width = rect.width + "px";
          dot.style.height = rect.height + "px";
          glowOverlayEl.appendChild(dot);
        }
      }
      glowSet = nextSet;
    }
  }

  function clearGlowPreview() {
    // Clear overlay
    while (glowOverlayEl.firstChild) glowOverlayEl.removeChild(glowOverlayEl.firstChild);
    glowSet.clear();
  }

  // --- Visual swap animation (semicircle orbit around midpoint) ---
  function scheduleSwapAnimation(a, b, colorA, colorB) {
    swapAnimChain = swapAnimChain
      .then(() => animateSwapVisualWithColors(a, b, colorA, colorB))
      .catch(() => {});
  }

  function animateSwapVisual(a, b) {
    const elA = tileEls[a.r][a.c];
    const elB = tileEls[b.r][b.c];
    if (!elA || !elB) return;

    // Colors before swap
    const colorA = COLOR_NAMES[board[a.r][a.c]];
    const colorB = COLOR_NAMES[board[b.r][b.c]];

    // Positions relative to board
    const br = boardEl.getBoundingClientRect();
    const ra = elA.getBoundingClientRect();
    const rb = elB.getBoundingClientRect();
    const ax = ra.left - br.left;
    const ay = ra.top - br.top;
    const bx = rb.left - br.left;
    const by = rb.top - br.top;

    const dx = bx - ax;
    const dy = by - ay;

    // Determine clockwise vs anticlockwise
    const clockwise = dx !== 0 ? dx > 0 : dy > 0;
    const rotSign = clockwise ? 1 : -1;

    // Create clones
    const cloneA = document.createElement("div");
    cloneA.className = `tile ${colorA} swap-clone`;
    cloneA.style.left = ax + "px";
    cloneA.style.top = ay + "px";
    cloneA.style.width = elA.offsetWidth + "px";
    cloneA.style.height = elA.offsetHeight + "px";

    const cloneB = document.createElement("div");
    cloneB.className = `tile ${colorB} swap-clone`;
    cloneB.style.left = bx + "px";
    cloneB.style.top = by + "px";
    cloneB.style.width = elB.offsetWidth + "px";
    cloneB.style.height = elB.offsetHeight + "px";

    boardEl.appendChild(cloneA);
    boardEl.appendChild(cloneB);

    // Hide originals with ref count
    incHide(elA);
    incHide(elB);

    const [kA, kB] = makeArcKeyframesVector(dx, dy, clockwise);
    const timing = { duration: SWAP_MS, easing: "ease-in-out", fill: "forwards" };

    const aAnim = cloneA.animate(kA, timing);
    const bAnim = cloneB.animate(kB, timing);

    const finish = () => {
      try { cloneA.remove(); } catch (_) {}
      try { cloneB.remove(); } catch (_) {}
      decHide(elA);
      decHide(elB);
    };
    aAnim.addEventListener("finish", finish, { once: true });
    bAnim.addEventListener("finish", () => {}, { once: true });
  }

  // Same as animateSwapVisual but colors are captured at schedule time
  function animateSwapVisualWithColors(a, b, colorA, colorB) {
    const elA = tileEls[a.r][a.c];
    const elB = tileEls[b.r][b.c];
    if (!elA || !elB) return Promise.resolve();

    const br = boardEl.getBoundingClientRect();
    const ra = elA.getBoundingClientRect();
    const rb = elB.getBoundingClientRect();
    const ax = ra.left - br.left;
    const ay = ra.top - br.top;
    const bx = rb.left - br.left;
    const by = rb.top - br.top;
    const dx = bx - ax;
    const dy = by - ay;
    const clockwise = dx !== 0 ? dx > 0 : dy > 0;

    const cloneA = document.createElement("div");
    cloneA.className = `tile ${colorA} swap-clone`;
    cloneA.style.left = ax + "px";
    cloneA.style.top = ay + "px";
    cloneA.style.width = elA.offsetWidth + "px";
    cloneA.style.height = elA.offsetHeight + "px";

    const cloneB = document.createElement("div");
    cloneB.className = `tile ${colorB} swap-clone`;
    cloneB.style.left = bx + "px";
    cloneB.style.top = by + "px";
    cloneB.style.width = elB.offsetWidth + "px";
    cloneB.style.height = elB.offsetHeight + "px";

    boardEl.appendChild(cloneA);
    boardEl.appendChild(cloneB);

    incHide(elA);
    incHide(elB);

    const [kA, kB] = makeArcKeyframesVector(dx, dy, clockwise);
    const timing = { duration: SWAP_MS, easing: "ease-in-out", fill: "forwards" };
    activeSwaps++;
    const aAnim = cloneA.animate(kA, timing);
    const bAnim = cloneB.animate(kB, timing);

    return Promise.allSettled([aAnim.finished, bAnim.finished])
      .then(() => {
        try { cloneA.remove(); } catch (_) {}
        try { cloneB.remove(); } catch (_) {}
        decHide(elA);
        decHide(elB);
      })
      .finally(() => {
        activeSwaps = Math.max(0, activeSwaps - 1);
        if (activeSwaps === 0) updateGlowPreview();
      });
  }

  function makeArcKeyframesVector(dx, dy, clockwise) {
    const len = Math.hypot(dx, dy) || 1;
    const r = len / 2;
    const mx = dx / 2;
    const my = dy / 2;
    // Perpendicular unit vector in SCREEN coordinates (y down):
    // clockwise uses rot90cw(u) = (uy, -ux); anticlockwise uses rot90ccw(u) = (-uy, ux)
    const nx = clockwise ? dy / len : -dy / len;
    const ny = clockwise ? -dx / len : dx / len;
    const offX = nx * r;
    const offY = ny * r;

    const midAX = mx + offX;
    const midAY = my + offY;
    const midBX = -mx - offX;
    const midBY = -my - offY;

    const rotSign = clockwise ? 1 : -1;
    const kA = [
      { transform: `translate3d(0px, 0px, 0) rotate(0deg)`, offset: 0 },
      { transform: `translate3d(${midAX}px, ${midAY}px, 0) rotate(${rotSign * 90}deg)`, offset: 0.5 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${rotSign * 180}deg)`, offset: 1 },
    ];
    const kB = [
      { transform: `translate3d(0px, 0px, 0) rotate(0deg)`, offset: 0 },
      { transform: `translate3d(${midBX}px, ${midBY}px, 0) rotate(${rotSign * 90}deg)`, offset: 0.5 },
      { transform: `translate3d(${-dx}px, ${-dy}px, 0) rotate(${rotSign * 180}deg)`, offset: 1 },
    ];
    return [kA, kB];
  }

  function incHide(el) {
    const n = (hideCounts.get(el) || 0) + 1;
    hideCounts.set(el, n);
    if (n === 1) el.style.visibility = "hidden";
  }
  function decHide(el) {
    const n = (hideCounts.get(el) || 0) - 1;
    if (n <= 0) {
      hideCounts.delete(el);
      el.style.visibility = "";
    } else {
      hideCounts.set(el, n);
    }
  }

  async function animateRevertPath(savedPath) {
    for (let i = savedPath.length - 1; i > 0; i--) {
      const a = savedPath[i];
      const b = savedPath[i - 1];
      const colorA = COLOR_NAMES[board[a.r][a.c]];
      const colorB = COLOR_NAMES[board[b.r][b.c]];
      await animateSwapVisualWithColors(a, b, colorA, colorB).catch(() => {});
      swap(a, b);
      draw();
    }
  }

  

  function expandConnectedSameColor(b, seeds) {
    const n = b.length;
    const seen = new Set();
    const out = [];
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (const s of seeds) {
      const color = b[s.r][s.c];
      if (color === null || color === undefined) continue;
      const sk = key(s);
      if (seen.has(sk)) continue;

      const q = [s];
      while (q.length) {
        const p = q.shift();
        const k = key(p);
        if (seen.has(k)) continue;
        if (b[p.r][p.c] !== color) continue;
        seen.add(k);
        out.push(p);
        for (const [dr, dc] of dirs) {
          const nr = p.r + dr,
            nc = p.c + dc;
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          if (seen.has(`${nr},${nc}`)) continue;
          if (b[nr][nc] === color) q.push({ r: nr, c: nc });
        }
      }
    }
    return out;
  }

  // --- Rendering ---
  function draw() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = tileEls[r][c];
        const v = board[r][c];
        const color = COLOR_NAMES[v];
        el.className = `tile ${color}`;
      }
    }
    // Restore trail highlight if dragging
    if (dragging) refreshTrail();
  }

  function refreshTrail() {
    clearTrail();
    for (const { r, c } of path) {
      tileEls[r][c].classList.add("trail");
    }
  }

  function clearTrail() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        tileEls[r][c].classList.remove("trail");
      }
    }
  }

  function updateScore(v) {
    score = v;
    scoreEl.textContent = String(score);
  }
})();
