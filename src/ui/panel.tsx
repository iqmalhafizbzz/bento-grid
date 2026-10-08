/* eslint-disable react-refresh/only-export-components */
/**
 * Figma-style inspector building blocks: an object header, sections whose title row carries
 * add / show / remove actions, compact filled fields with scrubbable prefixes, and paint rows
 * (swatch, hex, opacity) that open a floating color picker.
 */
import { Check, ChevronDown } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/arc/popover/popover'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import { fillCss, isTransparent } from '../model/defaults'
import type { Fill } from '../model/types'
import { ColorPicker } from './ColorPicker'
import './panel.css'

/* ---------- Structure ---------- */

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="p-header">
      <h2>{title}</h2>
      {children && <div className="p-actions">{children}</div>}
    </header>
  )
}

/**
 * A titled block. `empty` dims the title, the way Figma shows a property that hasn't been
 * added yet; its only action is then usually a plus.
 */
export function PanelSection({ title, empty, actions, children }: { title: string; empty?: boolean; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section className="p-section" data-empty={empty ? '' : undefined} aria-label={title}>
      <div className="p-section-head">
        <h3>{title}</h3>
        {actions && <div className="p-actions">{actions}</div>}
      </div>
      {children && <div className="p-section-body">{children}</div>}
    </section>
  )
}

/** Two equal columns plus an optional trailing icon column, like Figma's field rows. */
export function FieldRow({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="p-row" data-trailing={trailing ? '' : undefined}>
      {children}
      {trailing && <div className="p-row-trailing">{trailing}</div>}
    </div>
  )
}

export function IconAction({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean }) {
  return (
    <Tooltip content={label} side="bottom">
      <button type="button" className="p-icon" aria-label={label} aria-pressed={pressed} onClick={onClick}>
        {children}
      </button>
    </Tooltip>
  )
}

/* ---------- Number field ---------- */

/**
 * A compact numeric field. Drag the prefix sideways to scrub, use the arrow keys (Shift for
 * ten steps), or type a value and press Enter.
 */
export function NumberInput({
  prefix,
  value,
  onChange,
  label,
  min = 0,
  max = 99999,
  step = 1,
  suffix,
}: {
  prefix: ReactNode
  value: number
  /** `live` is true while scrubbing or nudging, so callers can merge it into one undo step. */
  onChange: (v: number, live: boolean) => void
  label: string
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step))
  const commit = (raw: string) => {
    setDraft(null)
    const n = Number(raw.replace(/[^\d.-]/g, ''))
    if (raw.trim() === '' || !Number.isFinite(n)) return
    const v = clamp(n)
    if (v !== value) onChange(v, false)
  }

  const scrub = useRef<{ x: number; v: number } | null>(null)
  return (
    <label className="p-field">
      <span
        className="p-prefix"
        aria-hidden="true"
        onPointerDown={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          scrub.current = { x: e.clientX, v: value }
        }}
        onPointerMove={(e) => {
          if (!scrub.current) return
          const next = clamp(scrub.current.v + Math.round((e.clientX - scrub.current.x) / 3) * step)
          if (next !== value) onChange(next, true)
        }}
        onPointerUp={() => (scrub.current = null)}
        onPointerCancel={() => (scrub.current = null)}
      >
        {prefix}
      </span>
      <input
        inputMode="decimal"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(null)
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            setDraft(null)
            onChange(clamp(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)), true)
          }
        }}
      />
      {suffix && <span className="p-suffix">{suffix}</span>}
    </label>
  )
}

/* ---------- Select (combobox) ---------- */

export interface SelectOption<T extends string> {
  value: T
  label: string
  /** Secondary text on the right, such as a size. */
  hint?: string
}

let comboSeq = 0

/**
 * A field-sized trigger that opens a combobox: a filter box over the option list.
 * Arrow keys move, Enter picks, Escape closes; typing filters by label and hint.
 */
