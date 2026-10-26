import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./mcp-server.js", import.meta.url));
const result = spawnSync("codex", ["mcp", "add", "project-unicorn", "--", process.execPath, serverPath], { stdio: "inherit" });

if (result.error) {
  console.error(`Nem sikerült elindítani a Codex CLI-t: ${result.error.message}`);
  console.error("Ellenőrizd, hogy a Codex telepítve van-e, majd futtasd újra az npm run mcp:install parancsot.");
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);
console.log("A Project Unicorn helyi MCP-szerver hozzáadva a Codexhez. Indítsd újra a Codex MCP-kapcsolatait a beállításokban.");
