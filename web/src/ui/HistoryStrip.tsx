import { useEffect, useRef } from 'react'
import { useEditor, type HistoryIcon } from '../store/editor'
import { I, type IconName } from './Icons'
import { VersionTag } from './VersionTag'

const iconFor = (i: HistoryIcon): IconName => (i in I ? (i as IconName) : 'start')

export function HistoryStrip() {
  const history = useEditor((s) => s.history)
  const cursor = useEditor((s) => s.cursor)
  const jumpTo = useEditor((s) => s.jumpTo)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cursor, history.length])

  return (
    <footer className="history" ref={ref} aria-label="History">
      <button className="btn ghost icon" onClick={undo} disabled={cursor === 0} title="Undo (Ctrl+Z)" aria-label="Undo">
        <I.undo />
      </button>
      <button className="btn ghost icon" onClick={redo} disabled={cursor >= history.length - 1} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
        <I.redo />
      </button>
      <span className="sep" />
      {history.map((h, i) => {
        const Icon = I[iconFor(h.icon)]
        return (
          <button key={i} className={`step${i === cursor ? ' current' : ''}${i > cursor ? ' future' : ''}`} onClick={() => jumpTo(i)} title={`${i + 1}. ${h.label}${i > cursor ? ' (undone)' : ''}`} aria-label={h.label} aria-current={i === cursor}>
            <Icon size={18} />
          </button>
        )
      })}
      <span className="count">
        Step <span className="mono">{cursor + 1}</span> of <span className="mono">{history.length}</span>
      </span>
      <VersionTag inline />
    </footer>
  )
}
