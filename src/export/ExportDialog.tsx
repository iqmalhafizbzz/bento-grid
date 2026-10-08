import JSZip from 'jszip'
import { Code2, FileCode2, Image as ImageIcon, Link2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { CodeBlock } from '@/components/arc/code-block/code-block'
import { CopyButton } from '@/components/arc/copy-button/copy-button'
import { Dialog, DialogContent } from '@/components/arc/dialog/dialog'
import { Input } from '@/components/arc/input/input'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Slider } from '@/components/arc/slider/slider'
import { Switch } from '@/components/arc/switch/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import { resolveVisibility } from '../model/defaults'
import { blobToDataUrl, extFor, getBlob } from '../model/media'
import type { BentoDoc, MediaRef } from '../model/types'
import { Group, toast } from '../ui'
import { buildCss, buildEmbed, buildHtmlPage, buildReactComponent, type Size } from './codegen'
import { renderImage, renderToCanvas, type ImageFormat } from './image'
import './export.css'

export type ExportTab = 'html' | 'react' | 'embed' | 'image'

type SaveFn = (r: { filename: string; data: Blob }) => Promise<{ status: string }>
type ClaudeHost = { use?: (name: string) => Promise<{ save: SaveFn } | null> }

/** Inside a claude.ai Artifact, page-started downloads are blocked; ask the viewer through its downloads capability. */
async function download(blob: Blob, name: string) {
  const host = (window as unknown as { claude?: ClaudeHost }).claude
  if (host?.use) {
    const dl = await host.use('downloads').catch(() => null)
    if (dl) {
      try {
        await dl.save({ filename: name, data: blob })
      } catch (e) {
        const code = (e as { code?: string }).code
        if (code !== 'declined') toast(code === 'rejected_extension' ? 'This file type cannot be saved here.' : 'Downloads are unavailable here.', 'error')
      }
      return
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

const DATA_URI = /data:([\w/+.-]+);base64,[A-Za-z0-9+/=]+/g

/** Collapse inlined base64 so the preview stays readable. */
function abbreviate(code: string) {
  return code.replace(DATA_URI, (m, mime) => `data:${mime};base64,…(${Math.round((m.length * 3) / 4 / 1024)} KB)`)
}

/**
 * Arc's CodeBlock copies exactly what it shows. When media is inlined the preview is
 * shortened, so its copy would be wrong; show a separate copy for the full source.
 */
function SourcePreview({ code, filename, language }: { code: string; filename: string; language: string }) {
  const short = abbreviate(code)
  if (short === code) return <CodeBlock code={code} filename={filename} language={language} maxLines={14} />
  return (
    <div className="source-preview">
      <div className="source-note">
        <span>Preview shortens inlined media. Copy the full source here:</span>
        <CopyButton value={code} label={`Copy full ${filename}`} />
      </div>
      <CodeBlock code={short} filename={`${filename} (preview)`} language={language} maxLines={14} />
    </div>
  )
}

function uniqueMedia(doc: BentoDoc) {
  const seen = new Map<string, MediaRef>()
  if (doc.background.kind === 'image') seen.set(doc.background.media.id, doc.background.media)
  for (const c of doc.cells) if (c.media) seen.set(c.media.id, c.media)
  return [...seen.values()]
}

/** Doc as exported: what the panel shows as removed or hidden doesn't export. */
function exportable(doc: BentoDoc): BentoDoc {
  return resolveVisibility(doc)
}

async function inlineHtml(doc: BentoDoc, size: Size) {
  const urls = new Map<string, string>()
  for (const m of uniqueMedia(doc)) {
    const b = await getBlob(m.id)
    if (b) urls.set(m.id, await blobToDataUrl(b))
  }
  return buildHtmlPage(doc, size, (m) => urls.get(m.id) ?? '')
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [v, setV] = useState<T | null>(null)
  useEffect(() => {
    let live = true
    setV(null)
    fn().then((r) => live && setV(r))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

/** Runs an async download and reports its pending state for Arc's button `loading`. */
function useBusy() {
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return [busy, run] as const
}

export function ExportDialog({
  open,
  onOpenChange,
  tab,
  onTab,
  doc: rawDoc,
  size,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  tab: ExportTab
  onTab: (t: ExportTab) => void
  doc: BentoDoc
  size: Size
}) {
  const doc = useMemo(() => exportable(rawDoc), [rawDoc])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Export"
        description={doc.sizeMode === 'fit' ? `Responsive, previewing at ${size.w}×${size.h}` : `${size.w}×${size.h}, ${doc.cells.length} ${doc.cells.length === 1 ? 'box' : 'boxes'}`}
        className="export-dialog"
      >
        <Tabs className="export-tabs" value={tab} onValueChange={(v) => onTab(v as ExportTab)}>
          <TabsList aria-label="Export format">
            <TabsTrigger value="html">
              <FileCode2 size={15} aria-hidden="true" /> HTML
            </TabsTrigger>
            <TabsTrigger value="react">
              <Code2 size={15} aria-hidden="true" /> React
            </TabsTrigger>
            <TabsTrigger value="embed">
              <Link2 size={15} aria-hidden="true" /> Embed
            </TabsTrigger>
            <TabsTrigger value="image">
              <ImageIcon size={15} aria-hidden="true" /> Image
            </TabsTrigger>
          </TabsList>
          <TabsContent value="html">
            <HtmlTab doc={doc} size={size} />
          </TabsContent>
          <TabsContent value="react">
            <ReactTab doc={doc} size={size} />
          </TabsContent>
          <TabsContent value="embed">
            <EmbedTab doc={doc} size={size} />
          </TabsContent>
          <TabsContent value="image">
            <ImageTab doc={doc} size={size} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function HtmlTab({ doc, size }: { doc: BentoDoc; size: Size }) {
  const html = useAsync(() => inlineHtml(doc, size), [doc, size.w, size.h])
  const [busy, run] = useBusy()
  const kb = html ? Math.max(1, Math.round(new Blob([html]).size / 1024)) : 0
  return (
    <div className="export-pane">
      <p className="export-lead">One self-contained file. Images and videos are inlined, so it works offline and anywhere you can put a file.</p>
      <div className="export-actions">
        <Button loading={busy || !html} onClick={() => run(async () => {
          if (html) await download(new Blob([html], { type: 'text/html' }), 'bento.html')
        })}>
          Download bento.html
        </Button>
        {html && <span className="export-meta">{kb.toLocaleString()} KB</span>}
      </div>
      {html && <SourcePreview code={html} filename="bento.html" language="html" />}
    </div>
  )
}

function ReactTab({ doc, size }: { doc: BentoDoc; size: Size }) {
  const [lang, setLang] = useState<'tsx' | 'jsx'>('tsx')
  const [busy, run] = useBusy()
  const files = useMemo(() => {
    const m = new Map<string, string>()
    uniqueMedia(doc).forEach((r, i) => m.set(r.id, `media-${i + 1}.${extFor(r.mime)}`))
    return m
  }, [doc])
  const component = buildReactComponent(doc, files, lang === 'tsx')
  const css = buildCss(doc, size)
  const name = `Bento.${lang}`

  const onZip = async () => {
    const zip = new JSZip()
    const dir = zip.folder('Bento')!
    dir.file(name, component)
    dir.file('Bento.css', css + '\n')
    for (const [id, file] of files) {
      const b = await getBlob(id)
      if (b) dir.folder('media')!.file(file, b)
    }
    dir.file(
      'README.md',
      `# Bento\n\nGenerated by Bento Creator.\n\n\`\`\`${lang}\nimport Bento from './Bento/Bento'\n\nexport default function Page() {\n  return <Bento />\n}\n\`\`\`\n\n` +
        (doc.sizeMode === 'fit'
          ? 'The bento fills its parent, so give the parent a width and height (for example `100vw` by `100vh`).\n'
          : `Designed at ${size.w}×${size.h}. It scales to the width of its parent and keeps the aspect ratio.\n`) +
        '\nMedia is imported from `./media`, which works with Vite, Next.js and most bundlers.\n',
    )
    await download(await zip.generateAsync({ type: 'blob' }), 'bento-react.zip')
  }

  return (
    <div className="export-pane">
      <p className="export-lead">A dependency-free React component, its stylesheet and a media folder, zipped and ready to drop into a project.</p>
      <Group label="Language">
        <SegmentedControl
          label="Language"
          value={lang}
          onValueChange={(v) => setLang(v as 'tsx' | 'jsx')}
          options={[
            { value: 'tsx', label: 'TypeScript' },
            { value: 'jsx', label: 'JavaScript' },
          ]}
        />
      </Group>
      <div className="export-actions">
        <Button loading={busy} onClick={() => run(onZip)}>
          Download bento-react.zip
        </Button>
        <span className="export-meta">
          {name}, Bento.css, README.md and {files.size} media {files.size === 1 ? 'file' : 'files'}
        </span>
      </div>
      <CodeBlock code={component} filename={name} language={lang} maxLines={14} />
      <CodeBlock code={css} filename="Bento.css" language="css" maxLines={10} />
    </div>
  )
}

function EmbedTab({ doc, size }: { doc: BentoDoc; size: Size }) {
  const [inline, setInline] = useState(false)
  const [url, setUrl] = useState('https://example.com/bento.html')
  const [busy, run] = useBusy()
  const html = useAsync(() => (inline ? inlineHtml(doc, size) : Promise.resolve('')), [inline, doc, size.w, size.h])
  const snippet = inline ? (html ? buildEmbed(doc, size, { srcdoc: html }) : '') : buildEmbed(doc, size, { src: url })
  const media = uniqueMedia(doc).length
  return (
    <div className="export-pane">
      <p className="export-lead">
        Paste an iframe into any site builder or CMS. Host the HTML export and point the snippet at it, or put everything inside the snippet.
      </p>
      <div className="export-option">
        <Switch label="Self-contained snippet" checked={inline} onCheckedChange={setInline} />
        <span className="export-meta">
          No hosting needed, but the snippet carries {media === 1 ? 'the media file' : `all ${media} media files`}, so it can get large.
        </span>
      </div>
      {!inline && (
        <>
          <Input label="Where you'll host bento.html" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="export-actions">
            <Button variant="secondary" loading={busy} onClick={() => run(async () => download(new Blob([await inlineHtml(doc, size)], { type: 'text/html' }), 'bento.html'))}>
              Download bento.html to host
            </Button>
          </div>
        </>
      )}
      {snippet ? <SourcePreview code={snippet} filename="embed.html" language="html" /> : <p className="export-meta">Preparing the snippet…</p>}
    </div>
  )
}

function ImageTab({ doc, size }: { doc: BentoDoc; size: Size }) {
  const [format, setFormat] = useState<ImageFormat>('png')
  const [scale, setScale] = useState(1)
  const [quality, setQuality] = useState(0.92)
  const [busy, run] = useBusy()
  const preview = useAsync(async () => (await renderToCanvas(doc, size, Math.min(1, 640 / size.w))).toDataURL(), [doc, size.w, size.h])
  const hasVideo = doc.cells.some((c) => c.media?.kind === 'video')

  return (
    <div className="export-pane">
      <div className="image-preview" style={{ aspectRatio: `${size.w}/${size.h}` }}>
        {preview ? <img src={preview} alt="Preview of the exported image" /> : <span className="export-meta">Rendering the preview…</span>}
      </div>
      <Group label="Format">
        <SegmentedControl
          label="Format"
          value={format}
          onValueChange={(v) => setFormat(v as ImageFormat)}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPEG' },
            { value: 'webp', label: 'WebP' },
          ]}
        />
      </Group>
      <Group label={`Scale (${Math.round(size.w * scale)}×${Math.round(size.h * scale)})`}>
        <SegmentedControl
          label="Scale"
          value={String(scale)}
          onValueChange={(v) => setScale(Number(v))}
          options={[
            { value: '0.5', label: '0.5×' },
            { value: '1', label: '1×' },
            { value: '2', label: '2×' },
            { value: '3', label: '3×' },
          ]}
        />
      </Group>
      {format !== 'png' && (
        <Slider label="Quality" value={quality} min={0.3} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onValueChange={(v) => setQuality(v as number)} />
      )}
      <div className="export-actions">
        <Button
          loading={busy}
          onClick={() =>
            run(async () => download(await renderImage(doc, size, { format, scale, quality }), `bento.${format === 'jpeg' ? 'jpg' : format}`))
          }
        >
          Download {format === 'jpeg' ? 'JPEG' : format === 'webp' ? 'WebP' : 'PNG'}
        </Button>
        {hasVideo && <span className="export-meta">Videos are captured at the frame showing now.</span>}
      </div>
    </div>
  )
}
