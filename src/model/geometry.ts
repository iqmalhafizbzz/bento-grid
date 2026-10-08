import type { BentoDoc, Cell, FreePlacement, MediaRef, Rect } from './types'

export function overlaps(a: Rect, b: Rect) {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h
}

export function inBounds(r: Rect, cols: number, rows: number) {
  return r.col >= 0 && r.row >= 0 && r.w >= 1 && r.h >= 1 && r.col + r.w <= cols && r.row + r.h <= rows
}

/** True when `r` fits on the grid without touching any cell except `ignoreId`. */
export function fits(doc: Pick<BentoDoc, 'cols' | 'rows' | 'cells'>, r: Rect, ignoreId?: string) {
  if (!inBounds(r, doc.cols, doc.rows)) return false
  return !doc.cells.some((c) => c.id !== ignoreId && overlaps(c, r))
}

export function rectFromCorners(a: { col: number; row: number }, b: { col: number; row: number }): Rect {
  const col = Math.min(a.col, b.col)
  const row = Math.min(a.row, b.row)
  return { col, row, w: Math.abs(a.col - b.col) + 1, h: Math.abs(a.row - b.row) + 1 }
}

/** Boolean occupancy map, indexed [row][col]. */
export function occupancy(doc: Pick<BentoDoc, 'cols' | 'rows' | 'cells'>) {
  const map = Array.from({ length: doc.rows }, () => new Array<boolean>(doc.cols).fill(false))
  for (const c of doc.cells) {
    for (let r = c.row; r < c.row + c.h && r < doc.rows; r++) {
      for (let k = c.col; k < c.col + c.w && k < doc.cols; k++) map[r][k] = true
    }
  }
  return map
}

export function firstFreeSlot(doc: Pick<BentoDoc, 'cols' | 'rows' | 'cells'>, w = 1, h = 1): Rect | null {
  for (let row = 0; row + h <= doc.rows; row++) {
    for (let col = 0; col + w <= doc.cols; col++) {
      const r = { col, row, w, h }
      if (fits(doc, r)) return r
    }
  }
  return null
}

/** Layout of the grid in document pixels – shared by the editor, image renderer and exports. */
export interface GridMetrics {
  colW: number
  rowH: number
  x(col: number): number
  y(row: number): number
  rect(r: Rect): { x: number; y: number; w: number; h: number }
}

export function gridMetrics(doc: BentoDoc, width = doc.width, height = doc.height): GridMetrics {
  const innerW = width - doc.padding * 2
  const innerH = height - doc.padding * 2
  const colW = Math.max(0, (innerW - doc.gapX * (doc.cols - 1)) / doc.cols)
  const rowH = Math.max(0, (innerH - doc.gapY * (doc.rows - 1)) / doc.rows)
  const x = (col: number) => doc.padding + col * (colW + doc.gapX)
  const y = (row: number) => doc.padding + row * (rowH + doc.gapY)
  return {
    colW,
    rowH,
    x,
    y,
    rect: (r) => ({
      x: x(r.col),
      y: y(r.row),
      w: r.w * colW + (r.w - 1) * doc.gapX,
      h: r.h * rowH + (r.h - 1) * doc.gapY,
    }),
  }
}

/**
 * Map a point in document pixels to a grid track index. Points that land in a gap
 * snap to the nearest track, so dragging feels continuous.
 */
export function trackAt(pos: number, padding: number, track: number, gap: number, count: number) {
  const p = pos - padding + gap / 2
  const idx = Math.floor(p / (track + gap))
  return Math.min(count - 1, Math.max(0, idx))
}

export function cellAt(doc: BentoDoc, px: number, py: number, width = doc.width, height = doc.height) {
  const m = gridMetrics(doc, width, height)
  return {
    col: trackAt(px, doc.padding, m.colW, doc.gapX, doc.cols),
    row: trackAt(py, doc.padding, m.rowH, doc.gapY, doc.rows),
  }
}

/** Drop cells that fall off a shrunk grid and trim spans that hang over the edge. */
export function clampCells(cells: Cell[], cols: number, rows: number): Cell[] {
  return cells
    .filter((c) => c.col < cols && c.row < rows)
    .map((c) => ({ ...c, w: Math.min(c.w, cols - c.col), h: Math.min(c.h, rows - c.row) }))
}

/** Media crop math. Mirrors CSS `object-fit: cover; object-position: x y; transform: scale(zoom)` with origin at x y. */
export function coverPlacement(
  boxW: number,
  boxH: number,
  natW: number,
  natH: number,
  zoom: number,
  fx: number,
  fy: number,
) {
  const s = Math.max(boxW / natW, boxH / natH) * zoom
  const dw = natW * s
  const dh = natH * s
  return { dx: -(dw - boxW) * fx, dy: -(dh - boxH) * fy, dw, dh }
}

