import { finRootRadius, RODS, TUBES } from '../model/rocketry'
import type { ShapeNode, Vec3 } from '../model/types'
import { useEditor, usePrintContext } from '../store/editor'
import { keepBottom, Num } from './Inspector'

const r2 = (v: number) => Math.round(v * 100) / 100
const near = (a: number, b: number) => Math.abs(a - b) < 0.06

type Patch = { size?: Vec3; params?: Partial<ShapeNode['params']>; name?: string }

/** Applies a change to a rocket part, keeping its bottom where it was when the size changes. */
function useApply(n: ShapeNode) {
  const update = useEditor((s) => s.updateNode)
  const ctx = usePrintContext()
  return (q: Patch, label: string) => {
    const next: ShapeNode = { ...n, ...(q.size ? { size: q.size } : {}), ...(q.name ? { name: q.name } : {}), params: { ...n.params, ...(q.params ?? {}) } }
    const patch: Partial<ShapeNode> = { params: next.params, ...(q.name ? { name: q.name } : {}) }
    if (q.size) Object.assign(patch, { size: q.size, position: keepBottom(n, next, ctx.clearances) })
    update(n.id, patch, label, 'size')
  }
}

/** Picks a standard cardboard tube. `match` says which listed tube the part fits now, if any. */
function TubeSelect({ label, match, onPick, motor = false }: { label: string; match: (t: (typeof TUBES)[number]) => boolean; onPick: (t: (typeof TUBES)[number]) => void; motor?: boolean }) {
  const list = motor ? TUBES.filter((t) => t.motor) : TUBES
  const cur = list.find(match)
  return (
    <label className="rk-select">
      <span>{label}</span>
      <select className="input mono" value={cur?.id ?? ''} aria-label={label} onChange={(e) => {
        const t = list.find((x) => x.id === e.target.value)
        if (t) onPick(t)
      }}>
        <option value="">Custom</option>
        {list.map((t) => (
          <option key={t.id} value={t.id}>{t.label}{t.motor && t.label !== `${t.motor} motor tube` ? ` · ${t.motor} motor` : ''} ({t.od} / {t.id_})</option>
        ))}
      </select>
    </label>
  )
}

/** Shoulder size picker for the nose cone, shown with the nose fields. */
export function NoseTubeFit({ n }: { n: ShapeNode }) {
  const apply = useApply(n)
  const gap = usePrintContext().clearances.snug
  const D = Math.max(n.size[0], n.size[1])
  return (
    <TubeSelect label="Fits tube" match={(t) => near(D, t.od) && near((n.params.shoulderRatio ?? 0) * D, t.id_ - gap)} onPick={(t) => apply({ size: [t.od, t.od, n.size[2]], params: { shoulderRatio: (t.id_ - gap) / t.od, shoulder: n.params.shoulder || 0.2 } }, `Nose fits ${t.label}`)} />
  )
}

function BodyTubeFields({ n }: { n: ShapeNode }) {
  const apply = useApply(n)
  const D = Math.max(n.size[0], n.size[1])
  const wall = n.params.tubeWall ?? 1.2
  const motors = [13, 18, 24, 29]
  return (
    <div className="section">
      <h4>Tube</h4>
      <TubeSelect label="Outside matches" match={(t) => near(D, t.od)} onPick={(t) => apply({ size: [t.od, t.od, n.size[2]] }, `Tube ⌀ ${t.label}`)} />
      <div className="dims two">
        <Num label="Wall" step={0.2} value={r2(wall)} onChange={(v) => apply({ params: { tubeWall: Math.max(0.4, Math.min(D / 2 - 0.5, v)) } }, 'Tube wall')} />
        <Num label="Inside ⌀" value={r2(D - 2 * wall)} onChange={(v) => apply({ size: [r2(v + 2 * wall), r2(v + 2 * wall), n.size[2]] }, 'Tube inside ⌀')} />
      </div>
      <div className="seg" role="group" aria-label="Motor tube">
        {motors.map((m) => (
          <button key={m} aria-pressed={near(D - 2 * wall, m + 0.3)} title={`Motor mount tube for a ${m} mm motor`} onClick={() => apply({ size: [r2(m + 0.3 + 2 * wall), r2(m + 0.3 + 2 * wall), n.size[2]], name: `${m} mm motor tube` }, `${m} mm motor tube`)}>{m} mm</button>
        ))}
      </div>
      <p className="note">Pick a size to match standard parts, or a motor size for a motor mount tube. Print it standing up.</p>
    </div>
  )
}

