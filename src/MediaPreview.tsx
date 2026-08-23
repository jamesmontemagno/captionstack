import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findActiveCue, parseTimestamp, serializeCaptionsAsync, type EditableCue } from './converter'

/** Imperative hooks the editor uses to talk to the player without re-rendering on every tick. */
export interface MediaControls {
  seek: (ms: number) => void
  currentTimeMs: () => number
}

interface MediaPreviewProps {
  cues: EditableCue[]
  /** False while cues contain unparseable timestamps; the track keeps its last good version. */
  cuesAreValid: boolean
  onControls: (controls: MediaControls | null) => void
  onJump: (cueId: string) => void
}

function tryParse(value: string): number | null {
  try {
    return parseTimestamp(value)
  } catch {
    return null
  }
}

function readableBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function MediaPreview({ cues, cuesAreValid, onControls, onJump }: MediaPreviewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [media, setMedia] = useState<{ url: string; name: string; size: number; isAudio: boolean } | null>(null)
  const [trackUrl, setTrackUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isDragging, setIsDragging] = useState(false)

  // Numeric start/end per cue for the "now playing" lookup; null for cues mid-edit.
  const timings = useMemo(
    () => cues.map((cue) => ({ start: tryParse(cue.start), end: tryParse(cue.end) })),
    [cues],
  )

  const chooseFile = useCallback((file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
      setError('Choose a video or audio file your browser can play (MP4, WebM, MP3, M4A, WAV…).')
      return
    }
    setError('')
    setMedia({ url: URL.createObjectURL(file), name: file.name, size: file.size, isAudio: file.type.startsWith('audio/') })
  }, [])

  // Rebuild the WebVTT track whenever the cues change; the media element keeps playing.
  useEffect(() => {
    if (!media || !cuesAreValid) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      serializeCaptionsAsync(cues, 'vtt')
        .then(({ output }) => {
          if (!cancelled) setTrackUrl(URL.createObjectURL(new Blob([output], { type: 'text/vtt' })))
        })
        .catch(() => { /* keep the previous track */ })
    }, 150)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [cues, cuesAreValid, media])

  // Each object URL is revoked exactly once: when it is replaced, removed, or the panel unmounts.
  useEffect(() => () => {
    if (media) URL.revokeObjectURL(media.url)
  }, [media])
  useEffect(() => () => {
    if (trackUrl) URL.revokeObjectURL(trackUrl)
  }, [trackUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !media) {
      onControls(null)
      return
    }
    onControls({
      seek: (ms) => {
        video.currentTime = Math.max(0, ms / 1000)
        video.focus({ preventScroll: true })
        void video.play().catch(() => { /* autoplay policies may refuse; the scrubber still moved */ })
      },
      currentTimeMs: () => Math.round(video.currentTime * 1000),
    })
    return () => onControls(null)
  }, [media, onControls])

  // Force the track to display; browsers only honour `default` on the first load.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !trackUrl) return
    const show = () => {
      for (const track of Array.from(video.textTracks)) track.mode = 'showing'
    }
    show()
    const trackElement = video.querySelector('track')
    trackElement?.addEventListener('load', show)
    return () => trackElement?.removeEventListener('load', show)
  }, [trackUrl])

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    const now = Math.round(video.currentTime * 1000)
    setActiveIndex(findActiveCue(timings, now))
  }

  const removeMedia = () => {
    setMedia(null)
    setTrackUrl(null)
    setActiveIndex(-1)
    if (inputRef.current) inputRef.current.value = ''
  }

  const active = activeIndex >= 0 ? cues[activeIndex] : null

  return (
    <section className="tool-panel media-panel" aria-label="Preview with media">
      {!media ? (
        <>
          <button
            type="button"
            className={`media-drop${isDragging ? ' is-dragging' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); setIsDragging(false) }}
            onDrop={(event) => { event.preventDefault(); setIsDragging(false); chooseFile(event.dataTransfer.files[0]) }}
          >
            <strong>Choose a video or audio file</strong>
            <span>Your captions play over it right here. The file is opened locally and never uploaded.</span>
          </button>
          <input ref={inputRef} className="visually-hidden" type="file" accept="video/*,audio/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
        </>
      ) : (
        <>
          <div className={`media-player${media.isAudio ? ' is-audio' : ''}`}>
            {/* Captions are delivered through a native text track so browser styling and a11y apply. */}
            <video
              ref={videoRef}
              src={media.url}
              controls
              playsInline
              preload="metadata"
              onTimeUpdate={handleTimeUpdate}
              onSeeked={handleTimeUpdate}
            >
              {trackUrl && <track kind="subtitles" label="Captions" srcLang="und" src={trackUrl} default />}
            </video>
          </div>
          <div className="media-meta">
            <span className="media-name"><strong>{media.name}</strong> · {readableBytes(media.size)}</span>
            <span className="media-now" role="status" aria-live="polite">
              {active ? (
                <>
                  Now showing cue{' '}
                  <button type="button" className="quality-cue-link" onClick={() => onJump(active.id)}>Cue {activeIndex + 1}</button>
                  {' '}<span className="media-now-text">{active.text.split('\n')[0]}</span>
                </>
              ) : (
                'No cue at this moment.'
              )}
            </span>
            <button type="button" className="text-button" onClick={removeMedia}>Remove media</button>
          </div>
          <p className="tool-help">
            In the editor, use <strong>▶</strong> on a cue to jump the player there, and <strong>⇤</strong> / <strong>⇥</strong> to set that cue’s start or end to the current playhead.
          </p>
        </>
      )}
      {error && <p className="tool-error" role="alert">{error}</p>}
    </section>
  )
}

export default MediaPreview
