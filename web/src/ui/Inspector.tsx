import { useEffect, useState } from 'react'
import { FILAMENT_COLORS, MAGNETS, SCREW_SIZES, SCREW_TYPES, SCREWS, screwHoleSize } from '../model/catalog'
import { holeIsSideways, isRoundHole } from '../model/geometry'
import { findNode, mapNodes } from '../model/ops'
import { FIT_CLASSES, type FitClass, type SceneNode, type ShapeNode, type Vec3 } from '../model/types'
import { useEditor, usePrintContext } from '../store/editor'
import { I } from './Icons'

const fmt = (v: number) => (Math.round(v * 1000) / 1000).toString()

function Num({ label, value, onChange, unit = 'mm', step = 1 }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number }) {
  const [text, setText] = useState(fmt(value))
  useEffect(() => setText(fmt(value)), [value])
  const commit = () => {
    const v = parseFloat(text)
    if (Number.isFinite(v) && v !== value) onChange(v)
    else setText(fmt(value))
  }
  return (
    <div className="dim">
      <label>{label}</label>
      <input
        value={text}
        inputMode="decimal"
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            onChange(Math.round((value + d) * 1000) / 1000)
          }
        }}
      />
      <span className="unit">{unit}</span>
    </div>
  )
}

const Vec = ({ v, onChange, unit, labels = ['X', 'Y', 'Z'], min }: { v: Vec3; onChange: (v: Vec3) => void; unit?: string; labels?: string[]; min?: number }) => (
  <div className="dims">
    {[0, 1, 2].map((i) => (
      <Num
        key={i}
        label={labels[i]}
        value={v[i]}
        unit={unit}
        onChange={(x) => {
          const n = [...v] as Vec3
          n[i] = min !== undefined ? Math.max(min, x) : x
          onChange(n)
        }}
      />
    ))}
  </div>
)

const FIT_LABEL: Record<FitClass, string> = { press: 'Press', snug: 'Snug', slide: 'Slide', loose: 'Loose' }

