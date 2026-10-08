import { FONT_STACKS, activeStroke, isTransparent } from '../model/defaults'
import { gridMetrics, mediaPlacement } from '../model/geometry'
import { getBlob } from '../model/media'
import type { BentoDoc, Fill, MediaRef, TextContent } from '../model/types'
import type { Size } from './codegen'

const TEXT_PAD = 32
const TEXT_GAP = 8

export type ImageFormat = 'png' | 'jpeg' | 'webp'

type Drawable = HTMLImageElement | HTMLVideoElement

async function loadDrawable(m: MediaRef): Promise<Drawable | null> {
  // Prefer the live editor element so videos export the frame you're looking at.
  if (m.kind === 'video') {
    const live = [...document.querySelectorAll<HTMLVideoElement>('video[data-media-id]')].find((v) => v.dataset.mediaId === m.id)
    if (live && live.readyState >= 2) return live
  }
  const blob = await getBlob(m.id)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  if (m.kind === 'image') {
    const img = new Image()
    img.src = url
    await img.decode().catch(() => undefined)
    return img
  }
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  await new Promise<void>((resolve) => {
    v.onloadeddata = () => resolve()
    v.onerror = () => resolve()
  })
  await new Promise<void>((resolve) => {
    v.onseeked = () => resolve()
    v.currentTime = Math.min(0.1, (v.duration || 1) / 2)
    setTimeout(resolve, 1500)
  })
  return v
}

function paintFill(ctx: CanvasRenderingContext2D, f: Fill, x: number, y: number, w: number, h: number) {
  if (f.kind === 'solid') {
    ctx.fillStyle = f.color
  } else {
    // CSS linear-gradient geometry: 0deg points up, angles run clockwise,
    // and the gradient line is long enough for the corners to hit the end colors.
    const a = (f.angle * Math.PI) / 180
    const len = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))
    const cx = x + w / 2
    const cy = y + h / 2
    const dx = (Math.sin(a) * len) / 2
    const dy = (-Math.cos(a) * len) / 2
    const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
    g.addColorStop(0, f.from)
    g.addColorStop(1, f.to)
    ctx.fillStyle = g
  }
  ctx.fillRect(x, y, w, h)
}

function drawMedia(ctx: CanvasRenderingContext2D, el: Drawable, m: MediaRef, x: number, y: number, w: number, h: number) {
  const natW = el instanceof HTMLVideoElement ? el.videoWidth || m.width : el.naturalWidth || m.width
  const natH = el instanceof HTMLVideoElement ? el.videoHeight || m.height : el.naturalHeight || m.height
  const p = mediaPlacement(w, h, natW, natH, m)
  ctx.drawImage(el, x + p.dx, y + p.dy, p.dw, p.dh)
}

