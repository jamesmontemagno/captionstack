import { useState } from 'react'
import type { QualityFinding, QualityReport as Report } from './converter'

interface QualityReportProps {
  report: Report
  canUndo: boolean
  onFix: (finding: QualityFinding) => void
  onFixAll: () => void
  onUndo: () => void
  onJump: (finding: QualityFinding) => void
}

function SeverityIcon({ severity }: { severity: 'error' | 'warning' | 'pass' }) {
  return (
    <svg className={`quality-severity is-${severity}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {severity === 'pass' && <path d="M5 12.5l4 4L19 6.5" />}
      {severity === 'warning' && <><path d="M12 3.5 2.5 20h19z" /><path d="M12 9.5v4.5M12 17.2v.3" /></>}
      {severity === 'error' && <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16v.3" /></>}
    </svg>
  )
}

function summaryLabel(report: Report): string {
  if (report.findings.length === 0) return 'All quality checks passed'
  const parts: string[] = []
  if (report.errorCount) parts.push(`${report.errorCount} ${report.errorCount === 1 ? 'error' : 'errors'}`)
  if (report.warningCount) parts.push(`${report.warningCount} ${report.warningCount === 1 ? 'warning' : 'warnings'}`)
  return parts.join(' · ')
}

function QualityReport({ report, canUndo, onFix, onFixAll, onUndo, onJump }: QualityReportProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [showPassed, setShowPassed] = useState(false)
  const clean = report.findings.length === 0
  const passedChecks = report.checks.filter((check) => check.count === 0)

  return (
    <section className={`quality-report${clean ? ' is-clean' : report.errorCount ? ' has-errors' : ' has-warnings'}`} aria-label="Caption quality report">
      <div className="quality-summary">
        <SeverityIcon severity={clean ? 'pass' : report.errorCount ? 'error' : 'warning'} />
        <div className="quality-summary-text">
          <strong>{summaryLabel(report)}</strong>
          <span>{report.passedCount} of {report.checks.length} checks passed{report.fixableCount ? ` · ${report.fixableCount} can be fixed automatically` : ''}</span>
        </div>
        <div className="quality-actions">
          {canUndo && (
            <button type="button" className="text-button" onClick={onUndo}>Undo</button>
          )}
          {report.fixableCount > 0 && (
            <button type="button" className="quality-fix-all" onClick={onFixAll}>
              Fix {report.fixableCount} safe {report.fixableCount === 1 ? 'issue' : 'issues'}
            </button>
          )}
          <button type="button" className="text-button" aria-expanded={showDetails} onClick={() => setShowDetails((value) => !value)}>
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="quality-details">
          {report.findings.length > 0 && (
            <ul className="quality-findings">
              {report.findings.map((finding) => (
                <li key={finding.id} className={`quality-finding is-${finding.severity}`}>
                  <SeverityIcon severity={finding.severity} />
                  <button type="button" className="quality-cue-link" onClick={() => onJump(finding)}>
                    Cue {finding.cueIndex + 1}
                  </button>
                  <span className="quality-finding-text">
                    <strong>{report.checks.find((check) => check.id === finding.check)?.label}</strong>
                    {finding.message}
                  </span>
                  {finding.fix ? (
                    <button type="button" className="quality-fix" onClick={() => onFix(finding)}>Fix</button>
                  ) : (
                    <span className="quality-manual">Manual</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {passedChecks.length > 0 && (
            <div className="quality-passed">
              <button type="button" className="text-button" aria-expanded={showPassed} onClick={() => setShowPassed((value) => !value)}>
                {showPassed ? 'Hide' : 'Show'} {passedChecks.length} passed {passedChecks.length === 1 ? 'check' : 'checks'}
              </button>
              {showPassed && (
                <ul className="quality-passed-list">
                  {passedChecks.map((check) => (
                    <li key={check.id}><SeverityIcon severity="pass" />{check.label}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default QualityReport
