import { Crop, Eye, EyeOff, Minus, Plus, RefreshCw } from 'lucide-react'
import { useRef } from 'react'
import { docColors } from '../model/defaults'
import { containWidth, fits, gridMetrics } from '../model/geometry'
import { addMediaFile, isSupportedFile } from '../model/media'
import { useStore } from '../model/store'
import type { Cell, MediaRef } from '../model/types'
import { toast } from '../ui'
import { FieldRow, IconAction, NumberInput, PaintRow, PanelSection, TextSegments } from '../ui/panel'
import { useMediaUrl } from './CellView'
import { useDocSize, useEditor } from './editorState'

/** Properties of the selected box, shown under the sidebar's Box header once a box is selected. */
export function BoxSections() {
  const { selected } = useStore()
  return selected ? <CellSections key={selected.id} cell={selected} /> : null
}

function CellSections({ cell }: { cell: Cell }) {
  const { doc, dispatch, updateCell } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const up = (patch: Partial<Cell>, key?: string) => updateCell(cell.id, patch, key)
  const hasFill = !cell.fillOff

  const onFile = async (file: File | undefined) => {
    if (!file || !isSupportedFile(file)) return
    try {
      const media = await addMediaFile(file)
      up({ media, mediaHidden: false })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const resize = (patch: Partial<Pick<Cell, 'w' | 'h'>>) => {
    const rect = { col: cell.col, row: cell.row, w: cell.w, h: cell.h, ...patch }
    if (!fits(doc, rect, cell.id)) return toast('Not enough free space next to this box', 'warning')
    dispatch({ type: 'moveCell', id: cell.id, rect })
  }

  return (
    <>
      <PanelSection title="Layout">
        <FieldRow>
          <NumberInput prefix="W" label="Width in columns" value={cell.w} min={1} max={doc.cols} onChange={(w) => resize({ w })} />
          <NumberInput prefix="H" label="Height in rows" value={cell.h} min={1} max={doc.rows} onChange={(h) => resize({ h })} />
        </FieldRow>
      </PanelSection>

      <PanelSection
        title="Fill"
        empty={!hasFill}
        actions={
          !hasFill && (
            <IconAction label="Add fill" onClick={() => up({ fillOff: false, fillHidden: false })}>
              <Plus />
            </IconAction>
          )
        }
      >
        {hasFill && (
          <FieldRow
            trailing={
              <div className="p-actions">
                <IconAction label={cell.fillHidden ? 'Show fill' : 'Hide fill'} onClick={() => up({ fillHidden: !cell.fillHidden })}>
                  {cell.fillHidden ? <EyeOff /> : <Eye />}
                </IconAction>
                <IconAction label="Remove fill" onClick={() => up({ fillOff: true })}>
                  <Minus />
                </IconAction>
              </div>
            }
          >
            <div className="p-span">
              <PaintRow label="Fill" allowGradient swatches={docColors(doc)} fill={cell.fill} hidden={cell.fillHidden} onChange={(fill, live) => up({ fill }, live ? 'fill' : undefined)} />
            </div>
          </FieldRow>
        )}
      </PanelSection>

      <PanelSection
        title="Image"
        empty={!cell.media}
        actions={
          !cell.media && (
            <IconAction label="Add image or video" onClick={() => fileRef.current?.click()}>
              <Plus />
            </IconAction>
          )
        }
      >
        {cell.media && (
          <>
            <FieldRow
              trailing={
                <div className="p-actions">
                  <IconAction label={cell.mediaHidden ? 'Show image' : 'Hide image'} onClick={() => up({ mediaHidden: !cell.mediaHidden })}>
                    {cell.mediaHidden ? <EyeOff /> : <Eye />}
                  </IconAction>
                  <IconAction label="Remove image" onClick={() => up({ media: null, mediaHidden: false })}>
                    <Minus />
                  </IconAction>
                </div>
              }
            >
              <div className="p-span">
                <MediaRow cell={cell} />
              </div>
            </FieldRow>
            <MediaControls cell={cell} onReplace={() => fileRef.current?.click()} />
          </>
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
      </PanelSection>
    </>
  )
}

function MediaRow({ cell }: { cell: Cell }) {
  const m = cell.media!
  const url = useMediaUrl(m.id)
  return (
    <div className="p-media" data-hidden={cell.mediaHidden ? '' : undefined}>
      <span className="p-media-thumb" aria-hidden="true">
        <span style={m.kind === 'image' ? (url ? { backgroundImage: `url(${url})` } : undefined) : { backgroundColor: 'var(--foreground)' }} />
      </span>
      <span className="p-media-name">{m.kind === 'video' ? 'Video' : 'Image'}</span>
      <span className="p-media-meta">
        {m.width}×{m.height}
      </span>
    </div>
  )
}

/** Placement controls, always visible under the image row. */
function MediaControls({ cell, onReplace }: { cell: Cell; onReplace: () => void }) {
  const { doc, updateCell } = useStore()
  const { cropId, setCropId } = useEditor()
  const size = useDocSize(doc)
  const m = cell.media as MediaRef
  const up = (media: MediaRef, key?: string) => updateCell(cell.id, { media }, key)
  const box = gridMetrics(doc, size.w, size.h).rect(cell)
  // Width at which the whole picture fits inside the box: the starting size for Free mode.
  const fitW = Math.min(1, containWidth(box.w, box.h, m.width, m.height))
  const free = m.mode === 'free' && m.free
  const adjusting = cropId === cell.id
  const pct = (v: number) => Math.round(v * 100)

  return (
    <>
      <TextSegments
        label="Placement"
        value={free ? 'free' : 'cover'}
        onChange={(v) => up({ ...m, mode: v, free: m.free ?? { w: fitW, x: 0.5, y: 0.5 } })}
        options={[
          { value: 'cover', label: 'Fill box' },
          { value: 'free', label: 'Free' },
        ]}
      />
      {free ? (
        <>
          <FieldRow>
            <NumberInput prefix="Size" label="Image size" suffix="%" value={pct(m.free!.w)} min={5} max={300} onChange={(v, live) => up({ ...m, free: { ...m.free!, w: v / 100 } }, live ? 'fw' : undefined)} />
            <button type="button" className="p-button" onClick={() => up({ ...m, free: { w: fitW, x: 0.5, y: 0.5 } })}>
              Fit inside
            </button>
          </FieldRow>
          <FieldRow>
            <NumberInput prefix="X" label="Horizontal position" suffix="%" value={pct(m.free!.x)} min={-50} max={150} onChange={(v, live) => up({ ...m, free: { ...m.free!, x: v / 100 } }, live ? 'fpx' : undefined)} />
            <NumberInput prefix="Y" label="Vertical position" suffix="%" value={pct(m.free!.y)} min={-50} max={150} onChange={(v, live) => up({ ...m, free: { ...m.free!, y: v / 100 } }, live ? 'fpy' : undefined)} />
          </FieldRow>
        </>
      ) : (
        <>
          <NumberInput prefix="Zoom" label="Zoom" suffix="%" value={pct(m.zoom)} min={100} max={500} onChange={(v, live) => up({ ...m, zoom: v / 100 }, live ? 'zoom' : undefined)} />
          <FieldRow>
            <NumberInput prefix="X" label="Horizontal focus" suffix="%" value={pct(m.x)} min={0} max={100} onChange={(v, live) => up({ ...m, x: v / 100 }, live ? 'fx' : undefined)} />
            <NumberInput prefix="Y" label="Vertical focus" suffix="%" value={pct(m.y)} min={0} max={100} onChange={(v, live) => up({ ...m, y: v / 100 }, live ? 'fy' : undefined)} />
          </FieldRow>
        </>
      )}
      <FieldRow>
        <button type="button" className="p-button" aria-pressed={adjusting} onClick={() => setCropId(adjusting ? null : cell.id)}>
          <Crop aria-hidden="true" /> {adjusting ? 'Done' : 'Adjust'}
        </button>
        <button type="button" className="p-button" onClick={onReplace}>
          <RefreshCw aria-hidden="true" /> Replace
        </button>
      </FieldRow>
    </>
  )
}
