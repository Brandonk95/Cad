import { useMemo, useState } from 'react'
import { CURRENT_VERSION, noticesEnabled, setNoticesEnabled } from '../lib/updates'
import { PRINTER_PRESETS } from '../model/catalog'
import { worldBodies } from '../model/geometry'
import { findNode } from '../model/ops'
import { DEFAULT_CLEARANCES, type FitClass, type PrinterProfile, type Vec3 } from '../model/types'
import { createPrinter, saveCalibration, updatePrinter } from '../lib/pb'
import { COUPON_PEG, COUPON_STEPS, couponNodes } from '../print/coupon'
import { suggestOrientations } from '../print/orientation'
import { download, to3MF, toSTL } from '../export/files'
import { mapNodes } from '../model/ops'
import { useEditor, usePrintContext } from '../store/editor'
import { Sheet } from './Sheet'
import { I } from './Icons'

const num = (s: string, d: number) => {
  const v = parseFloat(s)
  return Number.isFinite(v) ? v : d
}

// ---------------------------------------------------------------------------

export function PrinterForm({ initial, onSaved, onCancel, submitLabel = 'Save printer' }: { initial?: PrinterProfile; onSaved: (p: PrinterProfile) => void; onCancel?: () => void; submitLabel?: string }) {
  const [p, setP] = useState<Omit<PrinterProfile, 'id'>>(initial ?? PRINTER_PRESETS[0])
  const [presetIdx, setPresetIdx] = useState<number | null>(initial ? null : 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toast = useEditor((s) => s.toast)

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const saved = initial ? await updatePrinter({ ...p, id: initial.id }) : await createPrinter(p)
      onSaved(saved)
      toast(`${saved.name} is ready. Every hole and wall now checks against it.`, 'ok')
    } catch (e) {
      setErr((e as Error).message || 'Could not save this printer.')
    } finally {
      setBusy(false)
    }
  }
  const setBed = (i: number, v: string) => {
    const bed = [...p.bed] as Vec3
    bed[i] = num(v, bed[i])
    setP({ ...p, bed })
  }

  return (
    <>
      {!initial && (
        <div className="preset-list">
          {PRINTER_PRESETS.map((pr, i) => (
            <button key={pr.name} className="preset" aria-pressed={presetIdx === i} onClick={() => { setPresetIdx(i); setP(pr) }}>
              <div className="n">{pr.name}</div>
              <div className="s">{pr.bed.join(' × ')}</div>
            </button>
          ))}
        </div>
      )}
      <label className="field">
        <span>Name</span>
        <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </label>
      <div className="field">
        <span>Build volume (mm)</span>
        <div className="grid3">
          {['X', 'Y', 'Z'].map((a, i) => <input key={`${a}${presetIdx}`} className="input mono" aria-label={`Bed ${a}`} defaultValue={p.bed[i]} onBlur={(e) => setBed(i, e.target.value)} />)}
        </div>
      </div>
      <div className="grid3">
        <label className="field">
          <span>Technology</span>
          <select className="input" value={p.technology} onChange={(e) => setP({ ...p, technology: e.target.value as PrinterProfile['technology'] })}>
            <option value="fdm">FDM</option>
            <option value="resin">Resin</option>
            <option value="sls">SLS</option>
          </select>
        </label>
        <label className="field">
          <span>Nozzle (mm)</span>
          <input className="input mono" defaultValue={p.nozzle} key={`n${presetIdx}`} onBlur={(e) => setP({ ...p, nozzle: num(e.target.value, p.nozzle) })} />
        </label>
        <label className="field">
          <span>Layers (mm)</span>
          <input className="input mono" defaultValue={`${p.layer_min}–${p.layer_max}`} key={`l${presetIdx}`} onBlur={(e) => {
            const [a, b] = e.target.value.split(/[-–]/).map((x) => parseFloat(x))
            setP({ ...p, layer_min: Number.isFinite(a) ? a : p.layer_min, layer_max: Number.isFinite(b) ? b : p.layer_max })
          }} />
        </label>
      </div>
      <label className="row">
        <input type="checkbox" checked={p.multi_material} onChange={(e) => setP({ ...p, multi_material: e.target.checked })} />
        Multi-material (AMS, MMU or tool changer)
      </label>
      {err && <p className="note" style={{ color: 'var(--print-thin)' }}>{err}</p>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {onCancel && <button className="btn" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" onClick={save} disabled={busy || !p.name.trim()}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </>
  )
}

export function PrinterDialog() {
  const close = () => useEditor.getState().setDialog(null)
  const printers = useEditor((s) => s.printers)
  const materials = useEditor((s) => s.materials)
  const printerId = useEditor((s) => s.printerId)
  const materialId = useEditor((s) => s.materialId)
  const setPrinterId = useEditor((s) => s.setPrinterId)
  const setMaterialId = useEditor((s) => s.setMaterialId)
  const upsertPrinter = useEditor((s) => s.upsertPrinter)
  const setDialog = useEditor((s) => s.setDialog)
  const ctx = usePrintContext()
  const [editing, setEditing] = useState<'new' | PrinterProfile | null>(printers.length ? null : 'new')

  return (
    <Sheet title="Printer and material" onClose={close} wide>
      {editing ? (
        <PrinterForm
          initial={editing === 'new' ? undefined : editing}
          onCancel={printers.length ? () => setEditing(null) : undefined}
          onSaved={(p) => { upsertPrinter(p); setEditing(null) }}
        />
      ) : (
        <>
          <div className="section">
            <h4>Printer</h4>
            <div className="preset-list">
              {printers.map((p) => (
                <button key={p.id} className="preset" aria-pressed={p.id === printerId} onClick={() => setPrinterId(p.id)} onDoubleClick={() => setEditing(p)}>
                  <div className="n">{p.name}</div>
                  <div className="s">{p.bed.join(' × ')} · {p.nozzle}</div>
                </button>
              ))}
              <button className="preset" onClick={() => setEditing('new')}>
                <div className="n"><I.plus size={14} /> Add printer</div>
                <div className="s">From a preset or custom</div>
              </button>
            </div>
            {printerId && <div><button className="btn small" onClick={() => setEditing(printers.find((p) => p.id === printerId)!)}>Edit {ctx.printer.name}</button></div>}
          </div>
          <div className="section">
            <h4>Material</h4>
            <div className="preset-list">
              {materials.map((m) => (
                <button key={m.id} className="preset" aria-pressed={m.id === materialId} onClick={() => setMaterialId(m.id)}>
                  <div className="n">{m.name}</div>
                  <div className="s">{m.overhang_deg}° · {m.bridge_mm} mm bridge</div>
                </button>
              ))}
            </div>
          </div>
          <div className="section">
            <h4>Fit calibration</h4>
            <p className="note">
              {ctx.calibrated
                ? <>Calibrated for {ctx.printer.name} with {ctx.material.name}: press <span className="mono">{ctx.clearances.press.toFixed(2)}</span>, snug <span className="mono">{ctx.clearances.snug.toFixed(2)}</span>, slide <span className="mono">{ctx.clearances.slide.toFixed(2)}</span>, loose <span className="mono">{ctx.clearances.loose.toFixed(2)}</span> mm.</>
                : 'Not calibrated yet. Fits use safe defaults. A 10 minute coupon print makes them match your printer.'}
            </p>
            <div><button className="btn" onClick={() => setDialog('calibrate')} disabled={!printers.length}><I.calibrate size={16} /> {ctx.calibrated ? 'Recalibrate' : 'Calibrate fits'}</button></div>
          </div>
        </>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

const QUESTIONS: { fit: Exclude<FitClass, 'loose'>; title: string; hint: string }[] = [
  { fit: 'press', title: 'Press fit', hint: 'The tightest hole the peg goes into with firm thumb pressure, and stays put.' },
  { fit: 'snug', title: 'Snug fit', hint: 'Slides in with light force. No wobble.' },
  { fit: 'slide', title: 'Slide fit', hint: 'Moves freely in and out with a little play.' },
]

export function CalibrationWizard() {
  const close = () => useEditor.getState().setDialog(null)
  const ctx = usePrintContext()
  const toast = useEditor((s) => s.toast)
  const upsert = useEditor((s) => s.upsertCalibration)
  const [step, setStep] = useState(0)
  const [picks, setPicks] = useState<Record<string, number>>({ press: 1, snug: 3, slide: 5 })
  const [busy, setBusy] = useState(false)
  const coupon = useMemo(() => worldBodies(couponNodes(), DEFAULT_CLEARANCES), [])

  const finish = async () => {
    setBusy(true)
    try {
      const c = {
        press: COUPON_STEPS[picks.press],
        snug: COUPON_STEPS[Math.max(picks.snug, picks.press)],
        slide: COUPON_STEPS[Math.max(picks.slide, picks.snug)],
        loose: COUPON_STEPS[Math.max(picks.slide, picks.snug)] + 0.15,
      }
      const saved = await saveCalibration(ctx.printer.id, ctx.material.id, c, picks)
      upsert(saved)
      toast(`Fits now match your ${ctx.printer.name}. Every hole updated.`, 'ok')
      close()
    } catch (e) {
      toast(`Couldn't save calibration: ${(e as Error).message}`, 'warn')
    } finally {
      setBusy(false)
    }
  }

  const q = QUESTIONS[step - 1]
  return (
    <Sheet
      title={`Calibrate fits · ${ctx.printer.name} · ${ctx.material.name}`}
      onClose={close}
      footer={
        <>
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Back</button>}
          {step < 3 && <button className="btn primary" onClick={() => setStep(step + 1)}>{step === 0 ? 'I printed it' : 'Next'}</button>}
          {step === 3 && <button className="btn primary" onClick={finish} disabled={busy}>{busy ? 'Saving…' : 'Save fits'}</button>}
        </>
      }
    >
      <div className="steps" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
      {step === 0 && (
        <>
          <p style={{ margin: 0 }}>
            Print this coupon in {ctx.material.name}. It has one {COUPON_PEG} mm peg and eight holes, each 0.05 mm bigger than the last. Takes about 10 minutes.
          </p>
          <p className="note" style={{ margin: 0 }}>Hole 1 has one dimple next to it, hole 8 has eight. Print it flat, default settings.</p>
          <div className="row">
            <button className="btn primary" onClick={() => download('stratum-fit-coupon.3mf', to3MF(coupon, 'Stratum fit coupon') as BlobPart, 'model/3mf')}><I.send size={16} /> Download 3MF</button>
            <button className="btn" onClick={() => download('stratum-fit-coupon.stl', toSTL(coupon), 'model/stl')}>STL</button>
          </div>
        </>
      )}
      {q && (
        <>
          <div>
            <div className="panel-title">{q.title}</div>
            <p className="note" style={{ margin: '4px 0 0' }}>{q.hint}</p>
          </div>
          <div className="holes" role="radiogroup" aria-label={q.title}>
            {COUPON_STEPS.map((c, i) => (
              <button key={i} className="hole-pick" role="radio" aria-checked={picks[q.fit] === i} aria-pressed={picks[q.fit] === i} onClick={() => setPicks({ ...picks, [q.fit]: i })}>
                <span className="ring" style={{ width: 16 + i * 1.6, height: 16 + i * 1.6 }} />
                <span className="mono">{i + 1}</span>
                <small>+{c.toFixed(2)}</small>
              </button>
            ))}
          </div>
        </>
      )}
      {step === 3 && (
        <div className="section">
          <h4>Your fits</h4>
          {(['press', 'snug', 'slide'] as const).map((f) => (
            <div key={f} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{f[0].toUpperCase() + f.slice(1)}</span>
              <span className="mono">hole {picks[f] + 1} · +{COUPON_STEPS[picks[f]].toFixed(2)}<span className="unit">mm</span></span>
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>Loose</span>
            <span className="mono">+{(COUPON_STEPS[picks.slide] + 0.15).toFixed(2)}<span className="unit">mm</span></span>
          </div>
          <p className="note">Saved for {ctx.printer.name} with {ctx.material.name}. Other materials keep their own fits.</p>
        </div>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

export function OrientationDialog() {
  const id = useEditor((s) => s.orientFor)!
  const nodes = useEditor((s) => s.nodes)
  const commit = useEditor((s) => s.commit)
  const setOrientFor = useEditor((s) => s.setOrientFor)
  const ctx = usePrintContext()
  const node = findNode(nodes, id)
  const options = useMemo(() => (node && nodes.some((n) => n.id === id) ? suggestOrientations(node, ctx) : []), [node, ctx, id, nodes])
  const close = () => setOrientFor(null)
  if (!node) return null
  const fmtT = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} m` : `${Math.round(m)} m`)

  return (
    <Sheet title={`Orientation · ${node.name}`} onClose={close}>
      <p className="note" style={{ margin: 0 }}>Ranked by support area, then print time. Pick one to lay it on the bed that way.</p>
      <div className="orient-list">
        {options.map((o, i) => (
          <button key={o.label} className={`orient${i === 0 ? ' best' : ''}`} onClick={() => {
            commit(`Orient: ${o.label}`, 'orient', mapNodes(useEditor.getState().nodes, id, () => o.node))
            close()
          }}>
            <span>{o.label}{i === 0 && <span className="chip" style={{ marginLeft: 8, color: 'var(--accent)' }}>Best</span>}</span>
            <span><span className="k">Supports</span><span className="mono">{(o.supportArea / 100).toFixed(1)}<span className="unit">cm²</span></span></span>
            <span><span className="k">Height</span><span className="mono">{o.height.toFixed(1)}<span className="unit">mm</span></span></span>
            <span><span className="k">Time</span><span className="mono">{fmtT(o.minutes)}</span></span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

const KEYS: [string, string][] = [
  ['B C O K W', 'Box, cylinder, sphere, cone, wedge'],
  ['X M N', 'Screw hole, magnet pocket, pin and hole'],
  ['H', 'Switch solid / hole'],
  ['G / Shift+G', 'Combine / ungroup'],
  ['V / R', 'Move / rotate handles'],
  ['Arrows, PgUp, PgDn', 'Nudge 1 mm (Shift: 10 mm)'],
  ['D', 'Drop to bed'],
  ['Ctrl+D', 'Duplicate'],
  ['Delete', 'Delete selection'],
  ['P', 'Print overlay on / off'],
  ['F', 'Frame selection'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['[', 'Collapse tool shelf'],
  ['Esc', 'Clear selection'],
]

export function ShortcutsDialog() {
  const reduced = useEditor((s) => s.reducedMotion)
  const setReduced = useEditor((s) => s.setReducedMotion)
  const [notices, setNotices] = useState(noticesEnabled)
  return (
    <Sheet title="Keyboard shortcuts" onClose={() => useEditor.getState().setDialog(null)}>
      <div className="section">
        {KEYS.map(([k, v]) => (
          <div key={k} className="row" style={{ justifyContent: 'space-between' }}>
            <span>{v}</span>
            <span className="mono muted">{k}</span>
          </div>
        ))}
      </div>
      <label className="row">
        <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />
        Reduce motion
      </label>
      <label className="row">
        <input type="checkbox" checked={notices} onChange={(e) => {
          setNoticesEnabled(e.target.checked)
          setNotices(e.target.checked)
          window.dispatchEvent(new Event('stratum:update-prefs'))
        }} />
        Tell me when a new version is ready
      </label>
      <p className="note" style={{ margin: 0 }}>Stratum <span className="mono">{CURRENT_VERSION}</span></p>
    </Sheet>
  )
}
