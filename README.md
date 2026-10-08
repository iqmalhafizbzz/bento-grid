# Bento Creator

Design bento-grid layouts in the browser and export them as HTML/CSS, a React component, an iframe embed, or an image.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Using it

- **Add a box:** hover an empty slot and click `+`, or drag across empty slots to draw a larger box.
- **Move / resize:** drag a box, or a selected box's edge handles (powered by `@dnd-kit/dom`). Everything snaps to the grid. Dropping a box on others moves them into the space it left (shifted, or packed into the vacated cells); if they can't fit, the drop is refused.
- **Layers:** every box is a fill (solid, gradient or transparent), an optional image or video, and optional text on top.
- **Images:** upload, paste (⌘V) or drop files onto a box. Press *Adjust* (or double-click) to crop with *Fill box*, or place the picture anywhere with *Free*.
- **Spacing:** sliders snap to 4px up to 48px (ruler ticks below; a light vibration per step on devices that support it); type any exact value in the field beside them. Hovering a spacing control draws its gaps on the canvas.
- **Stroke:** under Corners, turn on one stroke for every box and set its width and color.
- **Colors:** transparent, black and white presets, a hex field, and the dropper button to open the full picker.
- **Shortcuts:** ⌘Z / ⇧⌘Z undo/redo · ⌫ delete · ⌘D duplicate · Esc deselect.

The document autosaves to `localStorage`; media blobs go to IndexedDB.

## Exports

| Format | What you get |
| --- | --- |
| HTML / CSS | One self-contained `bento.html` with media inlined as base64 |
| React | `Bento.tsx` (or `.jsx`) + `Bento.css` + `media/` folder, zipped |
| Embed | `<iframe>` snippet, pointing at a hosted `bento.html` or fully inlined via `srcdoc` |
| Image | PNG / JPEG / WebP at 0.5×–3×, rendered on a canvas (videos use the current frame) |

Fixed-size designs export with `cqw` units, so they scale proportionally to their container. *Fit screen* designs fill their container and keep pixel gaps.

## Code map

- `src/model/` – data types, grid geometry, reducer store with undo/redo, IndexedDB media store
- `src/editor/` – canvas (CSS Grid + snapping drag/resize), left settings panel, inspector, top bar
- `src/export/` – code generators (`codegen.ts`), canvas image renderer (`image.ts`), export dialog
- `src/components/arc/` – [Arc UI](https://uiarc.dev) components, installed with `npx shadcn add @uiarc/<id>`
- `src/components/arc-ext/` – an inline variant of Arc's color picker (Arc's own file is left untouched)
- `src/components/arc/motion-tokens.ts` – Arc's motion presets, tuned 2x faster with no spring overshoot
- `src/ui/` – app-level compositions of Arc components (sections, swatches, spacing fields, toast bridge)

`npm run build:artifact` produces a single-file build for publishing as a claude.ai Artifact.
