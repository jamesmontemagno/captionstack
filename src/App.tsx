import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  addCue,
  analyzeCues,
  analyzeCuesAsync,
  applyAllFixes,
  applyFix,
  applySpeakerStyle,
  detectSpeakers,
  formats,
  formatTimestamp,
  getFormat,
  hasBlockingErrors,
  isFormatId,
  loadCaptionsAsync,
  mergeCue,
  moveCue,
  parseTimestamp,
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
import TimingPanel from './TimingPanel'
import FindReplacePanel from './FindReplacePanel'
import MediaPreview, { type MediaControls } from './MediaPreview'
import OriginalPane from './OriginalPane'
import OutputPane from './OutputPane'
import BatchPanel from './BatchPanel'
import { buildBatchZip, cleanBaseName, MAX_FILE_SIZE, useBatch, zipFileName } from './batch'
import LandingContent from './LandingContent'
import { FORMAT_INFO } from './seo/formatInfo'
import { matchRoute, routePath, type Route } from './seo/routes'
import { copyText, readPreference, STORAGE_KEYS, writePreference } from './preferences'
import { deleteSavedCaption, listSavedCaptions, saveCaption, type SavedCaption } from './savedCaptions'
import './App.css'

const MAX_HISTORY = 50
const PASTED_NAME = 'pasted-captions'

