# project-unicorn

Project Unicorn is a local-first browser editor prototype for small 2D games, with a lightweight 3D preview and a starter directory of free asset sources.

## Run it

Install Node.js 20 or newer, then run `npm install` once and `npm run dev`. Open the local address printed in the terminal. No account, API key, paid service, or model connection is required.

## Prototype features

- Edit, rename, move, recolor, add, delete, and undo basic 2D objects.
- Preview the same primitives in 3D with Babylon.js.
- Autosave locally in the browser and import/export `.unicorn.json` project files.
- Browse the starter asset directory and save source links with license notes into the project file.
- Import small PNG, JPG, and WebP files, place them in the 2D scene, and carry them with project JSON exports.
- Use the deterministic command examples in the AI panel; this is not a connected AI service.

External catalog links are references only. Imported local images are embedded in the project file and browser save; keep images under 1 MB each and under 1.2 MB total per project. Check each asset's license on its source page before shipping a game.

## Connect a local AI assistant

The bundled MCP server exposes a small allowlist of tools for the currently open local editor: read project and object details, add and move objects, rename and resize objects, change primitive colors, and place an imported local image. It cannot delete objects or access arbitrary files. It binds only to `127.0.0.1`; it is not part of the public Vercel deployment.

1. In this folder, run `npm install` once.
2. Run `npm run mcp:install` once to add the tools to Codex.
3. Restart Codex's MCP connections in Settings → MCP servers.
4. Run `npm run dev` and open `http://localhost:5173`.

The editor shows whether the local bridge is connected. Ask the assistant to inspect the scene or make a small change. To remove the connection later, run `codex mcp remove project-unicorn`.

## Development principles

- Keep core project data engine-agnostic.
- Validate imports and AI command payloads before changing state.
- Prefer recoverable local-first saves and portable project files.
- Treat every commit as a restorable milestone.
