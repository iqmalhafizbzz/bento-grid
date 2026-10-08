# Bento Creator

Design bento-grid layouts in the browser and export them as HTML/CSS, a React component, an iframe embed, or an image.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Using it

- **Bentos:** start from *Create new bento* (or *Add new bento* in the sidebar): name it and pick a size and grid (Desktop HD, 4×3 by default). Switch between bentos with the picker at the top of the sidebar, start another with **+**, or delete the open one (you're asked to confirm). Undo history is per bento.
- **Add a box:** hover an empty slot and click `+`, or drag across empty slots to draw a larger box.
- **Move / resize:** drag a box, or a selected box's edge handles (powered by `@dnd-kit/dom`). Everything snaps to the grid. Dropping a box on others moves them into the space it left (shifted, or packed into the vacated cells); if they can't fit, the drop is refused.
- **Sidebar:** one resizable sidebar on the right (drag its left edge). The toolbar holds reset, undo/redo, light/dark mode and Export; below it are the Canvas properties and the selected Box's properties. Figma-style: Sections with nothing in them show a muted title and a **+**; filled ones have an eye (hide) and **−** (remove). Drag a field's prefix (W, H, an icon) sideways to scrub its value.
- **Layers:** every box is a fill (solid or linear gradient) and an optional image or video.
- **Colors:** each paint row is swatch, hex and opacity. Click the swatch for a Figma-style picker: paint type, saturation square, eyedropper, hue and opacity bars, Hex/RGB/HSL values, and the colors used on the page.
- **Images:** upload, paste (⌘V) or drop files onto a box. Placement (*Fill box* or *Free*), zoom and position sit under the image row; *Adjust* (or double-click the box) moves it on the canvas.
- **Spacing and radius:** sliders snap to 4px up to 48px with ruler ticks (and a light vibration per step where supported); type any exact value in the field. Hovering a spacing row draws its gaps on the canvas.
- **Stroke:** one stroke for every box, added from the Stroke section.
- **Shortcuts:** ⌘Z / ⇧⌘Z undo/redo · ⌫ delete · ⌘D duplicate · Esc deselect.

All bentos autosave to `localStorage`; media blobs go to IndexedDB.

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
- `src/editor/` – canvas (CSS Grid + snapping drag/resize) and the sidebar (toolbar, canvas and box sections)
- `src/export/` – code generators (`codegen.ts`), canvas image renderer (`image.ts`), export dialog
- `src/components/arc/` – [Arc UI](https://uiarc.dev) components, installed with `npx shadcn add @uiarc/<id>`
- `src/components/arc/motion-tokens.ts` – Arc's motion presets, tuned 2x faster with no spring overshoot
- `src/ui/panel.tsx` – Figma-style panel kit (sections, scrubbable fields, paint rows, ruler sliders)
- `src/ui/ColorPicker.tsx` – Figma-style color picker
- `src/ui/` – other app-level compositions of Arc components (tooltip buttons, toast bridge)

`npm run build:artifact` produces a single-file build for publishing as a claude.ai Artifact.
