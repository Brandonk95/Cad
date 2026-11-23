import { useState } from 'react'
import { useEditor } from '../store/editor'
import { useAnalysis } from '../store/analysis'
import { I } from './Icons'

const fmtTime = (min: number) => {
  if (min < 1) return '0 min'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

export function PrintPanel() {
  const overlay = useEditor((s) => s.overlay)
  const toggle = useEditor((s) => s.toggleOverlay)
  const applyFix = useEditor((s) => s.applyFix)
  const select = useEditor((s) => s.select)
  const nodes = useEditor((s) => s.nodes)
  const analysis = useAnalysis((s) => s.analysis)
  const busy = useAnalysis((s) => s.busy)
  const [open, setOpen] = useState(true)
  const issues = analysis?.issues ?? []
  const est = analysis?.estimate

  return (
    <section className="print-panel" aria-label="Print check">
      <header>
        <span className="title">
          Print check
          <span className={`count${issues.length ? '' : ' ok'}`} title={`${issues.length} to look at`}>{issues.length}</span>
          {busy && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>checking…</span>}
        </span>
        <button className="btn ghost icon" onClick={toggle} aria-pressed={overlay} title={`${overlay ? 'Hide' : 'Show'} overlay (P)`} aria-label="Toggle print overlay">
          {overlay ? <I.eye /> : <I.eyeOff />}
        </button>
        <button className="btn ghost icon" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'}>
          <I.chevronDown style={{ transform: open ? 'none' : 'rotate(180deg)', transition: 'transform var(--t-panel) var(--ease)' }} />
        </button>
      </header>
      {open && (
        <div className="issues">
          {!nodes.length ? (
            <div className="all-good">Add a shape to start. Print problems show up here as you go.</div>
          ) : !issues.length ? (
            <div className="all-good"><I.checkCircle /> No print problems on this printer.</div>
          ) : (
            issues.map((i) => (
              <div className="issue" key={i.id} onClick={() => select([i.nodeId])}>
                <span className={`sw sw-${i.kind}`} aria-hidden="true" />
                <div className="body">
                  <p className="msg">{i.message}</p>
                  <div className="fixes">
                    {i.fixes.map((f, k) => (
                      <button key={k} className={`btn small${k === 0 ? ' primary' : ''}`} onClick={(e) => {
                        e.stopPropagation()
                        applyFix(f.fix)
                      }}>{f.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {est && nodes.length > 0 && (
        <>
          <div className="estimates">
            <div><div className="v">{fmtTime(est.minutes)}</div><div className="k">Time</div></div>
            <div><div className="v">{est.grams.toFixed(1)}<span className="unit">g</span></div><div className="k">Filament</div></div>
            <div><div className="v">{est.cost.toFixed(2)}</div><div className="k">Cost</div></div>
          </div>
          <div className="estimate-note">Estimates. Your slicer has the final say.</div>
        </>
      )}
    </section>
  )
}
