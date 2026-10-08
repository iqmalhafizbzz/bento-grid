import { Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { Button } from '@/components/arc/button/button'
import { activeStroke, isTransparent, visibleBackground } from '../model/defaults'
import { cellAt, coverPlacement, fits, gridMetrics, mediaPlacement, occupancy, planMove, rectFromCorners, type GridMetrics } from '../model/geometry'
import { addMediaFile, isSupportedFile } from '../model/media'
import { useStore } from '../model/store'
import type { BentoDoc, Cell, MediaRef, Rect } from '../model/types'
import { toast } from '../ui'
import { canvasColors } from './canvasColors'
import { CellView, useMediaUrl } from './CellView'
import { useDocSize, useEditor, type GapGuide } from './editorState'
import { useBoxDrag, type BoxDragData, type Edge } from './useBoxDrag'
import './canvas.css'

/** Drawing a new box across empty slots. */
interface CreateDrag {
  start: { col: number; row: number }
  want: Rect
  valid: Rect | null
  moved: boolean
}

/** Moving or resizing a box (driven by @dnd-kit/dom). */
interface BoxDrag {
  data: BoxDragData
  origin: Rect
  /** Grid offset between the grabbed slot and the box's top-left, for moves. */
  grab: { col: number; row: number }
  /** Where the pointer wants the box. */
  want: Rect
  /** Placement of every affected box for the last arrangement that fit; committed on drop. */
  plan: Record<string, Rect> | null
}

/** Resizing media from a corner of its bounding box while adjusting. */
interface MediaResize {
  id: string
  /** Which corner: -1 = left / top, 1 = right / bottom. */
  cx: -1 | 1
  cy: -1 | 1
  /** Placement and media when the drag started, in document pixels relative to the box. */
  start: { dx: number; dy: number; dw: number; dh: number }
  media: MediaRef
}

/** Panning or moving media inside a box being adjusted. */
interface PanDrag {
  id: string
  startX: number
  startY: number
  fx: number
  fy: number
}

const STAGE_MARGIN = 56

function gridStyle(doc: BentoDoc): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    padding: doc.padding,
    display: 'grid',
    gridTemplateColumns: `repeat(${doc.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${doc.rows}, minmax(0, 1fr))`,
    columnGap: doc.gapX,
    rowGap: doc.gapY,
  }
}

const area = (r: Rect): CSSProperties => ({
  gridColumn: `${r.col + 1} / span ${r.w}`,
  gridRow: `${r.row + 1} / span ${r.h}`,
})

const sameRect = (a: Rect, b: Rect) => a.col === b.col && a.row === b.row && a.w === b.w && a.h === b.h

