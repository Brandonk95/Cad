import { useState } from 'react'
import { flushPendingSave } from '../lib/saveGate'
import { dismissBuild, setNoticesEnabled, useUpdateCheck } from '../lib/updates'
import { I } from './Icons'

/** Top-right card when a newer Stratum is deployed (e.g. Watchtower pulled a new image). */
export function UpdateNotice() {
  const { update, refresh } = useUpdateCheck()
  const [reloading, setReloading] = useState(false)
  if (!update) return null

  const reload = async () => {
    setReloading(true)
    await flushPendingSave()
    window.location.reload()
  }

  return (
    <aside className="update-notice" role="status" aria-live="polite" aria-label="Update available">
      <div className="update-head">
        <I.send size={16} />
        <strong>Stratum {update.version} is ready</strong>
      </div>
      <ul>
        {update.changes.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      <p className="note">Reload to update. Your work is saved first.</p>
      <div className="update-actions">
        <button className="btn primary small" onClick={reload} disabled={reloading}>
          {reloading ? 'Saving…' : 'Reload to update'}
        </button>
        <button className="btn small" onClick={() => { dismissBuild(update.build); refresh() }}>
          Got it
        </button>
        <button className="btn ghost small" onClick={() => { setNoticesEnabled(false); refresh() }}>
          Don't show again
        </button>
      </div>
    </aside>
  )
}