const FIN_PRESETS: { id: string; label: string; shape: 'trapezoid' | 'elliptical'; tip: number; sweep: number }[] = [
  { id: 'clipped', label: 'Clipped delta', shape: 'trapezoid', tip: 0.42, sweep: 0.58 },
  { id: 'delta', label: 'Delta', shape: 'trapezoid', tip: 0, sweep: 1 },
  { id: 'square', label: 'Square', shape: 'trapezoid', tip: 1, sweep: 0 },
  { id: 'elliptical', label: 'Elliptical', shape: 'elliptical', tip: 0, sweep: 0 },
]

/** Small drawing of one fin for its button. */
function FinThumb({ shape, tip, sweep }: { shape: 'trapezoid' | 'elliptical'; tip: number; sweep: number }) {
  const H = 22
  const S = 14
  const d =
    shape === 'elliptical'
      ? `M3 25 L3 3 A${S} ${H} 0 0 1 ${3 + S} 25 Z`
      : `M3 25 L3 3 L${3 + S} ${3 + sweep * H} L${3 + S} ${3 + (sweep + tip) * H} Z`
  return (
    <svg width="20" height="28" viewBox="0 0 20 28" aria-hidden="true">
      <path d={d} fill="currentColor" opacity={0.85} />
    </svg>
  )
}

function FinFields({ n }: { n: ShapeNode }) {
  const apply = useApply(n)
  const gap = usePrintContext().clearances.snug
  const p = n.params
  const H = n.size[2]
  const D = Math.max(n.size[0], n.size[1])
  const bore = p.innerDia ?? 41.6
  const sleeve = p.finSleeve ?? 1.6
  const r0 = finRootRadius({ bore, sleeve }, gap)
  const span = D / 2 - r0
  const shape = p.finShape ?? 'trapezoid'
  const tip = p.finTip ?? 25
  const sweep = p.finSweep ?? 35
  const withSpan = (s: number, r = r0): Vec3 => { const d = r2(2 * (r + Math.max(2, s))); return [d, d, H] }
  const preset = FIN_PRESETS.find((f) => f.shape === shape && (shape === 'elliptical' || (near(tip, f.tip * H) && near(sweep, f.sweep * H))))
  const lifted = shape === 'trapezoid' && H - sweep - tip > 0.05
  return (
    <div className="section">
      <h4>Fins</h4>
      <div className="seg" role="group" aria-label="Number of fins">
        {[3, 4, 5, 6].map((c) => (
          <button key={c} aria-pressed={(p.finCount ?? 3) === c} onClick={() => apply({ params: { finCount: c } }, `${c} fins`)}>{c} fins</button>
        ))}
      </div>
      <div className="nose-shapes four" role="group" aria-label="Fin shape">
        {FIN_PRESETS.map((f) => (
          <button key={f.id} aria-pressed={preset?.id === f.id} onClick={() => apply({ params: { finShape: f.shape, finTip: r2(f.tip * H), finSweep: r2(f.sweep * H) } }, `Fins: ${f.label}`)}>
            <FinThumb shape={f.shape} tip={f.tip} sweep={f.sweep} />
            <span>{f.label}</span>
          </button>
        ))}
      </div>
      <div className="dims two">
        <Num label="Root" value={r2(H)} onChange={(v) => {
          const h = Math.max(5, v)
          const k = h / H
          apply({ size: [n.size[0], n.size[1], h], params: { finTip: r2(tip * k), finSweep: r2(sweep * k) } }, 'Root chord')
        }} />
        <Num label="Span" value={r2(span)} onChange={(v) => apply({ size: withSpan(v) }, 'Fin span')} />
        {shape === 'trapezoid' && <Num label="Tip" value={r2(tip)} onChange={(v) => apply({ params: { finTip: Math.max(0, Math.min(H - sweep, v)) } }, 'Tip chord')} />}
        {shape === 'trapezoid' && <Num label="Sweep" value={r2(sweep)} onChange={(v) => apply({ params: { finSweep: Math.max(0, Math.min(H, v)), finTip: Math.min(tip, H - Math.max(0, Math.min(H, v))) } }, 'Fin sweep')} />}
        <Num label="Thick" step={0.2} value={r2(p.finThick ?? 3)} onChange={(v) => apply({ params: { finThick: Math.max(0.8, v) } }, 'Fin thickness')} />
        <Num label="Fillet" step={0.5} value={r2(p.finFillet ?? 2)} onChange={(v) => apply({ params: { finFillet: Math.max(0, v) } }, 'Root fillet')} />
      </div>
      <p className="note">
        {lifted
          ? 'The trailing edge tilts up, so it will need support. Make Tip + Sweep equal the root to keep it flat on the bed.'
          : 'Root is the length along the tube, span how far fins stick out. Prints standing on the trailing edges.'}
      </p>
      <h4>Sleeve</h4>
      <TubeSelect label="Slides over" match={(t) => near(bore, t.od)} onPick={(t) => apply({ params: { innerDia: t.od }, size: withSpan(span, finRootRadius({ bore: t.od, sleeve }, gap)) }, `Fins fit ${t.label}`)} />
      <div className="dims two">
        <Num label="Tube ⌀" value={r2(bore)} onChange={(v) => { const b = Math.max(3, v); apply({ params: { innerDia: b }, size: withSpan(span, finRootRadius({ bore: b, sleeve }, gap)) }, 'Fin can bore') }} />
        <Num label="Wall" step={0.2} value={r2(sleeve)} onChange={(v) => { const w = Math.max(0, v); apply({ params: { finSleeve: w }, size: withSpan(span, finRootRadius({ bore, sleeve: w }, gap)) }, w > 0 ? 'Sleeve wall' : 'Fins only') }} />
      </div>
      <p className="note">{sleeve > 0 ? `Slides over a ${r2(bore)} mm tube with a snug fit. Wall 0 leaves just the fins, to combine with a body tube.` : `Fins only, rooted on a ${r2(bore)} mm tube. Place them on a body tube of that size and Combine.`}</p>
    </div>
  )
}

