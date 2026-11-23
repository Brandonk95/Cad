import { useEffect, useState } from 'react'
import { createProject, deleteProject, listProjects, pb, type ProjectRecord } from '../lib/pb'
import { go } from '../lib/route'
import { useEditor, usePrintContext } from '../store/editor'
import { I } from '../ui/Icons'
import { Wordmark } from '../ui/Logo'
import { PrinterDialog, CalibrationWizard } from '../ui/Dialogs'
import { setTourStatus, startTour, tourStatus } from '../tour/tour'

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso.replace(' ', 'T')).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso.replace(' ', 'T')).toLocaleDateString()
}

export function Home({ onSignOut }: { onSignOut: () => void }) {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null)
  const [err, setErr] = useState('')
  const [inviteHidden, setInviteHidden] = useState(() => tourStatus() !== null)
  const ctx = usePrintContext()
  const printers = useEditor((s) => s.printers)
  const dialog = useEditor((s) => s.dialog)
  const setDialog = useEditor((s) => s.setDialog)
  const theme = useEditor((s) => s.theme)
  const setTheme = useEditor((s) => s.setTheme)

  useEffect(() => {
    // First run: ask for the printer before anything else.
    if (!useEditor.getState().printers.length) setDialog('printer')
  }, [setDialog])

  useEffect(() => {
    listProjects().then(setProjects).catch((e) => setErr(e.message))
  }, [])

  const create = async () => {
    try {
      const p = await createProject('Untitled part', useEditor.getState().printerId ?? undefined, useEditor.getState().materialId ?? undefined)
      go({ name: 'project', id: p.id })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <div className="page">
      <div className="page-top">
        <Wordmark />
        <div style={{ flex: 1 }} />
        <button className="printer-badge" onClick={() => setDialog('printer')}>
          <span className={`dot${ctx.calibrated ? '' : ' uncal'}`} />
          {printers.length ? ctx.printer.name : 'Set up your printer'}
          {printers.length > 0 && <span className="sub">{ctx.material.name}</span>}
        </button>
        <button className="btn ghost icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? <I.sun /> : <I.moon />}</button>
        <button className="btn ghost hide-sm" onClick={startTour} title="A short guided tour in a practice part">Take the tour</button>
        <button className="btn ghost" onClick={() => { pb.authStore.clear(); onSignOut() }}><I.logout size={16} /> Sign out</button>
      </div>
      <div className="page-body">
        <h1>Your parts</h1>
        <p className="muted" style={{ margin: 0 }}>
          {printers.length
            ? ctx.calibrated
              ? `Fits are calibrated for ${ctx.printer.name} with ${ctx.material.name}.`
              : `Fits use defaults until you print the calibration coupon.`
            : 'Start by telling Stratum which printer you have. Every hole and wall is checked against it.'}
          {printers.length > 0 && !ctx.calibrated && <> <button className="btn small" onClick={() => setDialog('calibrate')}>Calibrate fits</button></>}
        </p>
        {err && <p style={{ color: 'var(--print-thin)' }}>{err}</p>}
        {!inviteHidden && projects !== null && projects.length === 0 && printers.length > 0 && (
          <div className="tour-invite" role="region" aria-label="Tour">
            <div className="text">
              <b>New to Stratum?</b>
              <span className="muted">A 3 minute tour builds your first part with you: a box, a screw hole, a print check and an export.</span>
            </div>
            <div className="actions">
              <button className="btn primary" onClick={startTour}>Start the tour</button>
              <button className="btn" onClick={() => setInviteHidden(true)}>Not now</button>
              <button className="btn ghost" onClick={() => { setTourStatus('off'); setInviteHidden(true) }}>Don't ask again</button>
            </div>
          </div>
        )}
        <div className="cards">
          <button className="card new" onClick={create}>
            <I.plus />
            New part
          </button>
          {projects?.map((p) => (
            <div key={p.id} className="card" role="button" tabIndex={0} onClick={() => go({ name: 'project', id: p.id })} onKeyDown={(e) => e.key === 'Enter' && go({ name: 'project', id: p.id })}>
              <div className="thumb">{p.thumb ? <img src={p.thumb} alt="" /> : <I.box size={40} />}</div>
              <div className="meta">
                <span className="n">{p.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{ago(p.updated)}</span>
                <button className="btn ghost icon small" aria-label={`Delete ${p.name}`} title="Delete" onClick={async (e) => {
                  e.stopPropagation()
                  if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return
                  await deleteProject(p.id)
                  setProjects((ps) => ps?.filter((x) => x.id !== p.id) ?? null)
                }}><I.delete size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {dialog === 'printer' && <PrinterDialog />}
      {dialog === 'calibrate' && <CalibrationWizard />}
    </div>
  )
}
