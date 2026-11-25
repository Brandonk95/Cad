import * as THREE from 'three'
import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg'
import type { ShapeNode } from './types'

/**
 * Model rocket parts: body tube, fin can, transition, coupler, centering ring,
 * bulkhead and launch lug. All are built at full size in millimetres, standing
 * on Z and filling -h/2..h/2, so walls and fits don't stretch.
 *
 * Parts that slide into a tube shrink by the fit clearance; bores that slide over
 * one grow by it. `gap` is that clearance on the diameter.
 */

/** Standard cardboard tubes: outside and inside diameter in mm. */
export const TUBES: { id: string; label: string; od: number; id_: number; motor?: string }[] = [
  { id: 'BT-5', label: 'BT-5', od: 13.8, id_: 13.2, motor: '13 mm' },
  { id: 'BT-20', label: 'BT-20', od: 18.7, id_: 18.0, motor: '18 mm' },
  { id: 'BT-50', label: 'BT-50', od: 24.8, id_: 24.1, motor: '24 mm' },
  { id: '29mm', label: '29 mm motor tube', od: 30.4, id_: 29.1, motor: '29 mm' },
  { id: 'BT-55', label: 'BT-55', od: 33.7, id_: 32.6 },
  { id: 'BT-60', label: 'BT-60', od: 41.6, id_: 40.5 },
  { id: 'BT-80', label: 'BT-80', od: 66.0, id_: 65.0 },
]

/** Launch rods and the bore that slides on them freely. */
export const RODS: { label: string; rod: number; bore: number }[] = [
  { label: '1/8″ rod (3.2 mm)', rod: 3.2, bore: 3.7 },
  { label: '3/16″ rod (4.8 mm)', rod: 4.8, bore: 5.3 },
  { label: '1/4″ rod (6.4 mm)', rod: 6.35, bore: 6.9 },
]

export type FinShape = 'trapezoid' | 'elliptical'

export const ROCKET_KINDS: ShapeNode['kind'][] = ['nosecone', 'bodytube', 'fincan', 'transition', 'coupler', 'centeringring', 'bulkhead', 'launchlug']
export const isRocketPart = (n: ShapeNode) => ROCKET_KINDS.includes(n.kind)

const ev = new Evaluator()
ev.attributes = ['position', 'normal']
ev.useGroups = false
const cache = new Map<string, THREE.BufferGeometry>()

const prep = (g: THREE.BufferGeometry) => {
  const o = g.index ? g.toNonIndexed() : g
  o.deleteAttribute('uv')
  o.deleteAttribute('uv1')
  o.computeVertexNormals()
  o.clearGroups()
  return o
}

const union = (parts: THREE.BufferGeometry[]) => {
  let acc = new Brush(prep(parts[0]))
  acc.updateMatrixWorld()
  for (let i = 1; i < parts.length; i++) {
    const b = new Brush(prep(parts[i]))
    b.updateMatrixWorld()
    acc = ev.evaluate(acc, b, ADDITION)
  }
  return prep(acc.geometry.clone())
}

const dedupe = (pts: THREE.Vector2[]) => pts.filter((q, i) => i === 0 || q.distanceTo(pts[i - 1]) > 1e-5)

/** Turns an (r, z) outline, counter-clockwise, around Z. */
export const lathe = (pts: THREE.Vector2[], seg: number) => {
  const g = new THREE.LatheGeometry(dedupe(pts), Math.max(8, seg))
  g.rotateX(Math.PI / 2)
  return g
}

/** Plain ring: outer and inner radius, -h/2..h/2. */
const ring = (ro: number, ri: number, h: number, seg: number) => {
  const z0 = -h / 2
  const z1 = h / 2
  const V = (r: number, z: number) => new THREE.Vector2(r, z)
  return ri > 0.01 ? lathe([V(ri, z0), V(ro, z0), V(ro, z1), V(ri, z1), V(ri, z0)], seg) : lathe([V(0, z0), V(ro, z0), V(ro, z1), V(0, z1)], seg)
}

/**
 * The inside of a wall `w` thick under an outside radius r(z) sampled every
 * `dz`: each point stays w from the outside, measured square to it. Then, going
 * down from the top, the inside may not pull in faster than 45°, so no inside
 * ceiling hangs when printed upright.
 */
export function insideOf(r: number[], dz: number, w: number): number[] {
  const n = r.length
  const k = Math.ceil(w / dz)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    let m = Infinity
    for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) {
      const d = (j - i) * dz
      if (Math.abs(d) > w) continue
      m = Math.min(m, r[j] - Math.sqrt(w * w - d * d))
    }
    out[i] = m
  }
  for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] + dz)
  return out
}

