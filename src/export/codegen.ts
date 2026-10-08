import { FONT_STACKS, activeStroke, fillCss } from '../model/defaults'
import type { BentoDoc, MediaRef } from '../model/types'

/** Must match TEXT_PAD and the gap used by CellView in the editor. */
const TEXT_PAD = 32
const TEXT_GAP = 8

export interface Size {
  w: number
  h: number
}

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end' } as const
const TEXT_ALIGN = { start: 'left', center: 'center', end: 'right' } as const

/**
 * Fixed-size bentos export with lengths in `cqw` relative to the design width, so the
 * whole composition scales proportionally to whatever width it's given. "Fit" bentos
 * fill their container and keep pixel gaps, like the editor preview.
 */
function unit(doc: BentoDoc, size: Size) {
  return (px: number) => {
    if (px === 0) return '0'
    if (doc.sizeMode === 'fit') return `${round(px)}px`
    return `${round((px / size.w) * 100, 4)}cqw`
  }
}

function round(n: number, d = 2) {
  const f = 10 ** d
  return String(Math.round(n * f) / f)
}

export function cellClass(i: number) {
  return `bento-c${i + 1}`
}

function mediaCss(m: MediaRef) {
  if (m.mode === 'free' && m.free) {
    const f = m.free
    return `inset:auto;left:${round(f.x * 100, 3)}%;top:${round(f.y * 100, 3)}%;width:${round(f.w * 100, 3)}%;height:auto;max-width:none;transform:translate(-50%,-50%)`
  }
  const pos = `${round(m.x * 100)}% ${round(m.y * 100)}%`
  const zoom = m.zoom !== 1 ? `transform:scale(${round(m.zoom, 4)});transform-origin:${pos};` : ''
  return `object-position:${pos};${zoom}`
}

