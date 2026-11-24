import { useEffect, useRef, useState } from 'react'
import { getProject, saveProject } from '../lib/pb'
import { registerFlush } from '../lib/saveGate'
import { go } from '../lib/route'
import { contextOf, useEditor } from '../store/editor'
import { closedModel } from '../model/ops'
import { useAnalysis, useLiveAnalysis } from '../store/analysis'
import { TopBar } from '../ui/TopBar'
import { ToolShelf } from '../ui/ToolShelf'
import { Inspector } from '../ui/Inspector'
import { HistoryStrip } from '../ui/HistoryStrip'
import { PrintPanel } from '../ui/PrintPanel'
import { CalibrationWizard, OrientationDialog, PrinterDialog, ShortcutsDialog } from '../ui/Dialogs'
import { I } from '../ui/Icons'
import { Viewport, captureThumbnail, frameSelection } from '../viewport/Viewport'
import { useMeasure } from '../viewport/measure'
import { useSection } from '../viewport/section'
import { canvasHover, dropTargetAt } from '../viewport/probe'
import { SHAPE_DRAG } from '../ui/ToolShelf'
import type { ShapeKind } from '../model/types'
import { ALL_TEMPLATES } from '../model/catalog'
import { TourOverlay } from '../tour/TourOverlay'
import { useTour } from '../tour/tour'
import { SKETCH_TOOLS, useSketch } from '../sketch/store'
import { viewMove } from '../viewport/viewDir'

