import { ImagePlus, Monitor, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/arc/button/button'
import { NumberField } from '@/components/arc/number-field/number-field'
import { Select } from '@/components/arc/select/select'
import { SIZE_PRESETS, defaultStroke } from '../model/defaults'
import { Switch } from '@/components/arc/switch/switch'
import { addMediaFile, isSupportedFile } from '../model/media'
import { useStore } from '../model/store'
import { ColorBlock, FullSegmented, Row, Section, SpacingField, toast } from '../ui'
import { useDocSize, useEditor } from './editorState'

type SizeChoice = (typeof SIZE_PRESETS)[number]['id'] | 'fit' | 'custom'

const SIZE_OPTIONS: { value: SizeChoice; label: string }[] = [
  ...SIZE_PRESETS.map((p) => ({ value: p.id as SizeChoice, label: `${p.label} (${p.w}×${p.h})` })),
  { value: 'fit', label: 'Fit screen' },
  { value: 'custom', label: 'Custom size' },
]

export function LeftPanel() {
  const { doc, setDoc } = useStore()
  const size = useDocSize(doc)
  const { setGuide } = useEditor()
  const fileRef = useRef<HTMLInputElement>(null)

  const sizeChoice: SizeChoice =
    doc.sizeMode === 'fit' ? 'fit' : (SIZE_PRESETS.find((p) => p.w === doc.width && p.h === doc.height)?.id ?? 'custom')

  const onSize = (v: string) => {
    if (v === 'fit') return setDoc({ sizeMode: 'fit' })
    if (v === 'custom') return setDoc({ sizeMode: 'fixed' })
    const p = SIZE_PRESETS.find((x) => x.id === v)!
    setDoc({ sizeMode: 'fixed', width: p.w, height: p.h })
  }

  const onBgFile = async (file: File | undefined) => {
    if (!file || !isSupportedFile(file)) return
    try {
      const media = await addMediaFile(file)
      setDoc({ background: { kind: 'image', media } })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const stroke = doc.stroke ?? defaultStroke()
  const bgColor = doc.background.kind === 'color' ? doc.background.color : '#f4f2ee'

  return (
    <aside className="panel panel-left" aria-label="Bento settings">
      <Section title="Canvas">
        <Select label="Size" value={sizeChoice} onValueChange={onSize} options={SIZE_OPTIONS} />
        {doc.sizeMode === 'fixed' ? (
          <Row>
            <NumberField label="Width" size="sm" value={doc.width} min={100} max={8000} step={10} suffix=" px" limitHint={false} formatOptions={{ useGrouping: false }} onValueChange={(width) => setDoc({ width }, 'width')} />
            <NumberField label="Height" size="sm" value={doc.height} min={100} max={8000} step={10} suffix=" px" limitHint={false} formatOptions={{ useGrouping: false }} onValueChange={(height) => setDoc({ height }, 'height')} />
          </Row>
        ) : (
          <p className="panel-note">
            <Monitor size={14} aria-hidden="true" /> Fills any screen. Previewing at {size.w}×{size.h}.
          </p>
        )}
      </Section>

      <Section title="Grid">
        <Row>
          <NumberField label="Columns" size="sm" value={doc.cols} min={1} max={12} onValueChange={(cols) => setDoc({ cols })} />
          <NumberField label="Rows" size="sm" value={doc.rows} min={1} max={12} onValueChange={(rows) => setDoc({ rows })} />
        </Row>
        <p className="panel-note">Boxes stretch to fill the canvas. Shrinking the grid trims boxes that no longer fit.</p>
      </Section>

      <Section title="Spacing">
        <SpacingField label="Horizontal gap" value={doc.gapX} onGuide={(on) => setGuide(on ? 'gapX' : null)} onChange={(gapX, live) => setDoc({ gapX }, live ? 'gapX' : undefined)} />
        <SpacingField label="Vertical gap" value={doc.gapY} onGuide={(on) => setGuide(on ? 'gapY' : null)} onChange={(gapY, live) => setDoc({ gapY }, live ? 'gapY' : undefined)} />
        <SpacingField label="Outer padding" value={doc.padding} onGuide={(on) => setGuide(on ? 'padding' : null)} onChange={(padding, live) => setDoc({ padding }, live ? 'padding' : undefined)} />
      </Section>

      <Section title="Corners">
        <SpacingField label="Radius" value={doc.radius} onChange={(radius, live) => setDoc({ radius }, live ? 'radius' : undefined)} />
        <Switch label="Stroke" checked={stroke.on} onCheckedChange={(on) => setDoc({ stroke: { ...stroke, on } })} />
        {stroke.on && (
          <>
            <SpacingField
              label="Stroke width"
              value={stroke.width}
              sliderMax={12}
              step={1}
              major={4}
              max={64}
              onChange={(width, live) => setDoc({ stroke: { ...stroke, width } }, live ? 'stroke-width' : undefined)}
            />
            <ColorBlock label="Stroke" value={stroke.color} onChange={(color, live) => setDoc({ stroke: { ...stroke, color } }, live ? 'stroke-color' : undefined)} />
          </>
        )}
      </Section>

      <Section title="Background">
        <FullSegmented
          label="Background type"
          value={doc.background.kind}
          onValueChange={(k) => {
            if (k === 'color') setDoc({ background: { kind: 'color', color: bgColor } })
            else fileRef.current?.click()
          }}
          options={[
            { value: 'color', label: 'Color' },
            { value: 'image', label: 'Image' },
          ]}
        />
        {doc.background.kind === 'color' ? (
          <ColorBlock label="Background" value={bgColor} onChange={(color, live) => setDoc({ background: { kind: 'color', color } }, live ? 'bg-color' : undefined)} />
        ) : (
          <Row>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={16} aria-hidden="true" /> Replace
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDoc({ background: { kind: 'color', color: bgColor } })}>
              <Trash2 size={16} aria-hidden="true" /> Remove
            </Button>
          </Row>
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
      </Section>
    </aside>
  )
}