function createSavedId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `saved-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function readSavedFormat(): FormatId | null {
  const saved = readPreference(STORAGE_KEYS.outputFormat)
  return saved && isFormatId(saved) ? saved : null
}
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

function Icon({ name, size = 20 }: { name: 'upload' | 'file' | 'arrow' | 'download' | 'save' | 'shield' | 'moon' | 'sun' | 'check' | 'reset' | 'spinner' | 'edit' | 'clock' | 'copy' | 'search' | 'media'; size?: number }) {
  const paths = {
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></>,
    file: <><path d="M6 2.75h7l5 5V21.25H6z" /><path d="M13 2.75v5h5M9 13h6M9 17h6" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    download: <><path d="M12 4v12m0 0 4-4m-4 4-4-4" /><path d="M5 20h14" /></>,
    save: <><path d="M5 4h12l2 2v14H5z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></>,
    shield: <><path d="M12 3l7 3v5c0 4.5-2.7 8.2-7 10-4.3-1.8-7-5.5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
    moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z" />,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
    check: <path d="M5 12.5l4 4L19 6.5" />,
    reset: <><path d="M4 8V4m0 0h4M4 4l4 4" /><path d="M5.5 16.5A8 8 0 1 0 4 8" /></>,
    spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
    edit: <><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M13.5 6.5l3 3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
    media: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5v5l4.5-2.5z" /></>,
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
  savedId?: string
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
  const [activeTool, setActiveTool] = useState<'timing' | 'replace' | 'media' | null>(null)
  const [rightPane, setRightPane] = useState<'output' | 'media' | 'original'>('output')
  const [mobilePane, setMobilePane] = useState<'cues' | 'output'>('cues')
  const [originalFile, setOriginalFile] = useState<{ name: string; size: number; content: string } | null>(null)
  const [activeCueId, setActiveCueId] = useState<string | null>(null)
  // Mirrors the CSS breakpoint that stacks the panes, so hidden media can be paused.
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 960px)')
    const update = () => setIsNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const [editorPage, setEditorPage] = useState(0)
  const [theme, setTheme] = useState('light')
  const [loadingName, setLoadingName] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedCaptions, setSavedCaptions] = useState<SavedCaption[]>([])
  const [isSavedPickerOpen, setIsSavedPickerOpen] = useState(false)
  // Monotonic counters so a slow worker reply for a superseded request is ignored.
  const loadRequest = useRef(0)
  const serializeRequest = useRef(0)

  useEffect(() => {
    // Sync to the theme the inline head script picked before hydration. Both server and
    // client render 'light' first so the hydrated markup matches, then we reflect reality.
    const activeTheme = document.documentElement.dataset.theme
    if ((activeTheme === 'dark' || activeTheme === 'light') && activeTheme !== theme) setTheme(activeTheme)
  }, [theme])

  useEffect(() => {
    void listSavedCaptions().then(setSavedCaptions).catch(() => setSavedCaptions([]))
  }, [])

  useEffect(() => {
    if (!isSavedPickerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSavedPickerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isSavedPickerOpen])

  // Remembered output format: applied once after hydration unless the page dictates a target.
  const formatRestored = useRef(false)
  useEffect(() => {
    if (formatRestored.current) return
    formatRestored.current = true
    if (preferredFormat) return
    const saved = readSavedFormat()
    if (saved) setOutputFormat(saved)
  }, [preferredFormat])

  const chooseOutputFormat = useCallback((format: FormatId) => {
    setOutputFormat(format)
    writePreference(STORAGE_KEYS.outputFormat, format)
  }, [])

  const loadSource = useCallback(async (source: CaptionSource, name: string, size: number) => {
    const requestId = (loadRequest.current += 1)
    setLoadingName(name)
    setError('')
    try {
      const parsed = await loadCaptionsAsync(source)
      if (requestId !== loadRequest.current) return
      // Target priority: the landing page's format, then the remembered choice, then the first
      // format that differs from the source. A target equal to the source is skipped.
      const saved = readSavedFormat()
      const candidates: Array<FormatId | null> = [preferredFormat, saved]
      const nextFormat = candidates.find((candidate) => candidate && candidate !== parsed.format)
        ?? formats.find((format) => format.id !== parsed.format)?.id
        ?? 'srt'
      setLoaded({ name, size, sourceFormat: parsed.format, cues: parsed.cues, history: [], coalescing: false })
      setOutputFormat(nextFormat)
      setOutputName(cleanBaseName(name))
      setIsEditing(false)
      setActiveTool(null)
      setEditorPage(0)
      setMobilePane('cues')
      setActiveCueId(null)
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
      setOriginalFile(null)
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

  const [isPasting, setIsPasting] = useState(false)
  const [pastedText, setPastedText] = useState('')

  // No extension on the pseudo-filename so the format is detected from the content itself.
  const loadPastedText = useCallback((text: string) => {
    if (!text.trim()) return
    const size = new Blob([text]).size
    if (size > MAX_FILE_SIZE) {
      setError('Please paste caption text smaller than 10 MB.')
      return
    }
    setIsPasting(false)
    setPastedText('')
    void loadSource({ content: text, filename: PASTED_NAME }, PASTED_NAME, size)
  }, [loadSource])

  // Ctrl/Cmd+V anywhere on an empty converter pastes text or clipboard files straight in.
  useEffect(() => {
    if (loaded || isBatch) return
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.closest('input, textarea, [contenteditable]'))) return
      const files = event.clipboardData?.files
      if (files && files.length > 0) {
        event.preventDefault()
        handleFiles(files)
        return
      }
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (text.trim()) {
        event.preventDefault()
        loadPastedText(text)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [loaded, isBatch, handleFiles, loadPastedText])

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

  const jumpToCueId = useCallback((cueId: string) => {
    // Resolve the position from the live cue list: reports may lag behind recent edits.
    const index = loaded?.cues.findIndex((cue) => cue.id === cueId) ?? -1
    if (index === -1) return
    setIsEditing(true)
    setMobilePane('cues')
    setActiveCueId(cueId)
    setEditorPage(Math.floor(index / EDITOR_PAGE_SIZE))
    setPendingFocus(cueId)
  }, [loaded])

  const jumpToCue = useCallback((finding: QualityFinding) => jumpToCueId(finding.cueId), [jumpToCueId])

  // The rendered report can lag the cue list, so a fix is re-derived from the live cues at click
  // time: if the finding no longer holds (the user already fixed it), nothing is applied.
  const applyFinding = useCallback((finding: QualityFinding) => {
    mutateCues((list) => {
      const live = analyzeCues(list).findings.find((candidate) => candidate.id === finding.id)
      return live?.fix ? applyFix(list, live.fix) : list
    })
  }, [mutateCues])

  const editorRange = useMemo(() => {
    const total = loaded?.cues.length ?? 0
    const pageCount = Math.max(1, Math.ceil(total / EDITOR_PAGE_SIZE))
    const page = Math.min(editorPage, pageCount - 1)
    const start = page * EDITOR_PAGE_SIZE
    return { start, end: Math.min(total, start + EDITOR_PAGE_SIZE), pageCount }
  }, [loaded, editorPage])

  const speakers = useMemo(() => (loaded ? detectSpeakers(loaded.cues) : null), [loaded])

  const findingsByCue = useMemo(() => {
    const grouped = new Map<string, QualityFinding[]>()
    for (const finding of report?.findings ?? []) {
      const list = grouped.get(finding.cueId)
      if (list) list.push(finding)
      else grouped.set(finding.cueId, [finding])
    }
    return grouped
  }, [report])

  const activeCueTimeMs = useMemo(() => {
    const activeCue = loaded?.cues.find((cue) => cue.id === activeCueId)
    if (!activeCue) return null
    try {
      return parseTimestamp(activeCue.start)
    } catch {
      return null
    }
  }, [loaded, activeCueId])

  // Media preview bridge: the player registers imperative controls; the editor drives them.
  const [mediaControls, setMediaControls] = useState<MediaControls | null>(null)
  const editorMedia = useMemo(() => {
    if (!mediaControls) return undefined
    const setBound = (index: number, field: 'start' | 'end') => {
      const value = formatTimestamp(mediaControls.currentTimeMs())
      mutateCues((list) => updateCue(list, index, { [field]: value }))
    }
    return {
      seek: (index: number) => {
        const start = loaded?.cues[index]?.start
        if (start === undefined) return
        try {
          mediaControls.seek(parseTimestamp(start))
        } catch {
          // Unparseable start time while mid-edit: nothing to seek to.
        }
      },
      setStart: (index: number) => setBound(index, 'start'),
      setEnd: (index: number) => setBound(index, 'end'),
    }
  }, [mediaControls, loaded, mutateCues])

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

  const loadSaved = useCallback((saved: SavedCaption) => {
    setIsSavedPickerOpen(false)
    loadRequest.current += 1
    setLoaded({ savedId: saved.id, name: saved.name, size: saved.size, sourceFormat: saved.sourceFormat, cues: saved.cues, history: [], coalescing: false })
    setOutputName(cleanBaseName(saved.name))
    setOutputFormat(saved.outputFormat ?? (saved.sourceFormat === 'srt' ? 'vtt' : 'srt'))
    setError('')
    setIsEditing(false)
    setActiveTool(null)
    setEditorPage(0)
    setMobilePane('cues')
    setActiveCueId(null)
  }, [])

  const handleSave = async () => {
    if (!loaded || isSaving) return
    const defaultName = cleanBaseName(outputName.trim()) || cleanBaseName(loaded.name) || 'captions'
    const name = window.prompt('Name this saved caption project', defaultName)
    if (!name?.trim()) return
    setIsSaving(true)
    try {
      const saved: SavedCaption = {
        id: loaded.savedId ?? createSavedId(),
        name: name.trim(),
        sourceFormat: loaded.sourceFormat,
        outputFormat,
        cues: loaded.cues,
        size: loaded.size,
        updatedAt: Date.now(),
      }
      await saveCaption(saved)
      setLoaded((current) => current ? { ...current, savedId: saved.id, name: saved.name } : current)
      setSavedCaptions(await listSavedCaptions())
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save captions in this browser.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteSaved = async (saved: SavedCaption) => {
    if (!window.confirm(`Delete saved captions “${saved.name}”?`)) return
    try {
      await deleteSavedCaption(saved.id)
      setSavedCaptions((current) => current.filter((item) => item.id !== saved.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete saved captions.')
    }
  }

  const reset = () => {
    loadRequest.current += 1
    setLoaded(null)
    setOriginalFile(null)
    setLoadingName(null)
    setError('')
    setOutputName('')
    setIsEditing(false)
    setActiveTool(null)
    setMobilePane('cues')
    setActiveCueId(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = nextTheme
    setTheme(nextTheme)
    writePreference(STORAGE_KEYS.theme, nextTheme)
  }

  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyTimer = useRef<number | null>(null)
  const outputLineCount = useMemo(() => {
    if (!serialized) return 0
    let count = 1
    for (let index = serialized.output.indexOf('\n'); index !== -1; index = serialized.output.indexOf('\n', index + 1)) count += 1
    return count
  }, [serialized])

  useEffect(() => () => { if (copyTimer.current) window.clearTimeout(copyTimer.current) }, [])

  const handleCopy = async () => {
    if (!cues || hasCueErrors) return
    try {
      // Serialize fresh so the clipboard matches the latest edits, even mid-debounce.
      const { output } = await serializeCaptionsAsync(cues, outputFormat)
      setCopyState((await copyText(output)) ? 'copied' : 'failed')
    } catch {
      setCopyState('failed')
    }
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), 2000)
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
        {!loaded && (
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
        )}

        {loaded ? (
          <section className={`workspace${mobilePane === 'output' ? ' show-output' : ''}`} aria-label="Caption workspace">
            <h1 className="visually-hidden">{loaded.name === PASTED_NAME ? 'Pasted captions' : loaded.name} — caption workspace</h1>
            <div className="workspace-bar">
              <div className="workspace-file">
                <span className="file-icon"><Icon name="file" size={20} /></span>
                <div className="file-primary">
                  <strong>{loaded.name === PASTED_NAME ? 'Pasted captions' : loaded.name}</strong>
                  <span>{loaded.sourceFormat.toUpperCase()} · {readableBytes(loaded.size)} · {cueCount.toLocaleString()} cues · {serialized ? durationLabel(duration) : '…'}</span>
                </div>
                <button className="text-button" type="button" onClick={reset}><Icon name="reset" size={15} />Replace</button>
              </div>

              <label className="workspace-format">
                <span>Convert to</span>
                <select value={outputFormat} onChange={(event) => chooseOutputFormat(event.target.value as FormatId)}>
                  {formats.map((format) => (
                    <option key={format.id} value={format.id}>{format.extension} · {format.name}</option>
                  ))}
                </select>
              </label>

              <div className="workspace-actions">
                {loaded.history.length > 0 && (
                  <button type="button" className="tool-toggle" onClick={undo}><Icon name="reset" size={15} />Undo</button>
                )}
                <button
                  className={`secondary-button${copyState === 'copied' ? ' is-success' : ''}`}
                  type="button"
                  onClick={() => void handleCopy()}
                  disabled={hasCueErrors}
                  aria-live="polite"
                >
                  <Icon name={copyState === 'copied' ? 'check' : 'copy'} size={17} />
                  {copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
                </button>
                <div className="workspace-download">
                  <button className="secondary-button" type="button" onClick={() => void handleSave()} disabled={isSaving} aria-busy={isSaving}>
                    <Icon name="save" size={17} />{isSaving ? 'Saving…' : 'Save'}
                  </button>
                  <div className="filename-input">
                    <input id="output-name" aria-label="File name" value={outputName} onChange={(event) => setOutputName(event.target.value)} />
                    <span>{getFormat(outputFormat).extension}</span>
                  </div>
                  <button className="primary-button" type="button" onClick={() => void handleDownload()} disabled={hasCueErrors || isDownloading} aria-busy={isDownloading}>
                    <Icon name="download" size={18} />{isDownloading ? 'Preparing…' : 'Download'}
                  </button>
                </div>
              </div>
            </div>

            {error && <div className="error-message" role="alert">{error}</div>}
            {hasCueErrors && (
              <div className="error-message" role="alert">
                Fix the highlighted cues before exporting. Cues with invalid times can’t be downloaded.
              </div>
            )}

            <div className="workspace-switch" role="group" aria-label="Pane">
              <button type="button" aria-pressed={mobilePane === 'cues'} className={mobilePane === 'cues' ? 'is-active' : undefined} onClick={() => setMobilePane('cues')}>Cues</button>
              <button type="button" aria-pressed={mobilePane === 'output'} className={mobilePane === 'output' ? 'is-active' : undefined} onClick={() => setMobilePane('output')}>Output</button>
            </div>

            <div className="workspace-panes">
              <div className="workspace-pane pane-cues">
                <div className="pane-head">
                  <h2>Cues</h2>
                  <div className="tool-strip" role="group" aria-label="Editing tools">
                    <button
                      className={`tool-toggle${activeTool === 'timing' ? ' is-active' : ''}`}
                      type="button"
                      aria-pressed={activeTool === 'timing'}
                      onClick={() => setActiveTool((tool) => (tool === 'timing' ? null : 'timing'))}
                    >
                      <Icon name="clock" size={15} />Timing
                    </button>
                    <button
                      className={`tool-toggle${activeTool === 'replace' ? ' is-active' : ''}`}
                      type="button"
                      aria-pressed={activeTool === 'replace'}
                      onClick={() => setActiveTool((tool) => (tool === 'replace' ? null : 'replace'))}
                    >
                      <Icon name="search" size={15} />Find &amp; replace
                    </button>
                  </div>
                </div>
                {activeTool === 'timing' && (
                  <TimingPanel
                    cues={loaded.cues}
                    onApply={(transform) => mutateCues(transform)}
                  />
                )}
                {activeTool === 'replace' && (
                  <FindReplacePanel
                    cues={loaded.cues}
                    onReplaceAll={(transform) => mutateCues(transform)}
                    onJump={jumpToCueId}
                  />
                )}
                {speakers && (
                  <div className="speaker-banner" role="group" aria-label="Speaker labels">
                    <div className="speaker-banner-text">
                      <strong>Transcript with {speakers.names.length} {speakers.names.length === 1 ? 'speaker' : 'speakers'}</strong>
                      <span>{speakers.names.join(', ')} · {speakers.labelled.toLocaleString()} of {cueCount.toLocaleString()} cues labelled</span>
                    </div>
                    <div className="speaker-banner-actions">
                      <button type="button" className="tool-toggle" title="Replace names with a dash when the speaker changes" onClick={() => mutateCues((cues) => applySpeakerStyle(cues, 'dash'))}>
                        Use dashes
                      </button>
                      <button type="button" className="tool-toggle" title="Remove speaker names from every cue" onClick={() => mutateCues((cues) => applySpeakerStyle(cues, 'none'))}>
                        Remove names
                      </button>
                    </div>
                  </div>
                )}
                {report ? (
                  <QualityReport
                    report={report}
                    canUndo={loaded.history.length > 0}
                    onFix={applyFinding}
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
                <CaptionEditor
                  cues={loaded.cues}
                  errors={cueErrors}
                  findings={findingsByCue}
                  onFix={applyFinding}
                  onFocusCue={setActiveCueId}
                  page={editorPage}
                  onPageChange={setEditorPage}
                  onUpdate={(index, changes) => mutateCues((cues) => updateCue(cues, index, changes), { coalesce: true })}
                  onAdd={(index) => mutateCues((cues) => addCue(cues, index))}
                  onRemove={(index) => mutateCues((cues) => removeCue(cues, index))}
                  onMove={(index, direction) => mutateCues((cues) => moveCue(cues, index, direction))}
                  onSplit={(index) => mutateCues((cues) => splitCue(cues, index))}
                  onMerge={(index) => mutateCues((cues) => mergeCue(cues, index))}
                  media={editorMedia}
                />
              </div>

              <aside className="workspace-pane pane-output">
                <div className="pane-head">
                  <div className="pane-tabs" role="group" aria-label="Right pane">
                    <button type="button" aria-pressed={rightPane === 'output'} className={rightPane === 'output' ? 'is-active' : undefined} onClick={() => setRightPane('output')}>
                      {outputFormat.toUpperCase()} output
                    </button>
                    <button type="button" aria-pressed={rightPane === 'media'} className={rightPane === 'media' ? 'is-active' : undefined} onClick={() => setRightPane('media')}>
                      <Icon name="media" size={15} />Media preview
                    </button>
                    <button type="button" aria-pressed={rightPane === 'original'} className={rightPane === 'original' ? 'is-active' : undefined} onClick={() => setRightPane('original')}>
                      <Icon name="file" size={15} />Original
                    </button>
                  </div>
                  {rightPane === 'output' && serialized && (
                    <span className="pane-meta">{outputLineCount.toLocaleString()} lines · {readableBytes(new Blob([serialized.output]).size)}</span>
                  )}
                </div>
                {rightPane === 'output' ? (
                  <OutputPane
                    output={hasCueErrors ? null : serialized?.output ?? null}
                    format={outputFormat}
                    cues={loaded.cues}
                    pageStart={editorRange.start}
                    pageEnd={editorRange.end}
                    pageCount={editorRange.pageCount}
                    activeCueId={activeCueId}
                    onJump={jumpToCueId}
                  />
                ) : rightPane === 'media' ? (
                  <MediaPreview
                    cues={loaded.cues}
                    cuesAreValid={!hasCueErrors}
                    hidden={isNarrow && mobilePane !== 'output'}
                    onControls={setMediaControls}
                    onJump={jumpToCueId}
                  />
                ) : (
                  <OriginalPane file={originalFile} onFile={setOriginalFile} targetTimeMs={activeCueTimeMs} />
                )}
              </aside>
            </div>
          </section>
        ) : (
        <>
        <section className="converter-card" aria-label="Caption converter">
          <div className="step-heading">
            <span className="step-number">{batch.readyCount > 0 ? <Icon name="check" size={17} /> : '1'}</span>
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
          ) : (
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
                {savedCaptions.length > 0 && <>
                  <span aria-hidden="true">·</span>
                  <button className="saved-open-button" type="button" disabled={Boolean(loadingName)} onClick={() => setIsSavedPickerOpen(true)}><Icon name="save" size={15} />Open saved project</button>
                </>}
                <span aria-hidden="true">·</span>
                <button type="button" disabled={Boolean(loadingName)} aria-expanded={isPasting} onClick={() => setIsPasting((open) => !open)}>
                  {isPasting ? 'Cancel paste' : 'Paste caption text'}
                </button>
              </div>
              {isPasting && (
                <form
                  className="paste-panel"
                  onSubmit={(event) => { event.preventDefault(); loadPastedText(pastedText) }}
                >
                  <label htmlFor="paste-input">Paste SRT, VTT, SBV, LRC, TTML, JSON, CSV, or plain text</label>
                  <textarea
                    id="paste-input"
                    value={pastedText}
                    rows={8}
                    spellCheck={false}
                    autoFocus
                    placeholder={'1\n00:00:01,000 --> 00:00:04,000\nYour first caption…'}
                    onChange={(event) => setPastedText(event.target.value)}
                  />
                  <div className="paste-actions">
                    <button className="primary-button" type="submit" disabled={!pastedText.trim()}>Convert pasted text</button>
                    <span>The format is detected from the text. You can also press Ctrl/⌘+V anywhere on this page.</span>
                  </div>
                </form>
              )}
            </>
          )}

          {error && <div className="error-message" role="alert">{error}</div>}

          <div className={`conversion-area${canPickFormat ? '' : ' is-disabled'}`} aria-disabled={!canPickFormat}>
            <div className="step-heading">
              <span className="step-number">2</span>
              <div><h2>Choose an output format</h2><p>{isBatch ? 'Every file in the batch converts to this format.' : 'Select what you need on the other side.'}</p></div>
            </div>
            <div className="format-grid">
              {formats.map((format) => (
                <button
                  className={`format-option${outputFormat === format.id ? ' is-selected' : ''}`}
                  key={format.id}
                  type="button"
                  disabled={!canPickFormat}
                  onClick={() => chooseOutputFormat(format.id)}
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

        </section>
        </>
        )}

        {isSavedPickerOpen && (
          <div className="saved-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsSavedPickerOpen(false) }}>
            <section className="saved-picker" role="dialog" aria-modal="true" aria-labelledby="saved-picker-title">
              <div className="saved-picker-head">
                <div><p className="eyebrow">YOUR WORK</p><h2 id="saved-picker-title">Open saved captions</h2><p className="saved-picker-subtitle">Stored privately in this browser.</p></div>
                <button type="button" className="saved-picker-close" aria-label="Close saved captions" onClick={() => setIsSavedPickerOpen(false)}>×</button>
              </div>
              <div className="saved-picker-list">
                {savedCaptions.map((saved) => (
                  <div className="saved-caption-row" key={saved.id}>
                    <div className="saved-caption-open"><strong>{saved.name}</strong><span>{saved.sourceFormat.toUpperCase()} · {saved.cues.length.toLocaleString()} cues · {new Date(saved.updatedAt).toLocaleDateString()}</span></div>
                    <button type="button" className="saved-caption-action" onClick={() => loadSaved(saved)}><Icon name="arrow" size={15} />Open</button>
                    <button type="button" className="text-button is-danger-text" onClick={() => void handleDeleteSaved(saved)}>Delete</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

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
