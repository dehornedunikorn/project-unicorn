# project-unicorn

Project Unicorn is a local-first browser editor prototype for small 2D games, with a lightweight 3D preview and a starter directory of free asset sources.

## Run it

Install Node.js 20 or newer, then run `npm install` once and `npm run dev`. Open the local address printed in the terminal. No account, API key, paid service, or model connection is required.

## Prototype features

- Edit, rename, move, recolor, add, delete, and undo basic 2D objects.
- Preview the same primitives in 3D with Babylon.js.
- Autosave locally in the browser and import/export `.unicorn.json` project files.
- Browse the starter asset directory and save source links with license notes into the project file.
- Use the deterministic command examples in the AI panel; this is not a connected AI service.

The asset directory links to external catalogs; it does not download, embed, or automatically import their files yet. Check each asset's license on its source page before shipping a game.

## Development principles

- Keep core project data engine-agnostic.
- Validate imports and AI command payloads before changing state.
- Prefer recoverable local-first saves and portable project files.
- Treat every commit as a restorable milestone.