/** Width (as a fraction of the box width) at which media fits entirely inside the box. */
export function containWidth(boxW: number, boxH: number, natW: number, natH: number) {
  if (!boxW || !boxH || !natW || !natH) return 1
  return (natW * Math.min(boxW / natW, boxH / natH)) / boxW
}

/**
 * Free media placement. Mirrors the CSS used everywhere:
 * `left: x%; top: y%; width: w%; height: auto; transform: translate(-50%, -50%)`.
 */
export function freePlacement(boxW: number, boxH: number, natW: number, natH: number, f: FreePlacement) {
  const dw = boxW * f.w
  const dh = natW ? (dw * natH) / natW : 0
  return { dx: boxW * f.x - dw / 2, dy: boxH * f.y - dh / 2, dw, dh }
}

/** Where media lands inside a box, whichever mode it uses. */
export function mediaPlacement(boxW: number, boxH: number, natW: number, natH: number, m: MediaRef) {
  return m.mode === 'free' && m.free
    ? freePlacement(boxW, boxH, natW, natH, m.free)
    : coverPlacement(boxW, boxH, natW, natH, m.zoom, m.x, m.y)
}

/**
 * Where everything goes when box `id` is dropped at `target`.
 * Free space: just move it. Otherwise the boxes it lands on take over the space it left:
 * they shift by the same offset the dragged box travelled, in reverse. A single displaced box
 * that cannot shift is tried at the dragged box's old corner instead. Returns null if no
 * arrangement fits without overlaps.
 */
export function planMove(doc: Pick<BentoDoc, 'cols' | 'rows' | 'cells'>, id: string, target: Rect): Record<string, Rect> | null {
  const dragged = doc.cells.find((c) => c.id === id)
  if (!dragged || !inBounds(target, doc.cols, doc.rows)) return null
  if (fits(doc, target, id)) return { [id]: target }

  const hit = doc.cells.filter((c) => c.id !== id && overlaps(c, target))
  const others = doc.cells.filter((c) => c.id !== id && !hit.includes(c))
  const valid = (placed: Rect[]) =>
    placed.every(
      (r, i) =>
        inBounds(r, doc.cols, doc.rows) &&
        !overlaps(r, target) &&
        others.every((o) => !overlaps(r, o)) &&
        placed.every((q, j) => j === i || !overlaps(r, q)),
    )

  const dc = dragged.col - target.col
  const dr = dragged.row - target.row
  const shifted = hit.map((c) => ({ col: c.col + dc, row: c.row + dr, w: c.w, h: c.h }))
  if (valid(shifted)) return Object.fromEntries([[id, target], ...hit.map((c, i) => [c.id, shifted[i]])])

  if (hit.length === 1) {
    const atOrigin = { col: dragged.col, row: dragged.row, w: hit[0].w, h: hit[0].h }
    if (valid([atOrigin])) return { [id]: target, [hit[0].id]: atOrigin }
  }

  // Last resort: pack the displaced boxes into free space, preferring the cells the dragged
  // box left behind. (A 2×2 dropped over two 1×1 boxes sends them to its vacated bottom row.)
  const packed = packInto(doc, target, others, hit, dragged)
  return packed ? Object.fromEntries([[id, target], ...hit.map((c, i) => [c.id, packed[i]])]) : null
}

/**
 * Greedy placement of `boxes` around fixed `others` and `target`. Each box (in reading order)
 * takes the free spot that lies most inside the dragged box's vacated area, then nearest its
 * old position. Returns rects in the same order as `boxes`, or null if one doesn't fit.
 */
function packInto(doc: Pick<BentoDoc, 'cols' | 'rows'>, target: Rect, others: Rect[], boxes: Cell[], dragged: Rect) {
  const vacated = (col: number, row: number) =>
    col >= dragged.col && col < dragged.col + dragged.w && row >= dragged.row && row < dragged.row + dragged.h &&
    !(col >= target.col && col < target.col + target.w && row >= target.row && row < target.row + target.h)
  const placed: Rect[] = []
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].row - boxes[b].row || boxes[a].col - boxes[b].col)
  const result: Rect[] = new Array(boxes.length)
  for (const i of order) {
    const b = boxes[i]
    let best: { r: Rect; score: number } | null = null
    for (let row = 0; row + b.h <= doc.rows; row++) {
      for (let col = 0; col + b.w <= doc.cols; col++) {
        const r = { col, row, w: b.w, h: b.h }
        if (overlaps(r, target) || others.some((o) => overlaps(r, o)) || placed.some((p) => overlaps(r, p))) continue
        let outside = 0
        for (let y = row; y < row + b.h; y++) for (let x = col; x < col + b.w; x++) if (!vacated(x, y)) outside++
        const score = outside * 1000 + Math.hypot(col - b.col, row - b.row)
        if (!best || score < best.score) best = { r, score }
      }
    }
    if (!best) return null
    placed.push(best.r)
    result[i] = best.r
  }
  return result
}
