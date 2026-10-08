/* eslint-disable react-refresh/only-export-components */
/**
 * App-level compositions of Arc components that sit outside the inspector panels
 * (those live in ./panel.tsx): a labelled group, a tooltip icon button, and a toast bridge.
 */
import { useEffect, type ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/arc/button/button'
import { useToastStack } from '@/components/arc/toast-stack/toast-stack'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import './ui.css'

/** A label above a group of controls that has no label of its own. */
export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ui-group" role="group" aria-label={label}>
      <span className="ui-group-label">{label}</span>
      {children}
    </div>
  )
}

export function IconButton({ label, children, ...rest }: ButtonProps & { label: string }) {
  return (
    <Tooltip content={label} side="bottom">
      <Button variant="ghost" size="sm" aria-label={label} className="ui-icon-btn" {...rest}>
        {children}
      </Button>
    </Tooltip>
  )
}

/* ---------- Toasts ---------- */

type ToastType = 'success' | 'info' | 'warning' | 'error'
let push: ((title: string, type: ToastType) => void) | null = null

/** Raise an Arc toast from anywhere, including non-component code. */
export function toast(title: string, type: ToastType = 'info') {
  push?.(title, type)
}

/** Mount once inside ToastStackProvider. */
export function ToastBridge() {
  const { toast: show } = useToastStack()
  useEffect(() => {
    push = (title, type) => show({ title, type })
    return () => {
      push = null
    }
  }, [show])
  return null
}
