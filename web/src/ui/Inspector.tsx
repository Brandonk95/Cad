import { useEffect, useRef, useState } from 'react'
import { FILAMENT_COLORS, MAGNETS, SCREW_SIZES, SCREW_TYPES, SCREWS, screwHoleSize } from '../model/catalog'
import { holeIsSideways, isRoundHole, solidWorldBox } from '../model/geometry'
import { canOpen, DEFAULT_FLOOR, DEFAULT_WALL, EDGE_KINDS, hasFloor, HOLLOW_KINDS, ROUND_SIDES, SIDED_KINDS } from '../model/details'
import { findNode, mapNodes } from '../model/ops'
import { FIT_CLASSES, wallMin, type Clearances, type FitClass, type SceneNode, type ShapeNode, type Vec3 } from '../model/types'
import { beginScrub, endScrub, useEditor, usePrintContext } from '../store/editor'
import { I } from './Icons'

/** Position that keeps a part's bottom where it was after a size change, so it doesn't sink or float. */
const keepBottom = (before: ShapeNode, after: ShapeNode, clr: Clearances): Vec3 => {
  const dz = solidWorldBox(before, clr).min.z - solidWorldBox(after, clr).min.z
  return [before.position[0], before.position[1], Math.round((before.position[2] + dz) * 1000) / 1000]
}

const fmt = (v: number) => (Math.round(v * 1000) / 1000).toString()

/** Pixels of drag per step. Shift: 10 steps, Alt: a tenth of a step. */
const PX_PER_STEP = 4

function Num({ label, value, onChange, unit = 'mm', step = 1, scrub = true }: { label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number; scrub?: boolean }) {
  const [text, setText] = useState(fmt(value))
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef({ value, onChange })
  latest.current = { value, onChange }
  useEffect(() => setText(fmt(value)), [value])
  const commit = () => {
    const v = parseFloat(text)
    if (Number.isFinite(v) && v !== value) onChange(v)
    else setText(fmt(value))
  }

  // Drag left / right on the field to change the value. A click without moving still edits as text.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrub || e.button !== 0 || document.activeElement === input.current) return
    e.preventDefault()
    // Finish any field being typed in first (it commits on blur).
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const start = latest.current.value
    let moved = false
    let last = start
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      if (!moved && Math.abs(dx) < 3) return
      if (!moved) {
        moved = true
        setDragging(true)
        beginScrub()
      }
      const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1
      const v = Math.round((start + Math.round(dx / PX_PER_STEP) * step * k) * 1000) / 1000
      if (v !== last) {
        last = v
        latest.current.onChange(v)
      }
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      if (moved) {
        endScrub()
        setDragging(false)
      } else {
        input.current?.focus()
        input.current?.select()
      }
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  return (
    <div className={`dim${scrub ? ' scrub' : ''}${dragging ? ' dragging' : ''}`} onPointerDown={onPointerDown} title={scrub ? 'Drag left or right to change. Shift: faster, Alt: finer. Click to type.' : undefined}>
      <label>{label}</label>
      <input
        ref={input}
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
        <Vec v={n.size} min={0.05} onChange={(size) => set({ size, position: keepBottom(n, { ...n, size }, ctx.clearances) }, 'Resize')} labels={n.kind === 'cylinder' || n.kind === 'pin' ? ['⌀X', '⌀Y', 'H'] : ['W', 'D', 'H']} />
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

      <ShapeDetails n={n} setParams={setParams} />
    </>
  )
}

const SIDES: { v: number; label: string }[] = [
  { v: ROUND_SIDES, label: 'Round' },
  { v: 3, label: 'Triangle' },
  { v: 4, label: 'Square' },
  { v: 5, label: 'Pentagon' },
  { v: 6, label: 'Hexagon' },
  { v: 8, label: 'Octagon' },
  { v: 10, label: '10 sides' },
  { v: 12, label: '12 sides' },
]

type SetParams = (p: Partial<ShapeNode['params']>, extra?: Partial<ShapeNode>, label?: string) => void

