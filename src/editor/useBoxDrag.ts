import {
  Accessibility,
  Cursor,
  DragDropManager,
  Draggable,
  PointerActivationConstraints,
  PointerSensor,
  PreventSelection,
} from '@dnd-kit/dom'
import { useCallback, useEffect, useRef, useState } from 'react'

let instance = 0

export type Edge = { n?: boolean; s?: boolean; e?: boolean; w?: boolean }

/** What a box drag is doing: moving the whole box, or resizing it from one handle. */
export type BoxDragData = { kind: 'move'; id: string } | { kind: 'resize'; id: string; edge: Edge }

export interface BoxDragHandlers {
  start(data: BoxDragData, clientX: number, clientY: number): void
  move(data: BoxDragData, clientX: number, clientY: number): void
  end(data: BoxDragData, canceled: boolean): void
}

/**
 * Box moves and resizes run on @dnd-kit/dom. dnd-kit only tracks the pointer here: there is no
 * Feedback plugin, so the element itself never moves. The canvas snaps the box to the grid and
 * draws the preview from the reported pointer position.
 */
export function useBoxDrag(handlers: BoxDragHandlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const [manager] = useState(
    () =>
      new DragDropManager({
        plugins: [Accessibility, Cursor, PreventSelection],
        sensors: [
          PointerSensor.configure({
            activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
            // A box being cropped pans its media instead; a handle press belongs to the handle's own draggable.
            preventActivation: (event, source) => {
              const target = event.target as Element | null
              if (!target) return false
              if ((source.data as BoxDragData).kind === 'move') return !!target.closest('.handle, [data-cropping]')
              return false
            },
          }),
        ],
      }),
  )

  useEffect(() => {
    const data = (op: { source: { data: unknown } | null }) => op.source?.data as BoxDragData | undefined
    const offs = [
      manager.monitor.addEventListener('dragstart', (e) => {
        const d = data(e.operation)
        const p = e.operation.position.current
        if (d) handlersRef.current.start(d, p.x, p.y)
      }),
      manager.monitor.addEventListener('dragmove', (e) => {
        const d = data(e.operation)
        const p = e.to ?? e.operation.position.current
        if (d) handlersRef.current.move(d, p.x, p.y)
      }),
      manager.monitor.addEventListener('dragend', (e) => {
        const d = data(e.operation)
        if (d) handlersRef.current.end(d, e.canceled)
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [manager])

  // Destroy on unmount, deferred: React StrictMode unmounts and remounts once in development,
  // and the remount must find the manager still alive.
  const teardown = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    clearTimeout(teardown.current)
    return () => {
      teardown.current = setTimeout(() => manager.destroy(), 0)
    }
  }, [manager])

  // Ref callbacks are cached per key so re-renders never tear down a draggable mid-drag.
  const refs = useRef(new Map<string, (el: HTMLElement | null) => (() => void) | undefined>())
  const draggableRef = useCallback(
    (key: string, data: BoxDragData) => {
      let cb = refs.current.get(key)
      if (!cb) {
        cb = (el) => {
          if (!el) return
          // dnd-kit registers in a microtask. A unique id per instance stops a draggable destroyed by
          // a quick unmount and remount (React StrictMode does this) from claiming the id of its replacement.
          const draggable = new Draggable({ id: `${key}#${++instance}`, element: el, data }, manager)
          return () => draggable.destroy()
        }
        refs.current.set(key, cb)
      }
      return cb
    },
    [manager],
  )

  return draggableRef
}
