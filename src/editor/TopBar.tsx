import { Code2, Download, Eraser, FileCode2, Image as ImageIcon, Link2, Redo2, Undo2 } from 'lucide-react'
import { DropdownMenu } from '@/components/arc/dropdown-menu/dropdown-menu'
import { ThemeSwitch } from '@/components/arc/theme-switch/theme-switch'
import type { ExportTab } from '../export/ExportDialog'
import { useStore } from '../model/store'
import { IconButton, toast } from '../ui'
import { useEditor } from './editorState'
import { MOD } from './platform'

export function TopBar({ onExport }: { onExport: (tab: ExportTab) => void }) {
  const { canUndo, canRedo, dispatch, doc } = useStore()
  const { theme, setTheme } = useEditor()
  return (
    <header className="topbar">
      <div className="brand">
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="currentColor" />
          <rect x="6" y="6" width="11" height="11" rx="3" fill="var(--background)" opacity="0.9" />
          <rect x="19" y="6" width="7" height="20" rx="3" fill="var(--background)" opacity="0.55" />
          <rect x="6" y="19" width="11" height="7" rx="3" fill="var(--background)" opacity="0.75" />
        </svg>
        <span>Bento Creator</span>
      </div>

      <div className="topbar-group">
        <IconButton label={`Undo (${MOD}Z)`} disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
          <Undo2 />
        </IconButton>
        <IconButton label={`Redo (${MOD}⇧Z)`} disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })}>
          <Redo2 />
        </IconButton>
        <span className="topbar-divider" aria-hidden="true" />
        <IconButton
          label="Clear all boxes"
          disabled={!doc.cells.length}
          onClick={() => {
            dispatch({ type: 'replaceDoc', doc: { ...doc, cells: [] } })
            toast(`Cleared. ${MOD}Z brings the boxes back.`)
          }}
        >
          <Eraser />
        </IconButton>
      </div>

      <div className="topbar-group topbar-end">
        <ThemeSwitch
          theme={theme}
          variant="rise"
          iconOnly
          onThemeChange={(next) => {
            if (!document.startViewTransition) return setTheme(next)
            document.startViewTransition(() => setTheme(next))
          }}
        />
        <DropdownMenu
          label="Export"
          icon={<Download size={16} />}
          items={[
            { label: 'HTML and CSS', icon: <FileCode2 size={15} />, onSelect: () => onExport('html') },
            { label: 'React component', icon: <Code2 size={15} />, onSelect: () => onExport('react') },
            { label: 'Embed snippet', icon: <Link2 size={15} />, onSelect: () => onExport('embed') },
            { label: 'Image', icon: <ImageIcon size={15} />, onSelect: () => onExport('image'), separatorBefore: true },
          ]}
        />
      </div>
    </header>
  )
}
