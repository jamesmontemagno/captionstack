import { useCallback, useMemo, useRef, useState } from 'react'
import {
  formatTimestamp,
  formats,
  getFormat,
  parseCaptions,
  serializeCaptions,
  type Cue,
  type FormatId,
} from './converter'
import './App.css'

const MAX_FILE_SIZE = 10 * 1024 * 1024
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

function Icon({ name, size = 20 }: { name: 'upload' | 'file' | 'arrow' | 'download' | 'shield' | 'moon' | 'sun' | 'check' | 'reset'; size?: number }) {
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

function cleanBaseName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '-' : character)
    .join('')
}

interface LoadedFile {
  name: string
  size: number
  sourceFormat: FormatId
  cues: Cue[]
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState<LoadedFile | null>(null)
  const [outputFormat, setOutputFormat] = useState<FormatId>('srt')
  const [outputName, setOutputName] = useState('')
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')

  const processContent = useCallback((content: string, name: string, size: number) => {
    try {
      const parsed = parseCaptions(content, name)
      const nextFormat = formats.find((format) => format.id !== parsed.format)?.id ?? 'srt'
      setLoaded({ name, size, sourceFormat: parsed.format, cues: parsed.cues })
      setOutputFormat(nextFormat)
      setOutputName(cleanBaseName(name))
      setError('')
    } catch (caught) {
      setLoaded(null)
      setError(caught instanceof Error ? caught.message : 'This file could not be read.')
    }
  }, [])

  const processFile = useCallback(async (file?: File) => {
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      setError('Please choose a caption file smaller than 10 MB.')
      return
    }
    try {
      processContent(await file.text(), file.name, file.size)
    } catch {
      setError('The selected file could not be opened.')
    }
  }, [processContent])

  const output = useMemo(
    () => loaded ? serializeCaptions(loaded.cues, outputFormat) : '',
    [loaded, outputFormat],
  )

  const handleDownload = () => {
    if (!loaded) return
    const format = getFormat(outputFormat)
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${cleanBaseName(outputName.trim()) || 'captions'}${format.extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const reset = () => {
    setLoaded(null)
    setError('')
    setOutputName('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = nextTheme
    setTheme(nextTheme)
  }

  const duration = loaded ? Math.max(...loaded.cues.map((cue) => cue.end)) : 0

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="./" aria-label="CaptionStack home">
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
          <p className="eyebrow">CAPTION CONVERTER</p>
          <h1 id="page-title">Your captions.<br /><em>Any format.</em></h1>
          <p className="hero-description">Convert subtitle files in seconds. No uploads, no accounts, and nothing leaves your browser.</p>
          <div className="format-strip" aria-label="Supported formats">
            {formats.map((format) => <span key={format.id}>{format.id.toUpperCase()}</span>)}
          </div>
        </section>

        <section className="converter-card" aria-label="Caption converter">
          <div className="step-heading">
            <span className="step-number">{loaded ? <Icon name="check" size={17} /> : '1'}</span>
            <div><h2>Choose your caption file</h2><p>We’ll detect the format automatically.</p></div>
          </div>

          {!loaded ? (
            <>
              <button
                className={`drop-zone${isDragging ? ' is-dragging' : ''}`}
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { event.preventDefault(); setIsDragging(false) }}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsDragging(false)
                  void processFile(event.dataTransfer.files[0])
                }}
              >
                <span className="upload-icon"><Icon name="upload" size={28} /></span>
                <strong>Drop your file here</strong>
                <span>or click to browse from your device</span>
                <small>Up to 10 MB · SRT, VTT, SBV, LRC, TTML, JSON, CSV, TXT</small>
              </button>
              <input
                ref={inputRef}
                className="visually-hidden"
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={(event) => void processFile(event.target.files?.[0])}
              />
              <div className="demo-row">
                <span>Don’t have a file handy?</span>
                <button type="button" onClick={() => processContent(DEMO_CAPTIONS, 'captionstack-demo.vtt', new Blob([DEMO_CAPTIONS]).size)}>Try a sample file</button>
              </div>
            </>
          ) : (
            <div className="loaded-file">
              <span className="file-icon"><Icon name="file" size={23} /></span>
              <div className="file-primary"><strong>{loaded.name}</strong><span>{readableBytes(loaded.size)} · {loaded.cues.length} cues</span></div>
              <span className="detected-format">{loaded.sourceFormat.toUpperCase()}</span>
              <button className="text-button" type="button" onClick={reset}><Icon name="reset" size={16} />Replace</button>
            </div>
          )}

          {error && <div className="error-message" role="alert">{error}</div>}

          <div className={`conversion-area${loaded ? '' : ' is-disabled'}`} aria-disabled={!loaded}>
            <div className="step-heading">
              <span className="step-number">2</span>
              <div><h2>Choose an output format</h2><p>Select what you need on the other side.</p></div>
            </div>
            <div className="format-grid">
              {formats.map((format) => (
                <button
                  className={`format-option${outputFormat === format.id ? ' is-selected' : ''}`}
                  key={format.id}
                  type="button"
                  disabled={!loaded}
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

          {loaded && (
            <div className="result-area">
              <div className="flow-summary">
                <div><span>FROM</span><strong>{loaded.sourceFormat.toUpperCase()}</strong></div>
                <Icon name="arrow" size={22} />
                <div><span>TO</span><strong>{outputFormat.toUpperCase()}</strong></div>
                <div className="stats">
                  <span><strong>{loaded.cues.length}</strong> cues</span>
                  <span><strong>{durationLabel(duration)}</strong> runtime</span>
                  <span><strong>{readableBytes(new Blob([output]).size)}</strong> output</span>
                </div>
              </div>

              <div className="preview">
                <div className="preview-heading"><h3>Caption preview</h3><span>First {Math.min(3, loaded.cues.length)} cues</span></div>
                {loaded.cues.slice(0, 3).map((cue, index) => (
                  <div className="cue-row" key={`${cue.start}-${index}`}>
                    <span>{index + 1}</span>
                    <time>{formatTimestamp(cue.start).slice(0, -4)} → {formatTimestamp(cue.end).slice(0, -4)}</time>
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
                <button className="primary-button" type="button" onClick={handleDownload}>
                  <Icon name="download" size={20} />Download converted file
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
