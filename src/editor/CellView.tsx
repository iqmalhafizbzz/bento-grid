import { useSyncExternalStore, type CSSProperties } from 'react'
import { FONT_STACKS, fillCss } from '../model/defaults'
import { mediaUrl, subscribeMedia } from '../model/media'
import type { Cell, MediaRef, Stroke } from '../model/types'

/** Inner padding of text cells, in document pixels. Exports use the same value. */
export const TEXT_PAD = 32

export function useMediaUrl(id: string | undefined) {
  return useSyncExternalStore(subscribeMedia, () => (id ? mediaUrl(id) : undefined))
}

export function mediaStyle(m: MediaRef): CSSProperties {
  if (m.mode === 'free' && m.free) {
    return {
      position: 'absolute',
      left: `${(m.free.x * 100).toFixed(3)}%`,
      top: `${(m.free.y * 100).toFixed(3)}%`,
      width: `${(m.free.w * 100).toFixed(3)}%`,
      height: 'auto',
      maxWidth: 'none',
      display: 'block',
      transform: 'translate(-50%, -50%)',
    }
  }
  const pos = `${(m.x * 100).toFixed(2)}% ${(m.y * 100).toFixed(2)}%`
  return {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'cover',
    objectPosition: pos,
    transform: m.zoom !== 1 ? `scale(${m.zoom})` : undefined,
    transformOrigin: pos,
  }
}

export function MediaView({ media, cellId }: { media: MediaRef; cellId?: string }) {
  const url = useMediaUrl(media.id)
  if (!url) return <div className="cell-media-loading" />
  return media.kind === 'video' ? (
    <video
      data-media-for={cellId}
      data-media-id={media.id}
      src={url}
      style={mediaStyle(media)}
      autoPlay
      muted
      loop
      playsInline
      draggable={false}
    />
  ) : (
    <img data-media-for={cellId} data-media-id={media.id} src={url} alt="" style={mediaStyle(media)} draggable={false} />
  )
}

const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end' } as const
const TEXT_ALIGN = { start: 'left', center: 'center', end: 'right' } as const

export function CellView({ cell, radius, stroke }: { cell: Cell; radius: number; stroke?: Stroke | null }) {
  const base: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: radius,
    // Media sits on the box fill, which shows around free-placed or transparent media.
    background: fillCss(cell.fill),
  }

  const t = cell.text
  return (
    <div style={base}>
      {cell.media && <MediaView media={cell.media} cellId={cell.id} />}
      {cell.textOn && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: JUSTIFY[t.valign],
            alignItems: JUSTIFY[t.align],
            textAlign: TEXT_ALIGN[t.align],
            padding: TEXT_PAD,
            gap: 8,
            color: t.color,
            fontFamily: FONT_STACKS[t.font],
          }}
        >
          {t.title && (
            <div style={{ fontSize: t.titleSize, fontWeight: 650, lineHeight: 1.1, letterSpacing: '-0.02em', whiteSpace: 'pre-wrap' }}>
              {t.title}
            </div>
          )}
          {t.subtitle && (
            <div style={{ fontSize: t.subtitleSize, lineHeight: 1.35, opacity: 0.75, whiteSpace: 'pre-wrap' }}>{t.subtitle}</div>
          )}
        </div>
      )}
      {stroke && (
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', border: `${stroke.width}px solid ${stroke.color}`, pointerEvents: 'none' }}
        />
      )}
    </div>
  )
}
