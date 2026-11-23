import { PRINT_PRIMITIVES, SHAPES } from '../model/catalog'
import { useEditor } from '../store/editor'
import { I } from './Icons'

export function ToolShelf() {
  const open = useEditor((s) => s.shelfOpen)
  const setOpen = useEditor((s) => s.setShelfOpen)
  const add = useEditor((s) => s.add)
  const combine = useEditor((s) => s.combineSelected)
  const toggleHole = useEditor((s) => s.toggleHole)
  const selCount = useEditor((s) => s.selection.length)

  return (
    <nav className={`shelf${open ? ' open' : ''}`} aria-label="Tools">
      <h3>Shapes</h3>
      {SHAPES.map((t) => {
        const Icon = I[t.kind as 'box']
        return (
          <button key={t.kind} className="tool" data-tour={`tool-${t.kind}`} onClick={() => add(t.kind)} title={`${t.label} (${t.key})`}>
            <Icon />
            <span className="label">{t.label}</span>
            <kbd>{t.key}</kbd>
          </button>
        )
      })}
      <h3>Print primitives</h3>
      {PRINT_PRIMITIVES.map((t) => {
        const Icon = I[t.kind as 'screwHole']
        return (
          <button key={t.kind} className="tool" data-tour={`tool-${t.kind}`} onClick={() => add(t.kind)} title={`${t.label} (${t.key})`}>
            <Icon />
            <span className="label">{t.label}</span>
            <kbd>{t.key}</kbd>
          </button>
        )
      })}
      <h3>Build</h3>
      <button className="tool" onClick={toggleHole} disabled={!selCount} title="Solid / hole (H)">
        <I.hole />
        <span className="label">Solid / hole</span>
        <kbd>H</kbd>
      </button>
      <button className="tool" onClick={combine} disabled={selCount < 2} title="Combine (G)">
        <I.group />
        <span className="label">Combine</span>
        <kbd>G</kbd>
      </button>
      <button className="btn ghost icon collapse" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse tools' : 'Expand tools'} title={open ? 'Collapse ([)' : 'Expand ([)'}>
        {open ? <I.chevronLeft /> : <I.chevronRight />}
      </button>
    </nav>
  )
}