const KEY_TO_KIND = Object.fromEntries(ALL_TEMPLATES.map((t) => [t.key.toLowerCase(), t.kind]))

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t?.closest?.('input, textarea, select, [contenteditable]')) return
      if (document.querySelector('.scrim')) return
      const s = useEditor.getState()
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      const step = e.shiftKey ? 10 : 1

      if (mod && k === 'z') return e.preventDefault(), e.shiftKey ? s.redo() : s.undo()
      if (mod && k === 'y') return e.preventDefault(), s.redo()
      if (mod && k === 'd') return e.preventDefault(), s.duplicateSelected()
      if (mod && k === 'a') return e.preventDefault(), s.select(s.nodes.map((n) => n.id))
      if (mod) return

      // Sketch mode: R, C, L and V pick drawing tools instead of the Block shortcuts.
      if (s.mode === 'sketch') {
        const t = SKETCH_TOOLS.find((x) => x.key.toLowerCase() === k)
        if (t) return useSketch.getState().setTool(t.id)
        if (e.key === 'Escape' && useSketch.getState().tool !== 'select') return useSketch.getState().setTool('select')
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          return s.removeSelected()
        case 'Escape':
          // With nothing selected, Esc closes a group that is open for editing.
          if (!s.selection.length && s.groupEdit.length) return s.closeGroup()
          return s.select([])
        // Arrows move along the bed axis closest to that direction on screen.
        case 'ArrowLeft':
          return e.preventDefault(), s.nudge(...viewMove(-step, 0), 0)
        case 'ArrowRight':
          return e.preventDefault(), s.nudge(...viewMove(step, 0), 0)
        case 'ArrowUp':
          return e.preventDefault(), s.nudge(...viewMove(0, step), 0)
        case 'ArrowDown':
          return e.preventDefault(), s.nudge(...viewMove(0, -step), 0)
        case 'PageUp':
          return e.preventDefault(), s.nudge(0, 0, step)
        case 'PageDown':
          return e.preventDefault(), s.nudge(0, 0, -step)
        case '[':
          return s.setShelfOpen(!s.shelfOpen)
        case '?':
          return s.setDialog('shortcuts')
      }
      if (k === 'g') return e.shiftKey ? s.ungroupSelected() : s.combineSelected()
      if (k === 'h') return s.toggleHole()
      if (k === 'p') return s.toggleOverlay()
      if (k === 'f') return frameSelection()
      if (k === 'q') return useMeasure.getState().setOn(!useMeasure.getState().on)
      if (k === 'd') return s.dropSelected()
      if (k === 'v') return s.setTransformMode('translate')
      if (k === 'r') return s.setTransformMode('rotate')
      if (k === 's') return s.setTransformMode('scale')
      // With the mouse over the canvas, the new shape lands on the face under it.
      if (KEY_TO_KIND[k]) {
        const h = canvasHover()
        return s.add(KEY_TO_KIND[k], h ? dropTargetAt(h.x, h.y) : null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Saves a moment after the last change. Thumbnails at most every 15 s. */
function useAutosave(projectId: string | null) {
  const dirty = useEditor((s) => s.dirty)
  const [state, setState] = useState('Saved')
  const lastThumb = useRef(0)
  const pending = useRef(false)
  const save = useRef<() => Promise<void>>(async () => {})

  save.current = async () => {
    if (!projectId) return
    pending.current = false
    const s = useEditor.getState()
    setState('Saving…')
    try {
      const thumb = Date.now() - lastThumb.current > 15000 ? await captureThumbnail() : null
      if (thumb) lastThumb.current = Date.now()
      await saveProject(projectId, {
        name: s.projectName,
        model: { version: 1, units: 'mm', nodes: s.groupEdit.length ? closedModel(s.nodes, s.groupEdit, contextOf(s).clearances) : s.nodes },
        ...(s.printerId && s.printerId !== 'guest' ? { printer: s.printerId } : {}),
        ...(s.materialId && /^[a-z0-9]{15}$/.test(s.materialId) ? { material: s.materialId } : {}),
        ...(thumb ? { thumbnail: thumb } : {}),
      })
      setState('Saved')
    } catch (e) {
      console.error(e)
      pending.current = true
      setState("Couldn't save. Will retry on the next change.")
    }
  }

  useEffect(() => {
    if (!projectId || dirty === 0) return
    pending.current = true
    setState('Unsaved changes')
    const t = setTimeout(() => save.current(), 1200)
    return () => clearTimeout(t)
  }, [dirty, projectId])

  // The update notice calls this before reloading so nothing is lost.
  useEffect(() => {
    registerFlush(async () => {
      if (pending.current) await save.current()
    })
    return () => registerFlush(null)
  }, [])

  return state
}

/** Shown while a combined part is open: its pieces can be edited one by one. */
function GroupEditBanner() {
  const stack = useEditor((s) => s.groupEdit)
  const close = useEditor((s) => s.closeGroup)
  const f = stack[stack.length - 1]
  if (!f) return null
  return (
    <div className="group-banner" role="status">
      <I.ungroup size={16} />
      <span>
        Editing <b>{stack.map((x) => x.name).join(' › ')}</b>. Change any piece, add new ones, then put it back together.
      </span>
      <button className="btn primary" onClick={close}>Done</button>
    </div>
  )
}

/** Where the section cut sits: axis, position and which side stays. */
function SectionPanel() {
  const { axis, at, flip, set } = useSection()
  const bounds = useAnalysis((s) => s.analysis?.bounds)
  const box = bounds && !bounds.isEmpty() ? bounds : null
  const lo = box ? Math.floor(box.min.getComponent(axis) * 10) / 10 : 0
  const hi = box ? Math.ceil(box.max.getComponent(axis) * 10) / 10 : 20
  const pos = at ?? Math.round(((lo + hi) / 2) * 10) / 10
  const names = ['X', 'Y', 'Z']
  return (
    <div className="section-panel" role="group" aria-label="Section view">
      <div className="seg" role="group" aria-label="Cut across">
        {names.map((n, i) => (
          <button key={n} aria-pressed={axis === i} onClick={() => set({ axis: i as 0 | 1 | 2, at: null })} title={`Cut across ${n}`}>{n}</button>
        ))}
      </div>
      <input type="range" min={lo} max={hi} step={0.1} value={Math.min(hi, Math.max(lo, pos))} aria-label="Cut position" onChange={(e) => set({ at: parseFloat(e.target.value) })} />
      <span className="mono section-at">{names[axis]} {pos.toFixed(1)} mm</span>
      <button className="btn ghost" onClick={() => set({ flip: !flip })} title="Show the other side of the cut">Flip</button>
    </div>
  )
}

function SketchHint() {
  const mode = useEditor((s) => s.mode)
  const hint = useSketch((s) => s.hint)
  if (mode !== 'sketch' || !hint) return null
  return (
    <div className="sketch-hint" role="status">
      <I.sketch size={16} />
      <span>{hint}</span>
    </div>
  )
}

export function Editor({ id }: { id: string }) {
  const projectId = useEditor((s) => s.projectId)
  const nodes = useEditor((s) => s.nodes)
  const dialog = useEditor((s) => s.dialog)
  const orientFor = useEditor((s) => s.orientFor)
  const tm = useEditor((s) => s.transformMode)
  const mode = useEditor((s) => s.mode)
  const setTm = useEditor((s) => s.setTransformMode)
  const measuring = useMeasure((s) => s.on)
  const setMeasuring = useMeasure((s) => s.setOn)
  const sectionOn = useSection((s) => s.on)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    getProject(id)
      .then((p) => {
        if (!alive) return
        const s = useEditor.getState()
        s.load(p.id, p.name, p.model.nodes ?? [])
        if (p.printer && s.printers.some((x) => x.id === p.printer)) s.setPrinterId(p.printer)
        if (p.material && s.materials.some((x) => x.id === p.material)) s.setMaterialId(p.material)
        useEditor.setState({ dirty: 0 })
        setTimeout(frameSelection, 400)
        if (useTour.getState().pending) setTimeout(() => useTour.getState().start(), 600)
      })
      .catch(() => alive && setError("This project doesn't exist or isn't yours."))
    return () => {
      alive = false
    }
  }, [id])

  useShortcuts()
  useLiveAnalysis()
  const saveState = useAutosave(projectId === id ? id : null)

  if (error)
    return (
      <div className="auth">
        <div style={{ textAlign: 'center' }}>
          <p>{error}</p>
          <button className="btn primary" onClick={() => go({ name: 'home' })}>Back to your parts</button>
        </div>
      </div>
    )

  return (
    <div className="shell">
      <TopBar saveState={saveState} />
      <ToolShelf />
      <main
        className="canvas"
        data-tour="canvas"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(SHAPE_DRAG)) e.preventDefault()
        }}
        onDrop={(e) => {
          const kind = e.dataTransfer.getData(SHAPE_DRAG) as ShapeKind
          if (!kind) return
          e.preventDefault()
          useEditor.getState().add(kind, dropTargetAt(e.clientX, e.clientY))
        }}
      >
        {projectId === id && <Viewport />}
        <div className="view-tools" role="toolbar" aria-label="View">
          <button className="btn ghost icon" aria-pressed={tm === 'translate'} onClick={() => setTm('translate')} title="Move handles (V)" style={tm === 'translate' ? { color: 'var(--accent)' } : undefined}><I.move /></button>
          <button className="btn ghost icon" aria-pressed={tm === 'rotate'} onClick={() => setTm('rotate')} title="Rotate handles (R)" style={tm === 'rotate' ? { color: 'var(--accent)' } : undefined}><I.rotate /></button>
          <button className="btn ghost icon" aria-pressed={tm === 'scale'} onClick={() => setTm('scale')} title="Scale handles (S)" style={tm === 'scale' ? { color: 'var(--accent)' } : undefined}><I.scale /></button>
          <button className="btn ghost icon" onClick={frameSelection} title="Frame (F)"><I.frame /></button>
          <button className="btn ghost icon" aria-pressed={measuring} onClick={() => setMeasuring(!measuring)} title="Measure (Q)" style={measuring ? { color: 'var(--accent)' } : undefined}><I.measure /></button>
          <button className="btn ghost icon" aria-pressed={sectionOn} onClick={() => useSection.getState().set({ on: !sectionOn, at: null })} title="Section view: cut the model to see inside" style={sectionOn ? { color: 'var(--accent)' } : undefined}><I.section /></button>
        </div>
        {projectId === id && nodes.length === 0 && mode !== 'sketch' && (
          <div className="empty-hint">
            <b>Start with a shape.</b>
            Press B for a box or pick one on the left. Drop a hole into a solid and press G to cut it.
          </div>
        )}
        <SketchHint />
        {sectionOn && <SectionPanel />}
        <GroupEditBanner />
        {measuring && (
          <div className="sketch-hint below-tools" role="status">
            <I.measure size={16} />
            <span>Click two points to measure. Points snap to corners and edge middles; hold Alt to place freely. Esc to finish.</span>
          </div>
        )}
        <PrintPanel />
      </main>
      <Inspector />
      <HistoryStrip />
      {dialog === 'printer' && <PrinterDialog />}
      {dialog === 'calibrate' && <CalibrationWizard />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      {orientFor && <OrientationDialog />}
      <TourOverlay />
    </div>
  )
}
