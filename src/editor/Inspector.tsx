import { Copy, Crop, Crosshair, Film, Image as ImageIcon, ImagePlus, MousePointerClick, RotateCcw, Shrink, Trash2, Type, X } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/arc/button/button'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import { Input } from '@/components/arc/input/input'
import { NumberField } from '@/components/arc/number-field/number-field'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Slider } from '@/components/arc/slider/slider'
import { Textarea } from '@/components/arc/textarea/textarea'
import { containWidth, fits, gridMetrics } from '../model/geometry'
import { addMediaFile, isSupportedFile } from '../model/media'
import { useStore } from '../model/store'
import type { Cell, Fill, FontFamily, HAlign, VAlign } from '../model/types'
import { ColorBlock, FullSegmented, Group, IconButton, Row, Section, toast } from '../ui'
import { useDocSize, useEditor } from './editorState'
import { MOD } from './platform'

export function Inspector() {
  const { selected } = useStore()
  return (
    <aside className="panel panel-right" aria-label="Inspector">
      {selected ? <CellInspector key={selected.id} cell={selected} /> : <EmptyInspector />}
    </aside>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Undo, redo', `${MOD}Z, ${MOD}⇧Z`],
  ['Delete box', '⌫'],
  ['Duplicate box', `${MOD}D`],
  ['Paste image into box', `${MOD}V`],
  ['Adjust image', 'Double-click'],
]

function EmptyInspector() {
  return (
    <div className="inspector-empty">
      <EmptyState
        icon={<MousePointerClick size={24} />}
        title="Nothing selected"
        description="Click a box to edit it, or click an empty slot to add one. Drag across empty slots to draw a bigger box."
        label="Inspector"
      />
      <dl className="shortcut-list">
        {SHORTCUTS.map(([what, keys]) => (
          <div key={what}>
            <dt>{what}</dt>
            <dd>
              <kbd>{keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function CellInspector({ cell }: { cell: Cell }) {
  const { doc, dispatch, updateCell } = useStore()
  const { cropId, setCropId } = useEditor()
  const size = useDocSize(doc)
  const fileRef = useRef<HTMLInputElement>(null)
  const up = (patch: Partial<Cell>, key?: string) => updateCell(cell.id, patch, key)

  const onFile = async (file: File | undefined) => {
    if (!file || !isSupportedFile(file)) return
    try {
      const media = await addMediaFile(file)
      up({ media })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const resize = (patch: Partial<Pick<Cell, 'w' | 'h'>>) => {
    const rect = { col: cell.col, row: cell.row, w: cell.w, h: cell.h, ...patch }
    if (!fits(doc, rect, cell.id)) return toast('Not enough free space next to this box', 'warning')
    dispatch({ type: 'moveCell', id: cell.id, rect })
  }

  const m = cell.media
  const t = cell.text
  const adjusting = cropId === cell.id
  const free = m?.mode === 'free'
  const box = gridMetrics(doc, size.w, size.h).rect(cell)
  // Width at which the whole picture fits inside the box: the starting size for Free mode.
  const fitW = m ? Math.min(1, containWidth(box.w, box.h, m.width, m.height)) : 1
  const fillBase = cell.fill.kind === 'solid' ? cell.fill.color : cell.fill.from

  const setMode = (mode: 'cover' | 'free') => {
    if (!m) return
    up({ media: { ...m, mode, free: m.free ?? { w: fitW, x: 0.5, y: 0.5 } } })
  }

  return (
    <>
      <header className="inspector-head">
        <h2>Box</h2>
        <div className="section-actions">
          <IconButton label="Duplicate box" onClick={() => dispatch({ type: 'duplicateCell', id: cell.id })}>
            <Copy />
          </IconButton>
          <IconButton label="Delete box" onClick={() => dispatch({ type: 'removeCell', id: cell.id })}>
            <Trash2 />
          </IconButton>
        </div>
      </header>

      <Section title="Measure">
        <Row>
          <NumberField label="Width" size="sm" suffix={(n) => (n === 1 ? ' col' : ' cols')} value={cell.w} min={1} max={doc.cols} limitHint={false} onValueChange={(w) => resize({ w })} />
          <NumberField label="Height" size="sm" suffix={(n) => (n === 1 ? ' row' : ' rows')} value={cell.h} min={1} max={doc.rows} limitHint={false} onValueChange={(h) => resize({ h })} />
        </Row>
      </Section>

      <FillSection fill={cell.fill} onChange={(fill, key) => up({ fill }, key)} />

      <Section
        title="Image"
        action={
          m && (
            <IconButton label="Remove image" onClick={() => up({ media: null })}>
              <X />
            </IconButton>
          )
        }
      >
        {m ? (
          <>
            <p className="panel-note">
              {m.kind === 'video' ? <Film size={14} aria-hidden="true" /> : <ImageIcon size={14} aria-hidden="true" />}
              {m.kind === 'video' ? 'Video' : 'Image'}, {m.width}×{m.height}
            </p>
            <Row>
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={16} aria-hidden="true" /> Replace
              </Button>
              <Button variant="secondary" size="sm" aria-pressed={adjusting} onClick={() => setCropId(adjusting ? null : cell.id)}>
                <Crop size={16} aria-hidden="true" /> {adjusting ? 'Done' : 'Adjust'}
              </Button>
            </Row>
            {adjusting && (
              <>
                <Group label="Placement">
                  <FullSegmented
                    label="Placement"
                    value={free ? 'free' : 'cover'}
                    onValueChange={(v) => setMode(v as 'cover' | 'free')}
                    options={[
                      { value: 'cover', label: 'Fill box' },
                      { value: 'free', label: 'Free' },
                    ]}
                  />
                </Group>
                {free && m.free ? (
                  <>
                    <Slider label="Size" value={m.free.w} min={0.05} max={3} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onValueChange={(w) => up({ media: { ...m, free: { ...m.free!, w: w as number } } }, 'fw')} />
                    <Slider label="Horizontal position" value={m.free.x} min={-0.5} max={1.5} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onValueChange={(x) => up({ media: { ...m, free: { ...m.free!, x: x as number } } }, 'fpx')} />
                    <Slider label="Vertical position" value={m.free.y} min={-0.5} max={1.5} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onValueChange={(y) => up({ media: { ...m, free: { ...m.free!, y: y as number } } }, 'fpy')} />
                    <Row>
                      <Button variant="ghost" size="sm" onClick={() => up({ media: { ...m, free: { w: fitW, x: 0.5, y: 0.5 } } })}>
                        <Shrink size={16} aria-hidden="true" /> Fit inside
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => up({ media: { ...m, free: { ...m.free!, x: 0.5, y: 0.5 } } })}>
                        <Crosshair size={16} aria-hidden="true" /> Center
                      </Button>
                    </Row>
                  </>
                ) : (
                  <>
                    <Slider label="Zoom" value={m.zoom} min={1} max={5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onValueChange={(zoom) => up({ media: { ...m, zoom: zoom as number } }, 'zoom')} />
                    <Slider label="Horizontal focus" value={m.x} min={0} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onValueChange={(x) => up({ media: { ...m, x: x as number } }, 'fx')} />
                    <Slider label="Vertical focus" value={m.y} min={0} max={1} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onValueChange={(y) => up({ media: { ...m, y: y as number } }, 'fy')} />
                    <Button variant="ghost" size="sm" onClick={() => up({ media: { ...m, zoom: 1, x: 0.5, y: 0.5 } })}>
                      <RotateCcw size={16} aria-hidden="true" /> Reset crop
                    </Button>
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <EmptyState
            icon={<ImagePlus size={24} />}
            title="No image yet"
            description={`Upload an image or video, paste one with ${MOD}V, or drop a file onto the box.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
            }
          />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </Section>

      <Section
        title="Text"
        action={
          cell.textOn && (
            <IconButton label="Remove text" onClick={() => up({ textOn: false })}>
              <X />
            </IconButton>
          )
        }
      >
        {cell.textOn ? (
          <>
            <Input label="Title" value={t.title} onChange={(e) => up({ text: { ...t, title: e.target.value } }, 'title')} />
            <Textarea label="Subtitle" rows={3} value={t.subtitle} onChange={(e) => up({ text: { ...t, subtitle: e.target.value } }, 'subtitle')} />
            <Row>
              <NumberField label="Title size" size="sm" suffix=" px" value={t.titleSize} min={8} max={400} limitHint={false} onValueChange={(titleSize) => up({ text: { ...t, titleSize } }, 'ts')} />
              <NumberField label="Subtitle size" size="sm" suffix=" px" value={t.subtitleSize} min={6} max={200} limitHint={false} onValueChange={(subtitleSize) => up({ text: { ...t, subtitleSize } }, 'ss')} />
            </Row>
            <ColorBlock label="Text color" value={t.color} background={fillBase} onChange={(color, live) => up({ text: { ...t, color } }, live ? 'text-color' : undefined)} />
            <Group label="Font">
              <SegmentedControl
                label="Font"
                value={t.font}
                onValueChange={(font) => up({ text: { ...t, font: font as FontFamily } })}
                options={[
                  { value: 'sans', label: 'Sans' },
                  { value: 'serif', label: 'Serif' },
                  { value: 'mono', label: 'Mono' },
                ]}
              />
            </Group>
            <Group label="Horizontal alignment">
              <SegmentedControl
                label="Horizontal alignment"
                value={t.align}
                onValueChange={(align) => up({ text: { ...t, align: align as HAlign } })}
                options={[
                  { value: 'start', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'end', label: 'Right' },
                ]}
              />
            </Group>
            <Group label="Vertical alignment">
              <SegmentedControl
                label="Vertical alignment"
                value={t.valign}
                onValueChange={(valign) => up({ text: { ...t, valign: valign as VAlign } })}
                options={[
                  { value: 'start', label: 'Top' },
                  { value: 'center', label: 'Middle' },
                  { value: 'end', label: 'Bottom' },
                ]}
              />
            </Group>
          </>
        ) : (
          <EmptyState
            icon={<Type size={24} />}
            title="No text"
            description="Add a title and a supporting line on top of the fill and image."
            action={
              <Button variant="secondary" size="sm" onClick={() => up({ textOn: true })}>
                Add text
              </Button>
            }
          />
        )}
      </Section>
    </>
  )
}

/** Mirrors the Background section in the left panel: full-width switch, basic presets, always-open picker. */
function FillSection({ fill, onChange }: { fill: Fill; onChange: (f: Fill, key?: string) => void }) {
  const solidColor = fill.kind === 'solid' ? fill.color : fill.from
  const grad = fill.kind === 'gradient' ? fill : { kind: 'gradient' as const, from: fill.color, to: '#000000', angle: 135 }
  return (
    <Section title="Fill">
      <FullSegmented
        label="Fill type"
        value={fill.kind}
        onValueChange={(k) => onChange(k === 'solid' ? { kind: 'solid', color: solidColor } : grad)}
        options={[
          { value: 'solid', label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
        ]}
      />
      {fill.kind === 'solid' ? (
        <ColorBlock label="Fill" value={fill.color} onChange={(color, live) => onChange({ kind: 'solid', color }, live ? 'fill-color' : undefined)} />
      ) : (
        <>
          <ColorBlock label="Start" value={fill.from} onChange={(from, live) => onChange({ ...fill, from }, live ? 'grad-from' : undefined)} />
          <ColorBlock label="End" value={fill.to} onChange={(to, live) => onChange({ ...fill, to }, live ? 'grad-to' : undefined)} />
          <Slider label="Angle" value={fill.angle} min={0} max={360} format={(v) => `${v}°`} onValueChange={(angle) => onChange({ ...fill, angle: angle as number }, 'angle')} />
        </>
      )}
    </Section>
  )
}