export function buildCss(doc: BentoDoc, size: Size) {
  const u = unit(doc, size)
  const fit = doc.sizeMode === 'fit'
  const bg = doc.background.kind === 'color' ? doc.background.color : '#000'
  const stroke = activeStroke(doc)
  const lines: string[] = []
  lines.push(
    fit
      ? `.bento-root{width:100%;height:100%}`
      : `.bento-root{width:100%;container-type:inline-size}`,
    `.bento{position:relative;box-sizing:border-box;overflow:hidden;${fit ? 'width:100%;height:100%;' : `aspect-ratio:${size.w}/${size.h};`}` +
      `display:grid;grid-template-columns:repeat(${doc.cols},minmax(0,1fr));grid-template-rows:repeat(${doc.rows},minmax(0,1fr));` +
      `column-gap:${u(doc.gapX)};row-gap:${u(doc.gapY)};padding:${u(doc.padding)};background:${bg}}`,
    `.bento-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}`,
    `.bento-cell{position:relative;min-width:0;min-height:0;overflow:hidden;border-radius:${u(doc.radius)}}`,
    `.bento-media{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover}`,
    `.bento-text{position:absolute;inset:0;display:flex;flex-direction:column;gap:${u(TEXT_GAP)};padding:${u(TEXT_PAD)};box-sizing:border-box}`,
    ...(stroke
      ? [`.bento-cell::after{content:"";position:absolute;inset:0;box-sizing:border-box;border-radius:inherit;border:${u(stroke.width)} solid ${stroke.color};pointer-events:none}`]
      : []),
    `.bento-title{margin:0;font-weight:650;line-height:1.1;letter-spacing:-0.02em;white-space:pre-wrap}`,
    `.bento-subtitle{margin:0;line-height:1.35;opacity:.75;white-space:pre-wrap}`,
  )
  if (doc.background.kind === 'image') {
    const m = doc.background.media
    lines.push(`.bento-bg{object-position:${round(m.x * 100)}% ${round(m.y * 100)}%}`)
  }

  doc.cells.forEach((c, i) => {
    const cls = cellClass(i)
    const area = `grid-column:${c.col + 1}/span ${c.w};grid-row:${c.row + 1}/span ${c.h};`
    // Layers, bottom to top: the cell's fill, media, text.
    lines.push(`.${cls}{${area}background:${fillCss(c.fill)}}`)
    if (c.media) lines.push(`.${cls} .bento-media{${mediaCss(c.media)}}`)
    if (c.textOn) {
      const t = c.text
      lines.push(
        `.${cls} .bento-text{color:${t.color};font-family:${FONT_STACKS[t.font]};` +
          `justify-content:${JUSTIFY[t.valign]};align-items:${JUSTIFY[t.align]};text-align:${TEXT_ALIGN[t.align]}}`,
        `.${cls} .bento-title{font-size:${u(t.titleSize)}}`,
        `.${cls} .bento-subtitle{font-size:${u(t.subtitleSize)}}`,
      )
    }
  })
  return lines.join('\n')
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Plain HTML markup. `src` decides how media is referenced (data URL, relative path…). */
export function buildMarkup(doc: BentoDoc, src: (m: MediaRef) => string) {
  const out: string[] = ['<div class="bento-root">', '  <div class="bento">']
  if (doc.background.kind === 'image') {
    const m = doc.background.media
    out.push(
      m.kind === 'video'
        ? `    <video class="bento-bg" src="${src(m)}" autoplay muted loop playsinline aria-hidden="true"></video>`
        : `    <img class="bento-bg" src="${src(m)}" alt="" aria-hidden="true">`,
    )
  }
  doc.cells.forEach((c, i) => {
    const cls = `bento-cell ${cellClass(i)}`
    const layers: string[] = []
    if (c.media) {
      const m = c.media
      layers.push(
        m.kind === 'video'
          ? `<video class="bento-media" src="${src(m)}" autoplay muted loop playsinline></video>`
          : `<img class="bento-media" src="${src(m)}" alt="">`,
      )
    }
    if (c.textOn) {
      const parts = [
        c.text.title && `<h2 class="bento-title">${escapeHtml(c.text.title)}</h2>`,
        c.text.subtitle && `<p class="bento-subtitle">${escapeHtml(c.text.subtitle)}</p>`,
      ].filter(Boolean)
      layers.push(`<div class="bento-text">${parts.join('')}</div>`)
    }
    out.push(`    <div class="${cls}">${layers.join('')}</div>`)
  })
  out.push('  </div>', '</div>')
  return out.join('\n')
}

export function buildHtmlPage(doc: BentoDoc, size: Size, src: (m: MediaRef) => string, title = 'Bento') {
  const fit = doc.sizeMode === 'fit'
  const pageBg = doc.background.kind === 'color' ? doc.background.color : '#000'
  const page = fit
    ? `html,body{margin:0;height:100%}body{background:${pageBg}}`
    : `html,body{margin:0}body{min-height:100vh;display:grid;place-items:center;background:${pageBg}}` +
      `body>.bento-root{width:min(100vw,calc(100vh * ${size.w} / ${size.h}))}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${page}
${buildCss(doc, size)}
</style>
</head>
<body>
${buildMarkup(doc, src)}
</body>
</html>
`
}

/* ---------- React ---------- */

function jsxText(s: string) {
  // JSX expression keeps newlines and avoids escaping headaches with { } < >.
  return `{${JSON.stringify(s)}}`
}

export function buildReactComponent(doc: BentoDoc, files: Map<string, string>, ts: boolean) {
  const imports: string[] = [`import './Bento.css'`]
  const names = new Map<string, string>()
  let n = 0
  const ref = (m: MediaRef) => {
    if (!names.has(m.id)) {
      const name = `media${++n}`
      names.set(m.id, name)
      imports.push(`import ${name} from './media/${files.get(m.id)}'`)
    }
    return names.get(m.id)!
  }

  const body: string[] = []
  if (doc.background.kind === 'image') {
    const m = doc.background.media
    body.push(
      m.kind === 'video'
        ? `        <video className="bento-bg" src={${ref(m)}} autoPlay muted loop playsInline aria-hidden="true" />`
        : `        <img className="bento-bg" src={${ref(m)}} alt="" aria-hidden="true" />`,
    )
  }
  doc.cells.forEach((c, i) => {
    const cls = `bento-cell ${cellClass(i)}`
    if (!c.media && !c.textOn) {
      body.push(`        <div className="${cls}" />`)
      return
    }
    body.push(`        <div className="${cls}">`)
    if (c.media) {
      const m = c.media
      body.push(
        m.kind === 'video'
          ? `          <video className="bento-media" src={${ref(m)}} autoPlay muted loop playsInline />`
          : `          <img className="bento-media" src={${ref(m)}} alt="" />`,
      )
    }
    if (c.textOn) {
      body.push(`          <div className="bento-text">`)
      if (c.text.title) body.push(`            <h2 className="bento-title">${jsxText(c.text.title)}</h2>`)
      if (c.text.subtitle) body.push(`            <p className="bento-subtitle">${jsxText(c.text.subtitle)}</p>`)
      body.push(`          </div>`)
    }
    body.push(`        </div>`)
  })

  const props = ts ? `{ className = '' }: { className?: string }` : `{ className = '' }`
  return `${imports.join('\n')}

/**
 * Generated by Bento Creator.
 * ${doc.sizeMode === 'fit' ? 'Fills its parent – give the parent a width and height.' : `Designed at ${doc.width}×${doc.height}; scales to the width of its parent.`}
 */
export default function Bento(${props}) {
  return (
    <div className={\`bento-root \${className}\`.trim()}>
      <div className="bento">
${body.join('\n')}
      </div>
    </div>
  )
}
`
}

/* ---------- Embed ---------- */

export function buildEmbed(doc: BentoDoc, size: Size, opts: { src?: string; srcdoc?: string }) {
  const style =
    doc.sizeMode === 'fit'
      ? 'display:block;width:100%;height:100vh;border:0'
      : `display:block;width:100%;aspect-ratio:${size.w}/${size.h};border:0`
  const source = opts.srcdoc != null ? `srcdoc="${escapeHtml(opts.srcdoc)}"` : `src="${escapeHtml(opts.src ?? 'bento.html')}"`
  return `<iframe ${source} title="Bento grid" loading="lazy" style="${style}"></iframe>`
}
