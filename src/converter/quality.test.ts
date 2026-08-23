import { describe, expect, it } from 'vitest'
import {
  analyzeCues,
  applyAllFixes,
  applyFix,
  cleanCueText,
  toEditableCues,
  type QualityFinding,
} from '.'

function cues(list: Array<{ start: number; end: number; text: string }>) {
  return toEditableCues(list)
}

function byCheck(findings: QualityFinding[], check: QualityFinding['check']) {
  return findings.filter((finding) => finding.check === check)
}

describe('cleanCueText', () => {
  it('trims edges, collapses spaces, and removes blank lines', () => {
    expect(cleanCueText('  Hello   world \n\n  second line  ')).toBe('Hello world\nsecond line')
  })

  it('leaves already-clean text untouched', () => {
    expect(cleanCueText('Hello\nworld')).toBe('Hello\nworld')
  })
})

describe('analyzeCues', () => {
  it('passes every check for a healthy cue list', () => {
    const report = analyzeCues(cues([
      { start: 1000, end: 3000, text: 'Hello there.' },
      { start: 3500, end: 6000, text: 'How are you today?' },
    ]))
    expect(report.findings).toEqual([])
    expect(report.errorCount).toBe(0)
    expect(report.warningCount).toBe(0)
    expect(report.passedCount).toBe(report.checks.length)
  })

  it('reports invalid time ranges as errors', () => {
    const editable = cues([{ start: 1000, end: 3000, text: 'Hi' }])
    editable[0] = { ...editable[0], end: 'bogus' }
    const report = analyzeCues(editable)
    expect(report.errorCount).toBe(1)
    expect(byCheck(report.findings, 'invalid-time')[0].fix).toBeUndefined()
  })

  it('offers to trim the previous cue on overlap', () => {
    const editable = cues([
      { start: 1000, end: 4000, text: 'First cue here.' },
      { start: 3000, end: 6000, text: 'Second cue here.' },
    ])
    const [finding] = byCheck(analyzeCues(editable).findings, 'overlap')
    expect(finding.severity).toBe('warning')
    expect(finding.fix).toEqual({ kind: 'trim-previous', cueId: editable[1].id })
    const fixed = applyFix(editable, finding.fix!)
    expect(fixed[0].end).toBe('00:00:03.000')
    expect(byCheck(analyzeCues(fixed).findings, 'overlap')).toHaveLength(0)
  })

  it('does not offer a trim when it would leave the previous cue with no duration', () => {
    const editable = cues([
      { start: 3000, end: 4000, text: 'First.' },
      { start: 3000, end: 6000, text: 'Second.' },
    ])
    const [finding] = byCheck(analyzeCues(editable).findings, 'overlap')
    expect(finding.fix).toBeUndefined()
  })

  it('flags empty cues and removes them when fixed', () => {
    const editable = cues([
      { start: 1000, end: 3000, text: '   ' },
      { start: 3000, end: 5000, text: 'Real text.' },
    ])
    const [finding] = byCheck(analyzeCues(editable).findings, 'empty-cue')
    expect(finding.fix).toEqual({ kind: 'remove-cue', cueId: editable[0].id })
    expect(applyFix(editable, finding.fix!)).toHaveLength(1)
  })

  it('flags messy whitespace and cleans it', () => {
    const editable = cues([{ start: 1000, end: 3000, text: ' Hello   there ' }])
    const [finding] = byCheck(analyzeCues(editable).findings, 'whitespace')
    expect(finding.fix).toMatchObject({ kind: 'clean-text', text: 'Hello there' })
    expect(applyFix(editable, finding.fix!)[0].text).toBe('Hello there')
  })

  it('flags long lines and too many lines without a fix', () => {
    const report = analyzeCues(cues([
      { start: 1000, end: 9000, text: 'This single line of caption text is far too long to read.' },
      { start: 10000, end: 16000, text: 'one\ntwo\nthree' },
    ]))
    expect(byCheck(report.findings, 'long-line')).toHaveLength(1)
    expect(byCheck(report.findings, 'too-many-lines')).toHaveLength(1)
    expect(report.fixableCount).toBe(0)
  })

  it('extends a too-short cue only when there is room before the next cue', () => {
    const crowded = cues([
      { start: 1000, end: 1300, text: 'Hi' },
      { start: 1500, end: 4000, text: 'Next.' },
    ])
    expect(byCheck(analyzeCues(crowded).findings, 'short-duration')[0].fix).toBeUndefined()

    const roomy = cues([
      { start: 1000, end: 1300, text: 'Hi' },
      { start: 5000, end: 8000, text: 'Next.' },
    ])
    const [finding] = byCheck(analyzeCues(roomy).findings, 'short-duration')
    expect(finding.fix).toEqual({ kind: 'extend-end', cueId: roomy[0].id, end: 2000 })
    expect(applyFix(roomy, finding.fix!)[0].end).toBe('00:00:02.000')
  })

  it('flags fast reading speed and extends the cue when possible', () => {
    const editable = cues([
      { start: 0, end: 1000, text: 'Twenty five characters!!!' },
      { start: 10000, end: 12000, text: 'Later.' },
    ])
    const [finding] = byCheck(analyzeCues(editable).findings, 'reading-speed')
    expect(finding.message).toContain('characters per second')
    expect(finding.fix).toMatchObject({ kind: 'extend-end', cueId: editable[0].id })
    const fixed = applyFix(editable, finding.fix!)
    expect(byCheck(analyzeCues(fixed).findings, 'reading-speed')).toHaveLength(0)
  })
})

describe('applyAllFixes', () => {
  it('applies a stale fix to the right cue even after the list has shifted', () => {
    const editable = cues([
      { start: 1000, end: 2000, text: '' },
      { start: 2000, end: 3000, text: 'Keep me.' },
      { start: 3000, end: 4000, text: '   ' },
    ])
    const [first, second] = byCheck(analyzeCues(editable).findings, 'empty-cue')
    // Apply the first removal, then the second using the now-stale report.
    const afterFirst = applyFix(editable, first.fix!)
    const afterSecond = applyFix(afterFirst, second.fix!)
    expect(afterSecond.map((cue) => cue.text)).toEqual(['Keep me.'])
    // A fix for a cue that no longer exists is a no-op.
    expect(applyFix(afterSecond, first.fix!)).toBe(afterSecond)
  })

  it('applies every safe fix and leaves only unfixable findings', () => {
    const editable = cues([
      { start: 1000, end: 4000, text: ' Padded text ' },
      { start: 3000, end: 6000, text: 'Overlapping cue.' },
      { start: 6000, end: 8000, text: '' },
      { start: 8000, end: 20000, text: 'A very long line of caption text that nobody can fix automatically.' },
    ])
    const { cues: fixed, applied } = applyAllFixes(editable)
    expect(applied).toBe(3)
    expect(fixed).toHaveLength(3)
    expect(fixed[0]).toMatchObject({ text: 'Padded text', end: '00:00:03.000' })
    const report = analyzeCues(fixed)
    expect(report.fixableCount).toBe(0)
    expect(report.findings.map((finding) => finding.check)).toEqual(['long-line'])
  })

  it('is a no-op for clean input', () => {
    const editable = cues([{ start: 0, end: 2000, text: 'Fine.' }])
    const result = applyAllFixes(editable)
    expect(result.applied).toBe(0)
    expect(result.cues).toBe(editable)
  })
})
