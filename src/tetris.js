const COLS = 10;
const ROWS = 20;
const SHAPES = [
  { name: "I", color: "#55d8ff", cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  { name: "O", color: "#ffd15c", cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  { name: "T", color: "#b49aff", cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  { name: "S", color: "#69e6a6", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { name: "Z", color: "#ff7188", cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { name: "J", color: "#718cff", cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  { name: "L", color: "#ff9e63", cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }
];

function shuffledBag() {
  const bag = [...SHAPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function createTetris(viewport, onClose = () => {}) {
  const panel = document.createElement("section");
  panel.className = "tetris-overlay";
  panel.setAttribute("aria-label", "Tetris játék");
  panel.innerHTML = `
    <header class="tetris-header"><div><span class="tetris-kicker">PROJECT UNICORN · PLAY MODE</span><h2>Neon Tetris</h2></div>
      <div class="tetris-actions"><button type="button" data-action="pause">Ⅱ Szünet</button><button type="button" data-action="restart">↻ Újrakezdés</button><button type="button" data-action="close" aria-label="Vissza a szerkesztőbe">✕ Kilépés</button></div>
    </header>
    <div class="tetris-layout"><aside class="tetris-side"><div class="tetris-stat"><span>PONTSZÁM</span><b data-score>0</b></div><div class="tetris-stat"><span>SOROK</span><b data-lines>0</b></div><div class="tetris-stat"><span>SZINT</span><b data-level>1</b></div><div class="tetris-next-label">KÖVETKEZŐ</div><canvas class="tetris-next" width="112" height="92" aria-label="Következő elem"></canvas><p class="tetris-keys"><kbd>←</kbd><kbd>→</kbd> mozgatás<br><kbd>↑</kbd> forgatás<br><kbd>↓</kbd> gyorsítás<br><kbd>Space</kbd> leejtés<br><kbd>P</kbd> szünet</p></aside>
      <div class="tetris-board-wrap"><canvas class="tetris-board" tabindex="0" aria-label="Tetris játéktábla"></canvas><div class="tetris-message" hidden></div></div>
    </div>
    <div class="tetris-touch" aria-label="Érintős vezérlők"><button data-action="left" aria-label="Balra">←</button><button data-action="rotate" aria-label="Forgatás">↻</button><button data-action="down" aria-label="Le">↓</button><button data-action="right" aria-label="Jobbra">→</button><button data-action="drop" aria-label="Leejtés">⇊</button></div>`;
  viewport.append(panel);
  const boardCanvas = panel.querySelector(".tetris-board");
  const nextCanvas = panel.querySelector(".tetris-next");
  const ctx = boardCanvas.getContext("2d");
  const nextCtx = nextCanvas.getContext("2d");
  const scoreEl = panel.querySelector("[data-score]");
  const linesEl = panel.querySelector("[data-lines]");
  const levelEl = panel.querySelector("[data-level]");
  const message = panel.querySelector(".tetris-message");
  let board = emptyBoard();
  let bag = shuffledBag();
  let next = takePiece();
  let current = takePiece();
  let score = 0;
  let lines = 0;
  let level = 1;
  let paused = false;
  let over = false;
  let previousFrame = 0;
  let dropTimer = 0;
  let animationFrame = 0;
  let resizeObserver;

  function emptyBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }
  function takePiece() {
    if (!bag.length) bag = shuffledBag();
    const shape = bag.pop();
    return { ...shape, cells: shape.cells.map(([x, y]) => [x, y]), x: 3, y: 0 };
  }
  function collides(piece, dx = 0, dy = 0, cells = piece.cells) {
    return cells.some(([x, y]) => {
      const bx = piece.x + x + dx;
      const by = piece.y + y + dy;
      return bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && board[by][bx]);
    });
  }
  function spawn() {
    current = next;
    current.x = 3;
    current.y = 0;
    next = takePiece();
    if (collides(current)) {
      over = true;
      message.innerHTML = `<b>Játék vége</b><span>Végső pontszám: ${score}</span><button type="button" data-action="restart">Új játék</button>`;
      message.hidden = false;
    }
  }
  function lockPiece() {
    for (const [x, y] of current.cells) {
      const row = current.y + y;
      if (row < 0) { over = true; message.hidden = false; message.innerHTML = `<b>Játék vége</b><span>Végső pontszám: ${score}</span><button type="button" data-action="restart">Új játék</button>`; return; }
      board[row][current.x + x] = current.color;
    }
    let cleared = 0;
    board = board.filter(row => {
      if (row.every(Boolean)) { cleared++; return false; }
      return true;
    });
    while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
    if (cleared) {
      lines += cleared;
      score += [0, 100, 300, 500, 800][cleared] * level;
      level = Math.floor(lines / 10) + 1;
      updateStats();
    }
    spawn();
  }
  function stepDown(soft = false) {
    if (over || paused) return;
    if (!collides(current, 0, 1)) {
      current.y++;
      if (soft) { score++; updateStats(); }
    } else lockPiece();
  }
  function move(dx) { if (!over && !paused && !collides(current, dx, 0)) current.x += dx; }
  function rotate() {
    if (over || paused || current.name === "O") return;
    const rotated = current.cells.map(([x, y]) => [2 - y, x]);
    const minX = Math.min(...rotated.map(([x]) => x));
    const minY = Math.min(...rotated.map(([, y]) => y));
    const normalized = rotated.map(([x, y]) => [x - minX, y - minY]);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(current, kick, 0, normalized)) { current.x += kick; current.cells = normalized; return; }
    }
  }
  function hardDrop() {
    if (over || paused) return;
    let distance = 0;
    while (!collides(current, 0, 1)) { current.y++; distance++; }
    score += distance * 2;
    updateStats();
    lockPiece();
  }
  function updateStats() {
    scoreEl.textContent = score.toLocaleString("hu-HU");
    linesEl.textContent = String(lines);
    levelEl.textContent = String(level);
  }
  function roundedBlock(target, x, y, size, color, ghost = false) {
    const inset = Math.max(1, size * 0.055);
    target.globalAlpha = ghost ? 0.24 : 1;
    target.fillStyle = color;
    target.beginPath();
    target.roundRect(x + inset, y + inset, size - inset * 2, size - inset * 2, Math.max(2, size * 0.16));
    target.fill();
    if (!ghost) {
      target.fillStyle = "#ffffff30";
      target.fillRect(x + inset * 2, y + inset * 2, size - inset * 4, Math.max(1, size * 0.09));
    }
    target.globalAlpha = 1;
  }
  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(200, boardCanvas.clientWidth);
    const height = Math.max(360, boardCanvas.clientHeight);
    if (boardCanvas.width !== Math.round(width * dpr) || boardCanvas.height !== Math.round(height * dpr)) {
      boardCanvas.width = Math.round(width * dpr);
      boardCanvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const cell = Math.floor(Math.min(width / COLS, height / ROWS));
    const boardW = cell * COLS;
    const boardH = cell * ROWS;
    const ox = Math.floor((width - boardW) / 2);
    const oy = Math.floor((height - boardH) / 2);
    ctx.fillStyle = "#10131b";
    ctx.fillRect(ox - 5, oy - 5, boardW + 10, boardH + 10);
    ctx.strokeStyle = "#ffffff0c";
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(ox + x * cell + 0.5, oy); ctx.lineTo(ox + x * cell + 0.5, oy + boardH); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(ox, oy + y * cell + 0.5); ctx.lineTo(ox + boardW, oy + y * cell + 0.5); ctx.stroke(); }
    board.forEach((row, y) => row.forEach((color, x) => { if (color) roundedBlock(ctx, ox + x * cell, oy + y * cell, cell, color); }));
    if (!over) {
      let ghostY = current.y;
      while (!collides(current, 0, ghostY - current.y + 1)) ghostY++;
      current.cells.forEach(([x, y]) => roundedBlock(ctx, ox + (current.x + x) * cell, oy + (ghostY + y) * cell, cell, current.color, true));
      current.cells.forEach(([x, y]) => roundedBlock(ctx, ox + (current.x + x) * cell, oy + (current.y + y) * cell, cell, current.color));
    }
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const mini = Math.floor(Math.min(nextCanvas.width / 5, nextCanvas.height / 4));
    const minX = Math.min(...next.cells.map(([x]) => x));
    const maxX = Math.max(...next.cells.map(([x]) => x));
    const minY = Math.min(...next.cells.map(([, y]) => y));
    const maxY = Math.max(...next.cells.map(([, y]) => y));
    const nx = (nextCanvas.width - (maxX - minX + 1) * mini) / 2;
    const ny = (nextCanvas.height - (maxY - minY + 1) * mini) / 2;
    next.cells.forEach(([x, y]) => roundedBlock(nextCtx, nx + (x - minX) * mini, ny + (y - minY) * mini, mini, next.color));
  }
  function frame(time = 0) {
    const elapsed = Math.min(time - previousFrame, 100);
    previousFrame = time;
    if (!paused && !over) {
      dropTimer += elapsed;
      if (dropTimer >= Math.max(90, 850 - (level - 1) * 65)) { stepDown(); dropTimer = 0; }
    }
    draw();
    animationFrame = requestAnimationFrame(frame);
  }
  function restart() {
    board = emptyBoard(); bag = shuffledBag(); next = takePiece(); current = takePiece();
    score = 0; lines = 0; level = 1; paused = false; over = false; dropTimer = 0;
    message.hidden = true; panel.querySelector('[data-action="pause"]').textContent = "Ⅱ Szünet";
    updateStats(); boardCanvas.focus();
  }
  function togglePause() {
    if (over) return;
    paused = !paused;
    message.hidden = !paused;
    message.innerHTML = "<b>Szünet</b><span>Nyomd meg a P gombot a folytatáshoz</span>";
    panel.querySelector('[data-action="pause"]').textContent = paused ? "▶ Folytatás" : "Ⅱ Szünet";
  }
  function keydown(event) {
    const actions = { ArrowLeft: () => move(-1), ArrowRight: () => move(1), ArrowDown: () => stepDown(true), ArrowUp: rotate, " ": hardDrop, p: togglePause, P: togglePause };
    const action = actions[event.key];
    if (action) { event.preventDefault(); action(); }
  }
  function click(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "left") move(-1);
    else if (action === "right") move(1);
    else if (action === "down") stepDown(true);
    else if (action === "rotate") rotate();
    else if (action === "drop") hardDrop();
    else if (action === "pause") togglePause();
    else if (action === "restart") restart();
    else if (action === "close") destroy();
  }
  function destroy() {
    cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    window.removeEventListener("keydown", keydown);
    panel.removeEventListener("click", click);
    panel.remove();
    onClose();
  }
  window.addEventListener("keydown", keydown);
  panel.addEventListener("click", click);
  resizeObserver = new ResizeObserver(draw);
  resizeObserver.observe(panel.querySelector(".tetris-board-wrap"));
  requestAnimationFrame(() => { boardCanvas.focus(); animationFrame = requestAnimationFrame(frame); });
  return { destroy };
}