/** Greedy word wrap that honours explicit newlines and never breaks inside a word (like CSS). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/)
    let line = ''
    for (const word of words) {
      const test = line + word
      if (line && ctx.measureText(test.trimEnd()).width > maxW) {
        lines.push(line.trimEnd())
        line = word.trimStart()
      } else {
        line = test
      }
    }
    lines.push(line.trimEnd())
  }
  return lines
}

function drawText(ctx: CanvasRenderingContext2D, t: TextContent, x: number, y: number, w: number, h: number) {
  const font = FONT_STACKS[t.font]
  const innerW = Math.max(0, w - TEXT_PAD * 2)
  type Block = { lines: string[]; size: number; lh: number; font: string; alpha: number; spacing: string }
  const blocks: Block[] = []
  if (t.title) {
    const f = `650 ${t.titleSize}px ${font}`
    ctx.font = f
    ctx.letterSpacing = `${-0.02 * t.titleSize}px`
    blocks.push({ lines: wrap(ctx, t.title, innerW), size: t.titleSize, lh: 1.1, font: f, alpha: 1, spacing: ctx.letterSpacing })
  }
  if (t.subtitle) {
    const f = `400 ${t.subtitleSize}px ${font}`
    ctx.font = f
    ctx.letterSpacing = '0px'
    blocks.push({ lines: wrap(ctx, t.subtitle, innerW), size: t.subtitleSize, lh: 1.35, font: f, alpha: 0.75, spacing: '0px' })
  }
  const heights = blocks.map((b) => b.lines.length * b.size * b.lh)
  const total = heights.reduce((a, b) => a + b, 0) + TEXT_GAP * Math.max(0, blocks.length - 1)
  const innerH = h - TEXT_PAD * 2
  let cy = y + TEXT_PAD + (t.valign === 'start' ? 0 : t.valign === 'center' ? (innerH - total) / 2 : innerH - total)

  ctx.fillStyle = t.color
  ctx.textBaseline = 'middle'
  ctx.textAlign = t.align === 'start' ? 'left' : t.align === 'center' ? 'center' : 'right'
  const tx = t.align === 'start' ? x + TEXT_PAD : t.align === 'center' ? x + w / 2 : x + w - TEXT_PAD

  for (const b of blocks) {
    ctx.font = b.font
    ctx.letterSpacing = b.spacing
    ctx.globalAlpha = b.alpha
    for (const line of b.lines) {
      // CSS centres glyphs in the line box; 'middle' baseline gets close to that.
      ctx.fillText(line, tx, cy + (b.size * b.lh) / 2)
      cy += b.size * b.lh
    }
    cy += TEXT_GAP
  }
  ctx.globalAlpha = 1
  ctx.letterSpacing = '0px'
}

export async function renderToCanvas(doc: BentoDoc, size: Size, scale = 1) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(size.w * scale)
  canvas.height = Math.round(size.h * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  await document.fonts?.ready

  const refs: MediaRef[] = []
  if (doc.background.kind === 'image') refs.push(doc.background.media)
  for (const c of doc.cells) if (c.media) refs.push(c.media)
  const loaded = new Map<string, Drawable | null>()
  await Promise.all(refs.map(async (m) => loaded.set(m.id, await loadDrawable(m))))

  // Background
  if (doc.background.kind === 'image') {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size.w, size.h)
    const el = loaded.get(doc.background.media.id)
    if (el) drawMedia(ctx, el, doc.background.media, 0, 0, size.w, size.h)
  } else if (!isTransparent(doc.background.color)) {
    ctx.fillStyle = doc.background.color
    ctx.fillRect(0, 0, size.w, size.h)
  }

  const gm = gridMetrics(doc, size.w, size.h)
  const stroke = activeStroke(doc)
  for (const c of doc.cells) {
    const r = gm.rect(c)
    if (r.w <= 0 || r.h <= 0) continue
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(doc.radius, r.w / 2, r.h / 2))
    ctx.clip()
    // Same layer order as the editor: fill, then media, then text.
    paintFill(ctx, c.fill, r.x, r.y, r.w, r.h)
    if (c.media) {
      const el = loaded.get(c.media.id)
      if (el) drawMedia(ctx, el, c.media, r.x, r.y, r.w, r.h)
    }
    if (c.textOn) drawText(ctx, c.text, r.x, r.y, r.w, r.h)
    if (stroke) {
      // Inside stroke, matching CSS `border` on a box with this radius.
      const w = Math.min(stroke.width, r.w / 2, r.h / 2)
      ctx.lineWidth = w
      ctx.strokeStyle = stroke.color
      ctx.beginPath()
      ctx.roundRect(r.x + w / 2, r.y + w / 2, r.w - w, r.h - w, Math.max(0, Math.min(doc.radius, r.w / 2, r.h / 2) - w / 2))
      ctx.stroke()
    }
    ctx.restore()
  }
  return canvas
}

export async function renderImage(doc: BentoDoc, size: Size, opts: { format: ImageFormat; scale: number; quality: number }) {
  const canvas = await renderToCanvas(doc, size, opts.scale)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), `image/${opts.format}`, opts.quality),
  )
}
