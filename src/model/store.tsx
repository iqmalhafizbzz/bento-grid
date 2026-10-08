import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { clampCells, firstFreeSlot, fits, inBounds, overlaps } from './geometry'
import { makeCell, mediaIds, emptyDoc } from './defaults'
import { gcMedia, hydrateMedia, newId } from './media'
import type { BentoDoc, Cell, Rect } from './types'

/** All bentos and which one is open. */
const WORKSPACE_KEY = 'bento:workspace:v1'
/** The single-document save from before bentos had names; migrated into the workspace once. */
const LEGACY_KEY = 'bento:doc:v2'
const HISTORY_LIMIT = 100
const COALESCE_MS = 600

type CellPatch = Partial<Omit<Cell, 'id'>>

export type Action =
  /** `key` merges rapid edits of the same control (sliders, typing) into one undo step. */
  | { type: 'setDoc'; patch: Partial<BentoDoc>; key?: string }
  | { type: 'updateCell'; id: string; patch: CellPatch | ((c: Cell) => CellPatch); key?: string }
  | { type: 'addCell'; rect: Rect; init?: CellPatch }
  | { type: 'removeCell'; id: string }
  | { type: 'duplicateCell'; id: string }
  | { type: 'moveCell'; id: string; rect: Rect }
  /** Several boxes at once (a drop that swaps boxes), as one undo step. Applied only if the result has no overlaps. */
  | { type: 'moveCells'; moves: Record<string, Rect> }
  | { type: 'replaceDoc'; doc: BentoDoc }
  | { type: 'select'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'createBento'; name: string; doc: BentoDoc }
  | { type: 'switchBento'; id: string }
  | { type: 'deleteBento'; id: string }

export interface Bento {
  id: string
  name: string
  /** Epoch milliseconds. */
  createdAt: number
  doc: BentoDoc
}

interface State {
  /** Every bento. The open one's entry may be stale; `doc` holds its latest version. */
  bentos: Bento[]
  activeId: string | null
  /** The open bento (a blank placeholder when none is open). */
  doc: BentoDoc
  past: BentoDoc[]
  future: BentoDoc[]
  selectedId: string | null
  lastKey: string | null
  lastAt: number
}

function commit(state: State, doc: BentoDoc, key?: string, extra?: Partial<State>): State {
  if (doc === state.doc) return extra ? { ...state, ...extra } : state
  const now = Date.now()
  const merge = key != null && key === state.lastKey && now - state.lastAt < COALESCE_MS
  return {
    ...state,
    ...extra,
    doc,
    past: merge ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
    lastKey: key ?? null,
    lastAt: now,
  }
}

/** The workspace with the open bento's latest doc written back into its entry. */
function savedBentos(state: State): Bento[] {
  return state.bentos.map((b) => (b.id === state.activeId ? { ...b, doc: state.doc } : b))
}

/** Open a bento: its own doc, a fresh undo history, nothing selected. */
function open(state: State, bentos: Bento[], id: string | null): State {
  const target = bentos.find((b) => b.id === id)
  return { ...state, bentos, activeId: target?.id ?? null, doc: target?.doc ?? emptyDoc(), past: [], future: [], selectedId: null, lastKey: null }
}

function workspaceReducer(state: State, action: Action): State | null {
  switch (action.type) {
    case 'createBento': {
      const bento = { id: newId('b'), name: action.name, createdAt: Date.now(), doc: action.doc }
      return open(state, [...savedBentos(state), bento], bento.id)
    }
    case 'switchBento':
      return action.id === state.activeId ? state : open(state, savedBentos(state), action.id)
    case 'deleteBento': {
      const bentos = savedBentos(state).filter((b) => b.id !== action.id)
      if (action.id !== state.activeId) return { ...state, bentos }
      return open(state, bentos, bentos[0]?.id ?? null)
    }
    default:
      return null
  }
}

function reducer(state: State, action: Action): State {
  const ws = workspaceReducer(state, action)
  if (ws) return ws
  // Nothing to edit until a bento is open.
  if (!state.activeId) return state
  const { doc } = state
  switch (action.type) {
    case 'setDoc': {
      const next = { ...doc, ...action.patch }
      if (action.patch.cols != null || action.patch.rows != null) {
        next.cells = clampCells(next.cells, next.cols, next.rows)
      }
      const selectedId = next.cells.some((c) => c.id === state.selectedId) ? state.selectedId : null
      return commit(state, next, action.key, { selectedId })
    }
    case 'updateCell': {
      const cells = doc.cells.map((c) => {
        if (c.id !== action.id) return c
        const patch = typeof action.patch === 'function' ? action.patch(c) : action.patch
        return { ...c, ...patch }
      })
      return commit(state, { ...doc, cells }, action.key ? `${action.id}:${action.key}` : undefined)
    }
    case 'addCell': {
      if (!fits(doc, action.rect)) return state
      const cell = { ...makeCell(action.rect.col, action.rect.row, action.rect.w, action.rect.h, doc.cells.length), ...action.init }
      return commit(state, { ...doc, cells: [...doc.cells, cell] }, undefined, { selectedId: cell.id })
    }
    case 'removeCell': {
      const cells = doc.cells.filter((c) => c.id !== action.id)
      return commit(state, { ...doc, cells }, undefined, {
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      })
    }
    case 'duplicateCell': {
      const src = doc.cells.find((c) => c.id === action.id)
      if (!src) return state
      const slot = firstFreeSlot(doc, src.w, src.h) ?? firstFreeSlot(doc, 1, 1)
      if (!slot) return state
      const copy: Cell = { ...structuredClone(src), ...slot, id: newId('c') }
      return commit(state, { ...doc, cells: [...doc.cells, copy] }, undefined, { selectedId: copy.id })
    }
    case 'moveCell': {
      if (!fits(doc, action.rect, action.id)) return state
      const cells = doc.cells.map((c) => (c.id === action.id ? { ...c, ...action.rect } : c))
      return commit(state, { ...doc, cells })
    }
    case 'moveCells': {
      const changed = doc.cells.some((c) => {
        const r = action.moves[c.id]
        return r && (r.col !== c.col || r.row !== c.row || r.w !== c.w || r.h !== c.h)
      })
      if (!changed) return state
      const cells = doc.cells.map((c) => (action.moves[c.id] ? { ...c, ...action.moves[c.id] } : c))
      const ok = cells.every((c, i) => inBounds(c, doc.cols, doc.rows) && cells.every((o, j) => j === i || !overlaps(c, o)))
      return ok ? commit(state, { ...doc, cells }) : state
    }
    case 'replaceDoc':
      return commit(state, action.doc, undefined, { selectedId: null })
    case 'select':
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id, lastKey: null }
    case 'undo': {
      const prev = state.past.at(-1)
      if (!prev) return state
      return {
        ...state,
        doc: prev,
        past: state.past.slice(0, -1),
        future: [doc, ...state.future],
        lastKey: null,
        selectedId: prev.cells.some((c) => c.id === state.selectedId) ? state.selectedId : null,
      }
    }
    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        ...state,
        doc: next,
        past: [...state.past, doc],
        future: state.future.slice(1),
        lastKey: null,
        selectedId: next.cells.some((c) => c.id === state.selectedId) ? state.selectedId : null,
      }
    }
    default:
      return state
  }
}