/** Transition (reducer or boat tail): bottom ⌀ from the size, top ⌀, shoulders that slide into the tubes. */
export function transitionProfile(p: { d: number; h: number; top: number; shoulder: number; tubeWall: number; wall: number; gap: number }): THREE.Vector2[] {
  const V = (r: number, z: number) => new THREE.Vector2(r, z)
  const Rb = p.d / 2
  const Rt = Math.max(0.5, Math.min(p.top / 2, Rb * 3))
  const z0 = -p.h / 2
  const z1 = p.h / 2
  const s = Math.max(0, Math.min(p.shoulder, p.h * 0.35))
  const inset = Math.max(0, p.tubeWall) + p.gap / 2
  const rbS = Math.max(0.5, Rb - inset)
  const rtS = Math.max(0.5, Rt - inset)
  const zb = z0 + s
  const zt = z1 - s
  const body = (z: number) => Rb + ((Rt - Rb) * (z - zb)) / Math.max(1e-6, zt - zb)
  // Outside radius at any height. The bottom shoulder steps out at 45° so it prints without support.
  const outerAt = (z: number) => {
    if (s > 0 && z <= zb) return rbS
    if (s > 0 && z >= zt) return rtS
    return s > 0 ? Math.min(body(z), rbS + (z - zb)) : body(z)
  }
  const outer: THREE.Vector2[] = []
  if (s > 0) {
    outer.push(V(rbS, z0), V(rbS, zb))
    const slope = (Rt - Rb) / Math.max(1e-6, zt - zb)
    const t = (Rb - rbS) / Math.max(1e-6, 1 - slope)
    if (t > 0 && zb + t < zt) outer.push(V(rbS + t, zb + t))
    outer.push(V(Rt, zt), V(rtS, zt), V(rtS, z1))
  } else outer.push(V(Rb, z0), V(Rt, z1))

  const solid = [V(0, z0), ...outer, V(0, z1)]
  if (p.wall <= 0) return solid
  const dz = Math.min(0.25, p.h / 400)
  const n = Math.round(p.h / dz)
  const r = Array.from({ length: n + 1 }, (_, i) => outerAt(z0 + (i * p.h) / n))
  const inner = insideOf(r, p.h / n, p.wall)
  if (Math.min(...inner) < 0.3) return solid
  const back: THREE.Vector2[] = []
  for (let i = n; i >= 0; i--) back.push(V(inner[i], z0 + (i * p.h) / n))
  return [V(inner[0], z0), ...outer, ...back]
}

/** Coupler: joins two tubes. A band the size of the tubes, the rest slides inside them. */
export function couplerProfile(p: { d: number; h: number; tubeWall: number; wall: number; band: number; gap: number }): THREE.Vector2[] {
  const V = (r: number, z: number) => new THREE.Vector2(r, z)
  const ro = p.d / 2
  const ri = Math.max(1, ro - Math.max(0, p.tubeWall) - p.gap / 2)
  const rb = Math.max(0.5, ri - Math.max(0.4, p.wall))
  const z0 = -p.h / 2
  const z1 = p.h / 2
  const b = Math.max(0, Math.min(p.band, p.h * 0.8)) / 2
  if (b <= 0 || ro - ri < 0.01) return [V(rb, z0), V(ri, z0), V(ri, z1), V(rb, z1), V(rb, z0)]
  // Underside of the band at 45°, so it prints without support.
  const under = Math.min(ro - ri, z0 + p.h / 2 - b - z0)
  return [V(rb, z0), V(ri, z0), V(ri, -b - under), V(ro, -b), V(ro, b), V(ri, b), V(ri, z1), V(rb, z1), V(rb, z0)]
}

export interface FinParams {
  count: number
  shape: FinShape
  /** Tip chord, mm */
  tip: number
  /** How far the tip's leading edge sits below the root's, mm */
  sweep: number
  thick: number
  /** Root fillet leg, mm (0 = none) */
  fillet: number
  /** Bore: outside ⌀ of the tube the fins go on, mm */
  bore: number
  /** Sleeve wall around the tube, mm (0 = fins only, to combine with a tube) */
  sleeve: number
}

/** Radius where the fin roots sit. */
export const finRootRadius = (f: Pick<FinParams, 'bore' | 'sleeve'>, gap: number) => f.bore / 2 + (f.sleeve > 0 ? gap / 2 + f.sleeve : 0)

