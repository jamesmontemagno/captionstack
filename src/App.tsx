import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  addCue,
  analyzeCuesAsync,
  applyAllFixes,
  applyFix,
  formats,
  getFormat,
  hasBlockingErrors,
  loadCaptionsAsync,
  mergeCue,
  moveCue,
  removeCue,
  serializeCaptionsAsync,
  splitCue,
  updateCue,
  validateCues,
  type CaptionSource,
  type CueError,
  type EditableCue,
  type FormatId,
  type QualityFinding,
  type QualityReport as QualityReportData,
  type SerializedCaptions,
} from './converter'
import CaptionEditor, { EDITOR_PAGE_SIZE } from './CaptionEditor'
import QualityReport from './QualityReport'
import BatchPanel from './BatchPanel'
import { buildBatchZip, cleanBaseName, MAX_FILE_SIZE, useBatch, zipFileName } from './batch'
import LandingContent from './LandingContent'
import { FORMAT_INFO } from './seo/formatInfo'
import { matchRoute, routePath, type Route } from './seo/routes'
import './App.css'

const MAX_HISTORY = 50
const ACCEPTED_EXTENSIONS = formats.map((format) => format.extension).concat('.xml').join(',')
const DEMO_CAPTIONS = `WEBVTT

00:00:01.000 --> 00:00:04.200
Caption files, meet your new converter.

00:00:04.600 --> 00:00:08.300
Everything happens privately in your browser.

00:00:08.700 --> 00:00:12.000
Choose a format, then download.`

function BrandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="4" width="14" height="10" rx="2" />
      <path d="M9 8h8M9 11h5" />
      <path d="M6 9H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1" />
    </svg>
  )
}

