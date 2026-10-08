import { Suspense, lazy, useEffect, useState } from 'react'
import { Canvas } from './editor/Canvas'
import { EditorProvider, useDocSize, useEditor } from './editor/editorState'
import { Inspector } from './editor/Inspector'
import { LeftPanel } from './editor/LeftPanel'
import { TopBar } from './editor/TopBar'
import type { ExportTab } from './export/ExportDialog'
import { firstFreeSlot } from './model/geometry'
import { addMediaFile, isSupportedFile } from './model/media'
import { StoreProvider, useStore } from './model/store'
import { ToastStack, ToastStackProvider } from '@/components/arc/toast-stack/toast-stack'
import { ToastBridge, toast } from './ui'
import './app.css'

const ExportDialog = lazy(() => import('./export/ExportDialog').then((m) => ({ default: m.ExportDialog })))

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function Shortcuts() {
  const { dispatch, selected, doc, updateCell } = useStore()
  const { cropId, setCropId } = useEditor()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z' && !isTyping(e.target)) {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
      } else if (mod && e.key.toLowerCase() === 'y' && !isTyping(e.target)) {
        e.preventDefault()
        dispatch({ type: 'redo' })
      } else if (isTyping(e.target) || document.querySelector('[role=dialog]')) {
        return
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault()
        dispatch({ type: 'removeCell', id: selected.id })
      } else if (mod && e.key.toLowerCase() === 'd' && selected) {
        e.preventDefault()
        dispatch({ type: 'duplicateCell', id: selected.id })
      } else if (e.key === 'Escape') {
        if (cropId) setCropId(null)
        else dispatch({ type: 'select', id: null })
      } else if (e.key === 'Enter' && selected?.media) {
        setCropId(selected.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, selected, cropId, setCropId])

  // Paste media: into the selected box, otherwise into a new box in the first free slot.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (isTyping(e.target)) return
      const file = [...(e.clipboardData?.files ?? [])].find(isSupportedFile)
      if (!file) return
      e.preventDefault()
      try {
        const media = await addMediaFile(file)
        if (selected) {
          updateCell(selected.id, { media })
        } else {
          const slot = firstFreeSlot(doc)
          if (!slot) return toast('No free slot. Select a box to paste into it.', 'warning')
          dispatch({ type: 'addCell', rect: slot, init: { media } })
        }
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [selected, doc, dispatch, updateCell])

  return null
}

function Shell() {
  const { doc } = useStore()
  const size = useDocSize(doc)
  const [exportOpen, setExportOpen] = useState(false)
  const [tab, setTab] = useState<ExportTab>('html')
  return (
    <div className="app">
      <TopBar
        onExport={(t) => {
          setTab(t)
          setExportOpen(true)
        }}
      />
      <LeftPanel />
      <Canvas />
      <Inspector />
      {exportOpen && (
        <Suspense fallback={null}>
          <ExportDialog open={exportOpen} onOpenChange={setExportOpen} tab={tab} onTab={setTab} doc={doc} size={size} />
        </Suspense>
      )}
      <Shortcuts />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <EditorProvider>
        <ToastStackProvider>
          <Shell />
          <ToastBridge />
          <ToastStack position="bottom-center" />
        </ToastStackProvider>
      </EditorProvider>
    </StoreProvider>
  )
}
