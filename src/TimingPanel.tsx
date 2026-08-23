import { useMemo, useState } from 'react'
import {
  convertFrameRate,
  FRAME_RATES,
  parseOffset,
  parseTimestamp,
  shiftCues,
  syncByPoints,
  type EditableCue,
} from './converter'

type Mode = 'shift' | 'framerate' | 'sync'

interface TimingPanelProps {
  cues: EditableCue[]
  onApply: (transform: (cues: EditableCue[]) => EditableCue[], label: string) => void
}

function tryParse(value: string): number | null {
  try {
    return parseTimestamp(value)
  } catch {
    return null
  }
}

function Preview({ before, after, total }: { before: EditableCue[]; after: EditableCue[]; total: number }) {
  if (before.length === 0) return null
  return (
    <table className="timing-preview">
      <thead>
        <tr><th scope="col">Cue</th><th scope="col">Now</th><th scope="col">After</th></tr>
      </thead>
      <tbody>
        {before.map((cue, index) => (
          <tr key={cue.id}>
            <th scope="row">{index === 0 ? `First (#1)` : `Last (#${total})`}</th>
            <td>{cue.start} → {cue.end}</td>
            <td className={after[index].start !== cue.start || after[index].end !== cue.end ? 'is-changed' : undefined}>
              {after[index].start} → {after[index].end}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TimingPanel({ cues, onApply }: TimingPanelProps) {
  const [mode, setMode] = useState<Mode>('shift')
  const [offset, setOffset] = useState('')
  const [fromFps, setFromFps] = useState('23.976')
  const [toFps, setToFps] = useState('25')
  const [firstIndex, setFirstIndex] = useState('1')
  const [firstTarget, setFirstTarget] = useState('')
  const [lastIndexInput, setLastIndex] = useState<string | null>(null)
  // Follows the live cue count until the user types a value.
  const lastIndex = lastIndexInput ?? String(cues.length)
  const [lastTarget, setLastTarget] = useState('')

  const plan = useMemo<{ transform: ((cues: EditableCue[]) => EditableCue[]) | null; label: string; error?: string }>(() => {
    if (mode === 'shift') {
      if (!offset.trim()) return { transform: null, label: '' }
      const ms = parseOffset(offset)
      if (ms === null) return { transform: null, label: '', error: 'Enter an offset such as 1.5, -250ms, or 00:00:02.000.' }
      return { transform: (list) => shiftCues(list, ms), label: `Shift all cues by ${ms > 0 ? '+' : ''}${ms} ms` }
    }
    if (mode === 'framerate') {
      const from = Number(fromFps)
      const to = Number(toFps)
      if (!(from > 0) || !(to > 0)) return { transform: null, label: '', error: 'Frame rates must be positive numbers.' }
      if (from === to) return { transform: null, label: '' }
      return { transform: (list) => convertFrameRate(list, from, to), label: `Retime from ${from} fps to ${to} fps` }
    }
    const a = Number(firstIndex) - 1
    const b = Number(lastIndex) - 1
    if (!firstTarget.trim() && !lastTarget.trim()) return { transform: null, label: '' }
    const targetA = tryParse(firstTarget)
    const targetB = tryParse(lastTarget)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= cues.length || b >= cues.length) {
      return { transform: null, label: '', error: `Cue numbers must be between 1 and ${cues.length}.` }
    }
    if (a === b) return { transform: null, label: '', error: 'Pick two different cues.' }
    if (targetA === null || targetB === null) return { transform: null, label: '', error: 'Enter both target times, for example 00:00:05.000.' }
    const startA = tryParse(cues[a].start)
    const startB = tryParse(cues[b].start)
    if (startA === null || startB === null) return { transform: null, label: '', error: 'Both chosen cues need valid start times.' }
    if ((targetB - targetA) * (startB - startA) <= 0) return { transform: null, label: '', error: 'Target times must keep the cues in the same order.' }
    return {
      transform: (list) => syncByPoints(list, { sourceMs: startA, targetMs: targetA }, { sourceMs: startB, targetMs: targetB }),
      label: `Sync cue ${a + 1} to ${firstTarget.trim()} and cue ${b + 1} to ${lastTarget.trim()}`,
    }
  }, [mode, offset, fromFps, toFps, firstIndex, firstTarget, lastIndex, lastTarget, cues])

  // Preview only the sampled cues: transforming 100k+ cues on every keystroke would stall typing.
  const sample = useMemo(() => (cues.length > 1 ? [cues[0], cues[cues.length - 1]] : cues.slice(0, 1)), [cues])
  const sampleAfter = useMemo(() => (plan.transform ? plan.transform(sample) : sample), [plan, sample])

  return (
    <section className="tool-panel timing-panel" aria-label="Timing tools">
      <div className="tool-tabs" role="group" aria-label="Timing operation">
        {([
          ['shift', 'Shift'],
          ['framerate', 'Frame rate'],
          ['sync', 'Two-point sync'],
        ] as Array<[Mode, string]>).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={mode === id} className={mode === id ? 'is-active' : undefined} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'shift' && (
        <div className="tool-fields">
          <label className="tool-field">
            <span>Offset</span>
            <input value={offset} placeholder="e.g. 1.5, -250ms, 00:00:02.000" spellCheck={false} onChange={(event) => setOffset(event.target.value)} />
          </label>
          <p className="tool-help">Positive values make captions appear later; negative values make them earlier. Times never go below zero.</p>
        </div>
      )}

      {mode === 'framerate' && (
        <div className="tool-fields">
          <label className="tool-field">
            <span>Captions were made for</span>
            <input list="frame-rates" value={fromFps} inputMode="decimal" onChange={(event) => setFromFps(event.target.value)} />
          </label>
          <label className="tool-field">
            <span>Media now plays at</span>
            <input list="frame-rates" value={toFps} inputMode="decimal" onChange={(event) => setToFps(event.target.value)} />
          </label>
          <datalist id="frame-rates">
            {FRAME_RATES.map((rate) => <option key={rate} value={rate} />)}
          </datalist>
          <p className="tool-help">Fixes captions that drift further out of sync over time because the video was sped up or slowed down (for example film at 23.976 fps broadcast at 25 fps).</p>
        </div>
      )}

      {mode === 'sync' && (
        <div className="tool-fields tool-fields-grid">
          <label className="tool-field">
            <span>Cue #</span>
            <input value={firstIndex} inputMode="numeric" onChange={(event) => setFirstIndex(event.target.value)} />
          </label>
          <label className="tool-field">
            <span>should start at</span>
            <input value={firstTarget} placeholder="00:00:05.000" spellCheck={false} onChange={(event) => setFirstTarget(event.target.value)} />
          </label>
          <label className="tool-field">
            <span>Cue #</span>
            <input value={lastIndex} inputMode="numeric" onChange={(event) => setLastIndex(event.target.value)} />
          </label>
          <label className="tool-field">
            <span>should start at</span>
            <input value={lastTarget} placeholder="01:29:58.000" spellCheck={false} onChange={(event) => setLastTarget(event.target.value)} />
          </label>
          <p className="tool-help">Note when two cues actually appear in your video; every other cue is moved and stretched to match.</p>
        </div>
      )}

      {plan.error && <p className="tool-error" role="alert">{plan.error}</p>}
      <Preview before={sample} after={sampleAfter} total={cues.length} />

      <div className="tool-actions">
        <button type="button" className="primary-button" disabled={!plan.transform} onClick={() => plan.transform && onApply(plan.transform, plan.label)}>
          Apply to {cues.length.toLocaleString()} cues
        </button>
        {plan.label && <span className="tool-summary">{plan.label}</span>}
      </div>
    </section>
  )
}

export default TimingPanel
