# Architecture notes

## Product boundary

Project Unicorn is an authoring environment, not a new rendering engine. It composes established free/open-source browser engines and owns the editor workflow, project schema, safe command interface, and persistence model.

## Layers

1. **Project model** — versioned JSON, stable IDs, validation; must remain independent from the renderer.
2. **Editor UI** — scene tree, inspector, toolbars, project import/export.
3. **2D adapter** — Phaser-based scene canvas and pointer interaction.
4. **3D adapter** — Babylon.js preview for the shared primitive scene model.
5. **Command bridge** — allow-listed typed commands. Never evaluate generated JavaScript.
6. **Persistence** — debounced local autosave plus backup key and portable JSON exports.

## Current limitations

- The 3D view is a preview adapter; inspector changes recreate the preview rather than maintaining a full editable 3D scene graph.
- Local storage is browser/device specific. Use JSON export for a portable backup.
- AI commands are deterministic examples. No model API is connected and no API key is required.
- Automated tests and CI are not yet configured.

## Next milestone

Extract shared scene actions from UI handlers, add unit tests for project validation and command parsing, then add a small e2e test covering create → edit → reload → import/export.