function ShapeFields({ n }: { n: ShapeNode }) {
  const update = useEditor((s) => s.updateNode)
  const ctx = usePrintContext()
  const set = (patch: Partial<ShapeNode>, label = 'Edit') => update(n.id, patch, label, 'size')
  const setParams = (p: Partial<ShapeNode['params']>, extra: Partial<ShapeNode> = {}, label = 'Edit') => set({ params: { ...n.params, ...p }, ...extra }, label)
  const sideways = isRoundHole(n) && holeIsSideways(n)

  return (
    <>
      <div className="section">
        <div className="seg" role="group" aria-label="Solid or hole">
          <button aria-pressed={!n.hole} onClick={() => set({ hole: false }, 'Solid')}>Solid</button>
          <button aria-pressed={n.hole} onClick={() => set({ hole: true }, 'Hole')}>Hole</button>
        </div>
      </div>

      {n.kind === 'screwHole' && (
        <div className="section">
          <h4>Screw</h4>
          <div className="row">
            <select className="input mono" style={{ flex: 1 }} value={n.params.screwSize} aria-label="Screw size" onChange={(e) => {
              const size = e.target.value as ShapeNode['params']['screwSize'] & string
              setParams({ screwSize: size }, { size: screwHoleSize(size, n.params.screwType ?? 'clearance', n.size[2]), name: `${size} screw hole` }, `Screw ${size}`)
            }}>
              {SCREW_SIZES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="seg" role="group" aria-label="Screw hole type">
            {SCREW_TYPES.map((t) => (
              <button key={t.id} aria-pressed={n.params.screwType === t.id} onClick={() => {
                const size = n.params.screwSize ?? 'M3'
                const depth = t.id === 'insert' ? SCREWS[size].insertDepth + 0.5 : n.size[2]
                setParams({ screwType: t.id }, { size: screwHoleSize(size, t.id, depth) }, t.label)
              }}>{t.label.replace('Heat-set ', '')}</button>
            ))}
          </div>
          <p className="note">
            {n.params.screwType === 'clearance' && 'Screw passes through freely.'}
            {n.params.screwType === 'tapped' && 'Undersized so the screw cuts its own thread.'}
            {n.params.screwType === 'insert' && `Sized for a ${n.params.screwSize} heat-set insert. Press it in with a soldering iron.`}
            {n.params.screwType === 'nut' && 'Hex pocket on top holds the nut. The screw bore runs through.'}
          </p>
        </div>
      )}

      {n.kind === 'magnetPocket' && (
        <div className="section">
          <h4>Magnet</h4>
          <select className="input mono" aria-label="Magnet size" value={`${n.params.magnetDia}x${n.params.magnetThick}`} onChange={(e) => {
            const [d, t] = e.target.value.split('x').map(Number)
            setParams({ magnetDia: d, magnetThick: t }, { size: [d, d, t + 0.2], name: `${d}×${t} magnet pocket` }, 'Magnet size')
          }}>
            {MAGNETS.map((m) => <option key={`${m.dia}x${m.thick}`} value={`${m.dia}x${m.thick}`}>{m.dia} × {m.thick} mm</option>)}
          </select>
          <p className="note">Depth includes 0.2 mm so the magnet sits flush.</p>
        </div>
      )}

      <div className="section">
        <h4>Size</h4>
        <Vec v={n.size} min={0.05} onChange={(size) => set({ size }, 'Resize')} labels={n.kind === 'cylinder' || n.kind === 'pin' ? ['⌀X', '⌀Y', 'H'] : ['W', 'D', 'H']} />
      </div>

      {n.hole && (
        <div className="section">
          <h4>Fit</h4>
          <div className="seg" role="group" aria-label="Fit class">
            {FIT_CLASSES.map((f) => (
              <button key={f} aria-pressed={n.fit === f} onClick={() => set({ fit: n.fit === f ? null : f }, `Fit: ${FIT_LABEL[f]}`)}>{FIT_LABEL[f]}</button>
            ))}
          </div>
          <p className="note">
            {n.fit
              ? <>Adds <span className="mono">{ctx.clearances[n.fit].toFixed(2)}</span><span className="unit">mm</span> from {ctx.calibrated ? 'your calibration' : 'default clearances. Calibrate for a better fit'}.</>
              : 'Exact size. Pick a fit class for parts that go inside.'}
          </p>
        </div>
      )}

      {sideways && (
        <div className="section">
          <h4>Sideways hole profile</h4>
          <div className="seg" role="group" aria-label="Hole profile">
            <button aria-pressed={!n.params.teardrop && !n.params.sacrificial} onClick={() => setParams({ teardrop: false, sacrificial: false }, {}, 'Round hole')}>Round</button>
            <button aria-pressed={!!n.params.teardrop} onClick={() => setParams({ teardrop: true, sacrificial: false }, {}, 'Teardrop hole')}>Teardrop</button>
            <button aria-pressed={!!n.params.sacrificial} onClick={() => setParams({ teardrop: false, sacrificial: true }, {}, 'Bridged hole')}>Bridged</button>
          </div>
        </div>
      )}

      {n.kind === 'cone' && (
        <div className="section">
          <h4>Top</h4>
          <Num label="%" unit="" value={Math.round((n.params.topRatio ?? 0) * 100)} onChange={(v) => setParams({ topRatio: Math.min(1, Math.max(0, v / 100)) }, {}, 'Cone top')} />
        </div>
      )}
    </>
  )
}

function Transform({ n }: { n: SceneNode }) {
  const update = useEditor((s) => s.updateNode)
  const rotate = useEditor((s) => s.rotateSelected)
  const drop = useEditor((s) => s.dropSelected)
  return (
    <>
      <div className="section">
        <h4>Position</h4>
        <Vec v={n.position} onChange={(position) => update(n.id, { position }, 'Move', 'move')} />
      </div>
      <div className="section">
        <h4>Rotation</h4>
        <Vec v={n.rotation} unit="°" onChange={(rotation) => update(n.id, { rotation }, 'Rotate', 'rotate')} />
        <div className="row">
          <button className="btn small" onClick={() => rotate('x', 90)} title="Rotate 90° around X">X 90°</button>
          <button className="btn small" onClick={() => rotate('y', 90)} title="Rotate 90° around Y">Y 90°</button>
          <button className="btn small" onClick={() => rotate('z', 90)} title="Rotate 90° around Z">Z 90°</button>
          <button className="btn small" onClick={drop} title="Drop to bed (D)"><I.dropBed size={14} /> Bed</button>
        </div>
      </div>
    </>
  )
}

function ColorPicker({ n }: { n: SceneNode }) {
  const update = useEditor((s) => s.updateNode)
  const multi = usePrintContext().printer.multi_material
  return (
    <div className="section">
      <h4>Filament color</h4>
      <div className="swatches">
        {FILAMENT_COLORS.map((c) => (
          <button key={c} className="swatch" style={{ background: c }} aria-pressed={n.color.toLowerCase() === c.toLowerCase()} aria-label={`Color ${c}`} onClick={() => update(n.id, { color: c }, 'Color', 'color')} />
        ))}
      </div>
      {!multi && <p className="note">Your printer prints one color at a time. Colors become layer pauses.</p>}
    </div>
  )
}

export function Inspector() {
  const selection = useEditor((s) => s.selection)
  const nodes = useEditor((s) => s.nodes)
  const combine = useEditor((s) => s.combineSelected)
  const ungroup = useEditor((s) => s.ungroupSelected)
  const remove = useEditor((s) => s.removeSelected)
  const dup = useEditor((s) => s.duplicateSelected)
  const setOrientFor = useEditor((s) => s.setOrientFor)
  const n = selection.length === 1 ? findNode(nodes, selection[0]) : undefined
  const open = selection.length > 0

  return (
    <aside className={`inspector${open ? ' open' : ''}`} aria-label="Inspector" aria-hidden={!open}>
      <div className="inner">
        {selection.length > 1 && (
          <>
            <h2 className="panel-title">{selection.length} shapes</h2>
            <p className="note">Combine joins solids and cuts holes into one part.</p>
            <div className="row">
              <button className="btn primary" onClick={combine}><I.group size={16} /> Combine</button>
              <button className="btn" onClick={dup}><I.duplicate size={16} /> Duplicate</button>
              <button className="btn danger" onClick={remove} aria-label="Delete"><I.delete size={16} /></button>
            </div>
          </>
        )}
        {n && (
          <>
            <div className="row">
              <input className="input" style={{ flex: 1, fontWeight: 600, fontSize: 15 }} value={n.name} aria-label="Name" onChange={(e) => {
                const s = useEditor.getState()
                s.setLive(mapNodes(s.nodes, n.id, (x) => ({ ...x, name: e.target.value })))
              }} onBlur={() => {
                const s = useEditor.getState()
                if (s.history[s.cursor].nodes !== s.nodes) s.commit('Rename', 'size', s.nodes)
              }} onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }} />
            </div>
            <div className="row">
              {n.type === 'group' ? <span className="chip"><I.group size={14} /> {n.children.length} shapes combined</span> : <span className="chip">{n.kind === 'screwHole' || n.kind === 'magnetPocket' || n.kind === 'pin' ? 'Print primitive' : 'Shape'}</span>}
            </div>
            {n.type === 'shape' && <ShapeFields n={n} />}
            {n.type === 'group' && (
              <div className="section">
                <p className="note">Edit sizes with the tags on the canvas. Ungroup to change a single shape.</p>
                <div className="row">
                  <button className="btn" onClick={ungroup}><I.ungroup size={16} /> Ungroup</button>
                </div>
              </div>
            )}
            <Transform n={n} />
            {(n.type === 'group' || !n.hole) && <ColorPicker n={n} />}
            <div className="section">
              <h4>Printing</h4>
              <div className="row">
                <button className="btn" onClick={() => setOrientFor(n.id)}><I.orient size={16} /> Suggest orientation</button>
              </div>
            </div>
            <div className="row" style={{ marginTop: 'auto' }}>
              <button className="btn" onClick={dup}><I.duplicate size={16} /> Duplicate</button>
              <button className="btn danger" onClick={remove}><I.delete size={16} /> Delete</button>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
