import { type CueError, type EditableCue } from './converter'

interface CaptionEditorProps {
  cues: EditableCue[]
  errors: Map<string, CueError>
  onUpdate: (index: number, changes: Partial<Pick<EditableCue, 'start' | 'end' | 'text'>>) => void
  onAdd: (index: number) => void
  onRemove: (index: number) => void
  onMove: (index: number, direction: -1 | 1) => void
  onSplit: (index: number) => void
  onMerge: (index: number) => void
}

const editorIcons = {
  add: <path d="M12 5v14M5 12h14" />,
  remove: <><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7" /><path d="M10 11v5M14 11v5" /></>,
  up: <path d="M12 19V5m0 0l-6 6m6-6l6 6" />,
  down: <path d="M12 5v14m0 0l6-6m-6 6l-6-6" />,
  split: <><path d="M12 4v16" /><path d="M7 9l-3 3 3 3M17 9l3 3-3 3" /></>,
  merge: <><path d="M12 4v16" /><path d="M4 9l3 3-3 3M20 9l-3 3 3 3" /></>,
} as const

function EditorIcon({ name, size = 17 }: { name: keyof typeof editorIcons; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {editorIcons[name]}
    </svg>
  )
}

function CaptionEditor({ cues, errors, onUpdate, onAdd, onRemove, onMove, onSplit, onMerge }: CaptionEditorProps) {
  return (
    <div className="caption-editor">
      <div className="editor-list">
        {cues.map((cue, index) => {
          const error = errors.get(cue.id)
          return (
            <div className={`editor-cue${error ? ' has-error' : ''}`} key={cue.id}>
              <div className="editor-cue-head">
                <span className="editor-cue-number">{index + 1}</span>
                <div className="editor-times">
                  <label className="editor-time-field">
                    <span>Start</span>
                    <input
                      className={error?.start ? 'is-invalid' : undefined}
                      value={cue.start}
                      spellCheck={false}
                      aria-invalid={error?.start ? true : undefined}
                      onChange={(event) => onUpdate(index, { start: event.target.value })}
                    />
                  </label>
                  <label className="editor-time-field">
                    <span>End</span>
                    <input
                      className={error?.end || error?.overlap ? 'is-invalid' : undefined}
                      value={cue.end}
                      spellCheck={false}
                      aria-invalid={error?.end ? true : undefined}
                      onChange={(event) => onUpdate(index, { end: event.target.value })}
                    />
                  </label>
                </div>
                <div className="editor-cue-actions">
                  <button type="button" className="icon-button" title="Move up" aria-label={`Move cue ${index + 1} up`} disabled={index === 0} onClick={() => onMove(index, -1)}>
                    <EditorIcon name="up" />
                  </button>
                  <button type="button" className="icon-button" title="Move down" aria-label={`Move cue ${index + 1} down`} disabled={index === cues.length - 1} onClick={() => onMove(index, 1)}>
                    <EditorIcon name="down" />
                  </button>
                  <button type="button" className="icon-button" title="Split cue" aria-label={`Split cue ${index + 1}`} onClick={() => onSplit(index)}>
                    <EditorIcon name="split" />
                  </button>
                  <button type="button" className="icon-button" title="Merge with next cue" aria-label={`Merge cue ${index + 1} with the next cue`} disabled={index === cues.length - 1} onClick={() => onMerge(index)}>
                    <EditorIcon name="merge" />
                  </button>
                  <button type="button" className="icon-button is-danger" title="Delete cue" aria-label={`Delete cue ${index + 1}`} onClick={() => onRemove(index)}>
                    <EditorIcon name="remove" />
                  </button>
                </div>
              </div>
              <textarea
                className="editor-text"
                value={cue.text}
                rows={2}
                aria-label={`Caption text for cue ${index + 1}`}
                onChange={(event) => onUpdate(index, { text: event.target.value })}
              />
              {error && (
                <ul className="editor-errors" role="alert">
                  {error.start && <li>{error.start}</li>}
                  {error.end && <li>{error.end}</li>}
                  {error.overlap && <li>{error.overlap}</li>}
                </ul>
              )}
              <button type="button" className="editor-insert" aria-label={`Add a cue after cue ${index + 1}`} onClick={() => onAdd(index)}>
                <EditorIcon name="add" size={15} />Add cue
              </button>
            </div>
          )
        })}
      </div>
      {cues.length === 0 && (
        <button type="button" className="editor-insert editor-insert-empty" onClick={() => onAdd(-1)}>
          <EditorIcon name="add" size={15} />Add the first cue
        </button>
      )}
    </div>
  )
}

export default CaptionEditor