export function SelectInput<T extends string>({ value, onChange, options, label, prefix }: { value: T; onChange: (v: T) => void; options: SelectOption<T>[]; label: string; prefix?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [id] = useState(() => `p-combo-${++comboSeq}`)
  const current = options.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const list = q ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q)) : options
  const pick = (v: T) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setQuery('')
          setIndex(Math.max(0, options.findIndex((x) => x.value === value)))
        }
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="p-field p-select" aria-label={`${label}: ${current?.label ?? 'none'}`} aria-haspopup="listbox">
          {prefix && <span className="p-prefix p-prefix-static" aria-hidden="true">{prefix}</span>}
          <span className="p-select-value">{current?.label ?? 'Select'}</span>
          {current?.hint && <span className="p-select-hint">{current.hint}</span>}
          <ChevronDown size={14} aria-hidden="true" className="p-select-chevron" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="p-combo">
        <input
          className="p-combo-search"
          role="combobox"
          aria-label={`Find ${label.toLowerCase()}`}
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={list[index] ? `${id}-${list[index].value}` : undefined}
          placeholder={`Find ${label.toLowerCase()}`}
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setIndex((i) => Math.min(list.length - 1, i + 1)))
            if (e.key === 'ArrowUp') (e.preventDefault(), setIndex((i) => Math.max(0, i - 1)))
            if (e.key === 'Enter' && list[index]) (e.preventDefault(), pick(list[index].value))
          }}
        />
        <ul id={`${id}-list`} role="listbox" aria-label={label} className="p-combo-list">
          {list.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${o.value}`}
              role="option"
              aria-selected={o.value === value}
              data-highlighted={i === index ? '' : undefined}
              className="p-combo-option"
              onPointerEnter={() => setIndex(i)}
              onClick={() => pick(o.value)}
            >
              <span className="p-combo-check">{o.value === value && <Check size={14} aria-hidden="true" />}</span>
              <span className="p-combo-label">{o.label}</span>
              {o.hint && <span className="p-combo-hint">{o.hint}</span>}
            </li>
          ))}
          {!list.length && <li className="p-combo-empty">No matches</li>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

/* ---------- Joined icon segments (Figma alignment buttons) ---------- */

export function IconSegments<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon: ReactNode }[]; label: string }) {
  return (
    <div className="p-segments" role="group" aria-label={label}>
      {options.map((o) => (
        <Tooltip key={o.value} content={o.label} side="bottom">
          <button type="button" aria-label={o.label} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

/** Compact text segments, the same height as a field. */
export function TextSegments<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="p-segments p-segments-text" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Ruler slider ---------- */

/** A thin slider with ruler ticks at each step (taller every `major`) and a light haptic tap per step. */
export function RulerSlider({ value, onChange, max, step, major, label }: { value: number; onChange: (v: number) => void; max: number; step: number; major: number; label: string }) {
  const ticks = []
  for (let v = 0; v <= max; v += step) ticks.push(<span key={v} data-major={v % major === 0 ? '' : undefined} style={{ left: `${(v / max) * 100}%` }} />)
  const shown = Math.min(max, value)
  return (
    <div className="p-slider" style={{ ['--p' as string]: `${(shown / max) * 100}%` }}>
      <div className="p-slider-ticks" aria-hidden="true">
        {ticks}
      </div>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={max}
        step={step}
        value={shown}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (v !== shown) haptic()
          onChange(v)
        }}
      />
    </div>
  )
}

function haptic() {
  try {
    navigator.vibrate?.(6)
  } catch {
    /* blocked by the browser or the embedding frame */
  }
}

/* ---------- Paint (color) rows ---------- */

/** Split '#rrggbbaa' into '#rrggbb' and an opacity percentage. */
export function splitAlpha(color: string) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color)
  if (!m) return { rgb: '#000000', alpha: 100 }
  return { rgb: `#${m[1].toLowerCase()}`, alpha: m[2] ? Math.round((parseInt(m[2], 16) / 255) * 100) : 100 }
}

export function withAlpha(rgb: string, alpha: number) {
  if (alpha >= 100) return rgb
  return rgb + Math.round((Math.max(0, alpha) / 100) * 255).toString(16).padStart(2, '0')
}

function normalizeHex6(v: string) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return `#${h.toLowerCase()}`
}

function Chip({ css, transparent }: { css: string; transparent?: boolean }) {
  return <span className="p-chip" data-transparent={transparent ? '' : undefined} style={transparent ? undefined : { background: css }} />
}

/**
 * One paint: [swatch][hex][opacity %]. The swatch opens a floating picker; with
 * `allowGradient` the picker switches between Solid and Linear like Figma's fill picker.
 */
export function PaintRow({
  fill,
  onChange,
  label,
  allowGradient,
  hidden,
  swatches,
}: {
  fill: Fill
  /** `live` is true while dragging in the picker, so callers can merge it into one undo step. */
  onChange: (f: Fill, live: boolean) => void
  label: string
  allowGradient?: boolean
  hidden?: boolean
  /** Colors used elsewhere on the page, offered in the picker. */
  swatches?: string[]
}) {
  const solid = fill.kind === 'solid' ? splitAlpha(fill.color) : null
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const [alphaDraft, setAlphaDraft] = useState<string | null>(null)

  return (
    <div className="p-paint" data-hidden={hidden ? '' : undefined}>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="p-paint-swatch" aria-label={`Edit ${label.toLowerCase()}`}>
            <Chip css={fillCss(fill)} transparent={fill.kind === 'solid' && isTransparent(fill.color)} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="left" align="start" sideOffset={12} collisionPadding={8} className="p-picker">
          <ColorPicker fill={fill} onChange={onChange} allowGradient={allowGradient} swatches={swatches ?? []} />
        </PopoverContent>
      </Popover>
      {solid ? (
        <>
          <input
            className="p-paint-hex"
            aria-label={`${label} hex`}
            spellCheck={false}
            value={hexDraft ?? solid.rgb.slice(1).toUpperCase()}
            onChange={(e) => setHexDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              setHexDraft(null)
              const h = normalizeHex6(e.target.value)
              if (h && h !== solid.rgb) onChange({ kind: 'solid', color: withAlpha(h, solid.alpha) }, false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="p-paint-sep" aria-hidden="true" />
          <input
            className="p-paint-alpha"
            aria-label={`${label} opacity`}
            inputMode="numeric"
            value={alphaDraft ?? String(solid.alpha)}
            onChange={(e) => setAlphaDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              setAlphaDraft(null)
              const n = Math.round(Number(e.target.value.replace('%', '')))
              if (Number.isFinite(n) && n !== solid.alpha) onChange({ kind: 'solid', color: withAlpha(solid.rgb, Math.min(100, Math.max(0, n))) }, false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="p-paint-pct" aria-hidden="true">
            %
          </span>
        </>
      ) : (
        <span className="p-paint-name">Linear</span>
      )}
    </div>
  )
}
