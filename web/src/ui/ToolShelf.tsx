import { PRINT_PRIMITIVES, SHAPES } from '../model/catalog'
import { useEditor } from '../store/editor'
import { I } from './Icons'
import { SKETCH_TOOLS, useSketch } from '../sketch/store'

/** Drag type for a shape dragged from the shelf onto the canvas. */
export const SHAPE_DRAG = 'application/x-stratum-shape'

const drag = (e: React.DragEvent, kind: string) => {
  e.dataTransfer.setData(SHAPE_DRAG, kind)
  e.dataTransfer.effectAllowed = 'copy'
}

export function ToolShelf() {
  const open = useEditor((s) => s.shelfOpen)
  const setOpen = useEditor((s) => s.setShelfOpen)
  const add = useEditor((s) => s.add)
  const combine = useEditor((s) => s.combineSelected)
  const toggleHole = useEditor((s) => s.toggleHole)
  const selCount = useEditor((s) => s.selection.length)
  const mode = useEditor((s) => s.mode)
  const tool = useSketch((s) => s.tool)
  const setTool = useSketch((s) => s.setTool)

  return (
    <nav className={`shelf${open ? ' open' : ''}`} aria-label="Tools">
      {mode === 'sketch' ? (
        <>
          <h3>Sketch</h3>
          {SKETCH_TOOLS.map((t) => {
            const Icon = I[t.icon]
            return (
              <button key={t.id} className="tool" aria-pressed={tool === t.id} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
                <Icon />
                <span className="label">{t.label}</span>
                <kbd>{t.key}</kbd>
              </button>
            )
          })}
          <p className="shelf-note">Draw on the bed or on top of a part, then pull it up. Pull down into a part to cut a hole.</p>
        </>
      ) : (
        <>
      <h3>Shapes</h3>
      {SHAPES.map((t) => {
        const Icon = I[t.kind as 'box']
        return (
          <button key={t.kind} className="tool" data-tour={`tool-${t.kind}`} onClick={() => add(t.kind)} draggable onDragStart={(e) => drag(e, t.kind)} title={`${t.label} (${t.key}). Drag onto a face to place it there.`}>
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
          <button key={t.kind} className="tool" data-tour={`tool-${t.kind}`} onClick={() => add(t.kind)} draggable onDragStart={(e) => drag(e, t.kind)} title={`${t.label} (${t.key}). Drag onto a face to place it there.`}>
            <Icon />
            <span className="label">{t.label}</span>
            <kbd>{t.key}</kbd>
          </button>
        )
      })}
        </>
      )}
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
