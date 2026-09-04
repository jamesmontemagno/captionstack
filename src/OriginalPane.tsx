import { useEffect, useMemo, useRef, useState } from 'react'
import { loadCaptionsAsync, type EditableCue } from './converter'
import { findClosestCueIndex } from './originalCues'

interface OriginalFile {
  name: string
  size: number
  content: string
}

interface OriginalPaneProps {
  file: OriginalFile | null
  onFile: (file: OriginalFile) => void
  targetTimeMs: number | null
}

const MAX_FILE_SIZE = 10 * 1024 * 1024

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function OriginalPane({ file, onFile, targetTimeMs }: OriginalPaneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [cues, setCues] = useState<EditableCue[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!file) {
      setCues(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError('')
    loadCaptionsAsync({ content: file.content, filename: file.name })
      .then((result) => {
        if (!cancelled) setCues(result.cues)
      })
      .catch((caught) => {
        if (!cancelled) {
          setCues(null)
          setError(caught instanceof Error ? caught.message : 'This original file could not be parsed.')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [file])

  const activeIndex = useMemo(
    () => (cues && targetTimeMs !== null ? findClosestCueIndex(cues, targetTimeMs) : -1),
    [cues, targetTimeMs],
  )

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIndex])

  const chooseFile = async (candidate?: File | null) => {
    if (!candidate) return
    if (candidate.size > MAX_FILE_SIZE) {
      setError('Please choose a caption file smaller than 10 MB.')
      return
    }
    try {
      const content = await candidate.text()
      setError('')
      onFile({ name: candidate.name, size: candidate.size, content })
    } catch {
      setError('This original file could not be read.')
    }
  }

  return (
    <section className="original-pane" aria-label="Untouched original caption file">
      {!file ? (
        <>
          <div
            className={`original-drop${isDragging ? ' is-dragging' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
            onDragLeave={(event) => {
              event.preventDefault()
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              void chooseFile(event.dataTransfer.files[0])
            }}
          >
            <strong>Untouched original</strong>
            <span>Keep the source captions beside your updated captions for an easy comparison.</span>
            <button type="button" className="primary-button" onClick={() => inputRef.current?.click()}>
              Choose original file
            </button>
            <span className="original-drop-hint">or drag and drop a caption file here</span>
            <small>The file is opened locally and never uploaded.</small>
          </div>
          <input ref={inputRef} className="visually-hidden" type="file" accept=".srt,.vtt,.sbv,.lrc,.ttml,.xml,.json,.csv,.txt,text/*" onChange={(event) => { void chooseFile(event.target.files?.[0]) }} />
        </>
      ) : (
        <>
          <div className="original-meta">
            <span>
              <strong>{file.name}</strong> · {readableBytes(file.size)}
              {cues && <> · {cues.length.toLocaleString()} cues</>}
            </span>
            <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>Replace original</button>
          </div>
          {isLoading ? (
            <div className="original-status" role="status">Reading original captions…</div>
          ) : cues ? (
            <div className="original-cue-list" aria-label="Original caption cues">
              {cues.map((cue, index) => (
                <div
                  key={cue.id}
                  ref={index === activeIndex ? activeRef : undefined}
                  className={`original-cue${index === activeIndex ? ' is-active' : ''}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                >
                  <div className="original-cue-head">
                    <span className="editor-cue-number">{index + 1}</span>
                    <span className="original-cue-time">{cue.start} → {cue.end}</span>
                  </div>
                  <p>{cue.text}</p>
                </div>
              ))}
            </div>
          ) : null}
          <input ref={inputRef} className="visually-hidden" type="file" accept=".srt,.vtt,.sbv,.lrc,.ttml,.xml,.json,.csv,.txt,text/*" onChange={(event) => { void chooseFile(event.target.files?.[0]) }} />
        </>
      )}
      {error && <p className="tool-error" role="alert">{error}</p>}
    </section>
  )
}

export default OriginalPane