function TransitionFields({ n }: { n: ShapeNode }) {
  const apply = useApply(n)
  const p = n.params
  const D = Math.max(n.size[0], n.size[1])
  const top = p.topDia ?? D * 0.6
  return (
    <div className="section">
      <h4>Transition</h4>
      <TubeSelect label="Bottom tube" match={(t) => near(D, t.od)} onPick={(t) => apply({ size: [t.od, t.od, n.size[2]] }, `Bottom ${t.label}`)} />
      <TubeSelect label="Top tube" match={(t) => near(top, t.od)} onPick={(t) => apply({ params: { topDia: t.od } }, `Top ${t.label}`)} />
      <div className="dims two">
        <Num label="Top ⌀" value={r2(top)} onChange={(v) => apply({ params: { topDia: Math.max(1, v) } }, 'Top ⌀')} />
        <Num label="Shoulder" value={r2(p.shoulderLen ?? 0)} onChange={(v) => apply({ params: { shoulderLen: Math.max(0, v) } }, 'Shoulder length')} />
        <Num label="Tube wall" step={0.1} value={r2(p.tubeWall ?? 1.2)} onChange={(v) => apply({ params: { tubeWall: Math.max(0, v) } }, 'Tube wall')} />
        <Num label="Wall" step={0.2} value={r2(p.transWall ?? 0)} onChange={(v) => apply({ params: { transWall: Math.max(0, v) } }, v > 0 ? 'Hollow transition' : 'Solid transition')} />
      </div>
      <p className="note">Joins tubes of two sizes; a smaller top makes a reducer, a smaller bottom a boat tail. The shoulders slide into the tubes: set Tube wall to their wall (1.2 for printed, about 0.5 for cardboard). Wall 0 is solid.</p>
    </div>
  )
}

function CouplerFields({ n }: { n: ShapeNode }) {
  const apply = useApply(n)
  const p = n.params
  const D = Math.max(n.size[0], n.size[1])
  const tw = p.tubeWall ?? 1.2
  return (
    <div className="section">
      <h4>Coupler</h4>
      <TubeSelect label="Joins tube" match={(t) => near(D, t.od) && near(tw, (t.od - t.id_) / 2)} onPick={(t) => apply({ size: [t.od, t.od, n.size[2]], params: { tubeWall: r2((t.od - t.id_) / 2) } }, `Coupler for ${t.label}`)} />
      <div className="dims two">
        <Num label="Tube wall" step={0.1} value={r2(tw)} onChange={(v) => apply({ params: { tubeWall: Math.max(0, v) } }, 'Tube wall')} />
        <Num label="Wall" step={0.2} value={r2(p.couplerWall ?? 1.6)} onChange={(v) => apply({ params: { couplerWall: Math.max(0.4, v) } }, 'Coupler wall')} />
        <Num label="Band" value={r2(p.band ?? 4)} onChange={(v) => apply({ params: { band: Math.max(0, v) } }, 'Stop band')} />
      </div>
      <p className="note">Each end slides into a tube; the band in the middle sits flush with the tubes and stops them. Band 0 makes a plain sleeve.</p>
    </div>
  )
}

