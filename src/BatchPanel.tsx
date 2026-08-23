import type { BatchItem } from './batch'

interface BatchPanelProps {
  items: BatchItem[]
  isDragging: boolean
  onAddMore: () => void
  onRemove: (id: string) => void
  onClear: () => void
  onDragEnter: () => void
  onDragLeave: () => void
  onDrop: (files: File[]) => void
}

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusIcon({ status }: { status: BatchItem['status'] }) {
  return (
    <svg className={`batch-status-icon is-${status}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {status === 'reading' && <path d="M12 3a9 9 0 1 0 9 9" />}
      {status === 'ready' && <path d="M5 12.5l4 4L19 6.5" />}
      {status === 'error' && <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16v.3" /></>}
    </svg>
  )
}

function BatchPanel({ items, isDragging, onAddMore, onRemove, onClear, onDragEnter, onDragLeave, onDrop }: BatchPanelProps) {
  return (
    <div
      className={`batch-panel${isDragging ? ' is-dragging' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); onDragEnter() }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { event.preventDefault(); onDragLeave() }}
      onDrop={(event) => { event.preventDefault(); onDrop(Array.from(event.dataTransfer.files)) }}
    >
      <ul className="batch-list" aria-label="Files in this batch">
        {items.map((item) => (
          <li key={item.id} className={`batch-item is-${item.status}`}>
            <StatusIcon status={item.status} />
            <div className="batch-item-primary">
              <strong>{item.name}</strong>
              <span>
                {readableBytes(item.size)}
                {item.status === 'ready' && ` · ${item.cues?.length ?? 0} cues`}
                {item.status === 'reading' && ' · Reading…'}
              </span>
              {item.status === 'error' && <span className="batch-item-error" role="alert">{item.error}</span>}
            </div>
            {item.status === 'ready' && item.sourceFormat && <span className="detected-format">{item.sourceFormat.toUpperCase()}</span>}
            <button type="button" className="icon-button batch-remove" aria-label={`Remove ${item.name} from the batch`} onClick={() => onRemove(item.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </li>
        ))}
      </ul>
      <div className="batch-actions">
        <button type="button" className="text-button" onClick={onAddMore}>+ Add more files</button>
        <span className="batch-hint">or drop them here</span>
        <button type="button" className="text-button batch-clear" onClick={onClear}>Clear all</button>
      </div>
    </div>
  )
}

export default BatchPanel
