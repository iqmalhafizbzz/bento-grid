import { ArrowLeftRight, ArrowUpDown, Columns3, Eye, EyeOff, ImagePlus, Minus, Monitor, Plus, Rows3, Scan, SquareSquare, StretchHorizontal } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/arc/popover/popover'
import { SIZE_PRESETS, defaultStroke, docColors } from '../model/defaults'
import { addMediaFile, isSupportedFile } from '../model/media'
import { useStore } from '../model/store'
import type { BentoDoc } from '../model/types'
import { toast } from '../ui'
import { FieldRow, IconAction, NumberInput, PaintRow, PanelSection, RulerSlider, SelectInput, type SelectOption } from '../ui/panel'
import { useMediaUrl } from './CellView'
import { useDocSize, useEditor, type GapGuide } from './editorState'

type SizeChoice = (typeof SIZE_PRESETS)[number]['id'] | 'fit' | 'custom'

const SIZE_OPTIONS: SelectOption<SizeChoice>[] = [
  ...SIZE_PRESETS.map((p) => ({ value: p.id as SizeChoice, label: p.label, hint: `${p.w}×${p.h}` })),
  { value: 'fit', label: 'Fit screen', hint: 'Responsive' },
  { value: 'custom', label: 'Custom size' },
]

/** Canvas-wide properties, shown under the sidebar's Canvas header. */
export function CanvasSections() {
  const { doc, setDoc } = useStore()
  const size = useDocSize(doc)
  const { setGuide } = useEditor()
  const fileRef = useRef<HTMLInputElement>(null)

  const sizeChoice: SizeChoice =
    doc.sizeMode === 'fit' ? 'fit' : (SIZE_PRESETS.find((p) => p.w === doc.width && p.h === doc.height)?.id ?? 'custom')

  const onSize = (v: SizeChoice) => {
    if (v === 'fit') return setDoc({ sizeMode: 'fit' })
    if (v === 'custom') return setDoc({ sizeMode: 'fixed' })
    const p = SIZE_PRESETS.find((x) => x.id === v)!
    setDoc({ sizeMode: 'fixed', width: p.w, height: p.h })
  }

  const onBgFile = async (file: File | undefined) => {
    if (!file || !isSupportedFile(file)) return
    try {
      const media = await addMediaFile(file)
      setDoc({ background: { kind: 'image', media }, backgroundOff: false, backgroundHidden: false })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const stroke = doc.stroke ?? defaultStroke()
  const bgColor = doc.background.kind === 'color' ? doc.background.color : '#f4f2ee'
  const hasBg = !doc.backgroundOff
  const swatches = docColors(doc)

  return (
    <>
      <PanelSection title="Frame">
        <SelectInput<SizeChoice> label="Size" prefix={<Monitor />} value={sizeChoice} onChange={onSize} options={SIZE_OPTIONS} />
        {doc.sizeMode === 'fixed' ? (
          <FieldRow>
            <NumberInput prefix="W" label="Width in pixels" value={doc.width} min={100} max={8000} onChange={(width, live) => setDoc({ width }, live ? 'width' : undefined)} />
            <NumberInput prefix="H" label="Height in pixels" value={doc.height} min={100} max={8000} onChange={(height, live) => setDoc({ height }, live ? 'height' : undefined)} />
          </FieldRow>
        ) : (
          <p className="p-hint">Fills any screen. Previewing at {size.w}×{size.h}.</p>
        )}
      </PanelSection>

      <PanelSection title="Grid">
        <FieldRow>
          <NumberInput prefix={<Columns3 />} label="Columns" value={doc.cols} min={1} max={12} onChange={(cols) => setDoc({ cols })} />
          <NumberInput prefix={<Rows3 />} label="Rows" value={doc.rows} min={1} max={12} onChange={(rows) => setDoc({ rows })} />
        </FieldRow>
      </PanelSection>

      <PanelSection
        title="Background"
        empty={!hasBg}
        actions={
          <>
            {hasBg && doc.background.kind === 'color' && (
              <IconAction label="Use an image" onClick={() => fileRef.current?.click()}>
                <ImagePlus />
              </IconAction>
            )}
            {!hasBg && (
              <IconAction label="Add background" onClick={() => setDoc({ backgroundOff: false, backgroundHidden: false })}>
                <Plus />
              </IconAction>
            )}
          </>
        }
      >
        {hasBg && (
          <FieldRow
            trailing={
              <VisibilityActions
                what="background"
                hidden={!!doc.backgroundHidden}
                onToggle={() => setDoc({ backgroundHidden: !doc.backgroundHidden })}
                onRemove={() => setDoc({ backgroundOff: true })}
              />
            }
          >
            <div className="p-span">
              {doc.background.kind === 'color' ? (
                <PaintRow
                  label="Background"
                  swatches={swatches}
                  fill={{ kind: 'solid', color: bgColor }}
                  hidden={doc.backgroundHidden}
                  onChange={(f, live) => f.kind === 'solid' && setDoc({ background: { kind: 'color', color: f.color } }, live ? 'bg-color' : undefined)}
                />
              ) : (
                <BackgroundImageRow doc={doc} onReplace={() => fileRef.current?.click()} onUseColor={() => setDoc({ background: { kind: 'color', color: bgColor } })} />
              )}
            </div>
          </FieldRow>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={(e) => {
            void onBgFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </PanelSection>

      <PanelSection title="Spacing">
        <SpacingRow doc={doc} field="gapX" label="Horizontal gap" icon={<ArrowLeftRight />} onGuide={setGuide} setDoc={setDoc} />
        <SpacingRow doc={doc} field="gapY" label="Vertical gap" icon={<ArrowUpDown />} onGuide={setGuide} setDoc={setDoc} />
        <SpacingRow doc={doc} field="padding" label="Outer padding" icon={<SquareSquare />} onGuide={setGuide} setDoc={setDoc} />
      </PanelSection>

      <PanelSection title="Appearance">
        <SliderRow
          icon={<Scan />}
          label="Corner radius"
          value={doc.radius}
          onChange={(radius, live) => setDoc({ radius }, live ? 'radius' : undefined)}
        />
      </PanelSection>

      <PanelSection
        title="Stroke"
        empty={!stroke.on}
        actions={
          !stroke.on && (
            <IconAction label="Add stroke" onClick={() => setDoc({ stroke: { ...stroke, on: true, hidden: false } })}>
              <Plus />
            </IconAction>
          )
        }
      >
        {stroke.on && (
          <>
            <FieldRow trailing={<VisibilityActions what="stroke" hidden={!!stroke.hidden} onToggle={() => setDoc({ stroke: { ...stroke, hidden: !stroke.hidden } })} onRemove={() => setDoc({ stroke: { ...stroke, on: false } })} />}>
              <div className="p-span">
                <PaintRow label="Stroke" swatches={swatches} fill={{ kind: 'solid', color: stroke.color }} hidden={stroke.hidden} onChange={(f, live) => f.kind === 'solid' && setDoc({ stroke: { ...stroke, color: f.color } }, live ? 'stroke-color' : undefined)} />
              </div>
            </FieldRow>
            <SliderRow
              icon={<StretchHorizontal />}
              label="Stroke width"
              value={stroke.width}
              sliderMax={12}
              step={1}
              major={4}
              max={64}
              onChange={(width, live) => setDoc({ stroke: { ...stroke, width } }, live ? 'stroke-width' : undefined)}
            />
          </>
        )}
      </PanelSection>
    </>
  )
}

export function VisibilityActions({ what, hidden, onToggle, onRemove }: { what: string; hidden: boolean; onToggle: () => void; onRemove: () => void }) {
  return (
    <div className="p-actions">
      <IconAction label={`${hidden ? 'Show' : 'Hide'} ${what}`} onClick={onToggle}>
        {hidden ? <EyeOff /> : <Eye />}
      </IconAction>
      <IconAction label={`Remove ${what}`} onClick={onRemove}>
        <Minus />
      </IconAction>
    </div>
  )
}

/** [field with icon][ruler slider]. The field takes any value; the slider snaps to `step` up to `sliderMax`. */
function SliderRow({
  icon,
  label,
  value,
  onChange,
  sliderMax = 48,
  step = 4,
  major = 16,
  max = 400,
  onGuide,
}: {
  icon: ReactNode
  label: string
  value: number
  onChange: (v: number, live: boolean) => void
  sliderMax?: number
  step?: number
  major?: number
  max?: number
  onGuide?: (on: boolean) => void
}) {
  return (
    <div
      className="p-row p-row-slider"
      onPointerEnter={() => onGuide?.(true)}
      onPointerLeave={() => onGuide?.(false)}
      onFocus={() => onGuide?.(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && onGuide?.(false)}
    >
      <NumberInput prefix={icon} label={label} value={value} min={0} max={max} onChange={onChange} />
      <RulerSlider label={`${label} slider`} value={value} max={sliderMax} step={step} major={major} onChange={(v) => onChange(v, true)} />
    </div>
  )
}

function SpacingRow({
  doc,
  field,
  label,
  icon,
  onGuide,
  setDoc,
}: {
  doc: BentoDoc
  field: GapGuide
  label: string
  icon: ReactNode
  onGuide: (g: GapGuide | null) => void
  setDoc: (patch: Partial<BentoDoc>, key?: string) => void
}) {
  return (
    <SliderRow
      icon={icon}
      label={label}
      value={doc[field]}
      onGuide={(on) => onGuide(on ? field : null)}
      onChange={(v, live) => setDoc({ [field]: v }, live ? field : undefined)}
    />
  )
}

function BackgroundImageRow({ doc, onReplace, onUseColor }: { doc: BentoDoc; onReplace: () => void; onUseColor: () => void }) {
  const m = doc.background.kind === 'image' ? doc.background.media : null
  const url = useMediaUrl(m?.id)
  if (!m) return null
  return (
    <div className="p-media" data-hidden={doc.backgroundHidden ? '' : undefined}>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="p-media-thumb" aria-label="Background image settings">
            <span style={m.kind === 'image' ? (url ? { backgroundImage: `url(${url})` } : undefined) : { backgroundColor: 'var(--foreground)' }} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" sideOffset={12} className="p-popover">
          <p className="p-popover-title">Background image</p>
          <p className="p-hint">Covers the whole bento, cropped from the center.</p>
          <FieldRow>
            <button type="button" className="p-button" onClick={onReplace}>
              Replace
            </button>
            <button type="button" className="p-button" onClick={onUseColor}>
              Use a color
            </button>
          </FieldRow>
        </PopoverContent>
      </Popover>
      <span className="p-media-name">{m.kind === 'video' ? 'Video' : 'Image'}</span>
      <span className="p-media-meta">
        {m.width}×{m.height}
      </span>
    </div>
  )
}
