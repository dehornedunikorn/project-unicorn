import http from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const port = Number(process.env.PROJECT_UNICORN_BRIDGE_PORT || 4174);
const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
const pending = new Map();
const commands = [];
let projectSnapshot = null;
let projectUpdatedAt = 0;

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function readBody(request, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > limit) {
        reject(new Error("A kérés túl nagy."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("Hibás JSON kérés.")); }
    });
    request.on("error", reject);
  });
}

const bridge = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  const host = request.headers.host || "";
  let hostAllowed = false;
  try {
    const parsedHost = new URL(`http://${host}`);
    hostAllowed = ["127.0.0.1", "localhost"].includes(parsedHost.hostname) && parsedHost.port === String(port);
  } catch { /* Reject malformed Host headers below. */ }
  if (!allowedOrigins.has(origin) || !hostAllowed) {
    sendJson(response, 403, { error: "A helyi híd csak a Project Unicorn helyi szerkesztőoldaláról érhető el." });
    return;
  }
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }

  const pathname = new URL(request.url || "/", `http://127.0.0.1:${port}`).pathname;
  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { name: "project-unicorn-mcp-bridge", editorConnected: Date.now() - projectUpdatedAt < 5000 });
    return;
  }
  if (request.method === "POST" && pathname === "/state") {
    try {
      const body = await readBody(request);
      const project = body.project;
      if (!project || project.schemaVersion !== 1 || !Array.isArray(project.scenes) || !Array.isArray(project.assets)) throw new Error("Hibás projektállapot.");
      projectSnapshot = project;
      projectUpdatedAt = Date.now();
      sendJson(response, 200, { ok: true });
    } catch (error) { sendJson(response, 400, { error: error.message }); }
    return;
  }
  if (request.method === "GET" && pathname === "/commands") {
    const command = commands.shift();
    if (!command) { response.writeHead(204, { "Cache-Control": "no-store" }); response.end(); return; }
    sendJson(response, 200, command);
    return;
  }
  if (request.method === "POST" && pathname === "/results") {
    try {
      const body = await readBody(request, 100_000);
      const resolve = pending.get(body.id);
      if (resolve) { pending.delete(body.id); resolve(body.result); }
      sendJson(response, 200, { ok: Boolean(resolve) });
    } catch (error) { sendJson(response, 400, { error: error.message }); }
    return;
  }
  sendJson(response, 404, { error: "Ismeretlen helyi hídútvonal." });
});

bridge.on("error", error => console.error(`Project Unicorn hídhiba: ${error.message}`));
bridge.listen(port, "127.0.0.1", () => console.error(`Project Unicorn MCP helyi híd: http://127.0.0.1:${port}`));

function activeProject() {
  if (!projectSnapshot || Date.now() - projectUpdatedAt > 5000) throw new Error("Nyisd meg a Project Unicorn szerkesztőt a http://localhost:5173 címen.");
  return projectSnapshot;
}

function callEditor(type, args = {}) {
  activeProject();
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => {
      pending.delete(id);
      const queuedIndex = commands.findIndex(command => command.id === id);
      if (queuedIndex !== -1) commands.splice(queuedIndex, 1);
      reject(new Error("A szerkesztő nem válaszolt. Ellenőrizd, hogy nyitva van-e."));
    }, 15_000);
    pending.set(id, result => { clearTimeout(timeout); resolve(result); });
    commands.push({ id, type, args });
  });
}

function textResult(value, isError = false) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], isError };
}

function createServer() {
  const server = new McpServer({ name: "project-unicorn", version: "0.1.0" }, {
    instructions: "A Project Unicorn helyi 2D/3D szerkesztőhöz kapcsolódsz. Előbb olvasd be a projektet és az objektumlistát. Csak a felsorolt eszközökkel változtass; ne kérj vagy írj közvetlen fájlrendszer-hozzáférést. Törléshez nincs eszköz."
  });

  server.registerTool("get_project", {
    description: "A megnyitott Project Unicorn projekt nevét, módját, jeleneteit, objektumszámát és assetjeit adja vissza. Csak olvas.",
    inputSchema: {}
  }, async () => {
    try {
      const project = activeProject();
      return textResult({ name: project.name, mode: project.mode, scenes: project.scenes.map(scene => ({ id: scene.id, name: scene.name, objects: scene.objects.length })), assets: project.assets.map(({ id, name, kind, license, dataUrl, embedded }) => ({ id, name, kind, license, embedded: Boolean(dataUrl || embedded) })) });
    } catch (error) { return textResult(error.message, true); }
  });

  server.registerTool("list_scene_objects", {
    description: "Felsorolja az aktuális jelenet objektumait és pozíciójukat. A módosító eszközök objectId értékéhez használd.",
    inputSchema: {}
  }, async () => {
    try {
      const project = activeProject();
      return textResult(project.scenes[0].objects.map(({ id, name, type, x, y, width, height, color, assetId }) => ({ id, name, type, x, y, width, height, ...(color ? { color } : {}), ...(assetId ? { assetId } : {}) })));
    } catch (error) { return textResult(error.message, true); }
  });

  server.registerTool("add_scene_object", {
    description: "Kört vagy téglalapot ad az aktuális jelenethez.",
    inputSchema: { type: z.enum(["circle", "rect"]), x: z.number().int().min(-100000).max(100000).optional(), y: z.number().int().min(-100000).max(100000).optional(), name: z.string().trim().min(1).max(80).optional() }
  }, async args => {
    try { return textResult(await callEditor("add_object", args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.registerTool("move_scene_object", {
    description: "Egy objektum pozícióját állítja be. Előbb listázd az objektumokat és azonosítójukat.",
    inputSchema: { objectId: z.string().uuid(), x: z.number().int().min(-100000).max(100000), y: z.number().int().min(-100000).max(100000) }
  }, async args => {
    try { return textResult(await callEditor("move_object", args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.registerTool("rename_scene_object", {
    description: "Egy objektum nevét módosítja.",
    inputSchema: { objectId: z.string().uuid(), name: z.string().trim().min(1).max(80) }
  }, async args => {
    try { return textResult(await callEditor("rename_object", args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.registerTool("resize_scene_object", {
    description: "Egy objektum szélességét és magasságát állítja be 1 és 2000 képpont között.",
    inputSchema: { objectId: z.string().uuid(), width: z.number().int().min(1).max(2000), height: z.number().int().min(1).max(2000) }
  }, async args => {
    try { return textResult(await callEditor("resize_object", args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.registerTool("set_scene_object_color", {
    description: "Egy kör vagy téglalap kitöltőszínét állítja hatjegyű hex színkóddal.",
    inputSchema: { objectId: z.string().uuid(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }
  }, async args => {
    try { return textResult(await callEditor("set_color", args)); }
    catch (error) { return textResult(error.message, true); }
  });

  server.registerTool("add_asset_to_scene", {
    description: "Egy már importált helyi képet ad az aktuális jelenethez. Előbb listázd a projekt assetjeit, és csak beágyazott képet válassz.",
    inputSchema: { assetId: z.string().uuid() }
  }, async args => {
    try { return textResult(await callEditor("add_asset", args)); }
    catch (error) { return textResult(error.message, true); }
  });

  return server;
}

const stdioHandle = serveStdio(createServer);
process.stdin.on("end", () => bridge.close());
process.on("SIGINT", () => { void stdioHandle.close().finally(() => bridge.close()); });
console.error("Project Unicorn MCP eszközök elindultak.");