/** Corners, edges, sides, dome and hollow shell for basic shapes. */
function ShapeDetails({ n, setParams }: { n: ShapeNode; setParams: SetParams }) {
  const ctx = usePrintContext()
  const p = n.params
  const [sx, sy, sz] = n.size
  const minWall = wallMin(ctx.printer, ctx.material)
  const sides = p.segments ?? ROUND_SIDES
  const isRound = sides >= 24
  const edge = p.edge ?? 0
  const wall = p.wall ?? DEFAULT_WALL
  const floor = p.floor ?? DEFAULT_FLOOR
  const opening = p.opening ?? 'closed'
  const showHollow = !n.hole && HOLLOW_KINDS.includes(n.kind)
  const maxEdge = Math.max(0, Math.min(sx, sy, sz) / 2 - 0.05)
  const maxWall = Math.max(0.2, Math.min(sx, sy, n.kind === 'sphere' && !p.half ? sz : Infinity) / 2 - 0.2)
  const r2 = (v: number) => Math.round(v * 100) / 100

  return (
    <>
      {SIDED_KINDS.includes(n.kind) && (
        <div className="section">
          <h4>Sides</h4>
          <select className="input" aria-label="Sides" value={isRound ? ROUND_SIDES : sides} onChange={(e) => {
            const v = Number(e.target.value)
            setParams({ segments: v }, {}, v === ROUND_SIDES ? 'Round' : `${v} sides`)
          }}>
            {SIDES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
          {!isRound && <p className="note">Flat sides let the part lie on a face and print without supports.</p>}
        </div>
      )}

      {n.kind === 'box' && (
        <div className="section">
          <h4>Corners</h4>
          <div className="dims two">
            <Num label="Radius" value={p.cornerRadius ?? 0} step={0.5} onChange={(v) => setParams({ cornerRadius: r2(Math.max(0, Math.min(v, Math.min(sx, sy) / 2))) }, {}, 'Round corners')} />
          </div>
          <p className="note">Rounds the four upright corners.</p>
        </div>
      )}

      {EDGE_KINDS.includes(n.kind) && (
        <div className="section">
          <h4>{n.kind === 'pin' ? 'Lead-in' : 'Top and bottom edges'}</h4>
          <div className="dims two">
            <Num label="Size" value={edge} step={0.2} onChange={(v) => setParams({ edge: r2(Math.max(0, Math.min(v, maxEdge))) }, {}, 'Edges')} />
          </div>
          {edge > 0 && (
            <div className="seg" role="group" aria-label="Edge style">
              <button aria-pressed={p.edgeStyle !== 'round'} onClick={() => setParams({ edgeStyle: 'chamfer' }, {}, 'Chamfer edges')}>Chamfer</button>
              <button aria-pressed={p.edgeStyle === 'round'} onClick={() => setParams({ edgeStyle: 'round' }, {}, 'Round edges')}>Round</button>
            </div>
          )}
          <p className="note">
            {n.kind === 'pin'
              ? 'A small chamfer helps the pin find its hole.'
              : edge > 0 && p.edgeStyle === 'round'
                ? 'A round bottom edge overhangs. Chamfers print cleaner on the bed.'
                : 'A bottom chamfer also hides elephant foot.'}
          </p>
        </div>
      )}

      {n.kind === 'sphere' && (
        <div className="section">
          <h4>Shape</h4>
          <div className="seg" role="group" aria-label="Sphere shape">
            <button aria-pressed={!p.half} onClick={() => setParams({ half: false }, {}, 'Full sphere')}>Full</button>
            <button aria-pressed={!!p.half} onClick={() => setParams({ half: true }, { size: [sx, sy, r2(sz / 2)] }, 'Dome')}>Dome</button>
          </div>
          {p.half && <p className="note">Flat base sits on the bed. No supports needed.</p>}
        </div>
      )}

      {showHollow && (
        <div className="section">
          <h4>Inside</h4>
          <div className="seg" role="group" aria-label="Solid or hollow">
            <button aria-pressed={!p.hollow} onClick={() => setParams({ hollow: false }, {}, 'Fill in')}>Filled</button>
            <button aria-pressed={!!p.hollow} onClick={() => setParams({ hollow: true, wall: p.wall ?? Math.max(DEFAULT_WALL, r2(minWall)), floor: p.floor ?? Math.max(DEFAULT_FLOOR, r2(minWall)) }, {}, 'Hollow')}>Hollow</button>
          </div>
          {p.hollow && (
            <>
              <div className="dims two">
                <Num label="Wall" value={wall} step={0.2} onChange={(v) => setParams({ wall: r2(Math.max(0.2, Math.min(v, maxWall))) }, {}, 'Wall thickness')} />
                {hasFloor(n) && opening !== 'both' && (
                  <Num label="Floor" value={floor} step={0.2} onChange={(v) => setParams({ floor: r2(Math.max(0.2, Math.min(v, sz - 0.4))) }, {}, 'Floor thickness')} />
                )}
              </div>
              {canOpen(n) && (
                <div className="seg" role="group" aria-label="Opening">
                  <button aria-pressed={opening === 'closed'} onClick={() => setParams({ opening: 'closed' }, {}, 'Closed')}>Closed</button>
                  <button aria-pressed={opening === 'top'} onClick={() => setParams({ opening: 'top' }, {}, n.kind === 'sphere' ? 'Open base' : 'Open top')}>{n.kind === 'sphere' ? 'Open base' : 'Open top'}</button>
                  {n.kind !== 'sphere' && <button aria-pressed={opening === 'both'} onClick={() => setParams({ opening: 'both' }, {}, 'Tube')}>Tube</button>}
                </div>
              )}
              <p className="note">
                {wall < minWall - 1e-6
                  ? <>Thinner than <span className="mono">{minWall.toFixed(2)}</span><span className="unit">mm</span>, the thinnest wall your printer and material print well.</>
                  : opening === 'closed' && canOpen(n)
                    ? 'Closed shells trap air. Fine for most slicers, or open the top to make a box or cup.'
                    : n.kind === 'sphere' && !p.half
                      ? 'A sealed shell. Light and fast to print.'
                      : 'Print check measures the real wall thickness as you go.'}
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}

function Transform({ n }: { n: SceneNode }) {
  const update = useEditor((s) => s.updateNode)
  const rotate = useEditor((s) => s.rotateSelected)
  const drop = useEditor((s) => s.dropSelected)
  const scale = useEditor((s) => s.scaleSelected)
  // Re-mount the % field after each change so it reads 100 again.
  const cursor = useEditor((s) => s.cursor)
  return (
    <>
      <div className="section">
        <h4>Position</h4>
        <Vec v={n.position} onChange={(position) => update(n.id, { position }, 'Move', 'move')} />
      </div>
      <div className="section">
        <h4>Scale</h4>
        <div className="dims two">
          <Num key={cursor} scrub={false} label="All" unit="%" value={100} onChange={(v) => v > 0 && v !== 100 && scale([v / 100, v / 100, v / 100])} />
          <div className="row">
            <button className="btn small" onClick={() => scale([0.5, 0.5, 0.5])} title="Half size">½×</button>
            <button className="btn small" onClick={() => scale([2, 2, 2])} title="Double size">2×</button>
          </div>
        </div>
        <p className="note">Scales the whole part and keeps it on the bed. Screw holes and magnet pockets keep their hardware size. Press S for scale handles.</p>
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
