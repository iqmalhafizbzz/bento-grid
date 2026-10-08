import { Check, ChevronDown, Code2, Copy, FileCode2, Image as ImageIcon, Link2, Moon, Plus, Redo2, RotateCcw, Sun, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/arc/popover/popover'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import type { ExportTab } from '../export/ExportDialog'
import { useStore } from '../model/store'
import { toast } from '../ui'
import { IconAction, PanelHeader } from '../ui/panel'
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
        <BentoPicker onNew={onNew} onDelete={onDelete} />
        {activeId && (
          <>
            <PanelHeader title="Canvas" />
            <CanvasSections />
          </>
        )}
        {/* The Box group appears once a box is selected. */}
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
      </OverlayScroll>
    </aside>
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
