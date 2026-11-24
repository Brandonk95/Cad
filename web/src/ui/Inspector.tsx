import { useEffect, useRef, useState } from 'react'
import { FILAMENT_COLORS, MAGNETS, SCREW_SIZES, SCREW_TYPES, SCREWS, screwHoleSize } from '../model/catalog'
import { textAspect } from '../model/text'
import { holeIsSideways, isRoundHole, solidWorldBox } from '../model/geometry'
import { canOpen, DEFAULT_FLOOR, DEFAULT_WALL, EDGE_KINDS, hasFloor, HOLLOW_KINDS, ROUND_SIDES, SIDED_KINDS } from '../model/details'
import { findHub, findNode, mapNodes, type PatternOpts } from '../model/ops'
import { usePatternPreview } from '../viewport/pattern'
import { viewAxes, viewMove } from '../viewport/viewDir'
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

/** The letters of a text shape. Width follows the new text so letters keep their height. */
function TextField({ n }: { n: ShapeNode }) {
  const text = n.params.text ?? ''
  return (
    <div className="section">
      <h4>Text</h4>
      <input className="input" style={{ width: '100%', fontWeight: 600 }} value={text} aria-label="Text" placeholder="Type letters" maxLength={60} onChange={(e) => {
        const s = useEditor.getState()
        const next = e.target.value
        s.setLive(mapNodes(s.nodes, n.id, (x) => {
          if (x.type !== 'shape') return x
          const old = textAspect(x.params.text ?? '')
          const w = Math.max(0.5, Math.round(((x.size[0] / old) * textAspect(next)) * 100) / 100)
          return { ...x, size: [w, x.size[1], x.size[2]], params: { ...x.params, text: next } }
        }))
      }} onBlur={() => {
        const s = useEditor.getState()
        if (s.history[s.cursor].nodes !== s.nodes) s.commit('Edit text', 'text', s.nodes)
      }} onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }} />
      <p className="note">Raised letters stand on a face; engraved ones are a hole. Sink engraved text into a face by about its height (H) to cut it in, then Combine.</p>
    </div>
  )
}

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
          <button aria-pressed={!n.hole} onClick={() => set({ hole: false }, 'Solid')}>{n.kind === 'text' ? 'Raised' : 'Solid'}</button>
          <button aria-pressed={n.hole} onClick={() => set({ hole: true }, 'Hole')}>{n.kind === 'text' ? 'Engraved' : 'Hole'}</button>
        </div>
      </div>

      {n.kind === 'text' && <TextField n={n} />}

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

const ALIGN_ROWS: { row: 'right' | 'forward' | 'up'; title: string; labels: [string, string, string] }[] = [
  { row: 'right', title: 'Left to right', labels: ['Left', 'Center', 'Right'] },
  { row: 'forward', title: 'Front to back', labels: ['Front', 'Middle', 'Back'] },
  { row: 'up', title: 'Up and down', labels: ['Bottom', 'Middle', 'Top'] },
]

/**
 * Tinkercad-style align: line parts up against the selection's overall bounds.
 * Left, right, front and back are as seen from the camera, snapped to the bed axes.
 */
