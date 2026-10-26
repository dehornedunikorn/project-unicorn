export const SCHEMA_VERSION = 1;

export function createProject(name = "My First Game") {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name,
    mode: "2d",
    updatedAt: new Date().toISOString(),
    settings: { background: "#151a25", grid: true },
    scenes: [{
      id: crypto.randomUUID(),
      name: "Main Scene",
      objects: [
        { id: crypto.randomUUID(), name: "Player", type: "rect", x: 320, y: 210, width: 56, height: 56, color: "#8b7cff" },
        { id: crypto.randomUUID(), name: "Platform", type: "rect", x: 320, y: 330, width: 240, height: 24, color: "#46d6b0" }
      ]
    }]
  };
}

export function validateProject(input) {
  if (!input || typeof input !== "object") throw new Error("A projektnek objektumnak kell lennie.");
  if (input.schemaVersion !== SCHEMA_VERSION) throw new Error("Nem támogatott projektverzió.");
  if (typeof input.name !== "string" || !Array.isArray(input.scenes) || input.scenes.length < 1) throw new Error("Hiányzó projektadatok.");
  const ids = new Set();
  for (const scene of input.scenes) {
    if (!scene || typeof scene.name !== "string" || !Array.isArray(scene.objects)) throw new Error("Hibás jelenet.");
    for (const object of scene.objects) {
      if (!object || typeof object.id !== "string" || typeof object.name !== "string") throw new Error("Hibás objektum.");
      if (ids.has(object.id)) throw new Error("Az objektumazonosítók nem lehetnek duplikáltak.");
      ids.add(object.id);
      for (const key of ["x", "y", "width", "height"]) {
        if (!Number.isFinite(object[key]) || Math.abs(object[key]) > 100000) throw new Error("Érvénytelen objektum-koordináta.");
      }
      if (!/^#[0-9a-f]{6}$/i.test(object.color)) throw new Error("Érvénytelen szín.");
      if (!["rect", "circle"].includes(object.type)) throw new Error("Ismeretlen 2D objektumtípus.");
    }
  }
  return input;
}

export function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}