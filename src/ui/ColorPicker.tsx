/**
 * Figma-style color picker: paint type row, saturation square, eyedropper beside stacked hue
 * and opacity bars, a format / value / opacity row, and the colors already used on the page.
 */
import { PopoverClose } from '@/components/arc/popover/popover'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import { ChevronDown, Pipette, X } from 'lucide-react'
import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { isTransparent } from '../model/defaults'
import type { Fill } from '../model/types'
import { clamp, formatColor, hsvToRgb, parseColor, parseHex, rgbToHsv, toHex, type ColorFormat, type Hsv } from './color'
import { NumberInput } from './panel'
import './color-picker.css'

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }

/** Drag handler for a 2D or 1D control: reports the pointer as 0..1 fractions of the element. */
function usePad(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const at = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect()
    onMove(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1))
  }
  return {
    ref,
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      at(e)
    },
    onPointerMove: (e: RPointerEvent) => {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) at(e)
    },
  }
}

export function ColorPicker({
  fill,
  onChange,
  allowGradient,
  swatches,
}: {
  fill: Fill
  /** `live` is true during drags, so callers can merge them into one undo step. */
  onChange: (f: Fill, live: boolean) => void
  allowGradient?: boolean
  /** Colors used elsewhere on the page. */
  swatches: string[]
}) {
  const [stop, setStop] = useState<'from' | 'to'>('from')
  const activeStop = fill.kind === 'gradient' ? stop : 'from'
  const color = fill.kind === 'solid' ? fill.color : fill[activeStop]
  const parsed = parseHex(color) ?? { rgb: { r: 0, g: 0, b: 0 }, a: 1 }

  // Hue is kept locally so dragging through greys (where hue is undefined) doesn't reset it.
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(parsed.rgb))
  const [lastColor, setLastColor] = useState(color)
  if (color !== lastColor) {
    setLastColor(color)
    if (toHex(hsvToRgb(hsv), parsed.a) !== color.toLowerCase()) setHsv(rgbToHsv(parsed.rgb, hsv.h))
  }
  const alpha = parsed.a

  const emit = (hex: string, live: boolean) =>
    onChange(fill.kind === 'solid' ? { kind: 'solid', color: hex } : { ...fill, [activeStop]: hex }, live)
  const setFromHsv = (next: Hsv, a = alpha, live = true) => {
    setHsv(next)
    const hex = toHex(hsvToRgb(next), a)
    setLastColor(hex)
    emit(hex, live)
  }

  const square = usePad((x, y) => setFromHsv({ ...hsv, s: x, v: 1 - y }))
  const hue = usePad((x) => setFromHsv({ ...hsv, h: Math.min(359.9, x * 360) }))
  const opacity = usePad((x) => setFromHsv(hsv, Math.round(x * 100) / 100))

  const [fmt, setFmt] = useState<ColorFormat>('hex')
  const [draft, setDraft] = useState<string | null>(null)
  const [alphaDraft, setAlphaDraft] = useState<string | null>(null)
  const rgb = hsvToRgb(hsv)
  const pure = toHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }))
  const canPick = typeof window !== 'undefined' && 'EyeDropper' in window

  const pick = async () => {
    try {
      const Ctor = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper
      const { sRGBHex } = await new Ctor().open()
      const p = parseHex(sRGBHex)
      if (p) setFromHsv(rgbToHsv(p.rgb, hsv.h), alpha, false)
    } catch {
      /* cancelled */
    }
  }

  const setType = (kind: 'solid' | 'gradient') => {
    if (kind === fill.kind) return
    onChange(
      kind === 'solid'
        ? { kind: 'solid', color: fill.kind === 'gradient' ? fill.from : color }
        : { kind: 'gradient', from: color, to: '#000000', angle: 135 },
      false,
    )
  }

  return (
    <div className="cp" onKeyDown={(e) => e.stopPropagation()}>
      <div className="cp-head">
        <span className="cp-tab">Custom</span>
        <PopoverClose asChild>
          <button type="button" className="cp-icon" aria-label="Close color picker">
            <X />
          </button>
        </PopoverClose>
      </div>

      {allowGradient && (
        <div className="cp-types" role="group" aria-label="Paint type">
          <TypeButton label="Solid" pressed={fill.kind === 'solid'} onClick={() => setType('solid')}>
            <span className="cp-type-solid" />
          </TypeButton>
          <TypeButton label="Linear gradient" pressed={fill.kind === 'gradient'} onClick={() => setType('gradient')}>
            <span className="cp-type-linear" />
          </TypeButton>
        </div>
      )}

      <div className="cp-body">
        {fill.kind === 'gradient' && (
          <div className="cp-gradient">
            <div className="cp-stops" style={{ background: `linear-gradient(90deg, ${fill.from}, ${fill.to})` }}>
              {(['from', 'to'] as const).map((s) => (
                <button key={s} type="button" className="cp-stop" data-side={s} aria-label={s === 'from' ? 'Start color' : 'End color'} aria-pressed={activeStop === s} onClick={() => setStop(s)}>
                  <span style={{ background: fill[s] }} />
                </button>
              ))}
            </div>
            <NumberInput prefix="∠" label="Gradient angle" suffix="°" value={fill.angle} min={0} max={360} onChange={(angle, live) => onChange({ ...fill, angle }, live)} />
          </div>
        )}

        <div className="cp-square" style={{ background: pure }} {...square} role="slider" aria-label="Saturation and brightness" aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`} aria-valuenow={Math.round(hsv.s * 100)} tabIndex={0}
          onKeyDown={(e) => {
            const d = e.shiftKey ? 0.1 : 0.01
            const map: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }
            const m = map[e.key]
            if (!m) return
            e.preventDefault()
            setFromHsv({ ...hsv, s: clamp(hsv.s + m[0], 0, 1), v: clamp(hsv.v + m[1], 0, 1) })
          }}
        >
          <span className="cp-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: toHex(rgb) }} />
        </div>

        <div className="cp-bars">
          {canPick ? (
            <Tooltip content="Pick a color from the screen" side="bottom">
              <button type="button" className="cp-icon" aria-label="Pick a color from the screen" onClick={() => void pick()}>
                <Pipette />
              </button>
            </Tooltip>
          ) : (
            <span className="cp-icon" aria-hidden="true" />
          )}
          <div className="cp-bar-stack">
            <div className="cp-bar cp-hue" {...hue} role="slider" aria-label="Hue" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(hsv.h)} tabIndex={0}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                e.preventDefault()
                setFromHsv({ ...hsv, h: clamp(hsv.h + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1), 0, 359.9) })
              }}
            >
              <span className="cp-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }} />
            </div>
            <div className="cp-bar cp-alpha" {...opacity} role="slider" aria-label="Opacity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(alpha * 100)} tabIndex={0}
              style={{ ['--cp-rgb' as string]: toHex(rgb) }}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                e.preventDefault()
                setFromHsv(hsv, clamp(alpha + (e.key === 'ArrowRight' ? 0.01 : -0.01) * (e.shiftKey ? 10 : 1), 0, 1))
              }}
            >
              <span className="cp-thumb" style={{ left: `${alpha * 100}%` }}>
                <span style={{ background: toHex(rgb, alpha) }} />
              </span>
            </div>
          </div>
        </div>

        <div className="cp-values">
          <label className="cp-format">
            <select aria-label="Color format" value={fmt} onChange={(e) => setFmt(e.target.value as ColorFormat)}>
              <option value="hex">Hex</option>
              <option value="rgb">RGB</option>
              <option value="hsl">HSL</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <div className="cp-value">
            <input
              aria-label={`Color in ${fmt.toUpperCase()}`}
              spellCheck={false}
              value={draft ?? formatColor(rgb, fmt)}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => {
                setDraft(null)
                const next = parseColor(e.target.value, fmt)
                if (next) setFromHsv(rgbToHsv(next, hsv.h), alpha, false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <span className="cp-sep" aria-hidden="true" />
            <input
              className="cp-alpha-input"
              aria-label="Opacity percent"
              inputMode="numeric"
              value={alphaDraft ?? String(Math.round(alpha * 100))}
              onChange={(e) => setAlphaDraft(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => {
                setAlphaDraft(null)
                const n = Number(e.target.value.replace('%', ''))
                if (Number.isFinite(n)) setFromHsv(hsv, clamp(Math.round(n) / 100, 0, 1), false)
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <span className="cp-pct" aria-hidden="true">
              %
            </span>
          </div>
        </div>
      </div>

      {swatches.length > 0 && (
        <div className="cp-library">
          <span className="cp-library-title">On this page</span>
          <div className="cp-swatches">
            {swatches.map((c) => (
              <Tooltip key={c} content={isTransparent(c) ? 'Transparent' : c.toUpperCase()} side="bottom">
                <button type="button" className="cp-swatch" aria-label={isTransparent(c) ? 'Use transparent' : `Use ${c}`} aria-pressed={c === color.toLowerCase()} onClick={() => {
                  const p = parseHex(c)
                  if (p) setFromHsv(rgbToHsv(p.rgb, hsv.h), p.a, false)
                }}>
                  <span style={{ background: c }} />
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TypeButton({ label, pressed, onClick, children }: { label: string; pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip content={label} side="bottom">
      <button type="button" className="cp-type" aria-label={label} aria-pressed={pressed} onClick={onClick}>
        {children}
      </button>
    </Tooltip>
  )
}
