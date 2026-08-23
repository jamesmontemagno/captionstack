import { useMemo, useState } from 'react'
import { findMatches, replaceAll, type EditableCue, type SearchMatch, type SearchOptions } from './converter'

/** Matches listed before a "show more" control. */
const MATCHES_PAGE = 25

interface FindReplacePanelProps {
  cues: EditableCue[]
  onReplaceAll: (transform: (cues: EditableCue[]) => EditableCue[]) => void
  onJump: (cueId: string) => void
}

function FindReplacePanel({ cues, onReplaceAll, onJump }: FindReplacePanelProps) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [options, setOptions] = useState<SearchOptions>({})
  const [visible, setVisible] = useState(MATCHES_PAGE)
  const [lastReplaced, setLastReplaced] = useState<number | null>(null)

  const result = useMemo(() => findMatches(cues, query, options), [cues, query, options])

  const toggle = (key: keyof SearchOptions) => {
    setOptions((current) => ({ ...current, [key]: !current[key] }))
    setLastReplaced(null)
  }

  const summary = !query
    ? 'Type to search every cue.'
    : result.error
      ? null
      : result.total === 0
        ? 'No matches.'
        : `${result.total.toLocaleString()} ${result.total === 1 ? 'match' : 'matches'} in ${result.matches.length.toLocaleString()} ${result.matches.length === 1 ? 'cue' : 'cues'}`

  const handleReplaceAll = () => {
    if (result.total === 0) return
    const total = result.total
    onReplaceAll((list) => replaceAll(list, query, replacement, options))
    setLastReplaced(total)
  }

  return (
    <section className="tool-panel find-panel" aria-label="Find and replace">
      <div className="find-fields">
        <label className="tool-field find-field">
          <span>Find</span>
          <input
            value={query}
            spellCheck={false}
            placeholder={options.useRegex ? 'Regular expression, e.g. \\[.*?\\]' : 'Text to find'}
            aria-invalid={result.error ? true : undefined}
            aria-describedby="find-status"
            onChange={(event) => { setQuery(event.target.value); setVisible(MATCHES_PAGE); setLastReplaced(null) }}
          />
        </label>
        <label className="tool-field find-field">
          <span>Replace with</span>
          <input
            value={replacement}
            spellCheck={false}
            placeholder={options.useRegex ? 'Use $1 for groups; empty deletes' : 'Leave empty to delete matches'}
            onChange={(event) => { setReplacement(event.target.value); setLastReplaced(null) }}
          />
        </label>
      </div>

      <div className="find-options" role="group" aria-label="Search options">
        <label><input type="checkbox" checked={Boolean(options.matchCase)} onChange={() => toggle('matchCase')} />Match case</label>
        <label><input type="checkbox" checked={Boolean(options.wholeWord)} onChange={() => toggle('wholeWord')} />Whole word</label>
        <label><input type="checkbox" checked={Boolean(options.useRegex)} onChange={() => toggle('useRegex')} />Regular expression</label>
      </div>

      <p id="find-status" className={`find-status${result.error ? ' is-error' : ''}`} role="status">
        {result.error ?? (lastReplaced !== null ? `Replaced ${lastReplaced.toLocaleString()} ${lastReplaced === 1 ? 'match' : 'matches'}. Undo is available in the quality report.` : summary)}
      </p>

      {result.matches.length > 0 && (
        <>
          <ul className="find-matches">
            {result.matches.slice(0, visible).map((match: SearchMatch) => (
              <li key={match.cueId}>
                <button type="button" className="quality-cue-link" aria-label={`Go to cue ${match.cueIndex + 1}`} onClick={() => onJump(match.cueId)}>
                  Cue {match.cueIndex + 1}
                </button>
                <span className="find-snippet">
                  {match.before.length > 40 ? `…${match.before.slice(-40)}` : match.before}
                  <mark>{match.match}</mark>
                  {match.after.length > 60 ? `${match.after.slice(0, 60)}…` : match.after}
                </span>
                {match.count > 1 && <span className="find-count">×{match.count}</span>}
              </li>
            ))}
          </ul>
          {result.matches.length > visible && (
            <button type="button" className="text-button quality-show-more" onClick={() => setVisible((count) => count + MATCHES_PAGE)}>
              Show {Math.min(MATCHES_PAGE, result.matches.length - visible)} more cues
            </button>
          )}
        </>
      )}

      <div className="tool-actions">
        <button type="button" className="primary-button" disabled={result.total === 0} onClick={handleReplaceAll}>
          Replace all{result.total > 0 ? ` (${result.total.toLocaleString()})` : ''}
        </button>
        {replacement === '' && result.total > 0 && <span className="tool-summary">Matches will be deleted. Cues left empty are flagged by the quality checks.</span>}
      </div>
    </section>
  )
}

export default FindReplacePanel
