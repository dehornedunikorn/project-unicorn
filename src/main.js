import Phaser from "phaser";
import { createProject, validateProject } from "./project.js";
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
let engineGeneration = 0;
let saveTimer = null;
let sidebarTab = "objects";
let assetQuery = "";
const assetCatalog = [
  { id: "kenney", name: "Kenney · ingyenes játékelemek", kind: "2D + 3D + hang", license: "CC0 · attribúció nem szükséges", url: "https://kenney.nl/assets", search: "kenney sprite 3d hang" },
  { id: "kenney-3d", name: "Kenney · 3D eszközök", kind: "3D modellek", license: "A csomag oldalán ellenőrizd · jellemzően CC0", url: "https://kenney.nl/assets/category:3D", search: "kenney 3d model" },
  { id: "poly-pizza", name: "Poly Pizza", kind: "3D modellek", license: "Modellenként CC0 vagy CC-BY · ellenőrizd a letöltésnél", url: "https://poly.pizza/", search: "poly pizza 3d low poly" },
  { id: "opengameart", name: "OpenGameArt", kind: "2D + 3D + hang", license: "Eszközönként eltérő licenc · ellenőrizd a letöltésnél", url: "https://opengameart.org/", search: "opengameart sprites music" }
];

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
      <div class="sidebar-tabs"><button data-sidebar-tab="objects" class="sidebar-tab active">OBJECTS <span id="object-count">02</span></button><button data-sidebar-tab="assets" class="sidebar-tab">ASSETS</button></div>
      <div id="object-list" class="object-list"></div>
      <div id="asset-library" class="asset-library" hidden></div>
      <input id="asset-file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>
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
  document.querySelector("#object-list").hidden = sidebarTab !== "objects";
  document.querySelector("#asset-library").hidden = sidebarTab !== "assets";
  document.querySelectorAll("[data-sidebar-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.sidebarTab === sidebarTab));
  document.querySelector("#object-list").innerHTML = scene().objects.map(o => `
    <button class="object-row ${o.id === selectedId ? "selected" : ""}" data-object-id="${o.id}">
      <span class="object-glyph">${o.type === "circle" ? "◉" : o.type === "image" ? "▧" : "▰"}</span><span class="object-name">${escapeHtml(o.name)}</span><span class="object-color" style="background:${o.color || "#ffffff"}"></span>
    </button>`).join("");
  document.querySelectorAll("[data-object-id]").forEach(el => el.addEventListener("click", () => {
    selectedId = el.dataset.objectId; renderAll();
  }));
}
function renderAssetLibrary() {
  const el = document.querySelector("#asset-library");
  const saved = project.assets || [];
  const q = assetQuery.toLowerCase();
  const catalog = assetCatalog.filter(item => `${item.name} ${item.kind} ${item.search}`.toLowerCase().includes(q));
  el.innerHTML = `<label class="asset-search"><span>Keresés a katalógusban</span><input id="asset-search-input" value="${escapeAttr(assetQuery)}" placeholder="pl. 3D, sprite, hang"></label>
    <button id="import-local-asset" class="button small full">＋ Saját kép importálása</button><p class="asset-tip">PNG, JPG vagy WebP · legfeljebb 1 MB fájlonként</p>
    <div class="asset-section-title">INGYENES FORRÁSOK</div>${catalog.map(asset => `<article class="asset-card"><b>${escapeHtml(asset.name)}</b><small>${escapeHtml(asset.kind)}</small><p>${escapeHtml(asset.license)}</p><div><a href="${escapeAttr(asset.url)}" target="_blank" rel="noopener noreferrer">Megnyitás ↗</a><button data-save-asset="${asset.id}" ${saved.some(a => a.id === asset.id) ? "disabled" : ""}>${saved.some(a => a.id === asset.id) ? "Mentve" : "＋ Könyvtárba"}</button></div></article>`).join("") || '<p class="asset-empty">Nincs találat.</p>'}
    <div class="asset-section-title">SAJÁT KÖNYVTÁR · ${saved.length}</div>${saved.map(asset => `<article class="asset-card saved-asset">${asset.dataUrl ? `<img class="asset-thumbnail" src="${asset.dataUrl}" alt="">` : ""}<b>${escapeHtml(asset.name)}</b><small>${escapeHtml(asset.kind)}</small><p>${escapeHtml(asset.license)}</p><div>${asset.dataUrl ? `<button data-place-asset="${escapeAttr(asset.id)}">＋ Jelenethez adás</button>` : `<a href="${escapeAttr(asset.url)}" target="_blank" rel="noopener noreferrer">Forrás ↗</a>`}<button data-remove-asset="${escapeAttr(asset.id)}">Eltávolítás</button></div></article>`).join("") || '<p class="asset-empty">Importálj saját képet vagy ments katalóguselemet a könyvtárba.</p>'}`;
  el.querySelector("#import-local-asset").addEventListener("click", () => document.querySelector("#asset-file-input").click());
  el.querySelector("#asset-search-input").addEventListener("input", e => { assetQuery = e.target.value; renderAssetLibrary(); document.querySelector("#asset-search-input").focus(); });
  el.querySelectorAll("[data-save-asset]").forEach(button => button.addEventListener("click", () => {
    const item = assetCatalog.find(asset => asset.id === button.dataset.saveAsset);
    if (!item || project.assets.some(asset => asset.id === item.id)) return;
    checkpoint(); project.assets.push({ ...item, addedAt: new Date().toISOString() }); persist(); renderAssetLibrary(); toast("Forrás hozzáadva a projekt könyvtárához");
  }));
  el.querySelectorAll("[data-remove-asset]").forEach(button => button.addEventListener("click", () => {
    checkpoint();
    const removedId = button.dataset.removeAsset;
    project.assets = project.assets.filter(asset => asset.id !== removedId);
    scene().objects = scene().objects.filter(object => object.assetId !== removedId);
    if (!scene().objects.some(object => object.id === selectedId)) selectedId = scene().objects[0]?.id || null;
    renderAll(); persist();
  }));
  el.querySelectorAll("[data-place-asset]").forEach(button => button.addEventListener("click", () => addImageObject(button.dataset.placeAsset)));
}
function addImageObject(assetId) {
  const asset = project.assets.find(item => item.id === assetId && item.dataUrl);
  if (!asset) return;
  checkpoint();
  const count = scene().objects.length;
  const object = { id: crypto.randomUUID(), assetId, name: asset.name.replace(/\.[^.]+$/, "").slice(0, 80), type: "image", x: 320 + count * 18, y: 210 + count * 16, width: 96, height: 96 };
  scene().objects.push(object); selectedId = object.id; renderAll(); persist();
}
function renderInspector() {
  const o = selected();
  document.querySelector("#inspector-title").textContent = o ? o.name : "No selection";
  const content = document.querySelector("#inspector-content");
  if (!o) { content.innerHTML = '<p class="empty-inspector">Select an object in the scene or object list to edit its properties.</p>'; return; }
  content.innerHTML = `
    <div class="property-section"><div class="section-label">GENERAL <span>⌄</span></div>
      <label class="field-label">Name<input data-prop="name" value="${escapeAttr(o.name)}" maxlength="80"></label>
      <label class="field-label">Type<div class="read-only">${o.type === "circle" ? "Circle" : o.type === "image" ? "Image" : "Rectangle"} <span>LOCKED</span></div></label>
    </div>
    <div class="property-section"><div class="section-label">TRANSFORM <span>⌄</span></div>
      <div class="field-grid"><label class="field-label">Position X<input data-prop="x" type="number" value="${o.x}"></label><label class="field-label">Position Y<input data-prop="y" type="number" value="${o.y}"></label>
      <label class="field-label">Width<input data-prop="width" type="number" min="1" max="2000" value="${o.width}"></label><label class="field-label">Height<input data-prop="height" type="number" min="1" max="2000" value="${o.height}"></label></div>
    </div>
    ${o.type === "image" ? "" : `<div class="property-section"><div class="section-label">APPEARANCE <span>⌄</span></div><label class="field-label">Fill color<div class="color-field"><input data-prop="color" type="color" value="${o.color}"><code>${o.color.toUpperCase()}</code></div></label></div>`}
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
function renderAll() { renderObjects(); renderAssetLibrary(); renderInspector(); renderEngine(); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function escapeAttr(s) { return escapeHtml(s); }

class EditorScene extends Phaser.Scene {
  constructor() { super("EditorScene"); this.dragged = null; }
  create() {
    this.graphics = this.add.graphics();
    this.assetSprites = new Map();
    for (const asset of project.assets.filter(item => item.dataUrl)) {
      this.textures.once(Phaser.Textures.Events.ADD_KEY + asset.id, () => {
        if (!this.sys.isActive()) return;
        for (const object of scene().objects.filter(item => item.type === "image" && item.assetId === asset.id)) {
          const sprite = this.add.image(object.x, object.y, asset.id).setDisplaySize(object.width, object.height);
          this.assetSprites.set(object.id, sprite);
        }
      });
      this.textures.addBase64(asset.id, asset.dataUrl);
    }
    this.input.on("pointerdown", pointer => {
      const world = pointer.positionToCamera(this.cameras.main);
      const hit = [...scene().objects].reverse().find(o => {
        const x = world.x, y = world.y;
        if (o.type === "circle") return Math.hypot(x-o.x, y-o.y) <= Math.max(o.width,o.height)/2;
        return x >= o.x-o.width/2 && x <= o.x+o.width/2 && y >= o.y-o.height/2 && y <= o.y+o.height/2;
      });
      if (hit) { checkpoint(); selectedId = hit.id; this.dragged = { id: hit.id, x: world.x, y: world.y, ox: hit.x, oy: hit.y }; renderObjects(); renderInspector(); }
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
      if (o.type === "image") {
        const sprite = this.assetSprites.get(o.id);
        if (sprite?.active) { sprite.setPosition(o.x, o.y).setDisplaySize(o.width, o.height); }
        if (o.id === selectedId) { g.lineStyle(2, 0xc5baff, 1); g.strokeRect(o.x-o.width/2-5, o.y-o.height/2-5, o.width+10, o.height+10); }
        continue;
      }
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
async function renderEngine() {
  const generation = ++engineGeneration;
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
    const babylon = await import("@babylonjs/core");
    if (generation !== engineGeneration || project.mode !== "3d") return;
    const { Engine, Scene: BabylonScene, ArcRotateCamera, HemisphericLight, Vector3, MeshBuilder, StandardMaterial, Texture, Color3, Color4 } = babylon;
    const canvas = document.createElement("canvas"); canvas.className = "engine-canvas"; viewport.appendChild(canvas);
    babylonEngine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    const world = new BabylonScene(babylonEngine);
    world.clearColor = new Color4(0.08,0.1,0.15,1);
    const camera = new ArcRotateCamera("camera", -Math.PI/2, Math.PI/3, 12, Vector3.Zero(), world);
    camera.attachControl(canvas, true);
    new HemisphericLight("light", new Vector3(0,1,0), world);
    scene().objects.forEach((o, i) => {
      const mesh = o.type === "circle" ? MeshBuilder.CreateSphere(o.id, { diameter: Math.max(o.width,o.height)/40, segments: 24 }, world) : o.type === "image" ? MeshBuilder.CreatePlane(o.id, { width:o.width/40, height:o.height/40 }, world) : MeshBuilder.CreateBox(o.id, { width:o.width/40, height:o.height/40, depth:0.3 }, world);
      mesh.position = new Vector3((o.x-320)/40, 0.4 + i*0.02, (o.y-240)/40);
      const material = new StandardMaterial(o.id+"-mat", world);
      if (o.type === "image") { const asset = project.assets.find(item => item.id === o.assetId); if (asset?.dataUrl) { material.diffuseTexture = new Texture(asset.dataUrl, world); material.backFaceCulling = false; } }
      else material.diffuseColor = Color3.FromHexString(o.color);
      mesh.material = material;
    });
    babylonEngine.runRenderLoop(() => world.render());
  }
}
function addObject(type) {
  checkpoint();
  const obj = { id: crypto.randomUUID(), name: type === "circle" ? "Circle" : "Rectangle", type, x: 320 + scene().objects.length*24, y: 180 + scene().objects.length*20, width: type === "circle" ? 64 : 100, height: type === "circle" ? 64 : 60, color: type === "circle" ? "#ffbd69" : "#46d6b0" };
  scene().objects.push(obj); selectedId = obj.id; renderAll(); persist();
}
document.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
  if (project.mode === btn.dataset.mode) return;
  checkpoint(); project.mode = btn.dataset.mode; renderEngine(); persist();
}));
document.querySelector("#new-object").addEventListener("click", () => addObject("rect"));
document.querySelectorAll("[data-sidebar-tab]").forEach(btn => btn.addEventListener("click", () => { sidebarTab = btn.dataset.sidebarTab; renderObjects(); renderAssetLibrary(); }));
document.querySelector("#asset-file-input").addEventListener("change", async e => {
  const files = [...(e.target.files || [])];
  e.target.value = "";
  if (!files.length) return;
  try {
    const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
    const totalCurrent = (project.assets || []).reduce((sum, asset) => sum + (asset.dataUrl?.length || 0), 0);
    const dataUrls = [];
    let totalIncoming = 0;
    for (const file of files) {
      if (!allowed.has(file.type)) throw new Error("Csak PNG, JPG vagy WebP képet lehet importálni.");
      if (file.size > 1_000_000) throw new Error(`${file.name}: a fájl nagyobb 1 MB-nál.`);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("A fájl nem olvasható."));
        reader.readAsDataURL(file);
      });
      totalIncoming += dataUrl.length;
      dataUrls.push({ file, dataUrl });
    }
    if (totalCurrent + totalIncoming > 1_600_000) throw new Error("A projekthez összesen legfeljebb 1,2 MB képet lehet hozzáadni. Törölj egy képet vagy válassz kisebbeket.");
    checkpoint();
    for (const { file, dataUrl } of dataUrls) {
      project.assets.push({ id: crypto.randomUUID(), name: file.name.slice(0, 100), kind: "Saját 2D kép", license: "Saját fájl · a felhasználó által megadott jogok szerint", url: "", dataUrl, addedAt: new Date().toISOString() });
    }
    renderAll(); persist(); toast(`${files.length} kép hozzáadva a könyvtárhoz`);
  } catch (error) { toast("Importálási hiba: " + error.message); }
});
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
renderObjects(); renderAssetLibrary(); renderInspector(); renderEngine();
if (!restored) persist();
