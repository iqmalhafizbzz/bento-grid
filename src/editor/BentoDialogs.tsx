import { Columns3, Monitor, Rows3 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { Dialog, DialogClose, DialogContent } from '@/components/arc/dialog/dialog'
import { Input } from '@/components/arc/input/input'
import { SIZE_PRESETS, emptyDoc } from '../model/defaults'
import { useStore } from '../model/store'
import { FieldRow, NumberInput, SelectInput, type SelectOption } from '../ui/panel'
import './bento-dialogs.css'

type SizeChoice = (typeof SIZE_PRESETS)[number]['id'] | 'fit' | 'custom'

const SIZE_OPTIONS: SelectOption<SizeChoice>[] = [
  ...SIZE_PRESETS.map((p) => ({ value: p.id as SizeChoice, label: p.label, hint: `${p.w}×${p.h}` })),
  { value: 'fit', label: 'Fit screen', hint: 'Responsive' },
  { value: 'custom', label: 'Custom size' },
]

/** Name, size and grid for a new bento. Defaults: Desktop HD, 4 × 3. */
export function NewBentoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open && <NewBentoForm onDone={() => onOpenChange(false)} />}</Dialog>
}

function NewBentoForm({ onDone }: { onDone: () => void }) {
  const { bentos, dispatch } = useStore()
  const [name, setName] = useState('')
  const [size, setSize] = useState<SizeChoice>('1920x1080')
  const [custom, setCustom] = useState({ w: 1920, h: 1080 })
  const [cols, setCols] = useState(4)
  const [rows, setRows] = useState(3)
  const [touched, setTouched] = useState(false)
  const trimmed = name.trim()
  const error = touched && !trimmed ? 'Give the bento a name' : undefined

  const create = () => {
    setTouched(true)
    if (!trimmed) return
    const preset = SIZE_PRESETS.find((p) => p.id === size)
    const base = emptyDoc()
    const doc = {
      ...base,
      sizeMode: size === 'fit' ? ('fit' as const) : ('fixed' as const),
      width: preset?.w ?? custom.w,
      height: preset?.h ?? custom.h,
      cols,
      rows,
    }
    dispatch({ type: 'createBento', name: trimmed, doc })
    onDone()
  }

  return (
    <DialogContent title="New bento" description="Name it and pick a size and grid. You can change the size and grid later." className="bento-dialog">
      <form
        className="bento-form"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <Input
          label="Name"
          value={name}
          placeholder={`Bento ${bentos.length + 1}`}
          autoFocus
          error={error}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
        />
        <div className="bento-form-group">
          <span className="bento-form-label">Size</span>
          <SelectInput<SizeChoice> label="Size" prefix={<Monitor />} value={size} onChange={setSize} options={SIZE_OPTIONS} />
          {size === 'custom' && (
            <FieldRow>
              <NumberInput prefix="W" label="Width in pixels" value={custom.w} min={100} max={8000} onChange={(w) => setCustom((c) => ({ ...c, w }))} />
              <NumberInput prefix="H" label="Height in pixels" value={custom.h} min={100} max={8000} onChange={(h) => setCustom((c) => ({ ...c, h }))} />
            </FieldRow>
          )}
        </div>
        <div className="bento-form-group">
          <span className="bento-form-label">Grid</span>
          <FieldRow>
            <NumberInput prefix={<Columns3 />} label="Columns" value={cols} min={1} max={12} onChange={setCols} />
            <NumberInput prefix={<Rows3 />} label="Rows" value={rows} min={1} max={12} onChange={setRows} />
          </FieldRow>
        </div>
        <div className="bento-form-actions">
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" size="sm">
            Create bento
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}

export function DeleteBentoDialog({ bento, onOpenChange }: { bento: { id: string; name: string } | null; onOpenChange: (o: boolean) => void }) {
  const { dispatch } = useStore()
  return (
    <Dialog open={!!bento} onOpenChange={onOpenChange}>
      {bento && (
        <DialogContent title={`Delete “${bento.name}”?`} description="This removes the bento and all of its boxes. You can't undo this." className="bento-dialog">
          <div className="bento-form-actions">
            <DialogClose asChild>
              <Button type="button" variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => {
                dispatch({ type: 'deleteBento', id: bento.id })
                onOpenChange(false)
              }}
            >
              Delete bento
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
