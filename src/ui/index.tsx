/* eslint-disable react-refresh/only-export-components */
/**
 * App-level compositions of Arc components. Arc owns every control; this file only
 * arranges them (sections, swatch grids, preset + slider pairs) and bridges toasts.
 */
import { Pipette } from 'lucide-react'
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/arc/button/button'
import { InlineColorPicker } from '@/components/arc-ext/inline-color-picker/inline-color-picker'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Slider } from '@/components/arc/slider/slider'
import { useToastStack } from '@/components/arc/toast-stack/toast-stack'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import { BASIC_COLORS, isTransparent } from '../model/defaults'
import './ui.css'

/* ---------- Layout ---------- */

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ui-section" aria-label={title}>
      <div className="ui-section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A label above a group of controls that has no label of its own. */
export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ui-group" role="group" aria-label={label}>
      <span className="ui-group-label">{label}</span>
      {children}
    </div>
  )
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="ui-row">{children}</div>
}

/* ---------- Icon button ---------- */

export function IconButton({ label, children, ...rest }: ButtonProps & { label: string }) {
  return (
    <Tooltip content={label} side="bottom">
      <Button variant="ghost" size="sm" aria-label={label} className="ui-icon-btn" {...rest}>
        {children}
      </Button>
    </Tooltip>
  )
}

/* ---------- Swatches ---------- */

export function Swatches({
  colors,
  value,
  onPick,
  label,
}: {
  colors: { css: string; key: string; name: string }[]
  value?: string
  onPick: (key: string) => void
  label: string
}) {
  return (
    <div className="ui-swatches" role="group" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c.key}
          type="button"
          className="ui-swatch"
          data-transparent={isTransparent(c.css) ? '' : undefined}
          style={isTransparent(c.css) ? undefined : { background: c.css }}
          aria-label={c.name}
          aria-pressed={c.key === value}
          onClick={() => onPick(c.key)}
        />
      ))}
    </div>
  )
}

/* ---------- Spacing: snapped slider + exact value ---------- */

/**
 * Arc slider snapped to 4px steps up to 48, beside a field for any exact value. Both stay in
 * sync. Hovering or focusing the control tells the canvas which gap to draw guides for.
 */
export function SpacingField({
  label,
  value,
  onChange,
  onGuide,
  max = 400,
  sliderMax = SPACING_SLIDER_MAX,
  step = 4,
  major = 16,
}: {
  label: string
  value: number
  /** `live` is true while dragging, so callers can merge the drag into one undo step. */
  onChange: (v: number, live: boolean) => void
  onGuide?: (on: boolean) => void
  /** Largest value typed into the field. */
  max?: number
  /** Slider range and snapping; the field accepts any value up to `max`. */
  sliderMax?: number
  step?: number
  /** Every `major` units the ruler line is taller. */
  major?: number
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (raw: string) => {
    setDraft(null)
    const n = Math.round(Number(raw))
    if (raw.trim() === '' || !Number.isFinite(n)) return
    const v = Math.min(max, Math.max(0, n))
    if (v !== value) onChange(v, false)
  }
  return (
    <div
      className="ui-spacing"
      onPointerEnter={() => onGuide?.(true)}
      onPointerLeave={() => onGuide?.(false)}
      onFocus={() => onGuide?.(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && onGuide?.(false)}
    >
      <Slider
        label={label}
        value={Math.min(sliderMax, value)}
        min={0}
        max={sliderMax}
        step={step}
        showValue={false}
        onValueChange={(v) => {
          if (v !== Math.min(sliderMax, value)) tick()
          onChange(v as number, true)
        }}
        end={
          <label className="ui-spacing-input">
            <input
              inputMode="numeric"
              aria-label={`${label} in pixels`}
              value={draft ?? String(value)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  const next = Math.min(max, Math.max(0, value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 4 : 1)))
                  setDraft(null)
                  onChange(next, true)
                }
              }}
            />
            <span aria-hidden="true">px</span>
          </label>
        }
      />
      <Ruler max={sliderMax} step={step} major={major} />
    </div>
  )
}

/** Ruler lines under a slider track, one per step, taller at each `major` interval. */
function Ruler({ max, step, major }: { max: number; step: number; major: number }) {
  const lines = []
  for (let v = 0; v <= max; v += step) {
    lines.push(<span key={v} className="ui-ruler-line" data-major={v % major === 0 ? '' : undefined} style={{ left: `${(v / max) * 100}%` }} />)
  }
  return (
    <div className="ui-ruler" aria-hidden="true">
      <div className="ui-ruler-scale">{lines}</div>
    </div>
  )
}

/** A light haptic tap as the slider crosses a step. Only devices that support vibration feel it. */
function tick() {
  try {
    navigator.vibrate?.(6)
  } catch {
    /* blocked by the browser or the embedding frame */
  }
}

export const SPACING_SLIDER_MAX = 48

/* ---------- Full-width segmented control ---------- */

/** Arc's segmented control, stretched so its options share the full width equally. */
export function FullSegmented(props: ComponentProps<typeof SegmentedControl>) {
  return <SegmentedControl {...props} className="ui-seg-full" />
}

/* ---------- Color block: presets, hex field, picker on demand ---------- */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function normalizeHex(v: string) {
  const m = HEX.exec(v.trim())
  if (!m) return null
  let h = m[1].toLowerCase()
  if (h.length === 3) h = h.replace(/./g, (c) => c + c)
  return `#${h}`
}

/**
 * The three basic presets, then a hex field. The dropper button in the field opens the full
 * color picker underneath; it stays closed otherwise.
 */
export function ColorBlock({
  label,
  value,
  onChange,
  background,
}: {
  label: string
  value: string
  /** `live` is true while dragging inside the picker, so callers can merge it into one undo step. */
  onChange: (hex: string, live: boolean) => void
  background?: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (raw: string) => {
    setDraft(null)
    const hex = normalizeHex(raw)
    if (hex && hex !== value.toLowerCase()) onChange(hex, false)
  }
  return (
    <div className="ui-color-block">
      <div className="ui-color-row">
        <Swatches label={`${label} presets`} colors={BASIC_COLORS} value={value.toLowerCase()} onPick={(c) => onChange(c, false)} />
        <label className="ui-hex">
          <span className="ui-hex-chip" data-transparent={isTransparent(value) ? '' : undefined} style={isTransparent(value) ? undefined : { background: value }} />
          <input
            aria-label={`${label} hex value`}
            spellCheck={false}
            value={draft ?? value.toUpperCase()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
          />
          <Tooltip content={open ? 'Close color picker' : 'Open color picker'} side="top">
            <button type="button" className="ui-hex-dropper" aria-label={`${open ? 'Close' : 'Open'} ${label.toLowerCase()} color picker`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <Pipette size={15} aria-hidden="true" />
            </button>
          </Tooltip>
        </label>
      </div>
      {open && (
        <InlineColorPicker
          inline
          label={label}
          value={value}
          background={background ?? '#FFFFFF'}
          onValueChange={(hex) => onChange(hex.toLowerCase(), true)}
        />
      )}
    </div>
  )
}

/* ---------- Toasts ---------- */

type ToastType = 'success' | 'info' | 'warning' | 'error'
let push: ((title: string, type: ToastType) => void) | null = null

/** Raise an Arc toast from anywhere, including non-component code. */
export function toast(title: string, type: ToastType = 'info') {
  push?.(title, type)
}

/** Mount once inside ToastStackProvider. */
export function ToastBridge() {
  const { toast: show } = useToastStack()
  useEffect(() => {
    push = (title, type) => show({ title, type })
    return () => {
      push = null
    }
  }, [show])
  return null
}