function CenteringRingFields({ n }: { n: ShapeNode }) {
  const apply = useApply(n)
  const gap = usePrintContext().clearances.snug
  const D = Math.max(n.size[0], n.size[1])
  const inner = n.params.innerDia ?? 18.7
  return (
    <div className="section">
      <h4>Centering ring</h4>
      <TubeSelect label="Fits inside" match={(t) => near(D, t.id_ - gap)} onPick={(t) => apply({ size: [r2(t.id_ - gap), r2(t.id_ - gap), n.size[2]] }, `Ring fits ${t.label}`)} />
      <TubeSelect label="Motor tube" motor match={(t) => near(inner, t.od)} onPick={(t) => apply({ params: { innerDia: t.od } }, `Ring for ${t.label}`)} />
      <div className="dims two">
        <Num label="Hole ⌀" value={r2(inner)} onChange={(v) => apply({ params: { innerDia: Math.max(1, Math.min(D - 2, v)) } }, 'Ring hole')} />
      </div>
      <p className="note">Holds the motor tube in the middle of the body tube. Sizes are the tubes' own; the snug fit is added for you.</p>
    </div>
  )
}

function BulkheadFields({ n }: { n: ShapeNode }) {
  const apply = useApply(n)
  const gap = usePrintContext().clearances.snug
  const D = Math.max(n.size[0], n.size[1])
  const plate = n.params.plate ?? 3
  const eye = n.params.eyelet ?? true
  return (
    <div className="section">
      <h4>Bulkhead</h4>
      <TubeSelect label="Fits inside" match={(t) => near(D, t.id_ - gap)} onPick={(t) => apply({ size: [r2(t.id_ - gap), r2(t.id_ - gap), n.size[2]] }, `Bulkhead fits ${t.label}`)} />
      <div className="dims two">
        <Num label="Plate" step={0.5} value={r2(plate)} onChange={(v) => { const t = Math.max(1, v); apply({ params: { plate: t }, size: [n.size[0], n.size[1], eye ? t + (n.size[2] - plate) : t] }, 'Plate thickness') }} />
      </div>
      <div className="seg" role="group" aria-label="Shock cord eye">
        <button aria-pressed={eye} onClick={() => apply({ params: { eyelet: true }, size: [n.size[0], n.size[1], plate + 9] }, 'Add eye')}>Eye for shock cord</button>
        <button aria-pressed={!eye} onClick={() => apply({ params: { eyelet: false }, size: [n.size[0], n.size[1], plate] }, 'Plain bulkhead')}>Plain</button>
      </div>
      <p className="note">Closes off the tube. Tie the shock cord through the eye; its hole is teardrop-shaped so it prints without support.</p>
    </div>
  )
}

function LaunchLugFields({ n }: { n: ShapeNode }) {
  const apply = useApply(n)
  const D = Math.max(n.size[0], n.size[1])
  const bore = n.params.innerDia ?? 3.7
  const cur = RODS.find((r) => near(r.bore, bore))
  return (
    <div className="section">
      <h4>Launch lug</h4>
      <label className="rk-select">
        <span>Rod</span>
        <select className="input mono" value={cur ? String(cur.rod) : ''} aria-label="Launch rod" onChange={(e) => {
          const r = RODS.find((x) => String(x.rod) === e.target.value)
          if (r) apply({ params: { innerDia: r.bore }, size: [r2(r.bore + 2), r2(r.bore + 2), n.size[2]] }, `Lug for ${r.label}`)
        }}>
          <option value="">Custom</option>
          {RODS.map((r) => <option key={r.rod} value={String(r.rod)}>{r.label}</option>)}
        </select>
      </label>
      <div className="dims two">
        <Num label="Bore" step={0.1} value={r2(bore)} onChange={(v) => apply({ params: { innerDia: Math.max(1, Math.min(D - 0.8, v)) } }, 'Lug bore')} />
      </div>
      <p className="note">Guides the rocket up the launch rod. Stand it against the body tube, parallel to it, and Combine.</p>
    </div>
  )
}

export function RocketFields({ n }: { n: ShapeNode }) {
  switch (n.kind) {
    case 'bodytube':
      return <BodyTubeFields n={n} />
    case 'fincan':
      return <FinFields n={n} />
    case 'transition':
      return <TransitionFields n={n} />
    case 'coupler':
      return <CouplerFields n={n} />
    case 'centeringring':
      return <CenteringRingFields n={n} />
    case 'bulkhead':
      return <BulkheadFields n={n} />
    case 'launchlug':
      return <LaunchLugFields n={n} />
    default:
      return null
  }
}