function AlignSection() {
  const align = useEditor((s) => s.alignSelected)
  const run = (row: (typeof ALIGN_ROWS)[number]['row'], i: number, label: string) => {
    if (row === 'up') return align([2], (['min', 'center', 'max'] as const)[i], `Align ${label.toLowerCase()}`)
    const d = viewAxes()[row]
    // i = 0 is the near / left end. On an axis pointing the other way that is its max.
    const to = i === 1 ? 'center' : (i === 0) === (d.sign > 0) ? 'min' : 'max'
    align([d.axis], to, `Align ${label.toLowerCase()}`)
  }
  return (
    <div className="section" data-tour="align">
      <h4>Align</h4>
      {ALIGN_ROWS.map((r) => (
        <div key={r.row} className="align-row">
          <span className="align-label">{r.title}</span>
          <div className="seg" role="group" aria-label={`Align ${r.title.toLowerCase()}`}>
            {r.labels.map((l, i) => (
              <button key={l} onClick={() => run(r.row, i, l)} title={`Line up the ${i === 1 ? 'centers' : l.toLowerCase() + ' sides'} of the selected parts, as seen from the camera`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => align([0, 1], 'center')} title="Center the parts on each other, left to right and front to back">
        Center on each other
      </button>
    </div>
  )
}

/** Flip the selection, as seen from the camera, in place or as a touching copy. */
function MirrorSection() {
  const mirror = useEditor((s) => s.mirrorSelected)
  const [copy, setCopy] = useState(false)
  const run = (which: 'right' | 'forward' | 'up') => {
    if (which === 'up') return mirror(2, copy, 1)
    const d = viewAxes()[which]
    mirror(d.axis, copy, d.sign)
  }
  return (
    <div className="section">
      <h4>Mirror</h4>
      <div className="seg" role="group" aria-label="Mirror">
        <button onClick={() => run('right')} title="Flip left to right, as seen from the camera">Left–right</button>
        <button onClick={() => run('forward')} title="Flip front to back, as seen from the camera">Front–back</button>
        <button onClick={() => run('up')} title="Flip upside down">Top–bottom</button>
      </div>
      <label className="check">
        <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Keep the original and add the mirror image beside it
      </label>
    </div>
  )
}

/** Circular and linear patterns: copies of the selection, previewed live. */
function PatternSection() {
  const selection = useEditor((s) => s.selection)
  const pattern = useEditor((s) => s.patternSelected)
  const ctx = usePrintContext()
  const [kind, setKind] = useState<'circular' | 'linear' | null>(null)
  const [count, setCount] = useState(6)
  const [angle, setAngle] = useState(360)
  const [center, setCenter] = useState<[number, number]>([0, 0])
  const [grid, setGrid] = useState<[number, number]>([3, 1])
  const [spacing, setSpacing] = useState<[number, number]>([25, 25])
  const [hub, setHub] = useState<{ id: string; name: string } | null>(null)
  const [join, setJoin] = useState(true)
  const [turn, setTurn] = useState(true)
  /** Part the center follows; moving that part moves the center with it. */
  const [centerOn, setCenterOn] = useState<string | null>(null)
  const picking = usePatternPreview((s) => s.onPick !== null)
  const nodes = useEditor((s) => s.nodes)
  const key = selection.join(',')

  const boxCenter = (b: { min: { x: number; y: number }; max: { x: number; y: number } }): [number, number] => [
    Math.round(((b.min.x + b.max.x) / 2) * 1000) / 1000,
    Math.round(((b.min.y + b.max.y) / 2) * 1000) / 1000,
  ]
  const target = centerOn ? findNode(nodes, centerOn) : undefined
  // The center tracks the picked part live; without one it is the typed point.
  const c: [number, number] = target ? boxCenter(solidWorldBox(target, ctx.clearances)) : center
  const selBox = () => {
    const sel = nodes.filter((n) => selection.includes(n.id))
    return sel.length ? sel.reduce((acc, n) => acc.union(solidWorldBox(n, ctx.clearances)), solidWorldBox(sel[0], ctx.clearances)) : null
  }
  const sb = kind === 'circular' ? selBox() : null
  const sc = sb ? boxCenter(sb) : c
  const distance = Math.round(Math.hypot(sc[0] - c[0], sc[1] - c[1]) * 100) / 100

  /** Slides the selection straight toward or away from the center. */
  const setDistance = (v: number) => {
    const r = Math.max(0, v)
    const dx = sc[0] - c[0]
    const dy = sc[1] - c[1]
    const d = Math.hypot(dx, dy)
    const [ux, uy] = d > 1e-6 ? [dx / d, dy / d] : viewMove(1, 0)
    const k = r - d
    if (Math.abs(k) > 1e-6) useEditor.getState().nudge(ux * k, uy * k, 0)
  }

  const pickCenter = () => {
    usePatternPreview.setState({
      onPick: (id) => {
        const s = useEditor.getState()
        const n = findNode(s.nodes, id)
        if (!n) return
        if (s.selection.includes(id)) return s.toast('Pick a part that is not being copied.', 'info')
        usePatternPreview.setState({ onPick: null })
        setCenterOn(id)
        setHub({ id, name: n.name })
        setJoin(findHub(s.nodes, s.selection, ctx.clearances)?.id === id)
      },
    })
  }

  const start = (k: 'circular' | 'linear') => {
    const s = useEditor.getState()
    const h = findHub(s.nodes, s.selection, ctx.clearances)
    setHub(h ? { id: h.id, name: h.name } : null)
    setJoin(true)
    if (k === 'circular') {
      // Turn around the part the selection sits on (a hub or plate), else the bed center.
      setCenterOn(h ? h.id : null)
      setCenter(h ? boxCenter(solidWorldBox(h, ctx.clearances)) : [0, 0])
    } else {
      // Default spacing leaves a 5 mm gap between copies.
      const box = s.nodes.filter((n) => s.selection.includes(n.id)).reduce((acc, n) => acc.union(solidWorldBox(n, ctx.clearances)), solidWorldBox(s.nodes.find((n) => s.selection.includes(n.id))!, ctx.clearances))
      const r = (v: number) => Math.round(v * 10) / 10
      setSpacing([r(box.max.x - box.min.x + 5), r(box.max.y - box.min.y + 5)])
      setGrid([3, 1])
    }
    setKind(k)
  }

  const opts: PatternOpts | null =
    kind === 'circular' ? { kind, count, angle, center: c, turn } : kind === 'linear' ? { kind, count: grid, spacing } : null

  // A new selection closes the panel.
  useEffect(() => setKind(null), [key])
  useEffect(() => {
    usePatternPreview.setState({ opts })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, count, angle, c[0], c[1], turn, grid, spacing])
  useEffect(() => () => usePatternPreview.setState({ opts: null, onPick: null }), [])
  // Closing the panel or picking a part that is gone stops picking.
  useEffect(() => {
    if (kind !== 'circular') usePatternPreview.setState({ onPick: null })
  }, [kind])
  useEffect(() => {
    if (centerOn && !target) {
      setCenterOn(null)
      setHub(null)
    }
  }, [centerOn, target])
  // Esc cancels picking before anything else hears it.
  useEffect(() => {
    if (!picking) return
    document.body.classList.add('picking')
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.preventDefault()
      usePatternPreview.setState({ onPick: null })
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.body.classList.remove('picking')
      window.removeEventListener('keydown', onKey, true)
    }
  }, [picking])

  if (!kind)
    return (
      <div className="section">
        <h4>Pattern</h4>
        <div className="row">
          <button className="btn" style={{ flex: 1 }} onClick={() => start('circular')} title="Copy the selection around a circle">
            <I.pattern size={16} /> Circular
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={() => start('linear')} title="Copy the selection in a row or a grid">
            <I.linear size={16} /> Linear
          </button>
        </div>
      </div>
    )

  const copies = kind === 'circular' ? count - 1 : grid[0] * grid[1] - 1
  const full = Math.abs(angle) >= 360
  const clampCount = (v: number, min: number) => Math.max(min, Math.min(100, Math.round(v)))
  return (
    <div className="section pattern">
      <h4>{kind === 'circular' ? 'Circular pattern' : 'Linear pattern'}</h4>
      {kind === 'circular' ? (
        <>
          <div className="dims two">
            <Num label="Count" unit="" step={1} value={count} onChange={(v) => setCount(clampCount(v, 2))} />
            <Num label="Angle" unit="°" step={5} value={angle} onChange={(v) => setAngle(Math.max(-360, Math.min(360, v)) || 360)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={turn} onChange={(e) => setTurn(e.target.checked)} /> Turn copies with the circle
          </label>
          <p className="note">{turn ? '' : 'Copies keep facing the same way, like bolts on a flange. '}{full ? `${count} copies spread evenly, ${Math.round(3600 / count) / 10}° apart.` : `${count} copies over ${angle}°, ${Math.round((angle / (count - 1)) * 10) / 10}° apart.`}</p>
          <h4>Center</h4>
          <button className={`btn${picking ? ' primary' : ''}`} style={{ width: '100%' }} aria-pressed={picking} onClick={() => (picking ? usePatternPreview.setState({ onPick: null }) : pickCenter())} title="Click a part on the canvas to turn around its center">
            <I.pointer size={16} /> {picking ? 'Click a part… (Esc to cancel)' : 'Center on part'}
          </button>
          <div className="dims two">
            <Num label="X" value={c[0]} onChange={(v) => { setCenterOn(null); setCenter([v, c[1]]) }} />
            <Num label="Y" value={c[1]} onChange={(v) => { setCenterOn(null); setCenter([c[0], v]) }} />
            <Num label="Distance" step={1} value={distance} onChange={setDistance} />
          </div>
          <p className="note">
            {target
              ? `Turning around the center of ${target.name}; it follows that part if it moves.`
              : 'Turning around a fixed point. Pick a part to follow its center.'}{' '}
            Distance slides the selection toward or away from the center.
          </p>
        </>
      ) : (
        <>
          <div className="dims two">
            <Num label="Across" unit="" step={1} value={grid[0]} onChange={(v) => setGrid([clampCount(v, 1), grid[1]])} />
            <Num label="Step X" step={1} value={spacing[0]} onChange={(v) => setSpacing([v, spacing[1]])} />
            <Num label="Back" unit="" step={1} value={grid[1]} onChange={(v) => setGrid([grid[0], clampCount(v, 1)])} />
            <Num label="Step Y" step={1} value={spacing[1]} onChange={(v) => setSpacing([spacing[0], v])} />
          </div>
          <p className="note">
            {grid[0]} × {grid[1]} {grid[1] > 1 && grid[0] > 1 ? 'grid' : 'row'}. Steps are center to center; the default leaves a 5 mm gap. Negative steps go left or to the front.
          </p>
        </>
      )}
      {hub && (
        <label className="check">
          <input type="checkbox" checked={join} onChange={(e) => setJoin(e.target.checked)} /> Combine with {hub.name}
        </label>
      )}
      <div className="row">
        <button className="btn primary" disabled={copies < 1} onClick={() => {
          if (opts) pattern(opts, hub && join ? hub.id : null)
          setKind(null)
        }}><I.pattern size={16} /> Make {copies} {copies === 1 ? 'copy' : 'copies'}</button>
        <button className="btn" onClick={() => setKind(null)}>Cancel</button>
      </div>
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
            <AlignSection />
            <MirrorSection />
            <PatternSection />
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
              {n.type === 'group' ? <span className="chip"><I.group size={14} /> {n.children.length} shapes combined</span> : <span className="chip">{n.kind === 'screwHole' || n.kind === 'magnetPocket' || n.kind === 'pin' ? 'Print primitive' : n.kind === 'extrude' ? 'Sketch' : n.kind === 'text' ? 'Text' : 'Shape'}</span>}
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
            <MirrorSection />
            <PatternSection />
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