/** Fin outline in (radius, height), root along the tube, trailing edge at the bottom. */
export function finOutline(f: FinParams, r0: number, span: number, h: number, inset: number): THREE.Vector2[] {
  const V = (r: number, z: number) => new THREE.Vector2(r, z)
  const rt = r0 + span
  if (f.shape === 'elliptical') {
    const pts = [V(r0 - inset, 0), V(rt, 0)]
    const N = 32
    for (let i = N - 1; i >= 0; i--) {
      const u = i / N
      pts.push(V(r0 + span * u, h * Math.sqrt(1 - u * u)))
    }
    pts.push(V(r0 - inset, h))
    return pts
  }
  const sweep = Math.max(0, Math.min(f.sweep, h))
  const tip = Math.max(0, Math.min(f.tip, h - sweep))
  const zLE = h - sweep
  const zTE = zLE - tip
  const pts = [V(r0 - inset, 0), V(r0, 0), V(rt, zTE)]
  if (tip > 0.01) pts.push(V(rt, zLE))
  pts.push(V(r0, h), V(r0 - inset, h))
  return pts
}

/** Height of the fin's root fillet ends at radius r0+f, so the fillet stays inside the fin. */
const filletSpan = (f: FinParams, span: number, h: number, leg: number): [number, number] => {
  const u = Math.min(1, leg / Math.max(1e-6, span))
  if (f.shape === 'elliptical') return [0, h * Math.sqrt(1 - u * u) - 0.2]
  const sweep = Math.max(0, Math.min(f.sweep, h))
  const tip = Math.max(0, Math.min(f.tip, h - sweep))
  // Stop just short of the edges, so the fillet never ends exactly on one (a sliver for the slicer).
  const lo = (h - sweep - tip) * u
  return [lo > 0.01 ? lo + 0.2 : 0, h - sweep * u - 0.2]
}

export function finCanGeometry(f: FinParams, d: number, h: number, gap: number, seg: number): THREE.BufferGeometry {
  const key = JSON.stringify(['fins', f, d, h, gap, seg])
  const hit = cache.get(key)
  if (hit) return hit.clone()
  const r0 = finRootRadius(f, gap)
  const span = Math.max(1, d / 2 - r0)
  const t = Math.max(0.4, f.thick)
  const count = Math.max(1, Math.min(12, Math.round(f.count)))
  // Roots reach 0.8 mm into the sleeve, or into the tube they'll be combined with.
  const inset = 0.8
  const parts: THREE.BufferGeometry[] = []
  if (f.sleeve > 0) parts.push(ring(r0, f.bore / 2 + gap / 2, h, seg))
  const fin = new THREE.ExtrudeGeometry(new THREE.Shape(finOutline(f, r0, span, h, inset)), { depth: t, bevelEnabled: false, curveSegments: 4 })
  fin.rotateX(Math.PI / 2) // outline y -> Z, thickness -> -Y
  fin.translate(0, t / 2, -h / 2)
  const leg = Math.max(0, Math.min(f.fillet, span * 0.5, h * 0.5))
  const fillets: THREE.BufferGeometry[] = []
  if (leg > 0.2) {
    const [a, b] = filletSpan(f, span, h, leg)
    if (b - a > 0.5) {
      for (const side of [1, -1]) {
        const y = (v: number) => side * v
        // The fillet's foot lands right on the round tube, so no sliver is left between them.
        const w = t / 2 + leg
        const foot = Math.sqrt(Math.max(0, r0 * r0 - w * w))
        const s = new THREE.Shape([
          new THREE.Vector2(foot - inset, y(t / 2 - 0.05)),
          new THREE.Vector2(foot - inset, y(w)),
          new THREE.Vector2(foot, y(w)),
          new THREE.Vector2(r0 + leg, y(t / 2 - 0.05)),
        ])
        const g = new THREE.ExtrudeGeometry(s, { depth: b - a, bevelEnabled: false })
        g.translate(0, 0, a - h / 2)
        fillets.push(g)
      }
    }
  }
  for (let i = 0; i < count; i++) {
    const turn = (i / count) * Math.PI * 2
    for (const g of [fin, ...fillets]) parts.push(g.clone().rotateZ(turn))
  }
  const out = union(parts)
  if (cache.size > 100) cache.clear()
  cache.set(key, out)
  return out.clone()
}

