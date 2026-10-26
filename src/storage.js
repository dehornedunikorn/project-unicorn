import { validateProject } from "./project.js";

const KEY = "project-unicorn:autosave:v1";
const BACKUP_KEY = "project-unicorn:backup:v1";

export function saveProject(project) {
  const snapshot = JSON.stringify({ ...project, updatedAt: new Date().toISOString() });
  localStorage.setItem(BACKUP_KEY, snapshot);
  localStorage.setItem(KEY, snapshot);
  return new Date().toISOString();
}

export function loadProject() {
  for (const key of [KEY, BACKUP_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return validateProject(JSON.parse(raw));
    } catch (error) {
      console.warn("A mentés nem olvasható:", error);
    }
  }
  return null;
}

export function downloadProject(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(project.name || "unicorn-project").replace(/[^a-z0-9-_]/gi, "-").toLowerCase()}.unicorn.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readProjectFile(file) {
  const contents = (await file.text()).replace(/^\uFEFF/, "").trim();
  if (!contents) throw new Error("A kiválasztott fájl üres. Válassz egy Project Unicornból exportált .json vagy .unicorn.json fájlt.");
  if (contents.startsWith("<")) {
    throw new Error("A kiválasztott fájl HTML weboldal, nem Project Unicorn projekt. Projekt betöltéséhez exportált .json fájl kell. A Tetris demót a felső sáv ▶ Tetris demo gombjával indítsd el.");
  }
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("A fájl tartalma nem érvényes JSON. Válassz egy Project Unicornból exportált .json vagy .unicorn.json fájlt.");
  }
  return validateProject(parsed);
}
