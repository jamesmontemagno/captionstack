import { useRef, useState } from 'react'

interface OriginalFile {
  name: string
  size: number
  content: string
}

interface OriginalPaneProps {
  file: OriginalFile | null
  onFile: (file: OriginalFile) => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function OriginalPane({ file, onFile }: OriginalPaneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

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
          <button
            type="button"
            className="original-drop"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); void chooseFile(event.dataTransfer.files[0]) }}
          >
            <strong>Upload the untouched original</strong>
            <span>Keep the source captions beside your translation. The file is opened locally and never uploaded.</span>
          </button>
          <input ref={inputRef} className="visually-hidden" type="file" accept=".srt,.vtt,.sbv,.lrc,.ttml,.xml,.json,.csv,.txt,text/*" onChange={(event) => { void chooseFile(event.target.files?.[0]) }} />
        </>
      ) : (
        <>
          <div className="original-meta">
            <span><strong>{file.name}</strong> · {readableBytes(file.size)}</span>
            <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>Replace original</button>
          </div>
          <pre className="original-code">{file.content}</pre>
          <input ref={inputRef} className="visually-hidden" type="file" accept=".srt,.vtt,.sbv,.lrc,.ttml,.xml,.json,.csv,.txt,text/*" onChange={(event) => { void chooseFile(event.target.files?.[0]) }} />
        </>
      )}
      {error && <p className="tool-error" role="alert">{error}</p>}
    </section>
  )
}

export default OriginalPane