/** Bulkhead: a disc that fits inside the tube, with an eye on top for the shock cord. */
export function bulkheadGeometry(d: number, h: number, plate: number, eye: boolean, seg: number): THREE.BufferGeometry {
  const key = JSON.stringify(['bulk', d, h, plate, eye, seg])
  const hit = cache.get(key)
  if (hit) return hit.clone()
  const pt = Math.max(0.6, Math.min(plate, h))
  const disc = ring(d / 2, 0, pt, seg)
  disc.translate(0, 0, -h / 2 + pt / 2)
  const eh = h - pt
  let out: THREE.BufferGeometry
  if (!eye || eh < 3) out = prep(disc)
  else {
    const w = Math.min(d * 0.45, 16)
    const tt = Math.min(4, Math.max(2.4, w * 0.25))
    const tab = new THREE.BoxGeometry(w, tt, eh + 0.4)
    tab.translate(0, 0, -h / 2 + pt + eh / 2 - 0.2)
    // Teardrop hole across the tab, tip up, so its top prints without support.
    const hr = Math.min(w * 0.25, eh * 0.28)
    const s = new THREE.Shape()
    s.moveTo(0, hr * Math.SQRT2)
    s.lineTo(hr * Math.cos((3 * Math.PI) / 4), hr * Math.sin((3 * Math.PI) / 4))
    s.absarc(0, 0, hr, (3 * Math.PI) / 4, (9 * Math.PI) / 4, false)
    s.lineTo(0, hr * Math.SQRT2)
    const hole = new THREE.ExtrudeGeometry(s, { depth: tt + 2, bevelEnabled: false, curveSegments: 24 })
    hole.rotateX(Math.PI / 2)
    hole.translate(0, (tt + 2) / 2, -h / 2 + pt + Math.max(hr + 1.2, eh - hr * Math.SQRT2 - 1.6))
    const a = new Brush(prep(union([disc, tab])))
    const b = new Brush(prep(hole))
    a.updateMatrixWorld()
    b.updateMatrixWorld()
    out = prep(ev.evaluate(a, b, SUBTRACTION).geometry.clone())
  }
  if (cache.size > 100) cache.clear()
  cache.set(key, out)
  return out.clone()
}

/** Geometry for any rocket part except the nose cone, or null if `n` isn't one. */
export function rocketGeometry(n: ShapeNode, sx: number, sy: number, sz: number, gap: number): THREE.BufferGeometry | null {
  const p = n.params
  const seg = Math.max(12, n.params.segments ?? 64)
  const d = Math.max(sx, sy)
  let g: THREE.BufferGeometry
  switch (n.kind) {
    case 'bodytube':
      g = ring(d / 2, d / 2 - Math.min(d / 2 - 0.1, Math.max(0.2, p.tubeWall ?? 1.2)), sz, seg)
      break
    case 'launchlug':
      g = ring(d / 2, Math.min(d / 2 - 0.4, (p.innerDia ?? 3.7) / 2), sz, seg)
      break
    case 'centeringring':
      g = ring(d / 2, Math.min(d / 2 - 0.6, (p.innerDia ?? 18.7) / 2 + gap / 2), sz, seg)
      break
    case 'coupler':
      g = lathe(couplerProfile({ d, h: sz, tubeWall: p.tubeWall ?? 1.2, wall: p.couplerWall ?? 1.6, band: p.band ?? 4, gap }), seg)
      break
    case 'transition':
      g = lathe(transitionProfile({ d, h: sz, top: p.topDia ?? d * 0.6, shoulder: p.shoulderLen ?? 0, tubeWall: p.tubeWall ?? 1.2, wall: p.transWall ?? 0, gap }), seg)
      break
    case 'bulkhead':
      g = bulkheadGeometry(d, sz, p.plate ?? 3, p.eyelet ?? true, seg)
      break
    case 'fincan':
      g = finCanGeometry(finParamsOf(n), d, sz, gap, seg)
      break
    default:
      return null
  }
  if (Math.abs(sx - sy) > 1e-6) g.scale(sx / d, sy / d, 1)
  return g
}

export const finParamsOf = (n: ShapeNode): FinParams => ({
  count: n.params.finCount ?? 3,
  shape: n.params.finShape ?? 'trapezoid',
  tip: n.params.finTip ?? 25,
  sweep: n.params.finSweep ?? 35,
  thick: n.params.finThick ?? 3,
  fillet: n.params.finFillet ?? 2,
  bore: n.params.innerDia ?? 41.6,
  sleeve: n.params.finSleeve ?? 1.6,
})
