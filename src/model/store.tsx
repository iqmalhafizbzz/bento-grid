import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { clampCells, firstFreeSlot, fits, inBounds, overlaps } from './geometry'
import { makeCell, mediaIds, emptyDoc } from './defaults'
import { gcMedia, hydrateMedia, newId } from './media'
import type { BentoDoc, Cell, Rect } from './types'

// v2: earlier saves held the old pre-filled starter layout.
const STORAGE_KEY = 'bento:doc:v2'
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

interface State {
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

function reducer(state: State, action: Action): State {
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
  }
}

/** Earlier saves stored one content `kind` per box; boxes are now fill + optional media + optional text. */
function migrateCell(c: Cell & { kind?: 'fill' | 'media' | 'text' }): Cell {
  if (c.kind === undefined) return c
  const { kind, ...rest } = c
  return { ...rest, media: kind === 'media' ? rest.media : null, textOn: kind === 'text' }
}

function loadDoc(): BentoDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw) as BentoDoc
      if (d && d.version === 1 && Array.isArray(d.cells)) return { ...d, cells: d.cells.map(migrateCell) }
    }
  } catch {
    /* fall through */
  }
  return emptyDoc()
}

interface StoreValue {
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
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    doc: loadDoc(),
    past: [],
    future: [],
    selectedId: null,
    lastKey: null,
    lastAt: 0,
  }))

  // Load persisted media once.
  const hydrated = useRef(false)
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    void hydrateMedia(mediaIds(state.doc))
  }, [state.doc])

  // Persist the doc (debounced) and clean up orphaned media blobs.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.doc))
      } catch {
        /* quota or privacy mode */
      }
      const keep = new Set([state.doc, ...state.past, ...state.future].flatMap(mediaIds))
      void gcMedia(keep)
    }, 400)
    return () => clearTimeout(t)
  }, [state.doc, state.past, state.future])

  const updateCell = useCallback<StoreValue['updateCell']>(
    (id, patch, key) => dispatch({ type: 'updateCell', id, patch, key }),
    [],
  )
  const setDoc = useCallback<StoreValue['setDoc']>((patch, key) => dispatch({ type: 'setDoc', patch, key }), [])

  const value = useMemo<StoreValue>(
    () => ({
      doc: state.doc,
      selectedId: state.selectedId,
      selected: state.doc.cells.find((c) => c.id === state.selectedId) ?? null,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      dispatch,
      updateCell,
      setDoc,
    }),
    [state.doc, state.selectedId, state.past.length, state.future.length, updateCell, setDoc],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const v = useContext(StoreContext)
  if (!v) throw new Error('useStore outside StoreProvider')
  return v
}
