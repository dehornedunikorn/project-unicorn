const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Local, deterministic command bridge for the prototype.
 * Future model output must be converted to these validated commands before mutation.
 */
export function parseEditorCommand(text) {
  const input = String(text || "").trim();
  let match;
  if ((match = input.match(/^(?:add|create)\s+(?:a\s+)?(circle|rectangle|rect|kör|téglalap)$/i))) {
    const type = /circle|kör/i.test(match[1]) ? "circle" : "rect";
    return { type: "add-object", objectType: type };
  }
  if ((match = input.match(/^(?:move|mozgasd)\s+(.+?)\s+(-?\d+)\s*[, ]\s*(-?\d+)$/i))) {
    return { type: "move-object", name: match[1].trim(), x: clamp(Number(match[2]), -100000, 100000), y: clamp(Number(match[3]), -100000, 100000) };
  }
  if ((match = input.match(/^(?:rename|nevezd át)\s+(.+?)\s+(?:to|erre|legyen)\s+(.+)$/i))) {
    return { type: "rename-object", name: match[1].trim(), newName: match[2].trim().slice(0, 80) };
  }
  return { type: "help" };
}

export function applyEditorCommand(project, command) {
  const scene = project.scenes[0];
  if (command.type === "add-object") {
    scene.objects.push({
      id: crypto.randomUUID(),
      name: command.objectType === "circle" ? "Circle" : "Rectangle",
      type: command.objectType,
      x: 320 + Math.round(Math.random() * 100 - 50),
      y: 210 + Math.round(Math.random() * 100 - 50),
      width: command.objectType === "circle" ? 64 : 100,
      height: command.objectType === "circle" ? 64 : 60,
      color: "#46d6b0"
    });
    return "Új objektum létrehozva.";
  }
  if (command.type === "move-object") {
    const object = scene.objects.find(item => item.name.toLowerCase() === command.name.toLowerCase());
    if (!object) return `Nem találom ezt az objektumot: ${command.name}`;
    object.x = command.x;
    object.y = command.y;
    return `${object.name} áthelyezve.`;
  }
  if (command.type === "rename-object") {
    const object = scene.objects.find(item => item.name.toLowerCase() === command.name.toLowerCase());
    if (!object) return `Nem találom ezt az objektumot: ${command.name}`;
    if (!command.newName) return "A név nem lehet üres.";
    object.name = command.newName;
    return "Objektum átnevezve.";
  }
  return "Próbáld: add circle · add rectangle · move Player 300,200 · rename Player to Hero";
}