/** Earlier saves stored one content `kind` per box; boxes are now fill + optional media + optional text. */
function migrateCell(c: Cell & { kind?: 'fill' | 'media' | 'text' }): Cell {
  if (c.kind === undefined) return c
  const { kind, ...rest } = c
  return { ...rest, media: kind === 'media' ? rest.media : null, textOn: kind === 'text' }
}

function migrateDoc(d: BentoDoc): BentoDoc {
  return { ...d, cells: d.cells.map(migrateCell) }
}

function loadWorkspace(): { bentos: Bento[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (raw) {
      const w = JSON.parse(raw) as { bentos: Bento[]; activeId: string | null }
      if (Array.isArray(w.bentos)) {
        const bentos = w.bentos.filter((b) => b?.doc?.version === 1).map((b) => ({ ...b, createdAt: b.createdAt ?? Date.now(), doc: migrateDoc(b.doc) }))
        return { bentos, activeId: bentos.some((b) => b.id === w.activeId) ? w.activeId : (bentos[0]?.id ?? null) }
      }
    }
    // A design saved before bentos had names becomes the first bento, if it has any boxes.
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const d = JSON.parse(legacy) as BentoDoc
      if (d?.version === 1 && Array.isArray(d.cells) && d.cells.length) {
        const bento = { id: newId('b'), name: 'My bento', createdAt: Date.now(), doc: migrateDoc(d) }
        return { bentos: [bento], activeId: bento.id }
      }
    }
  } catch {
    /* storage unavailable or unreadable */
  }
  return { bentos: [], activeId: null }
}

interface StoreValue {
  /** Names and ids of every bento, in creation order. */
  bentos: { id: string; name: string; createdAt: number }[]
  activeId: string | null
  doc: BentoDoc
  selectedId: string | null
  selected: Cell | null
  canUndo: boolean
  canRedo: boolean
  dispatch: (a: Action) => void
  updateCell: (id: string, patch: CellPatch | ((c: Cell) => CellPatch), key?: string) => void
  setDoc: (patch: Partial<BentoDoc>, key?: string) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, (): State => {
    const { bentos, activeId } = loadWorkspace()
    return {
      bentos,
      activeId,
      doc: bentos.find((b) => b.id === activeId)?.doc ?? emptyDoc(),
      past: [],
    future: [],
    selectedId: null,
      lastKey: null,
      lastAt: 0,
    }
  })

  // Load persisted media once.
  const hydrated = useRef(false)
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    void hydrateMedia(state.bentos.flatMap((b) => mediaIds(b.doc)))
  }, [state.bentos])

  // Persist the doc (debounced) and clean up orphaned media blobs.
  useEffect(() => {
    const t = setTimeout(() => {
      const bentos = savedBentos(state)
      try {
        localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ activeId: state.activeId, bentos }))
      } catch {
        /* quota or privacy mode */
      }
      // Keep media used by any bento or by the open bento's undo history.
      const keep = new Set([...bentos.map((b) => b.doc), ...state.past, ...state.future].flatMap(mediaIds))
      void gcMedia(keep)
    }, 400)
    return () => clearTimeout(t)
  }, [state])

  const updateCell = useCallback<StoreValue['updateCell']>(
    (id, patch, key) => dispatch({ type: 'updateCell', id, patch, key }),
    [],
  )
  const setDoc = useCallback<StoreValue['setDoc']>((patch, key) => dispatch({ type: 'setDoc', patch, key }), [])

  const value = useMemo<StoreValue>(
    () => ({
      bentos: state.bentos.map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt })),
      activeId: state.activeId,
      doc: state.doc,
      selectedId: state.selectedId,
      selected: state.doc.cells.find((c) => c.id === state.selectedId) ?? null,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      dispatch,
      updateCell,
      setDoc,
    }),
    [state.bentos, state.activeId, state.doc, state.selectedId, state.past.length, state.future.length, updateCell, setDoc],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const v = useContext(StoreContext)
  if (!v) throw new Error('useStore outside StoreProvider')
  return v
}
