"use strict";

(function () {
  const SIZE = 5;
  const COLOR_NAMES = ["red", "pink", "yellow", "green", "blue", "orange"]; // indices 0..5

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
  let animatingCascade = false; // during fall/refill animations
  const ROW_MS = 60; // per-row fall duration (default)
  const CLEAR_MS = 320; // fade-out duration

  // Speed configuration for collapse and refill stages
  const speedConfig = {
    collapse: {
      baseRowMs: 30,
      inboard_offset_ms: 0, // additive ms/row for y=5->1; collapse only (pre-refill)
    },
    refill: {
      baseRowMs: 30,
      above_offset_ms: 0, // additive ms/row for y=10->5 (refill before entering)
    },
    swap: {
      cw_offset_ms: 0,   // additive ms to SWAP_MS for clockwise orbits
      ccw_offset_ms: 45,  // additive ms to SWAP_MS for counter-clockwise orbits
    },
  };

  // Elements
  const boardEl = document.getElementById("board");
  const scoreEl = document.getElementById("score");
  const resetBtn = document.getElementById("reset");
  const mainEl = document.querySelector('.main');
  const lifeToggleBtn = document.getElementById('life-toggle');
  const debugToggleEl = document.getElementById("debug-toggle");
  const debugClearEl = document.getElementById("debug-clear");
  const debugPanelEl = document.getElementById("debug-panel");
  const timingPanelEl = document.getElementById("timing-panel");
  const timingToggleEl = document.getElementById("timing-toggle");
  let debugEnabled = false;
  let debugActionCount = 0;
  // Currently enlarged tile element during an active press/drag
  let pressedEl = null;

  // Life meter state/config
  let life = 60;
  const LIFE_MAX = 60;
  const DECAY_STEP = 5;
  const DECAY_INTERVAL_MS = 1000; // 10 per second
  const NO_MATCH_PENALTY = 20;
  let lifeTimer = null;
  let lifeActive = false; // meter starts only after first match
  let lost = false;
  let lifeSystemEnabled = true; // on/off toggle
  let lifeWrapEl = null, lifeMeterEl = null, lifeFillEl = null, lifeTextEl = null;

  // Build grid once
  const tileEls = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  buildGrid();
  buildLifeMeter();
  // Overlay for continuous outside glow
  const glowOverlayEl = document.createElement("div");
  glowOverlayEl.className = "glow-overlay";
  boardEl.appendChild(glowOverlayEl);
  draw();
  updateScore(0);
  updateLifeUI();
  // Do not start decay until the first match is detected
  setupDebugUI();
  setupTimingPanel();
  setupLifeToggle();

  // Events
  resetBtn.addEventListener("click", () => {
    dragging = false;
    clearPressed();
    clearTrail();
    score = 0;
    updateScore(0);
    board = createInitialBoard(SIZE);
    draw();
    // Reset life and state — meter will start after first match (if enabled)
    lost = false;
    lifeActive = false;
    setLife(LIFE_MAX);
    hideGameOver();
    stopLifeDecayTimer();
    if (debugEnabled) {
      debugPanelEl.innerHTML = "";
      debugActionCount = 0;
      updateClearButtonVisibility();
    }
  });

  // Always clear press state on release/cancel; keep existing game logic
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointerup", clearPressed);
  window.addEventListener("pointercancel", clearPressed);
  window.addEventListener("resize", positionDebugUI);
  window.addEventListener("scroll", positionDebugUI, { passive: true });
  window.addEventListener("resize", positionTimingPanel);
  window.addEventListener("scroll", positionTimingPanel, { passive: true });
  window.addEventListener('resize', positionLifeMeter);
  window.addEventListener('scroll', positionLifeMeter, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopLifeDecayTimer();
    } else {
      restartLifeDecayTimer();
    }
  });
  

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

  function buildLifeMeter() {
    if (!mainEl) return;
    lifeWrapEl = document.createElement('div');
    lifeWrapEl.className = 'life-container';
    lifeMeterEl = document.createElement('div');
    lifeMeterEl.className = 'life-meter';
    lifeFillEl = document.createElement('div');
    lifeFillEl.className = 'life-fill';
    lifeTextEl = document.createElement('div');
    lifeTextEl.className = 'life-text';
    lifeTextEl.setAttribute('aria-live', 'polite');
    lifeMeterEl.appendChild(lifeFillEl);
    lifeMeterEl.appendChild(lifeTextEl);
    lifeWrapEl.appendChild(lifeMeterEl);
    // Insert above the board element
    if (boardEl.parentNode === mainEl) {
      mainEl.insertBefore(lifeWrapEl, boardEl);
    } else {
      mainEl.appendChild(lifeWrapEl);
    }
    positionLifeMeter();
  }

  function setupLifeToggle() {
    if (!lifeToggleBtn) return;
    const refresh = () => {
      lifeToggleBtn.textContent = lifeSystemEnabled ? 'Life: On' : 'Life: Off';
      if (lifeMeterEl) lifeMeterEl.classList.toggle('disabled', !lifeSystemEnabled);
    };
    refresh();
    lifeToggleBtn.addEventListener('click', () => {
      lifeSystemEnabled = !lifeSystemEnabled;
      if (!lifeSystemEnabled) {
        // Turning off the life system: stop timers, clear loss state and overlay
        stopLifeDecayTimer();
        lost = false;
        lifeActive = false; // require a new match to start when re-enabled
        hideGameOver();
      } else {
        // Re-enabled: wait for first successful match to start
        // no immediate start here to honor the rule
      }
      refresh();
    });
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

  // --- Timing Panel ---
  function setupTimingPanel() {
    if (!timingPanelEl) return;
    timingPanelEl.innerHTML = buildTimingPanelHtml();
    const applyBtn = timingPanelEl.querySelector('#timing-apply');
    const resetBtn = timingPanelEl.querySelector('#timing-reset');
    if (applyBtn) applyBtn.addEventListener('click', applyTimingFromUI);
    if (resetBtn) resetBtn.addEventListener('click', () => { resetTimingToDefault(); renderTimingToUI(); });
    renderTimingToUI();
    // Toggle setup
    if (timingToggleEl) {
      timingToggleEl.style.display = 'block';
      let visible = false;
      timingPanelEl.style.display = 'none';
      timingToggleEl.textContent = 'Show Panel';
      timingToggleEl.addEventListener('click', () => {
        visible = !visible;
        timingPanelEl.style.display = visible ? 'block' : 'none';
        timingToggleEl.textContent = visible ? 'Hide Panel' : 'Show Panel';
        positionTimingPanel();
      });
    }
    positionTimingPanel();
  }

  function buildTimingPanelHtml() {
    const baseInput = (prefix, label) => `<div class=\"grid\"><label>${label} Base ms/row</label><input id=\"${prefix}-base\" type=\"number\" min=\"10\" max=\"1000\" step=\"10\"></div>`;
    return `
      <div class=\"section\">
        <h3>Panel 1 — Falling speed (above the playboard)</h3>
        <div class=\"grid\"><label>Above-board offset (ms/row)</label><input id=\"above-offset\" type=\"number\" min=\"-500\" max=\"500\" step=\"5\"></div>
        ${baseInput('refill', 'Refill')}
      </div>
      <div class=\"section\">
        <h3>Panel 2 — Collapse speed (within the playboard)</h3>
        <div class=\"small\">Only affects collapse (pre-refill) from row 5 to row 1.</div>
        <div class=\"grid\"><label>Collapse offset (ms/row)</label><input id=\"inboard-offset\" type=\"number\" min=\"-500\" max=\"500\" step=\"5\"></div>
        ${baseInput('collapse', 'Collapse')}
      </div>
      <div class=\"section\">\n        <h3>Panel 3 — Swapping speed</h3>\n        <div class=\"small\">Adjust CW/CCW swap duration by ±ms relative to base (90ms).</div>\n        <div class=\"grid\"><label>Clockwise offset (ms)</label><input id=\"swap-cw\" type=\"number\" min=\"-1000\" max=\"1000\" step=\"5\"></div>\n        <div class=\"grid\"><label>Counter-clockwise offset (ms)</label><input id=\"swap-ccw\" type=\"number\" min=\"-1000\" max=\"1000\" step=\"5\"></div>\n      </div>
      <div class=\"actions\">
        <button id=\"timing-reset\" class=\"btn\" type=\"button\">Reset</button>
        <button id=\"timing-apply\" class=\"btn\" type=\"button\">Apply</button>
      </div>
    `;
  }

  function renderTimingToUI() {
    if (!timingPanelEl) return;
    const write = (id, v) => { const el = timingPanelEl.querySelector(`#${id}`); if (el) el.value = String(v); };
    write('collapse-base', speedConfig.collapse.baseRowMs);
    write('refill-base', speedConfig.refill.baseRowMs);
    write('above-offset', speedConfig.refill.above_offset_ms);
    write('inboard-offset', speedConfig.collapse.inboard_offset_ms);
    write('swap-cw', (speedConfig.swap && speedConfig.swap.cw_offset_ms) || 0);
    write('swap-ccw', (speedConfig.swap && speedConfig.swap.ccw_offset_ms) || 0);
  }

  function applyTimingFromUI() {
    if (!timingPanelEl) return;
    const readNum = (id, fallback) => {
      const el = timingPanelEl.querySelector(`#${id}`);
      const v = el ? parseFloat(el.value) : NaN;
      return Number.isFinite(v) ? v : fallback;
    };
    speedConfig.collapse.baseRowMs = Math.max(10, readNum('collapse-base', ROW_MS));
    speedConfig.refill.baseRowMs = Math.max(10, readNum('refill-base', ROW_MS));
    speedConfig.refill.above_offset_ms = Math.max(-500, Math.min(500, readNum('above-offset', 0)));
    speedConfig.collapse.inboard_offset_ms = Math.max(-500, Math.min(500, readNum('inboard-offset', 0)));
    speedConfig.swap.cw_offset_ms = Math.max(-1000, Math.min(1000, readNum('swap-cw', 0)));
    speedConfig.swap.ccw_offset_ms = Math.max(-1000, Math.min(1000, readNum('swap-ccw', 0)));
  }

  function resetTimingToDefault() {
    // Defaults per request
    speedConfig.collapse.baseRowMs = 30;
    speedConfig.refill.baseRowMs = 30;
    speedConfig.refill.above_offset_ms = 0;
    speedConfig.collapse.inboard_offset_ms = 0;
    speedConfig.swap.cw_offset_ms = 0;
    speedConfig.swap.ccw_offset_ms = 45;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function positionTimingPanel() {
    if (!timingPanelEl) return;
    const rect = boardEl.getBoundingClientRect();
    const margin = 16;
    const top = Math.max(8, Math.round(rect.top));
    const toggleW = timingToggleEl ? (timingToggleEl.offsetWidth || 110) : 110;
    let toggleLeft = Math.max(8, Math.round(rect.left - margin - toggleW));
    if (timingToggleEl) {
      timingToggleEl.style.left = toggleLeft + 'px';
      timingToggleEl.style.top = top + 'px';
    }
    const toggleHeight = 36;
    const panelW = timingPanelEl.offsetWidth || 320;
    const panelLeft = Math.max(8, Math.round(rect.left - margin - panelW));
    timingPanelEl.style.left = panelLeft + 'px';
    timingPanelEl.style.top = Math.round(top + toggleHeight + 8) + 'px';
  }

  function positionLifeMeter() {
    if (!lifeMeterEl) return;
    const rect = boardEl.getBoundingClientRect();
    const w = Math.max(0, Math.round(rect.width));
    lifeMeterEl.style.width = w + 'px';
  }

  // --- Input handlers ---
  function onPointerDown(e) {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    // Visual press feedback (independent of gameplay state)
    if (pressedEl && pressedEl !== tile) pressedEl.classList.remove("pressed");
    tile.classList.add("pressed");
    pressedEl = tile;
    if (lost || reverting || animatingCascade) return;
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

  // Clear any pressed visuals
  function clearPressed() {
    if (pressedEl) pressedEl.classList.remove("pressed");
    pressedEl = null;
  }

  function onTileEnter(e) {
    if (!dragging) return;
    const tile = e.target.closest(".tile");
    if (!tile) return;
    // Keep the enlarge on the current hovered tile during drag
    if (pressedEl && pressedEl !== tile) pressedEl.classList.remove("pressed");
    tile.classList.add("pressed");
    pressedEl = tile;
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

  async function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    boardEl.classList.remove("dragging");
    clearTrail();
    clearGlowPreview();

    // Check for any matches
    const anyCleared = await resolveMatchesAndCascades();
    if (anyCleared === 0) {
      // No match -> visually roll back along the path
      reverting = true;
      // Apply penalty for failed move only if life has started
      if (lifeSystemEnabled && lifeActive) addLife(-NO_MATCH_PENALTY);
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

  async function resolveMatchesAndCascades() {
    let matchCount = 0;
    animatingCascade = true;
    try {
      // Ensure queued swap animations finished
      await swapAnimChain.catch(() => {});
      while (true) {
        const matches = findMatches(board);
        if (matches.length === 0) break;

        const toClear = expandConnectedSameColor(board, matches);
        // Count connected clusters within the clear set as individual matches
        matchCount += countClearClusters(board, toClear);

        const boardBefore = debugEnabled ? cloneBoard(board) : null;

        // Fade out matched tiles (fixed duration/easing)
        for (const { r, c } of toClear) {
          const el = tileEls[r][c];
          if (el) el.classList.add("clearing");
        }
        await new Promise((res) => setTimeout(res, CLEAR_MS));
        for (const { r, c } of toClear) {
          const el = tileEls[r][c];
          if (el) el.classList.remove("clearing");
        }

        // Ensure life system starts on first match, then apply life gains
        if (lifeSystemEnabled && !lifeActive) startLife();
        // Apply life gains for this wave after tiles disappeared
        const sizes = clusterSizesForClear(board, toClear);
        let lifeGain = 0;
        for (const sz of sizes) {
          if (sz >= 8) lifeGain += 30;
          else if (sz >= 6) lifeGain += 15;
          else if (sz >= 3) lifeGain += 5;
        }
        // Double gain if multiple clusters matched in this wave
        if (sizes.length >= 2) lifeGain *= 2;
        if (lifeSystemEnabled && lifeGain > 0) addLife(lifeGain);

        // Snapshot board after clear (without mutating original yet)
        const snapshot = board.map((row) => row.slice());
        for (const { r, c } of toClear) snapshot[r][c] = null;
        const boardAfterClear = debugEnabled ? cloneBoard(snapshot) : null;

        // Compute gravity plan
        const plan = computeGravityPlan(snapshot);

        // Set actual board to cleared snapshot (underlay), then animate overlay fall/refill
        board = snapshot;
        draw();
        await animateFallAndRefill(plan, snapshot);

        // Commit next board
        board = plan.nextBoard;
        draw();

        if (debugEnabled) {
          const boardAfterCollapse = cloneBoard(board);
          logDebugAction(++debugActionCount, matches, toClear, boardBefore, boardAfterClear, boardAfterCollapse);
        }
      }
    } finally {
      animatingCascade = false;
    }
    if (matchCount > 0) updateScore(score + matchCount * 10);
    draw();
    return matchCount;
  }

  function measureRowDistance() {
    const gapStr = getComputedStyle(boardEl).rowGap || getComputedStyle(boardEl).gap || "0";
    const gap = parseFloat(gapStr) || 0;
    const t = tileEls[0] && tileEls[0][0] ? tileEls[0][0].getBoundingClientRect().height : 0;
    return t + gap;
  }

  function cellRect(r, c) {
    const br = boardEl.getBoundingClientRect();
    const el = tileEls[r][c];
    const rr = el.getBoundingClientRect();
    return { left: rr.left - br.left, top: rr.top - br.top, width: rr.width, height: rr.height };
  }

  function computeGravityPlan(snapshot) {
    const n = SIZE;
    const next = Array.from({ length: n }, () => Array(n).fill(null));
    const survivors = [];
    const spawns = [];
    for (let c = 0; c < n; c++) {
      const nonNull = [];
      for (let r = n - 1; r >= 0; r--) {
        const v = snapshot[r][c];
        if (v !== null && v !== undefined) nonNull.push({ v, fromR: r });
      }
      let write = n - 1;
      for (const item of nonNull) {
        next[write][c] = item.v;
        const rows = write - item.fromR;
        if (rows > 0) survivors.push({ from: { r: item.fromR, c }, to: { r: write, c }, rows });
        write--;
      }
      for (let r = write; r >= 0; r--) {
        const color = rngTile();
        next[r][c] = color;
        spawns.push({ to: { r, c }, rowsFromTop: r + 1, color });
      }
    }
    return { nextBoard: next, survivors, spawns };
  }

  async function animateFallAndRefill(plan, snapshot) {
    const rowPx = measureRowDistance();
    const overlay = document.createElement("div");
    overlay.className = "fall-overlay";
    boardEl.appendChild(overlay);

    // Row-ordered start (bottom earliest) and synchronized landing
    const collapseBase = speedConfig.collapse.baseRowMs || ROW_MS;
    const refillBase = speedConfig.refill.baseRowMs || ROW_MS;
    const waveBaseMs = Math.max(collapseBase, refillBase);
    const ALPHA = 0.35 * waveBaseMs; // per-rank stagger (ms)
    const MIN_DUR = 40; // lower bound for an individual fall duration

    // Compute common end time across all fallers (survivors + spawns),
    // factoring in row-based start offsets so columns share the same schedule per row.
    let T_end = 0;
    for (const s of plan.survivors) {
      const factor = 1;
      const perRowInside = Math.max(10, (collapseBase / Math.max(0.1, factor)) + (speedConfig.collapse.inboard_offset_ms || 0));
      const baseDur = Math.max(perRowInside * s.rows, MIN_DUR);
      const rank = (SIZE - 1) - s.to.r; // bottom earliest
      const tStart = ALPHA * rank;
      const candidateEnd = baseDur + tStart;
      if (candidateEnd > T_end) T_end = candidateEnd;
    }
    for (const sp of plan.spawns) {
      const factorIn = 1;
      const colF = 1;
      const y_to = SIZE - sp.to.r;
      const rowsAbove = 10 - 5;
      const rowsIn = Math.max(0, 5 - y_to);
      const perRowAbove = Math.max(10, (refillBase / colF) + (speedConfig.refill.above_offset_ms || 0));
      const perRowInside = Math.max(10, (refillBase / Math.max(0.1, factorIn)) + 0);
      const baseDur = Math.max(rowsAbove * perRowAbove + rowsIn * perRowInside, MIN_DUR);
      const rank = (SIZE - 1) - sp.to.r; // bottom earliest
      const tStart = ALPHA * rank;
      const candidateEnd = baseDur + tStart;
      if (candidateEnd > T_end) T_end = candidateEnd;
    }

    const survivorsAnims = [];
    const hidden = [];
    for (const s of plan.survivors) {
      const from = cellRect(s.from.r, s.from.c);
      const colorIdx = snapshot[s.from.r][s.from.c];
      const color = COLOR_NAMES[colorIdx];
      if (color == null) continue;
      const clone = document.createElement("div");
      clone.className = `tile ${color} fall-clone`;
      clone.style.left = `${from.left}px`;
      clone.style.top = `${from.top}px`;
      clone.style.width = `${from.width}px`;
      clone.style.height = `${from.height}px`;
      clone.style.zIndex = String(100 + s.to.r);
      overlay.appendChild(clone);
      const elFrom = tileEls[s.from.r][s.from.c];
      if (elFrom) { incHide(elFrom); hidden.push(elFrom); }
      const distance = (s.to.r - s.from.r) * rowPx;
      const factor = Math.max(0.1, computeCollapseFactor(s.from.r, s.to.r, s.to.c));
      const perRowInside = Math.max(10, (collapseBase / factor) + (speedConfig.collapse.inboard_offset_ms || 0));
      const baseDur = Math.max(perRowInside * s.rows, MIN_DUR);
      const rank = (SIZE - 1) - s.to.r; // bottom row=0 (earliest)
      const tStart = ALPHA * rank;
      const collapseDelay = tStart;
      const collapseDuration = Math.max(T_end - tStart, MIN_DUR);
      const a = clone.animate([
        { transform: 'translate3d(0, 0, 0)' },
        { transform: `translate3d(0, ${distance}px, 0)` }
      ], { duration: collapseDuration, delay: collapseDelay, easing: 'ease-in-out', fill: 'forwards' });
      survivorsAnims.push(a.finished.catch(() => {}));
    }
    // Spawns animate concurrently with per-row duration
    const spawnsAnims = [];
    for (const sp of plan.spawns) {
      const to = cellRect(sp.to.r, sp.to.c);
      const clone = document.createElement("div");
      const color = COLOR_NAMES[sp.color];
      clone.className = `tile ${color} fall-clone`;
      clone.style.left = `${to.left}px`;
      const startY = 10;
      const y_to = SIZE - sp.to.r;
      const deltaRows = Math.max(0, startY - y_to);
      clone.style.top = `${to.top - deltaRows * rowPx}px`;
      clone.style.width = `${to.width}px`;
      clone.style.height = `${to.height}px`;
      clone.style.zIndex = String(100 + sp.to.r);
      overlay.appendChild(clone);
      const factorIn = 1;
      const colF = 1;
      const rowsAbove = 10 - 5;
      const rowsIn = Math.max(0, 5 - y_to);
      const perRowAbove = Math.max(10, (refillBase / colF) + (speedConfig.refill.above_offset_ms || 0));
      const perRowInside = Math.max(10, (refillBase / Math.max(0.1, factorIn)) + 0);
      const baseDur = Math.max(rowsAbove * perRowAbove + rowsIn * perRowInside, MIN_DUR);
      const rank = (SIZE - 1) - sp.to.r; // bottom earliest
      const tStart = ALPHA * rank;
      const refillDelay = tStart;
      const refillDuration = Math.max(T_end - tStart, MIN_DUR);
      const a = clone.animate([
        { transform: 'translate3d(0, 0, 0)' },
        { transform: `translate3d(0, ${deltaRows * rowPx}px, 0)` }
      ], { duration: refillDuration, delay: refillDelay, easing: 'ease-in-out', fill: 'forwards' });
      spawnsAnims.push(a.finished.catch(() => {}));
    }

    await Promise.all([...survivorsAnims, ...spawnsAnims]);
    try { overlay.remove(); } catch {}
    for (const el of hidden) decHide(el);
  }

  function computeCollapseFactor(fromR, toR, c) { return 1; }

  function computeRefillFactor(toR, c) { return 1; }

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

    // If membership changed, toggle epoch to restart the breathing animation.
    if (changed) {
      glowEpoch = 1 - glowEpoch;
      boardEl.classList.toggle("glow-epoch-0", glowEpoch === 0);
      boardEl.classList.toggle("glow-epoch-1", glowEpoch === 1);
    }

    // Always rebuild overlay geometry so it aligns with any transforms
    // (e.g., the 15% press scale while holding during a match).
    while (glowOverlayEl.firstChild) glowOverlayEl.removeChild(glowOverlayEl.firstChild);
    if (nextSet.size > 0) {
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
    }
    glowSet = nextSet;
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
    const timing = { duration: computeSwapDuration(clockwise), easing: "ease-in-out", fill: "forwards" };

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
    const timing = { duration: computeSwapDuration(clockwise), easing: "ease-in-out", fill: "forwards" };
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

  // Compute swap duration based on direction and panel offsets
  function computeSwapDuration(clockwise) {
    const base = SWAP_MS;
    const cfg = speedConfig.swap || {};
    const off = clockwise ? (cfg.cw_offset_ms || 0) : (cfg.ccw_offset_ms || 0);
    const dur = base + off;
    return Math.max(20, Math.min(2000, dur));
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

  // Count number of 4-connected same-color clusters within the set of cells to clear
  function countClearClusters(b, toClear) {
    if (!toClear || toClear.length === 0) return 0;
    const set = new Set(toClear.map(({r,c}) => `${r},${c}`));
    const seen = new Set();
    const n = b.length;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    let clusters = 0;
    for (const {r, c} of toClear) {
      const k = `${r},${c}`;
      if (seen.has(k)) continue;
      clusters++;
      const color = b[r][c];
      const q = [{r, c}];
      seen.add(k);
      while (q.length) {
        const p = q.pop();
        for (const [dr, dc] of dirs) {
          const nr = p.r + dr, nc = p.c + dc;
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          const nk = `${nr},${nc}`;
          if (!set.has(nk) || seen.has(nk)) continue;
          if (b[nr][nc] !== color) continue;
          seen.add(nk);
          q.push({r: nr, c: nc});
        }
      }
    }
    return clusters;
  }

  // Return sizes of same-color clusters within the toClear set (for a single wave)
  function clusterSizesForClear(b, toClear) {
    if (!toClear || toClear.length === 0) return [];
    const set = new Set(toClear.map(({r,c}) => `${r},${c}`));
    const seen = new Set();
    const n = b.length;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    const sizes = [];
    for (const {r, c} of toClear) {
      const k = `${r},${c}`;
      if (seen.has(k)) continue;
      const color = b[r][c];
      let size = 0;
      const q = [{r, c}];
      seen.add(k);
      while (q.length) {
        const p = q.pop();
        size++;
        for (const [dr, dc] of dirs) {
          const nr = p.r + dr, nc = p.c + dc;
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          const nk = `${nr},${nc}`;
          if (!set.has(nk) || seen.has(nk)) continue;
          if (b[nr][nc] !== color) continue;
          seen.add(nk);
          q.push({r: nr, c: nc});
        }
      }
      sizes.push(size);
    }
    return sizes;
  }

  // --- Rendering ---
  function draw() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = tileEls[r][c];
        const v = board[r][c];
        if (v === null || v === undefined) {
          el.className = 'tile';
          // Hide empty cells during cleared state to avoid showing stale colors
          el.style.visibility = 'hidden';
        } else {
          const color = COLOR_NAMES[v];
          el.className = `tile ${color}`;
          // Ensure visibility is restored unless an animation explicitly hid it
          const hiddenCount = hideCounts.get(el) || 0;
          if (hiddenCount <= 0) el.style.visibility = '';
        }
      }
    }
    // Reapply pressed visual after class resets
    if (pressedEl) pressedEl.classList.add('pressed');
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

  // --- Life helpers ---
  function setLife(v) {
    const nv = clamp(v, 0, LIFE_MAX);
    life = nv;
    updateLifeUI();
    if (life <= 0) {
      onGameOver();
    }
  }
  function addLife(delta) {
    setLife(life + delta);
    // Do not reset decay schedule on gains/penalties; decay continues only by its own drops
  }
  function updateLifeUI() {
    if (!lifeFillEl || !lifeTextEl) return;
    const pct = (life / LIFE_MAX) * 100;
    lifeFillEl.style.width = pct + '%';
    lifeTextEl.textContent = `Life: ${life} / ${LIFE_MAX}`;
  }
  function restartLifeDecayTimer() {
    stopLifeDecayTimer();
    if (lost || !lifeActive) return;
    lifeTimer = setTimeout(() => {
      if (life > 0) {
        setLife(life - DECAY_STEP);
      }
      if (!lost && life > 0) restartLifeDecayTimer();
    }, DECAY_INTERVAL_MS);
  }
  function stopLifeDecayTimer() {
    if (lifeTimer) {
      clearTimeout(lifeTimer);
      lifeTimer = null;
    }
  }
  function onGameOver() {
    lost = true;
    stopLifeDecayTimer();
    showGameOver();
  }
  function startLife() {
    lifeActive = true;
    setLife(LIFE_MAX);
    restartLifeDecayTimer();
  }
  function showGameOver() {
    let overlay = document.querySelector('.game-over');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'game-over';
      const card = document.createElement('div');
      card.className = 'card';
      const title = document.createElement('h2');
      title.textContent = 'Life depleted — Game Over';
      const info = document.createElement('p');
      info.textContent = 'Press Reset to start again.';
      const actions = document.createElement('div');
      actions.className = 'actions';
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Reset';
      btn.addEventListener('click', () => resetBtn.click());
      actions.appendChild(btn);
      card.appendChild(title);
      card.appendChild(info);
      card.appendChild(actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
  }
  function hideGameOver() {
    const overlay = document.querySelector('.game-over');
    if (overlay) overlay.style.display = 'none';
  }
})();
