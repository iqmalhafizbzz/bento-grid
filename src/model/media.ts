import type { MediaKind, MediaRef } from './types'

/**
 * Media blobs live in IndexedDB (too big for localStorage). The doc only stores ids.
 * Object URLs are cached in memory for rendering.
 */
const DB_NAME = 'bento-media'
const STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

const blobs = new Map<string, Blob>()
const urls = new Map<string, string>()
const listeners = new Set<() => void>()

export function subscribeMedia(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  listeners.forEach((fn) => fn())
}

export function mediaUrl(id: string): string | undefined {
  return urls.get(id)
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  if (blobs.has(id)) return blobs.get(id)
  try {
    const b = await tx<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)
    if (b) remember(id, b)
    return b
  } catch {
    return undefined
  }
}

function remember(id: string, blob: Blob) {
  blobs.set(id, blob)
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob))
}

/** Load every blob referenced by the doc into memory. */
export async function hydrateMedia(ids: string[]) {
  await Promise.all(ids.filter((id) => !blobs.has(id)).map(getBlob))
  emit()
}

export function newId(prefix = 'm') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function measure(url: string, kind: MediaKind): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (kind === 'image') {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('Could not read image'))
      img.src = url
    } else {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight })
      v.onerror = () => reject(new Error('Could not read video'))
      v.src = url
    }
  })
}

export function isSupportedFile(f: File) {
  return f.type.startsWith('image/') || f.type.startsWith('video/')
}

export async function addMediaFile(file: Blob): Promise<MediaRef> {
  const kind: MediaKind = file.type.startsWith('video/') ? 'video' : 'image'
  const id = newId()
  remember(id, file)
  const { width, height } = await measure(urls.get(id)!, kind)
  try {
    await tx('readwrite', (s) => s.put(file, id))
  } catch (e) {
    console.warn('Could not persist media, it will be lost on reload', e)
  }
  emit()
  return { id, kind, mime: file.type || (kind === 'image' ? 'image/png' : 'video/mp4'), width, height, zoom: 1, x: 0.5, y: 0.5 }
}

/** Remove blobs no longer referenced by the doc or the undo history. */
export async function gcMedia(keep: Set<string>) {
  try {
    const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
    for (const k of keys) {
      const id = String(k)
      if (keep.has(id)) continue
      await tx('readwrite', (s) => s.delete(id))
      const u = urls.get(id)
      if (u) URL.revokeObjectURL(u)
      urls.delete(id)
      blobs.delete(id)
    }
  } catch {
    /* best effort */
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export function extFor(mime: string) {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/ogg': 'ogv',
  }
  return map[mime] ?? mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') ?? 'bin'
}
