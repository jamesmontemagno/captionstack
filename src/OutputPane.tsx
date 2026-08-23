import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { splitOutput, type EditableCue, type FormatId } from './converter'

interface OutputPaneProps {
  output: string | null
  format: FormatId
  cues: EditableCue[]
  /** Index range of the cues currently shown in the editor, so both panes stay in step. */
  pageStart: number
  pageEnd: number
  pageCount: number
  activeCueId: string | null
  onJump: (cueId: string) => void
}

const TOKEN = /(\d{1,2}:\d{2}:\d{2}[.,]\d{3}|\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]|-->|<\/?[\w:-]+(?:\s[^>]*)?>|"(?:[^"\\]|\\.)*"(?=\s*:)|\b\d+\b(?=\n|,|$))/g

/** Plain-text cap for output that couldn't be split into cue chunks. */
const FALLBACK_LIMIT = 512 * 1024

/** Light, format-agnostic highlighting: timestamps, arrows, XML tags, JSON keys, bare numbers. */
function highlight(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(text.slice(last, index))
    const token = match[0]
    const kind = /^\d{1,2}:|^\[/.test(token) ? 'time' : token === '-->' ? 'arrow' : token.startsWith('<') ? 'tag' : token.startsWith('"') ? 'key' : 'number'
    nodes.push(<span key={index} className={`tok-${kind}`}>{token}</span>)
    last = index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function OutputPane({ output, format, cues, pageStart, pageEnd, pageCount, activeCueId, onJump }: OutputPaneProps) {
  const segments = useMemo(() => (output === null ? null : splitOutput(output, format, cues.length)), [output, format, cues.length])
  const activeRef = useRef<HTMLButtonElement>(null)
  // The unmapped fallback (chunk count mismatch, e.g. blank lines inside TXT cues) shows plain
  // text: highlighting a multi-megabyte string would create hundreds of thousands of nodes.
  const fallbackText = useMemo(() => (output === null ? '' : output.slice(0, FALLBACK_LIMIT)), [output])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeCueId])

  if (output === null || segments === null) {
    return <div className="output-pane is-pending" role="status">Preparing {format.toUpperCase()} output…</div>
  }

  const mapped = segments.cues.length === cues.length
  const joiner = format === 'lrc' || format === 'csv' || format === 'ttml' || format === 'json' ? '\n' : '\n\n'

  return (
    <div className="output-pane" aria-label={`Converted ${format.toUpperCase()} output`}>
      {mapped ? (
        <pre className="output-code">
          {segments.header && <span className="output-chrome">{highlight(segments.header)}</span>}
          {pageStart > 0 && <span className="output-elided">… {pageStart.toLocaleString()} earlier {pageStart === 1 ? 'cue' : 'cues'} …{'\n'}</span>}
          {segments.cues.slice(pageStart, pageEnd).map((chunk, offset) => {
            const index = pageStart + offset
            const cue = cues[index]
            const isActive = cue.id === activeCueId
            return (
              <button
                key={cue.id}
                ref={isActive ? activeRef : undefined}
                type="button"
                className={`output-chunk${isActive ? ' is-active' : ''}`}
                aria-label={`Cue ${index + 1} in the output. Jump to this cue in the editor.`}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => onJump(cue.id)}
              >
                {highlight(chunk)}
                {index < cues.length - 1 ? joiner : ''}
              </button>
            )
          })}
          {pageEnd < cues.length && <span className="output-elided">… {(cues.length - pageEnd).toLocaleString()} more {cues.length - pageEnd === 1 ? 'cue' : 'cues'} …</span>}
          {segments.footer && <span className="output-chrome">{highlight(segments.footer)}</span>}
        </pre>
      ) : (
        <pre className="output-code">{fallbackText}{output.length > FALLBACK_LIMIT ? '\n…' : ''}</pre>
      )}
      {pageCount > 1 && mapped && (
        <p className="output-foot">Showing cues {pageStart + 1}–{pageEnd} of {cues.length.toLocaleString()} to match the editor page. Download or copy for the whole file.</p>
      )}
    </div>
  )
}

export default OutputPane
