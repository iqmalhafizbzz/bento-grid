/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { BentoDoc } from '../model/types'

interface EditorState {
  /** Cell whose media is being panned / zoomed directly on the canvas. */
  cropId: string | null
  setCropId: (id: string | null) => void
  theme: 'light' | 'dark'
  setTheme: (t: 'light' | 'dark') => void
  /** Spacing being adjusted in the left panel, drawn as guides on the canvas. */
  guide: GapGuide | null
  setGuide: (g: GapGuide | null) => void
}

export type GapGuide = 'gapX' | 'gapY' | 'padding'

const Ctx = createContext<EditorState | null>(null)

export function EditorProvider({ children }: { children: ReactNode }) {
  const [cropId, setCropId] = useState<string | null>(null)
  const [guide, setGuide] = useState<GapGuide | null>(null)
  const [theme, setThemeState] = useState<'light' | 'dark'>(
    () => (document.documentElement.dataset.theme as 'light' | 'dark') ?? 'dark',
  )
  const setTheme = (t: 'light' | 'dark') => {
    setThemeState(t)
    document.documentElement.dataset.theme = t
    try {
      localStorage.setItem('bento:theme:v2', t)
    } catch {
      /* ignore */
    }
  }
  return <Ctx.Provider value={{ cropId, setCropId, theme, setTheme, guide, setGuide }}>{children}</Ctx.Provider>
}

export function useEditor() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useEditor outside EditorProvider')
  return v
}

/** Logical size of the bento. In "fit" mode it tracks the browser window, as the export would. */
export function useDocSize(doc: BentoDoc) {
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    if (doc.sizeMode !== 'fit') return
    const on = () => setWin({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [doc.sizeMode])
  return doc.sizeMode === 'fit' ? win : { w: doc.width, h: doc.height }
}