function Icon({ name, size = 20 }: { name: 'upload' | 'file' | 'arrow' | 'download' | 'shield' | 'moon' | 'sun' | 'check' | 'reset' | 'spinner'; size?: number }) {
  const paths = {
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></>,
    file: <><path d="M6 2.75h7l5 5V21.25H6z" /><path d="M13 2.75v5h5M9 13h6M9 17h6" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    download: <><path d="M12 4v12m0 0 4-4m-4 4-4-4" /><path d="M5 20h14" /></>,
    shield: <><path d="M12 3l7 3v5c0 4.5-2.7 8.2-7 10-4.3-1.8-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
    moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z" />,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
    check: <path d="M5 12.5l4 4L19 6.5" />,
    reset: <><path d="M4 8V4m0 0h4M4 4l4 4" /><path d="M5.5 16.5A8 8 0 1 0 4 8" /></>,
    spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function durationLabel(milliseconds: number): string {
  const totalSeconds = Math.ceil(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`
}

interface LoadedFile {
  name: string
  size: number
  sourceFormat: FormatId
  cues: EditableCue[]
  /** Previous cue lists, oldest first, so automatic fixes and structural edits can be undone. */
  history: EditableCue[][]
  /** True while consecutive keystroke edits are sharing the most recent history entry. */
  coalescing: boolean
}

function heroCopy(route: Route): { eyebrow: string; title: ReactNode; description: string } {
  switch (route.kind) {
    case 'home':
      return {
        eyebrow: 'CAPTION CONVERTER',
        title: <>Your captions.<br /><em>Any format.</em></>,
        description: 'Convert subtitle files in seconds. No uploads, no accounts, and nothing leaves your browser.',
      }
    case 'format': {
      const info = FORMAT_INFO[route.format]
      return {
        eyebrow: `${route.format.toUpperCase()} CONVERTER`,
        title: <>{info.name} files.<br /><em>Any format.</em></>,
        description: `Convert ${info.extension} captions to SRT, VTT, TTML, and more — or convert anything to ${info.extension}. Free, private, and in your browser.`,
      }
    }
    case 'convert': {
      const from = FORMAT_INFO[route.from]
      const to = FORMAT_INFO[route.to]
      return {
        eyebrow: `${route.from.toUpperCase()} TO ${route.to.toUpperCase()}`,
        title: <>{route.from.toUpperCase()} to <em>{route.to.toUpperCase()}</em>.</>,
        description: `Convert ${from.name} (${from.extension}) subtitles to ${to.name} (${to.extension}) in seconds. No upload, no sign-up, nothing leaves your browser.`,
      }
    }
  }
}

interface AppProps {
  /** The path being rendered. Passed explicitly so server and client agree during hydration. */
  pathname?: string
}

function App({ pathname = '/' }: AppProps) {
  const route = useMemo(() => matchRoute(pathname), [pathname])
  const hero = heroCopy(route)
  const preferredFormat: FormatId | null = route.kind === 'convert' ? route.to : null
  const inputRef = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [outputFormat, setOutputFormat] = useState<FormatId>(preferredFormat ?? 'srt')
  const [outputName, setOutputName] = useState('')
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editorPage, setEditorPage] = useState(0)
  const [theme, setTheme] = useState('light')
  const [loadingName, setLoadingName] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  // Monotonic counters so a slow worker reply for a superseded request is ignored.
  const loadRequest = useRef(0)
  const serializeRequest = useRef(0)

  useEffect(() => {
    // Sync to the theme the inline head script picked before hydration. Both server and
    // client render 'light' first so the hydrated markup matches, then we reflect reality.
    const activeTheme = document.documentElement.dataset.theme
    if (activeTheme && activeTheme !== theme) setTheme(activeTheme)
  }, [theme])

  const loadSource = useCallback(async (source: CaptionSource, name: string, size: number) => {
    const requestId = (loadRequest.current += 1)
    setLoadingName(name)
    setError('')
    try {
      const parsed = await loadCaptionsAsync(source)
      if (requestId !== loadRequest.current) return
      // On a "X to Y" landing page keep Y selected; otherwise pick the first format that differs.
      const nextFormat = preferredFormat && preferredFormat !== parsed.format
        ? preferredFormat
        : formats.find((format) => format.id !== parsed.format)?.id ?? 'srt'
      setLoaded({ name, size, sourceFormat: parsed.format, cues: parsed.cues, history: [], coalescing: false })
      setOutputFormat(nextFormat)
      setOutputName(cleanBaseName(name))
      setIsEditing(false)
      setEditorPage(0)
    } catch (caught) {
      if (requestId !== loadRequest.current) return
      setLoaded(null)
      setError(caught instanceof Error ? caught.message : 'This file could not be read.')
    } finally {
      if (requestId === loadRequest.current) setLoadingName(null)
    }
  }, [preferredFormat])

  const processFile = useCallback((file?: File) => {
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      setError('Please choose a caption file smaller than 10 MB.')
      return
    }
    void loadSource(file, file.name, file.size)
  }, [loadSource])

  const batch = useBatch()
  const isBatch = batch.items.length > 0
  const [isZipping, setIsZipping] = useState(false)

  // One file takes the single-file path with editing; two or more become a batch.
  const { addFiles } = batch
  const handleFiles = useCallback((list: FileList | File[] | null | undefined) => {
    const files = list ? Array.from(list) : []
    if (files.length === 0) return
    if (isBatch || files.length > 1) {
      // Entering batch mode supersedes any single-file load still in flight.
      loadRequest.current += 1
      setLoadingName(null)
      setLoaded(null)
      setError('')
      addFiles(files)
      return
    }
    processFile(files[0])
  }, [addFiles, isBatch, processFile])

  const handleBatchDownload = async () => {
    if (batch.readyCount === 0 || isZipping) return
    setIsZipping(true)
    try {
      const blob = await buildBatchZip(batch.items, outputFormat)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = zipFileName(outputFormat, batch.readyCount)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The ZIP archive could not be prepared.')
    } finally {
      setIsZipping(false)
    }
  }

  const loadDemo = useCallback(() => {
    void loadSource({ content: DEMO_CAPTIONS, filename: 'captionstack-demo.vtt' }, 'captionstack-demo.vtt', new Blob([DEMO_CAPTIONS]).size)
  }, [loadSource])

  // Inline validation stays on the main thread: it is cheap and the editor needs it synchronously
  // to highlight fields as the user types.
  const cueErrors = useMemo<Map<string, CueError>>(
    () => (loaded ? validateCues(loaded.cues) : new Map()),
    [loaded],
  )
  const hasCueErrors = hasBlockingErrors(cueErrors)

  // Cues that have been edited into an unparseable state can't be converted yet; if the
  // user gets there, open the editor so the highlighted fields are actually visible.
  useEffect(() => {
    if (hasCueErrors) setIsEditing(true)
  }, [hasCueErrors])

  // Serialization and quality analysis run in the worker. A short delay batches rapid edits
  // (keystrokes, quick format clicks) into one trip, and a request counter discards stale replies.
  const [serialized, setSerialized] = useState<SerializedCaptions | null>(null)
  const [report, setReport] = useState<QualityReportData | null>(null)
  const cues = loaded?.cues ?? null

  useEffect(() => {
    const requestId = (serializeRequest.current += 1)
    if (!cues) {
      setSerialized(null)
      setReport(null)
      return
    }
    const timer = window.setTimeout(() => {
      analyzeCuesAsync(cues)
        .then((result) => { if (requestId === serializeRequest.current) setReport(result) })
        .catch(() => { if (requestId === serializeRequest.current) setReport(null) })
      if (hasCueErrors) {
        setSerialized(null)
        return
      }
      serializeCaptionsAsync(cues, outputFormat)
        .then((result) => { if (requestId === serializeRequest.current) setSerialized(result) })
        .catch(() => { if (requestId === serializeRequest.current) setSerialized(null) })
    }, 60)
    return () => window.clearTimeout(timer)
  }, [cues, hasCueErrors, outputFormat])

  const mutateCues = useCallback(
    (transform: (cues: EditableCue[]) => EditableCue[], options: { coalesce?: boolean } = {}) => {
      setLoaded((current) => {
        if (!current) return current
        const cues = transform(current.cues)
        if (cues === current.cues) return current
        // Keystroke-level edits coalesce into one history entry: the first keystroke after a
        // fix or structural change takes a snapshot, later ones reuse it. Undo therefore never
        // drops typing silently, and the history isn't flooded by individual characters.
        const shouldSnapshot = !options.coalesce || !current.coalescing
        const history = shouldSnapshot ? [...current.history, current.cues].slice(-MAX_HISTORY) : current.history
        return { ...current, cues, history, coalescing: Boolean(options.coalesce) }
      })
    },
    [],
  )

  const undo = useCallback(() => {
    setLoaded((current) => {
      if (!current || current.history.length === 0) return current
      const history = current.history.slice(0, -1)
      return { ...current, cues: current.history[current.history.length - 1], history, coalescing: false }
    })
  }, [])

  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

  const jumpToCue = useCallback((finding: QualityFinding) => {
    // Resolve the position from the live cue list: the report may lag behind recent edits.
    const index = loaded?.cues.findIndex((cue) => cue.id === finding.cueId) ?? -1
    if (index === -1) return
    setIsEditing(true)
    setEditorPage(Math.floor(index / EDITOR_PAGE_SIZE))
    setPendingFocus(finding.cueId)
  }, [loaded])

  useEffect(() => {
    if (!pendingFocus) return
    const element = document.getElementById(`editor-cue-${pendingFocus}`)
    if (!element) return
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const target = element.querySelector<HTMLElement>('[aria-invalid="true"], .is-warning, textarea')
    target?.focus({ preventScroll: true })
    setPendingFocus(null)
  }, [pendingFocus, isEditing, editorPage])

  const handleDownload = async () => {
    if (!cues || hasCueErrors || isDownloading) return
    const format = getFormat(outputFormat)
    setIsDownloading(true)
    try {
      // Serialize fresh so the download always reflects the latest edits, even mid-debounce.
      const { output } = await serializeCaptionsAsync(cues, outputFormat)
      const blob = new Blob([output], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${cleanBaseName(outputName.trim()) || 'captions'}${format.extension}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The converted file could not be prepared.')
    } finally {
      setIsDownloading(false)
    }
  }

  const reset = () => {
    loadRequest.current += 1
    setLoaded(null)
    setLoadingName(null)
    setError('')
    setOutputName('')
    setIsEditing(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = nextTheme
    setTheme(nextTheme)
  }

  const duration = serialized?.duration ?? 0
  const cueCount = loaded ? loaded.cues.length : 0
  const canPickFormat = Boolean(loaded) || batch.readyCount > 0
  const batchSourceFormats = [...new Set(batch.items.flatMap((item) => (item.sourceFormat ? [item.sourceFormat] : [])))]
  const batchSourceLabel = batchSourceFormats.length === 0 ? '…' : batchSourceFormats.length === 1 ? batchSourceFormats[0].toUpperCase() : 'MIXED'

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="CaptionStack home">
          <span className="brand-mark"><BrandIcon /></span>
          <span>CaptionStack</span>
        </a>
        <div className="header-actions">
          <span className="privacy-badge"><Icon name="shield" size={17} />Private by design</span>
          <button className="icon-button" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} />
          </button>
        </div>
      </header>

      <main>
        <section className="hero-copy" aria-labelledby="page-title">
          <p className="eyebrow">{hero.eyebrow}</p>
          <h1 id="page-title">{hero.title}</h1>
          <p className="hero-description">{hero.description}</p>
          <div className="format-strip" aria-label="Supported formats">
            {formats.map((format) => (
              <a key={format.id} href={routePath({ kind: 'format', format: format.id })} aria-current={route.kind === 'format' && route.format === format.id ? 'page' : undefined}>
                {format.id.toUpperCase()}
              </a>
            ))}
          </div>
        </section>

        <section className="converter-card" aria-label="Caption converter">
          <div className="step-heading">
            <span className="step-number">{loaded || batch.readyCount > 0 ? <Icon name="check" size={17} /> : '1'}</span>
            <div>
              <h2>{isBatch ? 'Choose your caption files' : 'Choose your caption file'}</h2>
              <p>{isBatch ? `${batch.items.length} ${batch.items.length === 1 ? 'file' : 'files'} · each format is detected separately.` : 'We’ll detect the format automatically. Drop several files to convert them all at once.'}</p>
            </div>
          </div>

          {isBatch ? (
            <>
              <BatchPanel
                items={batch.items}
                isDragging={isDragging}
                onAddMore={() => inputRef.current?.click()}
                onRemove={batch.removeItem}
                onClear={() => { batch.clear(); setError(''); if (inputRef.current) inputRef.current.value = '' }}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(files) => { setIsDragging(false); handleFiles(files) }}
              />
              <input
                ref={inputRef}
                className="visually-hidden"
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS}
                onChange={(event) => { handleFiles(event.target.files); event.target.value = '' }}
              />
            </>
          ) : !loaded ? (
            <>
              <button
                className={`drop-zone${isDragging ? ' is-dragging' : ''}${loadingName ? ' is-loading' : ''}`}
                type="button"
                disabled={Boolean(loadingName)}
                aria-busy={Boolean(loadingName)}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { event.preventDefault(); setIsDragging(false) }}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragging(false)
                  handleFiles(event.dataTransfer.files)
                }}
              >
                {loadingName ? (
                  <>
                    <span className="upload-icon is-spinning" aria-hidden="true"><Icon name="spinner" size={28} /></span>
                    <strong>Reading {loadingName}…</strong>
                    <span role="status">Detecting the format and parsing cues in the background.</span>
                  </>
                ) : (
                  <>
                    <span className="upload-icon"><Icon name="upload" size={28} /></span>
                    <strong>Drop your files here</strong>
                    <span>or click to browse from your device</span>
                    <small>Up to 10 MB each · SRT, VTT, SBV, LRC, TTML, JSON, CSV, TXT · multiple files become a ZIP</small>
                  </>
                )}
              </button>
              <input
                ref={inputRef}
                className="visually-hidden"
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS}
                onChange={(event) => { handleFiles(event.target.files); event.target.value = '' }}
              />
              <div className="demo-row">
                <span>Don’t have a file handy?</span>
                <button type="button" disabled={Boolean(loadingName)} onClick={loadDemo}>Try a sample file</button>
              </div>
            </>
          ) : (
            <div className="loaded-file">
              <span className="file-icon"><Icon name="file" size={23} /></span>
              <div className="file-primary"><strong>{loaded.name}</strong><span>{readableBytes(loaded.size)} · {cueCount} cues</span></div>
              <span className="detected-format">{loaded.sourceFormat.toUpperCase()}</span>
              <button className="text-button" type="button" onClick={reset}><Icon name="reset" size={16} />Replace</button>
            </div>
          )}

          {error && <div className="error-message" role="alert">{error}</div>}

          {loaded && (
            <div className="edit-area">
              <div className="step-heading">
                <span className="step-number">2</span>
                <div><h2>Review and edit your cues</h2><p>Fix timings and text before you export. Nothing leaves your browser.</p></div>
                <button
                  className="text-button edit-toggle"
                  type="button"
                  aria-expanded={isEditing}
                  onClick={() => setIsEditing((editing) => !editing)}
                >
                  {isEditing ? 'Hide editor' : 'Edit cues'}
                </button>
              </div>
              {report ? (
                <QualityReport
                  report={report}
                  canUndo={loaded.history.length > 0}
                  onFix={(finding) => finding.fix && mutateCues((cues) => applyFix(cues, finding.fix!))}
                  onFixAll={() => mutateCues((cues) => applyAllFixes(cues).cues)}
                  onUndo={undo}
                  onJump={jumpToCue}
                />
              ) : (
                <div className="quality-report is-pending" role="status" aria-live="polite">
                  <div className="quality-summary">
                    <span className="upload-icon is-spinning quality-pending-icon" aria-hidden="true"><Icon name="spinner" size={16} /></span>
                    <div className="quality-summary-text"><strong>Checking caption quality…</strong><span>Running checks in the background.</span></div>
                  </div>
                </div>
              )}
              {hasCueErrors && (
                <div className="error-message" role="alert">
                  Fix the highlighted cues before exporting. Cues with invalid times can’t be downloaded.
                </div>
              )}
              {isEditing && (
                <CaptionEditor
                  cues={loaded.cues}
                  errors={cueErrors}
                  page={editorPage}
                  onPageChange={setEditorPage}
                  onUpdate={(index, changes) => mutateCues((cues) => updateCue(cues, index, changes), { coalesce: true })}
                  onAdd={(index) => mutateCues((cues) => addCue(cues, index))}
                  onRemove={(index) => mutateCues((cues) => removeCue(cues, index))}
                  onMove={(index, direction) => mutateCues((cues) => moveCue(cues, index, direction))}
                  onSplit={(index) => mutateCues((cues) => splitCue(cues, index))}
                  onMerge={(index) => mutateCues((cues) => mergeCue(cues, index))}
                />
              )}
            </div>
          )}

          <div className={`conversion-area${canPickFormat ? '' : ' is-disabled'}`} aria-disabled={!canPickFormat}>
            <div className="step-heading">
              <span className="step-number">{loaded && !isBatch ? 3 : 2}</span>
              <div><h2>Choose an output format</h2><p>{isBatch ? 'Every file in the batch converts to this format.' : 'Select what you need on the other side.'}</p></div>
            </div>
            <div className="format-grid">
              {formats.map((format) => (
                <button
                  className={`format-option${outputFormat === format.id ? ' is-selected' : ''}`}
                  key={format.id}
                  type="button"
                  disabled={!canPickFormat}
                  onClick={() => setOutputFormat(format.id)}
                  aria-pressed={outputFormat === format.id}
                >
                  <span className="format-extension">.{format.id}</span>
                  <span><strong>{format.name}</strong><small>{format.description}</small></span>
                  <span className="radio-mark" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          {isBatch && (
            <div className="result-area">
              <div className="flow-summary">
                <div><span>FROM</span><strong>{batchSourceLabel}</strong></div>
                <Icon name="arrow" size={22} />
                <div><span>TO</span><strong>{outputFormat.toUpperCase()}</strong></div>
                <div className="stats">
                  <span><strong>{batch.readyCount}</strong> ready</span>
                  <span><strong>{batch.items.filter((item) => item.status === 'reading').length}</strong> reading</span>
                  <span><strong>{batch.errorCount}</strong> failed</span>
                </div>
              </div>
              {batch.errorCount > 0 && (
                <p className="batch-note" role="status">
                  {batch.errorCount === 1 ? 'One file' : `${batch.errorCount} files`} couldn’t be converted and will be left out of the archive. The other files are unaffected.
                </p>
              )}
              <div className="download-row">
                <label htmlFor="zip-name">Archive</label>
                <div className="filename-input is-readonly">
                  <input id="zip-name" value={zipFileName(outputFormat, batch.readyCount)} readOnly aria-describedby="zip-name-hint" />
                  <span id="zip-name-hint">{batch.readyCount} {batch.readyCount === 1 ? 'file' : 'files'}</span>
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleBatchDownload()}
                  disabled={batch.readyCount === 0 || batch.isReading || isZipping}
                  aria-busy={isZipping}
                >
                  <Icon name="download" size={20} />
                  {isZipping ? 'Preparing ZIP…' : batch.isReading ? 'Reading files…' : `Download ${batch.readyCount} ${batch.readyCount === 1 ? 'file' : 'files'} as ZIP`}
                </button>
              </div>
            </div>
          )}

          {loaded && (
            <div className="result-area">
              <div className="flow-summary">
                <div><span>FROM</span><strong>{loaded.sourceFormat.toUpperCase()}</strong></div>
                <Icon name="arrow" size={22} />
                <div><span>TO</span><strong>{outputFormat.toUpperCase()}</strong></div>
                <div className="stats">
                  <span><strong>{cueCount}</strong> cues</span>
                  <span><strong>{serialized ? durationLabel(duration) : '…'}</strong> runtime</span>
                  <span><strong>{serialized ? readableBytes(new Blob([serialized.output]).size) : '…'}</strong> output</span>
                </div>
              </div>

              <div className="preview">
                <div className="preview-heading"><h3>Caption preview</h3><span>First {Math.min(3, cueCount)} cues</span></div>
                {loaded.cues.slice(0, 3).map((cue, index) => (
                  <div className="cue-row" key={cue.id}>
                    <span>{index + 1}</span>
                    <time>{cue.start} → {cue.end}</time>
                    <p>{cue.text}</p>
                  </div>
                ))}
              </div>

              <div className="download-row">
                <label htmlFor="output-name">File name</label>
                <div className="filename-input">
                  <input id="output-name" value={outputName} onChange={(event) => setOutputName(event.target.value)} />
                  <span>{getFormat(outputFormat).extension}</span>
                </div>
                <button className="primary-button" type="button" onClick={() => void handleDownload()} disabled={hasCueErrors || isDownloading} aria-busy={isDownloading}>
                  <Icon name="download" size={20} />{isDownloading ? 'Preparing file…' : 'Download converted file'}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="trust-row" aria-label="Privacy and compatibility details">
          <div><Icon name="shield" size={22} /><span><strong>100% private</strong>Your files never leave this device.</span></div>
          <div><Icon name="file" size={22} /><span><strong>8 formats</strong>Built for the caption formats you use.</span></div>
          <div><Icon name="download" size={22} /><span><strong>No limits</strong>Convert as often as you need.</span></div>
        </section>

        <LandingContent route={route} />
      </main>

      <footer>
        <span>CaptionStack</span>
        <p>Fast, private caption tools in your browser.</p>
        <a href="https://github.com/jamesmontemagno/captionstack" target="_blank" rel="noreferrer">
          View on GitHub
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.6v-2.2c-3.4.7-4.1-1.4-4.1-1.4-.5-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.3.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.4 3.6 1.1.1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.4-5.5-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.2 1.2A11 11 0 0 1 12 6c1 0 2 .1 2.9.4 2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.9.1 3.2.8.8 1.2 1.8 1.2 3.1 0 4.4-2.8 5.4-5.5 5.7.5.4.9 1.2.9 2.3v3c0 .4.2.7.8.6A11.5 11.5 0 0 0 12 .7Z" />
          </svg>
        </a>
      </footer>
    </div>
  )
}

export default App
