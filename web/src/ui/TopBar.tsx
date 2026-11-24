import { useEffect, useRef, useState } from 'react'
import { useEditor, usePrintContext } from '../store/editor'
import { useAnalysis } from '../store/analysis'
import { download, safeName, to3MF, toSTL } from '../export/files'
import { go } from '../lib/route'
import { I } from './Icons'
import { Mark } from './Logo'
import type { Mode } from '../store/editor'

const MODES: { id: Mode; label: string; icon: 'block' | 'sketch' | 'pro'; ready: boolean }[] = [
  { id: 'block', label: 'Block', icon: 'block', ready: true },
  { id: 'sketch', label: 'Sketch', icon: 'sketch', ready: true },
  { id: 'pro', label: 'Pro', icon: 'pro', ready: false },
]

export function TopBar({ saveState }: { saveState: string }) {
  const name = useEditor((s) => s.projectName)
  const setName = useEditor((s) => s.setProjectName)
  const mode = useEditor((s) => s.mode)
  const setMode = useEditor((s) => s.setMode)
  const theme = useEditor((s) => s.theme)
  const setTheme = useEditor((s) => s.setTheme)
  const setDialog = useEditor((s) => s.setDialog)
  const toast = useEditor((s) => s.toast)
  const ctx = usePrintContext()
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const exportAs = (fmt: '3mf' | 'stl', onlySelected = false) => {
    setMenu(false)
    const { bodies, analysis } = useAnalysis.getState()
    const sel = useEditor.getState().selection
    const list = onlySelected ? bodies.filter((b) => sel.includes(b.id)) : bodies
    if (!list.length) return toast(onlySelected ? 'Select a solid part to export it.' : 'Nothing to print yet. Add a shape first.', 'info')
    const file = `${safeName(name)}.${fmt}`
    if (fmt === '3mf') download(file, to3MF(list, name) as BlobPart, 'model/3mf')
    else download(file, toSTL(list), 'model/stl')
    const blocking = analysis?.issues.filter((i) => i.kind === 'bed' || i.kind === 'offbed' || i.kind === 'floating').length ?? 0
    if (blocking) toast(`Saved ${file}. ${blocking} placement ${blocking === 1 ? 'problem' : 'problems'} still open.`, 'warn')
    else toast(`Saved ${file}. Open it in your slicer. Happy printing.`, 'ok')
  }

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast('Link copied. Anyone signed in to this Stratum server as you can open it.', 'ok')
    } catch {
      toast('Copy the address bar to share this project.', 'info')
    }
  }

  return (
    <header className="topbar">
      <button className="btn ghost icon" onClick={() => go({ name: 'home' })} aria-label="All projects" title="All projects">
        <Mark />
      </button>
      <input className="title" value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      <span className="save-state hide-sm">{saveState}</span>
      <div className="spacer" />
      <div className="mode-switch" role="group" aria-label="Modeling mode">
        {MODES.map((m) => {
          const Icon = I[m.icon]
          return (
            <button
              key={m.id}
              className={m.ready ? undefined : 'soon'}
              aria-pressed={mode === m.id}
              aria-disabled={!m.ready || undefined}
              aria-label={m.ready ? undefined : `${m.label} mode, coming soon`}
              data-soon={m.ready ? undefined : 'Coming soon'}
              onClick={() => m.ready && setMode(m.id)}
              title={m.ready ? `${m.label} mode` : undefined}
            >
              <Icon size={16} />
              <span className="hide-sm">{m.label}</span>
            </button>
          )
        })}
      </div>
      <div className="spacer" />
      <button className="printer-badge" data-tour="printer" onClick={() => setDialog('printer')} title="Printer and material. Switching re-checks the whole model.">
        <span className={`dot${ctx.calibrated ? '' : ' uncal'}`} />
        <span>{ctx.printer.name}</span>
        <span className="sub hide-sm">
          {ctx.material.name} · <span className="mono">{ctx.printer.nozzle}</span>
          <span className="unit">mm</span>
        </span>
      </button>
      <button className="btn ghost icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme" title="Light / dark">
        {theme === 'dark' ? <I.sun /> : <I.moon />}
      </button>
      <button className="btn ghost icon hide-sm" onClick={() => setDialog('shortcuts')} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
        <I.keyboard />
      </button>
      <button className="btn hide-sm" onClick={share}>
        <I.share size={16} /> Share
      </button>
      <div className="menu-wrap" ref={menuRef}>
        <button className="btn primary" data-tour="send" onClick={() => setMenu(!menu)} aria-expanded={menu}>
          <I.send size={16} /> Send to slicer
        </button>
        {menu && (
          <div className="menu" role="menu">
            <button role="menuitem" onClick={() => exportAs('3mf')}>
              <I.send size={16} />
              <span>
                3MF for your slicer<span className="hint">Bambu Studio, PrusaSlicer, OrcaSlicer, Cura</span>
              </span>
            </button>
            <button role="menuitem" onClick={() => exportAs('stl')}>
              <I.box size={16} />
              <span>
                STL<span className="hint">Every part in one mesh file</span>
              </span>
            </button>
            <hr />
            <button role="menuitem" onClick={() => exportAs('3mf', true)}>
              <I.frame size={16} />
              <span>
                Selected part only<span className="hint">3MF of the current selection</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