export function Canvas() {
  const { doc, selectedId, dispatch, updateCell } = useStore()
  const { cropId, setCropId, guide } = useEditor()
  const size = useDocSize(doc)
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState({ w: 800, h: 600 })
  const [create, setCreate] = useState<CreateDrag | null>(null)
  const [boxDrag, setBoxDrag] = useState<BoxDrag | null>(null)
  const [pan, setPan] = useState<PanDrag | null>(null)
  const [mresize, setMresize] = useState<MediaResize | null>(null)
  const [dropTarget, setDropTarget] = useState<Rect | null>(null)
  // Latest drag state for event handlers; commits happen outside state updaters.
  const boxDragRef = useRef(boxDrag)
  boxDragRef.current = boxDrag
  const createRef = useRef(create)
  createRef.current = create

  useLayoutEffect(() => {
    const el = viewportRef.current!
    const ro = new ResizeObserver(([e]) => setVp({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = Math.max(0.05, Math.min((vp.w - STAGE_MARGIN * 2) / size.w, (vp.h - STAGE_MARGIN * 2) / size.h))
  const metrics = useMemo(() => gridMetrics(doc, size.w, size.h), [doc, size.w, size.h])

  const toDoc = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect()
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale }
  }
  const slotAt = (clientX: number, clientY: number) => {
    const p = toDoc(clientX, clientY)
    return cellAt(doc, p.x, p.y, size.w, size.h)
  }
  const cellUnder = (clientX: number, clientY: number) => {
    const p = toDoc(clientX, clientY)
    if (p.x < 0 || p.y < 0 || p.x > size.w || p.y > size.h) return { slot: null, cell: null }
    const slot = cellAt(doc, p.x, p.y, size.w, size.h)
    const cell = doc.cells.find((c) => slot.col >= c.col && slot.col < c.col + c.w && slot.row >= c.row && slot.row < c.row + c.h)
    return { slot, cell: cell ?? null }
  }

  // Leave adjust mode when its box goes away, loses its media, or gets deselected.
  useEffect(() => {
    if (cropId && (selectedId !== cropId || !doc.cells.some((c) => c.id === cropId && c.media))) setCropId(null)
  }, [cropId, selectedId, doc.cells, setCropId])

  /* ----- box move and resize, via @dnd-kit/dom ----- */
  const draggableRef = useBoxDrag({
    start(data, x, y) {
      const cell = doc.cells.find((c) => c.id === data.id)
      if (!cell) return
      const origin = { col: cell.col, row: cell.row, w: cell.w, h: cell.h }
      const slot = slotAt(x, y)
      setCropId(null)
      dispatch({ type: 'select', id: cell.id })
      setBoxDrag({ data, origin, grab: { col: slot.col - cell.col, row: slot.row - cell.row }, want: origin, plan: { [cell.id]: origin } })
    },
    move(data, x, y) {
      setBoxDrag((d) => {
        if (!d) return d
        const slot = slotAt(x, y)
        const o = d.origin
        let want: Rect
        let plan: Record<string, Rect> | null
        if (data.kind === 'move') {
          const col = Math.min(doc.cols - o.w, Math.max(0, slot.col - d.grab.col))
          const row = Math.min(doc.rows - o.h, Math.max(0, slot.row - d.grab.row))
          want = { ...o, col, row }
          // Landing on other boxes swaps them into the space this one left.
          plan = planMove(doc, data.id, want)
        } else {
          want = resized(o, data.edge, slot)
          plan = fits(doc, want, data.id) ? { [data.id]: want } : null
        }
        if (sameRect(want, d.want)) return d
        return { ...d, want, plan: plan ?? d.plan }
      })
    },
    end(data, canceled) {
      const d = boxDragRef.current
      if (d && !canceled && d.plan && !sameRect(d.plan[data.id] ?? d.origin, d.origin)) dispatch({ type: 'moveCells', moves: d.plan })
      setBoxDrag(null)
    },
  })

  /* ----- drawing new boxes and panning media (plain pointer events) ----- */
  useEffect(() => {
    if (!create && !pan && !mresize) return
    const onMove = (e: PointerEvent) => {
      if (mresize) {
        const cell = doc.cells.find((c) => c.id === mresize.id)
        if (!cell?.media) return
        const box = metrics.rect(cell)
        const pt = toDoc(e.clientX, e.clientY)
        const px = pt.x - box.x
        const py = pt.y - box.y
        const { start: s0, media: m0, cx, cy } = mresize
        // The opposite corner stays pinned; the larger of the two axis scales wins, aspect locked.
        const ax = cx > 0 ? s0.dx : s0.dx + s0.dw
        const ay = cy > 0 ? s0.dy : s0.dy + s0.dh
        const k = Math.max(0.02, Math.max(((px - ax) * cx) / s0.dw, ((py - ay) * cy) / s0.dh))
        if (m0.mode === 'free' && m0.free) {
          const dw = s0.dw * k
          const dh = s0.dh * k
          const w = Math.min(5, Math.max(0.05, dw / box.w))
          const x = (ax + (cx * dw) / 2) / box.w
          const y = (ay + (cy * dh) / 2) / box.h
          updateCell(cell.id, { media: { ...cell.media, free: { w, x: Math.min(1.5, Math.max(-0.5, x)), y: Math.min(1.5, Math.max(-0.5, y)) } } }, 'mresize')
        } else {
          updateCell(cell.id, { media: { ...cell.media, zoom: Math.min(5, Math.max(1, m0.zoom * k)) } }, 'mresize')
        }
        return
      }
      if (pan) {
        const cell = doc.cells.find((c) => c.id === pan.id)
        const m = cell?.media
        if (!cell || !m) return
        const box = metrics.rect(cell)
        const dx = (e.clientX - pan.startX) / scale
        const dy = (e.clientY - pan.startY) / scale
        if (m.mode === 'free' && m.free) {
          // Free media follows the pointer; keep its centre near the box so it can't be lost.
          const x = Math.min(1.5, Math.max(-0.5, pan.fx + dx / box.w))
          const y = Math.min(1.5, Math.max(-0.5, pan.fy + dy / box.h))
          updateCell(pan.id, { media: { ...m, free: { ...m.free, x, y } } }, 'pan')
          return
        }
        const pl = coverPlacement(box.w, box.h, m.width, m.height, m.zoom, 0, 0)
        const ox = pl.dw - box.w
        const oy = pl.dh - box.h
        const x = ox > 0.5 ? Math.min(1, Math.max(0, pan.fx - dx / ox)) : m.x
        const y = oy > 0.5 ? Math.min(1, Math.max(0, pan.fy - dy / oy)) : m.y
        updateCell(pan.id, { media: { ...m, x, y } }, 'pan')
        return
      }
      setCreate((c) => {
        if (!c) return c
        const want = rectFromCorners(c.start, slotAt(e.clientX, e.clientY))
        const valid = fits(doc, want) ? want : c.valid
        return { ...c, want, valid, moved: c.moved || want.w > 1 || want.h > 1 }
      })
    }
    const onUp = () => {
      const c = createRef.current
      if (c?.valid) dispatch({ type: 'addCell', rect: c.valid })
      setCreate(null)
      setPan(null)
      setMresize(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!create, pan, mresize, doc, scale, metrics])

  /* ----- wheel zoom or resize while adjusting media ----- */
  useEffect(() => {
    const el = viewportRef.current!
    const onWheel = (e: WheelEvent) => {
      if (!cropId) return
      const cell = doc.cells.find((c) => c.id === cropId)
      if (!cell?.media) return
      e.preventDefault()
      const m = cell.media
      const factor = Math.exp(-e.deltaY * 0.0015)
      if (m.mode === 'free' && m.free) {
        const w = Math.min(5, Math.max(0.05, m.free.w * factor))
        updateCell(cropId, { media: { ...m, free: { ...m.free, w } } }, 'zoom')
        return
      }
      const zoom = Math.min(5, Math.max(1, m.zoom * factor))
      updateCell(cropId, { media: { ...m, zoom } }, 'zoom')
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [cropId, doc.cells, updateCell])

  /* ----- handlers ----- */
  const onSlotDown = (e: RPointerEvent, col: number, row: number) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setCropId(null)
    const r = { col, row, w: 1, h: 1 }
    setCreate({ start: { col, row }, want: r, valid: r, moved: false })
  }

  const onCellDown = (e: RPointerEvent, cell: Cell) => {
    if (e.button !== 0) return
    e.stopPropagation()
    if (cropId === cell.id && cell.media) {
      const m = cell.media
      const origin = m.mode === 'free' && m.free ? m.free : m
      setPan({ id: cell.id, startX: e.clientX, startY: e.clientY, fx: origin.x, fy: origin.y })
      return
    }
    setCropId(null)
    dispatch({ type: 'select', id: cell.id })
  }

  /* ----- file drop ----- */
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const target = dropTarget
    setDropTarget(null)
    const file = [...e.dataTransfer.files].find(isSupportedFile)
    if (!file) return
    const { slot, cell } = cellUnder(e.clientX, e.clientY)
    if (!slot) return
    try {
      const media = await addMediaFile(file)
      if (cell) {
        updateCell(cell.id, { media })
        dispatch({ type: 'select', id: cell.id })
      } else if (target) {
        dispatch({ type: 'addCell', rect: target, init: { media } })
      }
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  // Empty slots follow the arrangement being previewed, so a slot under a moving box is hidden.
  const shown = boxDrag?.plan ? { ...doc, cells: doc.cells.map((c) => (boxDrag.plan![c.id] ? { ...c, ...boxDrag.plan![c.id] } : c)) } : doc
  const occ = occupancy(shown)
  const emptySlots: { col: number; row: number }[] = []
  for (let row = 0; row < doc.rows; row++) for (let col = 0; col < doc.cols; col++) if (!occ[row][col]) emptySlots.push({ col, row })

  const handle = 10 / scale
  const cropCell = cropId ? doc.cells.find((c) => c.id === cropId) : undefined
  const shownBg = visibleBackground(doc)
  const background = shownBg ?? { kind: 'color' as const, color: '#00000000' }
  const transparent = background.kind === 'color' && isTransparent(background.color)
  const dragging = boxDrag ? boxDrag.data.kind : create ? 'create' : pan ? 'pan' : undefined
  const ghost = boxDrag && !sameRect(boxDrag.want, boxDrag.origin) ? boxDrag : null
  const ghostInvalid = ghost
    ? ghost.data.kind === 'move'
      ? !planMove(doc, ghost.data.id, ghost.want)
      : !fits(doc, ghost.want, ghost.data.id)
    : false

  return (
    <div
      ref={viewportRef}
      className="canvas-viewport"
      data-dragging={dragging}
      onPointerDown={() => {
        setCropId(null)
        dispatch({ type: 'select', id: null })
      }}
      onDragOver={(e) => {
        if (![...e.dataTransfer.items].some((i) => i.kind === 'file')) return
        e.preventDefault()
        const { slot, cell } = cellUnder(e.clientX, e.clientY)
        setDropTarget(cell ? { col: cell.col, row: cell.row, w: cell.w, h: cell.h } : slot ? { ...slot, w: 1, h: 1 } : null)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropTarget(null)
      }}
      onDrop={onDrop}
    >
      <div className="canvas-frame" style={{ width: size.w * scale, height: size.h * scale }}>
        <div
          ref={stageRef}
          className="canvas-stage"
          data-transparent={transparent ? '' : undefined}
          style={{
            width: size.w,
            height: size.h,
            transform: `scale(${scale})`,
            background: background.kind === 'color' && !transparent ? background.color : undefined,
            ...canvasColors(background),
            ['--handle' as string]: `${handle}px`,
            ['--px' as string]: `${1 / scale}px`,
          }}
        >
          {background.kind === 'image' && <BackgroundImage doc={doc} />}

          <div style={gridStyle(doc)}>
            {emptySlots.map(({ col, row }) => (
              <div
                key={`${col}-${row}`}
                className="slot"
                style={{ ...area({ col, row, w: 1, h: 1 }), borderRadius: doc.radius }}
                onPointerDown={(e) => onSlotDown(e, col, row)}
              >
                <span className="slot-plus" style={{ width: 36 / scale, height: 36 / scale }}>
                  <Plus style={{ width: 18 / scale, height: 18 / scale }} />
                </span>
              </div>
            ))}

            {doc.cells.map((cell) => {
              const planned = boxDrag?.plan?.[cell.id]
              const r = planned ?? cell
              const selected = cell.id === selectedId
              const cropping = cell.id === cropId
              const lifted = boxDrag?.data.id === cell.id
              const displaced = !!planned && !lifted && !sameRect(planned, cell)
              return (
                <div
                  key={cell.id}
                  ref={draggableRef(`move:${cell.id}`, { kind: 'move', id: cell.id })}
                  className="cell"
                  data-selected={selected ? '' : undefined}
                  data-cropping={cropping ? '' : undefined}
                  data-lifted={lifted ? '' : undefined}
                  data-displaced={displaced ? '' : undefined}
                  style={{ ...area(r), borderRadius: doc.radius }}
                  onPointerDown={(e) => onCellDown(e, cell)}
                  onDoubleClick={() => cell.media && setCropId(cell.id)}
                >
                  {cropping && cell.media && <CropGhost cell={cell} box={metrics.rect(cell)} radius={doc.radius} />}
                  {cropping && cell.media && (
                    <MediaBounds
                      cell={cell}
                      box={metrics.rect(cell)}
                      scale={scale}
                      resizing={mresize?.id === cell.id}
                      onCorner={(cx, cy, start) => setMresize({ id: cell.id, cx, cy, start, media: cell.media! })}
                    />
                  )}
                  <CellView cell={cell} radius={doc.radius} stroke={activeStroke(doc)} />
                  {selected && !cropping && (
                    <>
                      <div className="cell-ring" style={{ borderRadius: doc.radius }} />
                      {HANDLES.map(([name, edge]) => (
                        <div
                          key={name}
                          ref={draggableRef(`resize:${cell.id}:${name}`, { kind: 'resize', id: cell.id, edge })}
                          className={`handle handle-${name}`}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                      ))}
                    </>
                  )}
                </div>
              )
            })}

            {create?.moved && (
              <div className="ghost" data-invalid={!fits(doc, create.want) ? '' : undefined} style={{ ...area(create.want), borderRadius: doc.radius }}>
                <GhostSize rect={create.want} scale={scale} />
              </div>
            )}
            {ghost && (
              <div className="ghost" data-invalid={ghostInvalid ? '' : undefined} style={{ ...area(ghost.want), borderRadius: doc.radius }}>
                <GhostSize rect={ghost.want} scale={scale} />
              </div>
            )}

            {dropTarget && <div className="ghost" data-drop="" style={{ ...area(dropTarget), borderRadius: doc.radius }} />}
          </div>

          {guide && <GapGuides doc={doc} metrics={metrics} size={size} guide={guide} scale={scale} />}
        </div>
      </div>

      {cropId && (
        <div className="canvas-hint" onPointerDown={(e) => e.stopPropagation()}>
          <span>{cropCell?.media?.mode === 'free' ? 'Drag to move, scroll to resize' : 'Drag to reposition, scroll to zoom'}</span>
          <Button size="sm" onClick={() => setCropId(null)}>
            Done
          </Button>
        </div>
      )}
    </div>
  )
}

function resized(o: Rect, edge: Edge, slot: { col: number; row: number }): Rect {
  let { col, row, w, h } = o
  if (edge.e) w = Math.max(1, slot.col - o.col + 1)
  if (edge.s) h = Math.max(1, slot.row - o.row + 1)
  if (edge.w) {
    col = Math.min(slot.col, o.col + o.w - 1)
    w = o.col + o.w - col
  }
  if (edge.n) {
    row = Math.min(slot.row, o.row + o.h - 1)
    h = o.row + o.h - row
  }
  return { col, row, w, h }
}

function GhostSize({ rect, scale }: { rect: Rect; scale: number }) {
  return (
    <span className="ghost-size" style={{ fontSize: 12 / scale, padding: `${3 / scale}px ${7 / scale}px` }}>
      {rect.w} × {rect.h}
    </span>
  )
}

/** Bands over every gap (or the outer padding) being adjusted, each with a centre line, plus one value label. */
function GapGuides({ doc, metrics, size, guide, scale }: { doc: BentoDoc; metrics: GridMetrics; size: { w: number; h: number }; guide: GapGuide; scale: number }) {
  const bands: { x: number; y: number; w: number; h: number; vertical: boolean }[] = []
  const p = doc.padding
  if (guide === 'gapX') {
    for (let i = 1; i < doc.cols; i++) bands.push({ x: metrics.x(i) - doc.gapX, y: p, w: doc.gapX, h: size.h - p * 2, vertical: true })
  } else if (guide === 'gapY') {
    for (let i = 1; i < doc.rows; i++) bands.push({ x: p, y: metrics.y(i) - doc.gapY, w: size.w - p * 2, h: doc.gapY, vertical: false })
  } else {
    bands.push(
      { x: 0, y: 0, w: size.w, h: p, vertical: false },
      { x: 0, y: size.h - p, w: size.w, h: p, vertical: false },
      { x: 0, y: p, w: p, h: size.h - p * 2, vertical: true },
      { x: size.w - p, y: p, w: p, h: size.h - p * 2, vertical: true },
    )
  }
  const value = guide === 'gapX' ? doc.gapX : guide === 'gapY' ? doc.gapY : doc.padding
  return (
    <div className="gap-guides" aria-hidden="true">
      {bands.map((b, i) => (
        <div key={i} className="gap-band" data-vertical={b.vertical ? '' : undefined} style={{ left: b.x, top: b.y, width: b.w, height: b.h }}>
          {i === 0 && (
            <span className="gap-label" style={{ fontSize: 12 / scale, padding: `${2 / scale}px ${6 / scale}px` }}>
              {value}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

const HANDLES: [string, Edge][] = [
  ['n', { n: true }],
  ['s', { s: true }],
  ['e', { e: true }],
  ['w', { w: true }],
  ['ne', { n: true, e: true }],
  ['nw', { n: true, w: true }],
  ['se', { s: true, e: true }],
  ['sw', { s: true, w: true }],
]

/**
 * Bounding box of the media while adjusting: a frame around its full extent with four corner
 * handles, and its rendered size in pixels while a corner is being dragged.
 */
function MediaBounds({
  cell,
  box,
  scale,
  resizing,
  onCorner,
}: {
  cell: Cell
  box: { w: number; h: number }
  scale: number
  resizing: boolean
  onCorner: (cx: -1 | 1, cy: -1 | 1, start: { dx: number; dy: number; dw: number; dh: number }) => void
}) {
  const m = cell.media!
  const p = mediaPlacement(box.w, box.h, m.width, m.height, m)
  const corners: [-1 | 1, -1 | 1, string][] = [
    [-1, -1, 'nwse-resize'],
    [1, -1, 'nesw-resize'],
    [-1, 1, 'nesw-resize'],
    [1, 1, 'nwse-resize'],
  ]
  return (
    <div className="media-bounds" style={{ left: p.dx, top: p.dy, width: p.dw, height: p.dh }}>
      {corners.map(([cx, cy, cursor]) => (
        <span
          key={`${cx}${cy}`}
          className="media-handle"
          role="presentation"
          style={{ left: cx < 0 ? 0 : '100%', top: cy < 0 ? 0 : '100%', cursor }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            e.preventDefault()
            onCorner(cx, cy, p)
          }}
        />
      ))}
      {resizing && (
        <span className="media-size" style={{ fontSize: 12 / scale, padding: `${2 / scale}px ${7 / scale}px`, marginTop: 8 / scale }}>
          {Math.round(p.dw)} × {Math.round(p.dh)}
        </span>
      )}
    </div>
  )
}

/** Faint view of the whole media while adjusting, so you can see what's outside the frame. */
function CropGhost({ cell, box, radius }: { cell: Cell; box: { w: number; h: number }; radius: number }) {
  const m = cell.media!
  const url = useMediaUrl(m.id)
  if (!url) return null
  const p = mediaPlacement(box.w, box.h, m.width, m.height, m)
  const style: CSSProperties = { position: 'absolute', left: p.dx, top: p.dy, width: p.dw, height: p.dh }
  return (
    <div className="crop-ghost" style={{ borderRadius: radius }}>
      {m.kind === 'video' ? <video src={url} muted autoPlay loop playsInline style={style} /> : <img src={url} alt="" style={style} />}
    </div>
  )
}

function BackgroundImage({ doc }: { doc: BentoDoc }) {
  const m = doc.background.kind === 'image' ? doc.background.media : null
  const url = useMediaUrl(m?.id)
  if (!m || !url) return <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-muted)' }} />
  const pos = `${m.x * 100}% ${m.y * 100}%`
  const style: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos }
  return m.kind === 'video' ? <video src={url} style={style} autoPlay muted loop playsInline /> : <img src={url} alt="" style={style} />
}
