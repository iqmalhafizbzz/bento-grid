/**
 * Phone layout helpers: dialogs open as vaul drawers (bottom sheets) on small screens and as
 * Arc dialogs everywhere else, so call sites stay the same.
 */
import { Dialog, DialogClose, DialogContent } from '@/components/arc/dialog/dialog'
import { useSyncExternalStore, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import './sheet.css'

export const MOBILE_QUERY = '(max-width: 640px)'

function subscribe(cb: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}

export function ResponsiveDialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode }) {
  const mobile = useIsMobile()
  if (!mobile) return <Dialog open={open} onOpenChange={onOpenChange}>{children}</Dialog>
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      {children}
    </Drawer.Root>
  )
}

export function ResponsiveContent({ title, description, className, children }: { title: string; description?: string; className?: string; children: ReactNode }) {
  const mobile = useIsMobile()
  if (!mobile)
    return (
      <DialogContent title={title} description={description} className={className}>
        {children}
      </DialogContent>
    )
  return (
    <Drawer.Portal>
      <Drawer.Overlay className="drawer-overlay" />
      <Drawer.Content className={['drawer', className].filter(Boolean).join(' ')} {...(description ? {} : { 'aria-describedby': undefined })}>
        <div className="drawer-header">
          <span className="drawer-handle" aria-hidden="true" />
          <Drawer.Title className="drawer-title">{title}</Drawer.Title>
          {description && <Drawer.Description className="drawer-description">{description}</Drawer.Description>}
        </div>
        <div className="drawer-body">{children}</div>
      </Drawer.Content>
    </Drawer.Portal>
  )
}

export function ResponsiveClose({ children }: { children: ReactNode }) {
  const mobile = useIsMobile()
  return mobile ? <Drawer.Close asChild>{children}</Drawer.Close> : <DialogClose asChild>{children}</DialogClose>
}
