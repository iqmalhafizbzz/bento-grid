/** Color math for the picker. Colors are stored as '#rrggbb' or '#rrggbbaa'. */

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface Hsv {
  h: number
  s: number
  v: number
}

export function parseHex(hex: string): { rgb: Rgb; a: number } | null {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { rgb: { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }, a: m[2] ? parseInt(m[2], 16) / 255 : 1 }
}

const h2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')

export function toHex(rgb: Rgb, a = 1) {
  return `#${h2(rgb.r)}${h2(rgb.g)}${h2(rgb.b)}${a >= 1 ? '' : h2(a * 255)}`
}

export function rgbToHsv({ r, g, b }: Rgb, keepHue = 0): Hsv {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  let h = keepHue
  if (d) {
    if (max === R) h = 60 * (((G - B) / d) % 6)
    else if (max === G) h = 60 * ((B - R) / d + 2)
    else h = 60 * ((R - G) / d + 4)
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export function rgbToHsl({ r, g, b }: Rgb) {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  const { h } = rgbToHsv({ r, g, b })
  return { h, s, l }
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const v = l + c / 2
  return hsvToRgb({ h, s: v ? c / v : 0, v })
}

export type ColorFormat = 'hex' | 'rgb' | 'hsl'

/** Text for the value field in the chosen format (alpha is a separate field). */
export function formatColor(rgb: Rgb, fmt: ColorFormat) {
  if (fmt === 'hex') return toHex(rgb).slice(1).toUpperCase()
  if (fmt === 'rgb') return `${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}`
  const { h, s, l } = rgbToHsl(rgb)
  return `${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`
}

export function parseColor(text: string, fmt: ColorFormat): Rgb | null {
  const t = text.trim()
  if (fmt === 'hex') {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t)
    if (!m) return null
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
    return parseHex(h)!.rgb
  }
  const nums = t.match(/-?\d+(\.\d+)?/g)?.map(Number)
  if (!nums || nums.length < 3) return null
  if (fmt === 'rgb') return { r: clamp(nums[0], 0, 255), g: clamp(nums[1], 0, 255), b: clamp(nums[2], 0, 255) }
  return hslToRgb(((nums[0] % 360) + 360) % 360, clamp(nums[1], 0, 100) / 100, clamp(nums[2], 0, 100) / 100)
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
