import Phaser from "phaser";
import { Engine, Scene as BabylonScene, ArcRotateCamera, HemisphericLight, Vector3, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
import { createProject, cloneProject, validateProject } from "./project.js";
import { saveProject, loadProject, downloadProject, readProjectFile } from "./storage.js";
import { parseEditorCommand, applyEditorCommand } from "./ai-bridge.js";
import "./style.css";

const restored = loadProject();
let project = restored || createProject();
let selectedId = project.scenes[0].objects[0]?.id || null;
let statusText = restored ? "Projekt helyreállítva a helyi mentésből." : "Új projekt · automatikus mentés aktív";
let history = [];
let phaserGame = null;
let babylonEngine = null;
let saveTimer = null;

const app = document.querySelector("#app");
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Project Unicorn"><span class="brand-mark">✳</span><span>PROJECT <b>UNICORN</b><small>AI GAME LAB · EARLY ACCESS</small></span></a>
    <div class="project-title"><span class="live-dot"></span><input id="project-name" aria-label="Projekt neve" maxlength="70" value=""></div>
    <div class="top-actions"><span id="save-status" class="save-status"></span><button id="undo-btn" class="button quiet" title="Visszavonás">↶ Undo</button><button id="export-btn" class="button quiet">Export JSON</button><button id="import-btn" class="button primary">Import project ↑</button><input id="file-input" type="file" accept=".json,.unicorn.json,application/json" hidden></div>
  </header>
  <div class="workspace">
    <aside class="sidebar">
      <div class="panel-heading"><span>PROJECT</span><button id="new-object" class="icon-button" title="Új objektum">＋</button></div>
      <div class="scene-row"><span>▧</span><div><b>Main Scene</b><small>SCENE · 01</small></div><span class="scene-menu">•••</span></div>
      <div class="panel-heading objects-heading"><span>OBJECTS</span><span id="object-count">02</span></div>
      <div id="object-list" class="object-list"></div>
      <div class="sidebar-footer"><span class="avatar">U</span><div><b>Unicorn Workspace</b><small>Local project</small></div><span class="status-pill">FREE</span></div>
    </aside>
    <main class="center">
      <div class="toolbar">
        <div class="mode-switch"><button data-mode="2d" class="mode-btn active">▦ 2D Editor</button><button data-mode="3d" class="mode-btn">◇ 3D Editor</button></div>
        <div class="tool-group"><button class="tool-btn active" title="Select">↖</button><button id="grid-toggle" class="tool-btn" title="Rács kapcsolása">▦</button><span class="separator"></span><span class="zoom-label">100%</span></div>
        <button id="add-circle" class="button small">＋ Circle</button><button id="add-rect" class="button small">＋ Rectangle</button>
      </div>
      <section id="viewport" class="viewport"><div class="viewport-badge">MAIN SCENE <span>● LIVE</span></div><div class="canvas-hint">Click an object to select · Drag to move</div></section>
      <footer class="bottom-bar"><span><i class="status-dot"></i> Engine ready</span><span id="scene-info">Scene 01 / Main Scene</span><span>Autosave <b>ON</b> · Local</span></footer>
    </main>
    <aside class="inspector">
      <div class="inspector-head"><div><small>INSPECTOR</small><h2 id="inspector-title">No selection</h2></div><span class="inspector-icon">☷</span></div>
      <div id="inspector-content" class="inspector-content"></div>
      <div class="ai-panel">
        <div class="ai-title"><span class="ai-spark">✳</span><div><b>Unicorn AI</b><small>COMMAND BRIDGE · PREVIEW</small></div><span class="beta">BETA</span></div>
        <p>Describe a change in plain language. Commands are validated before they touch your project.</p>
        <form id="ai-form"><textarea id="ai-input" rows="2" placeholder="e.g. add circle"></textarea><button class="button ai-send" type="submit">Run command ↗</button></form>
        <div id="ai-output" class="ai-output">Try: <code>add circle</code> · <code>move Player 300,200</code></div>
      </div>
    </aside>
  </div>
  <div id="toast" class="toast" role="status"></div>
`;

document.querySelector("#project-name").value = project.name;
const scene = () => project.scenes[0];
const selected = () => scene().objects.find(o => o.id === selectedId) || null;
const viewport = document.querySelector("#viewport");
const toast = (message) => {
  const el = document.querySelector("#toast");
  el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
};
function checkpoint() {
  history.push(JSON.stringify(project));
  if (history.length > 30) history.shift();
}
function persist() {
  clearTimeout(saveTimer);
  document.querySelector("#save-status").textContent = "Saving…";
  saveTimer = setTimeout(() => {
    try {
      project.updatedAt = new Date().toISOString();
      saveProject(project);
      document.querySelector("#save-status").textContent = "✓ Saved locally";
      statusText = "Mentve ezen az eszközön";
    } catch (error) {
      document.querySelector("#save-status").textContent = "Save failed";
      toast("Mentési hiba: " + error.message);
    }
  }, 250);
}
function renderObjects() {
  document.querySelector("#object-count").textContent = String(scene().objects.length).padStart(2, "0");
  document.querySelector("#object-list").innerHTML = scene().objects.map(o => `
    <button class="object-row ${o.id === selectedId ? "selected" : ""}" data-object-id="${o.id}">
      <span class="object-glyph">${o.type === "circle" ? "◉" : "▰"}</span><span class="object-name">${escapeHtml(o.name)}</span><span class="object-color" style="background:${o.color}"></span>
    </button>`).join("");
  document.querySelectorAll("[data-object-id]").forEach(el => el.addEventListener("click", () => {
    selectedId = el.dataset.objectId; renderAll();
  }));
}
function renderInspector() {
  const o = selected();
  document.querySelector("#inspector-title").textContent = o ? o.name : "No selection";
  const content = document.querySelector("#inspector-content");
  if (!o) { content.innerHTML = '<p class="empty-inspector">Select an object in the scene or object list to edit its properties.</p>'; return; }
  content.innerHTML = `
    <div class="property-section"><div class="section-label">GENERAL <span>⌄</span></div>
      <label class="field-label">Name<input data-prop="name" value="${escapeAttr(o.name)}" maxlength="80"></label>
      <label class="field-label">Type<div class="read-only">${o.type === "circle" ? "Circle" : "Rectangle"} <span>LOCKED</span></div></label>
    </div>
    <div class="property-section"><div class="section-label">TRANSFORM <span>⌄</span></div>
      <div class="field-grid"><label class="field-label">Position X<input data-prop="x" type="number" value="${o.x}"></label><label class="field-label">Position Y<input data-prop="y" type="number" value="${o.y}"></label>
      <label class="field-label">Width<input data-prop="width" type="number" min="1" max="2000" value="${o.width}"></label><label class="field-label">Height<input data-prop="height" type="number" min="1" max="2000" value="${o.height}"></label></div>
    </div>
    <div class="property-section"><div class="section-label">APPEARANCE <span>⌄</span></div><label class="field-label">Fill color<div class="color-field"><input data-prop="color" type="color" value="${o.color}"><code>${o.color.toUpperCase()}</code></div></label></div>
    <button id="delete-object" class="button danger full">Delete object</button>`;
  content.querySelectorAll("[data-prop]").forEach(input => {
    const eventName = input.type === "color" || input.type === "text" ? "change" : "change";
    input.addEventListener(eventName, () => {
      const key = input.dataset.prop;
      checkpoint();
      if (["x", "y", "width", "height"].includes(key)) {
        const n = Number(input.value); if (!Number.isFinite(n)) return;
        o[key] = Math.max(key === "width" || key === "height" ? 1 : -100000, Math.min(100000, n));
      } else if (key === "color") o.color = input.value;
      else o.name = input.value.trim().slice(0, 80) || "Object";
      renderAll(); persist();
    });
  });
  document.querySelector("#delete-object").addEventListener("click", () => {
    checkpoint(); project.scenes[0].objects = scene().objects.filter(item => item.id !== o.id);
    selectedId = scene().objects[0]?.id || null; renderAll(); persist(); toast("Object deleted");
  });
}
function renderAll() { renderObjects(); renderInspector(); renderEngine(); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function escapeAttr(s) { return escapeHtml(s); }

class EditorScene extends Phaser.Scene {
  constructor() { super("EditorScene"); this.dragged = null; }
  create() {
    this.graphics = this.add.graphics();
    this.input.on("pointerdown", pointer => {
      const world = pointer.positionToCamera(this.cameras.main);
      const hit = [...scene().objects].reverse().find(o => {
        const x = world.x, y = world.y;
        if (o.type === "circle") return Math.hypot(x-o.x, y-o.y) <= Math.max(o.width,o.height)/2;
        return x >= o.x-o.width/2 && x <= o.x+o.width/2 && y >= o.y-o.height/2 && y <= o.y+o.height/2;
      });
      if (hit) { selectedId = hit.id; this.dragged = { id: hit.id, x: world.x, y: world.y, ox: hit.x, oy: hit.y }; renderObjects(); renderInspector(); }
    });
    this.input.on("pointermove", pointer => {
      if (!this.dragged || !pointer.isDown) return;
      const world = pointer.positionToCamera(this.cameras.main);
      const o = scene().objects.find(item => item.id === this.dragged.id);
      if (o) { o.x = Math.round(this.dragged.ox + world.x - this.dragged.x); o.y = Math.round(this.dragged.oy + world.y - this.dragged.y); renderInspector(); }
    });
    this.input.on("pointerup", () => { if (this.dragged) { this.dragged = null; persist(); renderObjects(); } });
  }
  update() {
    const g = this.graphics; g.clear();
    const w = this.scale.width, h = this.scale.height;
    g.fillStyle(0x151a25, 1); g.fillRect(0, 0, w, h);
    if (project.settings.grid) {
      g.lineStyle(1, 0x252c3b, 0.7); g.beginPath();
      for (let x=0; x<w; x+=24) { g.moveTo(x,0); g.lineTo(x,h); }
      for (let y=0; y<h; y+=24) { g.moveTo(0,y); g.lineTo(w,y); }
      g.strokePath();
    }
    for (const o of scene().objects) {
      const color = Phaser.Display.Color.HexStringToColor(o.color).color;
      g.fillStyle(color, 1);
      if (o.type === "circle") g.fillCircle(o.x, o.y, Math.max(o.width,o.height)/2);
      else g.fillRect(o.x-o.width/2, o.y-o.height/2, o.width, o.height);
      if (o.id === selectedId) {
        g.lineStyle(2, 0xc5baff, 1);
        if (o.type === "circle") g.strokeCircle(o.x, o.y, Math.max(o.width,o.height)/2+5);
        else g.strokeRect(o.x-o.width/2-5, o.y-o.height/2-5, o.width+10, o.height+10);
        g.fillStyle(0xc5baff, 1); g.fillRect(o.x-o.width/2-5,o.y-o.height/2-5,5,5);
        g.fillRect(o.x+o.width/2,o.y+o.height/2,5,5);
      }
    }
  }
}
function stopEngines() {
  if (phaserGame) { phaserGame.destroy(true); phaserGame = null; }
  if (babylonEngine) { babylonEngine.stopRenderLoop(); babylonEngine.dispose(); babylonEngine = null; }
  viewport.querySelectorAll("canvas").forEach(canvas => canvas.remove());
}
function renderEngine() {
  stopEngines();
  const mode = project.mode;
  document.querySelectorAll("[data-mode]").forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
  if (mode === "2d") {
    phaserGame = new Phaser.Game({
      type: Phaser.CANVAS, parent: viewport, width: viewport.clientWidth, height: viewport.clientHeight,
      backgroundColor: "#151a25", scene: [EditorScene], scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true, pixelArt: false }, banner: false
    });
  } else {
    const canvas = document.createElement("canvas"); canvas.className = "engine-canvas"; viewport.appendChild(canvas);
    babylonEngine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const world = new BabylonScene(babylonEngine);
    world.clearColor = new (awaitlessColor())(0.08,0.1,0.15,1);
    const camera = new ArcRotateCamera("camera", -Math.PI/2, Math.PI/3, 12, Vector3.Zero(), world);
    camera.attachControl(canvas, true);
    new HemisphericLight("light", new Vector3(0,1,0), world);
    scene().objects.forEach((o, i) => {
      const mesh = o.type === "circle" ? MeshBuilder.CreateSphere(o.id, { diameter: Math.max(o.width,o.height)/40, segments: 24 }, world) : MeshBuilder.CreateBox(o.id, { width:o.width/40, height:o.height/40, depth:0.3 }, world);
      mesh.position = new Vector3((o.x-320)/40, 0.4 + i*0.02, (o.y-240)/40);
      const material = new StandardMaterial(o.id+"-mat", world);
      material.diffuseColor = Color3.FromHexString(o.color); mesh.material = material;
    });
    babylonEngine.runRenderLoop(() => world.render());
    window.addEventListener("resize", () => babylonEngine?.resize(), { once: true });
  }
}
function awaitlessColor() { return class { constructor(r,g,b,a) { return {r,g,b,a}; } }; }

function addObject(type) {
  checkpoint();
  const obj = { id: crypto.randomUUID(), name: type === "circle" ? "Circle" : "Rectangle", type, x: 320 + scene().objects.length*24, y: 180 + scene().objects.length*20, width: type === "circle" ? 64 : 100, height: type === "circle" ? 64 : 60, color: type === "circle" ? "#ffbd69" : "#46d6b0" };
  scene().objects.push(obj); selectedId = obj.id; renderAll(); persist();
}
document.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
  if (project.mode === btn.dataset.mode) return;
  checkpoint(); project.mode = btn.dataset.mode; renderEngine();
}));
document.querySelector("#new-object").addEventListener("click", () => addObject("rect"));
document.querySelector("#add-rect").addEventListener("click", () => addObject("rect"));
document.querySelector("#add-circle").addEventListener("click", () => addObject("circle"));
document.querySelector("#grid-toggle").addEventListener("click", e => {
  checkpoint(); project.settings.grid = !project.settings.grid; e.currentTarget.classList.toggle("active", project.settings.grid); renderEngine(); persist();
});
document.querySelector("#project-name").addEventListener("change", e => {
  checkpoint(); project.name = e.target.value.trim() || "Untitled Game"; e.target.value = project.name; persist();
});
document.querySelector("#export-btn").addEventListener("click", () => { downloadProject(project); toast("Projekt exportálva JSON fájlba"); });
document.querySelector("#import-btn").addEventListener("click", () => document.querySelector("#file-input").click());
document.querySelector("#file-input").addEventListener("change", async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const imported = await readProjectFile(file); checkpoint(); project = imported; selectedId = scene().objects[0]?.id || null; renderAll(); persist(); toast("Projekt sikeresen importálva");
  } catch (error) { toast("Import hiba: " + error.message); }
  e.target.value = "";
});
document.querySelector("#undo-btn").addEventListener("click", () => {
  const previous = history.pop(); if (!previous) { toast("Nincs visszavonható művelet"); return; }
  project = validateProject(JSON.parse(previous)); selectedId = scene().objects[0]?.id || null; renderAll(); persist(); toast("Művelet visszavonva");
});
document.querySelector("#ai-form").addEventListener("submit", e => {
  e.preventDefault(); const text = document.querySelector("#ai-input").value;
  const command = parseEditorCommand(text);
  if (command.type === "help") { document.querySelector("#ai-output").textContent = "Parancsok: add circle · add rectangle · move Player 300,200 · rename Player to Hero"; return; }
  checkpoint(); const message = applyEditorCommand(project, command);
  document.querySelector("#ai-output").textContent = message; document.querySelector("#ai-input").value = "";
  renderAll(); persist();
});
window.addEventListener("beforeunload", () => { try { saveProject(project); } catch {} });
window.addEventListener("resize", () => { if (project.mode === "3d") babylonEngine?.resize(); });
document.querySelector("#grid-toggle").classList.toggle("active", project.settings.grid);
document.querySelector("#save-status").textContent = restored ? "✓ Recovered" : "Ready";
renderObjects(); renderInspector(); renderEngine();
if (!restored) persist();
