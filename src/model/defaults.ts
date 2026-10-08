import { newId } from './media'
import type { BentoDoc, Cell, Fill, Stroke, TextContent } from './types'

export const SIZE_PRESETS = [
  { id: '1920x1080', label: 'Desktop HD', w: 1920, h: 1080 },
  { id: '2560x1440', label: 'Desktop QHD', w: 2560, h: 1440 },
  { id: '1280x720', label: 'HD 720p', w: 1280, h: 720 },
  { id: '1080x1080', label: 'Square', w: 1080, h: 1080 },
  { id: '1080x1350', label: 'Portrait 4:5', w: 1080, h: 1350 },
  { id: '1080x1920', label: 'Story 9:16', w: 1080, h: 1920 },
  { id: '1200x630', label: 'Social card', w: 1200, h: 630 },
] as const

/** Fully transparent, as 8-digit hex so CSS, canvas and Arc's color picker all understand it. */
export const TRANSPARENT = '#00000000'

export function isTransparent(color: string) {
  return /^#[0-9a-f]{6}00$/i.test(color) || color === 'transparent'
}

/** The only preset colors: everything else comes from the always-open color picker. */
export const BASIC_COLORS = [
  { css: TRANSPARENT, key: TRANSPARENT, name: 'Transparent' },
  { css: '#000000', key: '#000000', name: 'Black' },
  { css: '#ffffff', key: '#ffffff', name: 'White' },
]

const CELL_FILLS = ['#ffffff', '#e9e7ff', '#dff3e8', '#fff1d6', '#ffe1e1', '#1c1c1f']

export function defaultText(): TextContent {
  return {
    title: 'Title',
    subtitle: 'Add a short supporting line',
    color: '#111111',
    titleSize: 48,
    subtitleSize: 22,
    align: 'start',
    valign: 'end',
    font: 'sans',
  }
}

export function makeCell(col: number, row: number, w = 1, h = 1, index = 0): Cell {
  const color = CELL_FILLS[index % CELL_FILLS.length]
  return {
    id: newId('c'),
    col,
    row,
    w,
    h,
    textOn: false,
    fill: { kind: 'solid', color },
    media: null,
    text: { ...defaultText(), color: color === '#1c1c1f' ? '#ffffff' : '#111111' },
  }
}

/** A blank grid: the user adds every box themselves. */
export function emptyDoc(): BentoDoc {
  return {
    version: 1,
    sizeMode: 'fixed',
    width: 1920,
    height: 1080,
    cols: 4,
    rows: 3,
    gapX: 16,
    gapY: 16,
    padding: 32,
    radius: 24,
    background: { kind: 'color', color: '#f4f2ee' },
    stroke: defaultStroke(),
    cells: [],
  }
}

export function defaultStroke(): Stroke {
  return { on: false, width: 2, color: '#000000' }
}

/** The stroke to draw, or null when it is off (or the doc predates strokes). */
export function activeStroke(doc: BentoDoc): Stroke | null {
  return doc.stroke?.on && doc.stroke.width > 0 ? doc.stroke : null
}

export function fillCss(f: Fill) {
  return f.kind === 'solid' ? f.color : `linear-gradient(${f.angle}deg, ${f.from}, ${f.to})`
}

export const FONT_STACKS = {
  sans: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
  serif: `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`,
  mono: `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`,
} as const

/** Every media id referenced by a doc. */
export function mediaIds(doc: BentoDoc) {
  const ids: string[] = []
  if (doc.background.kind === 'image') ids.push(doc.background.media.id)
  for (const c of doc.cells) if (c.media) ids.push(c.media.id)
  return ids
}
