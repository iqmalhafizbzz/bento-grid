import { Suspense, lazy, useEffect, useState } from 'react'
import { Canvas } from './editor/Canvas'
import { EditorProvider, useDocSize, useEditor } from './editor/editorState'
import { Sidebar } from './editor/Sidebar'
import { DeleteBentoDialog, NewBentoDialog } from './editor/BentoDialogs'
import { LayoutGrid } from 'lucide-react'
import { Button } from '@/components/arc/button/button'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import type { ExportTab } from './export/ExportDialog'
import { firstFreeSlot } from './model/geometry'
import { addMediaFile, isSupportedFile } from './model/media'
import { StoreProvider, useStore } from './model/store'
import { ToastStack, ToastStackProvider } from '@/components/arc/toast-stack/toast-stack'
import { ToastBridge, toast } from './ui'
import './app.css'
import './mobile.css'

const ExportDialog = lazy(() => import('./export/ExportDialog').then((m) => ({ default: m.ExportDialog })))

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function Shortcuts() {
  const { dispatch, selected, doc, updateCell, activeId } = useStore()
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
      if (isTyping(e.target) || !activeId) return
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
  }, [selected, doc, dispatch, updateCell, activeId])

  return null
}

/** Entry point 1: shown in place of the canvas until a bento exists. */
function EmptyWorkspace({ onNew }: { onNew: () => void }) {
  return (
    <div className="canvas-viewport workspace-empty">
      <EmptyState
        icon={<LayoutGrid size={24} />}
        title="No bentos yet"
        description="Create a bento to start laying out boxes. You can make as many as you like and switch between them from the sidebar."
        action={
          <Button size="sm" onClick={onNew}>
            Create new bento
          </Button>
        }
        label="Workspace"
      />
    </div>
  )
}

function Shell() {
  const { doc, activeId } = useStore()
  const size = useDocSize(doc)
  const [exportOpen, setExportOpen] = useState(false)
  const [tab, setTab] = useState<ExportTab>('html')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  return (
    <div className="app">
      {activeId ? <Canvas /> : <EmptyWorkspace onNew={() => setCreating(true)} />}
      <Sidebar
        onExport={(t) => {
          setTab(t)
          setExportOpen(true)
        }}
        onNew={() => setCreating(true)}
        onDelete={setDeleting}
      />
      <NewBentoDialog open={creating} onOpenChange={setCreating} />
      <DeleteBentoDialog bento={deleting} onOpenChange={(o) => !o && setDeleting(null)} />
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
