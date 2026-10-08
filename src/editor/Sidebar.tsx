import { Check, ChevronDown, Code2, Copy, FileCode2, Image as ImageIcon, Link2, Moon, Plus, Redo2, RotateCcw, Sun, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/arc/popover/popover'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import type { ExportTab } from '../export/ExportDialog'
import { useStore } from '../model/store'
import { toast } from '../ui'
import { IconAction, PanelHeader } from '../ui/panel'
import { useIsMobile } from '../ui/sheet'
import { BoxSections } from './BoxSections'
import { CanvasSections } from './CanvasSections'
import { useEditor } from './editorState'
import { MOD } from './platform'
import './sidebar.css'

const WIDTH_KEY = 'bento:sidebar-w'
const MIN_W = 240
const MAX_W = 480

function readWidth() {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY))
    if (n >= MIN_W && n <= MAX_W) return n
  } catch {
    /* storage unavailable */
  }
  return 288
}

export function Sidebar({ onExport, onNew, onDelete }: { onExport: (tab: ExportTab) => void; onNew: () => void; onDelete: (b: { id: string; name: string }) => void }) {
  const { selected, dispatch, activeId } = useStore()
  const mobile = useIsMobile()
  const [width, setWidth] = useState(readWidth)
  const [resizing, setResizing] = useState(false)
  const drag = useRef<{ x: number; w: number } | null>(null)

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${width}px`)
    try {
      localStorage.setItem(WIDTH_KEY, String(width))
    } catch {
      /* storage unavailable */
    }
  }, [width])

  const picker = <BentoPicker onNew={onNew} onDelete={onDelete} />
  const sections = (
    <>
      {/* Canvas and Box controls are separate: selecting a box swaps Canvas out for Box. */}
      {activeId && !selected && (
        <>
          <PanelHeader title="Canvas" />
          <CanvasSections />
        </>
      )}
      {activeId && selected && (
        <>
          <PanelHeader title="Box">
            <IconAction label="Duplicate box" onClick={() => dispatch({ type: 'duplicateCell', id: selected.id })}>
              <Copy />
            </IconAction>
            <IconAction label="Delete box" onClick={() => dispatch({ type: 'removeCell', id: selected.id })}>
              <Trash2 />
            </IconAction>
          </PanelHeader>
          <BoxSections />
        </>
      )}
    </>
  )

  if (mobile) return <MobileSheet toolbar={<Toolbar onExport={onExport} />} picker={picker} sections={sections} />

  return (
    <aside className="sidebar" aria-label="Properties" data-resizing={resizing ? '' : undefined}>
      <div
        className="sidebar-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={MIN_W}
        aria-valuemax={MAX_W}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, w: width }
          setResizing(true)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          // The handle sits on the left edge, so dragging left widens the sidebar.
          setWidth(Math.round(Math.min(MAX_W, Math.max(MIN_W, drag.current.w + drag.current.x - e.clientX))))
        }}
        onPointerUp={() => {
          drag.current = null
          setResizing(false)
        }}
        onPointerCancel={() => {
          drag.current = null
          setResizing(false)
        }}
        onDoubleClick={() => setWidth(288)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setWidth((w) => Math.min(MAX_W, w + 16))
          if (e.key === 'ArrowRight') setWidth((w) => Math.max(MIN_W, w - 16))
        }}
      />

      <Toolbar onExport={onExport} />

      <OverlayScroll>
        {picker}
        {sections}
      </OverlayScroll>
    </aside>
  )
}

/** Collapsed height on phones: grip, toolbar and the bento selector. Matches .canvas-viewport padding. */
const PEEK = 156

/**
 * Phones: the sidebar is a bottom sheet that always shows the toolbar and bento selector.
 * Swiping it up (or tapping the grip) reveals the Canvas or Box options, whichever applies;
 * swiping down on its top part collapses it again. It's a plain region, not a dialog, so the
 * canvas stays reachable.
 */
function MobileSheet({ toolbar, picker, sections }: { toolbar: ReactNode; picker: ReactNode; sections: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const [dragY, setDragY] = useState<number | null>(null)
  const ref = useRef<HTMLElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ id: number; y: number; dragging: boolean; travel: number } | null>(null)
  const dragged = useRef(false)
  const [height, setHeight] = useState(() => window.innerHeight * 0.88)

  useLayoutEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const travel = () => Math.max(0, height - PEEK)
  const offset = dragY ?? (expanded ? 0 : travel())

  const end = () => {
    const g = gesture.current
    gesture.current = null
    if (!g?.dragging) return
    dragged.current = true
    setDragY((y) => {
      if (y !== null) setExpanded(y < g.travel / 2)
      return null
    })
  }

  return (
    <section
      ref={ref}
      className="sheet"
      aria-label="Properties"
      data-expanded={expanded ? '' : undefined}
      data-dragging={dragY !== null ? '' : undefined}
      style={{ transform: `translateY(${offset}px)` }}
      onPointerDown={(e) => {
        const t = e.target as HTMLElement
        // Collapsed: swipe anywhere. Expanded: only the top part drags, the list scrolls.
        if (t.closest('[data-vaul-no-drag]')) return
        if (expanded && !head.current?.contains(t)) return
        dragged.current = false
        gesture.current = { id: e.pointerId, y: e.clientY, dragging: false, travel: travel() }
      }}
      onPointerMove={(e) => {
        const g = gesture.current
        if (!g || g.id !== e.pointerId) return
        const dy = e.clientY - g.y
        if (!g.dragging) {
          if (Math.abs(dy) < 6) return
          g.dragging = true
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }
        const base = expanded ? 0 : g.travel
        setDragY(Math.min(g.travel, Math.max(0, base + dy)))
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onClickCapture={(e) => {
        // A drag that ends on a button shouldn't also press it.
        if (dragged.current) {
          dragged.current = false
          e.stopPropagation()
          e.preventDefault()
        }
      }}
      onWheel={(e) => {
        if (!expanded && e.deltaY > 0) setExpanded(true)
      }}
    >
      <div ref={head} className="sheet-head">
        <button type="button" className="sheet-grip" aria-expanded={expanded} aria-label={expanded ? 'Collapse options' : 'Show all options'} onClick={() => setExpanded((x) => !x)}>
          <span className="drawer-handle" aria-hidden="true" />
        </button>
        {toolbar}
        {picker}
      </div>
      <div className="sheet-scroll" inert={!expanded}>
        {sections}
      </div>
    </section>
  )
}

/**
 * Scroll area with a thin scrollbar drawn over its right padding lane. The native scrollbar is
 * hidden, so content (and its separators) keeps full width whether or not it overflows.
 */
function OverlayScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null)
  const [active, setActive] = useState(false)
  const grab = useRef<{ y: number; scroll: number } | null>(null)

  useEffect(() => {
    const el = ref.current!
    const measure = () => {
      const { scrollHeight: sh, clientHeight: ch, scrollTop: st } = el
      if (sh <= ch + 1) return setThumb(null)
      const height = Math.max(24, (ch / sh) * ch)
      setThumb({ height, top: (st / (sh - ch)) * (ch - height) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const mo = new MutationObserver(() => {
      for (const c of el.children) ro.observe(c)
      measure()
    })
    for (const c of el.children) ro.observe(c)
    mo.observe(el, { childList: true, subtree: true })
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
      el.removeEventListener('scroll', measure)
    }
  }, [])

  return (
    <div className="sidebar-scroll-wrap">
      <div className="sidebar-scroll" ref={ref}>
        {children}
      </div>
      {thumb && (
        <div
          className="sidebar-thumb"
          data-active={active ? '' : undefined}
          style={{ top: thumb.top, height: thumb.height }}
          aria-hidden="true"
          onPointerDown={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            grab.current = { y: e.clientY, scroll: ref.current!.scrollTop }
            setActive(true)
          }}
          onPointerMove={(e) => {
            const el = ref.current!
            if (!grab.current) return
            const ratio = (el.scrollHeight - el.clientHeight) / (el.clientHeight - thumb.height)
            el.scrollTop = grab.current.scroll + (e.clientY - grab.current.y) * ratio
          }}
          onPointerUp={() => {
            grab.current = null
            setActive(false)
          }}
          onPointerCancel={() => {
            grab.current = null
            setActive(false)
          }}
        />
      )}
    </div>
  )
}

/** Entry point 2: the bento selector, with new (+) and delete beside it. */
function BentoPicker({ onNew, onDelete }: { onNew: () => void; onDelete: (b: { id: string; name: string }) => void }) {
  const { bentos, activeId } = useStore()
  const active = bentos.find((b) => b.id === activeId)
  if (!bentos.length) {
    return (
      <div className="bento-bar">
        <button type="button" className="p-button p-button-wide" onClick={onNew}>
          <Plus aria-hidden="true" /> Add new bento
        </button>
      </div>
    )
  }
  return (
    <div className="bento-bar">
      <BentoSelector />
      <IconAction label="New bento" onClick={onNew}>
        <Plus />
      </IconAction>
      {active && (
        <IconAction label={`Delete ${active.name}`} onClick={() => onDelete(active)}>
          <Trash2 />
        </IconAction>
      )}
    </div>
  )
}

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** A large button naming the open bento; it opens a searchable list of every saved bento. */
function BentoSelector() {
  const { bentos, activeId, dispatch } = useStore()
  const active = bentos.find((b) => b.id === activeId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const q = query.trim().toLowerCase()
  const list = q ? bentos.filter((b) => b.name.toLowerCase().includes(q)) : bentos
  const choose = (id: string) => {
    dispatch({ type: 'switchBento', id })
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setQuery('')
          setIndex(Math.max(0, bentos.findIndex((b) => b.id === activeId)))
        }
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="bento-selector" aria-label={`Bento: ${active?.name ?? 'none'}. Change bento`}>
          <span className="bento-selector-name">{active?.name ?? 'Select a bento'}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="bento-menu">
        <input
          className="bento-menu-search"
          role="combobox"
          aria-label="Find a bento"
          aria-expanded="true"
          aria-controls="bento-menu-list"
          aria-activedescendant={list[index] ? `bento-opt-${list[index].id}` : undefined}
          placeholder="Find a bento"
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setIndex((i) => Math.min(list.length - 1, i + 1)))
            if (e.key === 'ArrowUp') (e.preventDefault(), setIndex((i) => Math.max(0, i - 1)))
            if (e.key === 'Enter' && list[index]) (e.preventDefault(), choose(list[index].id))
          }}
        />
        <ul id="bento-menu-list" role="listbox" aria-label="Saved bentos" className="bento-menu-list">
          {list.map((b, i) => (
            <li
              key={b.id}
              id={`bento-opt-${b.id}`}
              role="option"
              aria-selected={b.id === activeId}
              data-highlighted={i === index ? '' : undefined}
              className="bento-option"
              onPointerEnter={() => setIndex(i)}
              onClick={() => choose(b.id)}
            >
              <span className="bento-option-text">
                <span className="bento-option-name">{b.name}</span>
                <span className="bento-option-date">Created {dateFormat.format(b.createdAt)}</span>
              </span>
              {b.id === activeId && <Check aria-hidden="true" />}
            </li>
          ))}
          {!list.length && <li className="bento-menu-empty">No bento with that name</li>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function Toolbar({ onExport }: { onExport: (tab: ExportTab) => void }) {
  const { canUndo, canRedo, dispatch, doc, activeId } = useStore()
  const { theme, setTheme } = useEditor()
  return (
    <div className="toolbar" role="toolbar" aria-label="Document">
      <Tip label="Reset canvas">
        <button
          type="button"
          className="tb-btn"
          aria-label="Reset canvas"
          disabled={!doc.cells.length}
          onClick={() => {
            dispatch({ type: 'replaceDoc', doc: { ...doc, cells: [] } })
            toast(`Canvas reset. ${MOD}Z brings the boxes back.`)
          }}
        >
          <RotateCcw />
        </button>
      </Tip>
      <div className="tb-group" role="group" aria-label="History">
        <Tip label={`Undo (${MOD}Z)`}>
          <button type="button" className="tb-btn" aria-label="Undo" disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
            <Undo2 />
          </button>
        </Tip>
        <Tip label={`Redo (${MOD}⇧Z)`}>
          <button type="button" className="tb-btn" aria-label="Redo" disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })}>
            <Redo2 />
          </button>
        </Tip>
      </div>
      <span className="tb-spacer" />
      <IconAction label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun /> : <Moon />}
      </IconAction>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="tb-btn tb-export" disabled={!activeId}>
            Export <ChevronDown />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="tb-menu">
          <ExportItem icon={<FileCode2 />} label="HTML and CSS" hint=".html" onSelect={() => onExport('html')} />
          <ExportItem icon={<Code2 />} label="React component" hint=".zip" onSelect={() => onExport('react')} />
          <ExportItem icon={<Link2 />} label="Embed snippet" hint="iframe" onSelect={() => onExport('embed')} />
          <span className="tb-menu-sep" />
          <ExportItem icon={<ImageIcon />} label="Image" hint="PNG, JPEG, WebP" onSelect={() => onExport('image')} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ExportItem({ icon, label, hint, onSelect }: { icon: ReactNode; label: string; hint: string; onSelect: () => void }) {
  return (
    <PopoverClose asChild>
      <button type="button" className="tb-menu-item" onClick={onSelect}>
        {icon}
        <span>{label}</span>
        <span className="tb-menu-hint">{hint}</span>
      </button>
    </PopoverClose>
  )
}

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip content={label} side="bottom">
      {children}
    </Tooltip>
  )
}
