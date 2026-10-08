import { isTransparent } from '../model/defaults'
import type { Background } from '../model/types'

function parseHex(hex: string) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance({ r, g, b }: { r: number; g: number; b: number }) {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * Editor colors for empty slots, derived from the bento background:
 * - `--canvas-primary`: the background fill itself
 * - `--canvas-hover`: a step darker on light fills, lighter on dark ones
 * - `--canvas-stroke`: a further step in the same direction
 * - `--canvas-ink`: strong enough for the slot's plus icon
 * Image or transparent backgrounds have no single color, so they get neutral translucent greys.
 */
export function canvasColors(bg: Background): Record<string, string> {
  const rgb = bg.kind === 'color' && !isTransparent(bg.color) ? parseHex(bg.color) : null
  if (!rgb) {
    return {
      '--canvas-primary': 'transparent',
      '--canvas-hover': 'rgb(128 128 128 / 0.18)',
      '--canvas-stroke': 'rgb(128 128 128 / 0.5)',
      '--canvas-ink': 'rgb(128 128 128 / 0.9)',
    }
  }
  const toward = luminance(rgb) > 0.4 ? 'black' : 'white'
  const primary = (bg as { color: string }).color
  const step = (pct: number) => `color-mix(in oklab, ${primary}, ${toward} ${pct}%)`
  return {
    '--canvas-primary': primary,
    '--canvas-hover': step(6),
    '--canvas-stroke': step(16),
    '--canvas-ink': step(45),
  }
}
