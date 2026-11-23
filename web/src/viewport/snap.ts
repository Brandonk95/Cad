import * as THREE from 'three'
import { create } from 'zustand'

/**
 * Smart snapping while dragging with the move gizmo.
 *
 * - Stacking: a solid that was sitting on something (the bed or another part)
 *   and is dragged sideways over another solid lands on its top face, and drops
 *   back down when dragged off it.
 * - Height: dragging up/down snaps the bottom to the bed or another part's top,
 *   and the top flush with another part's top or bottom.
 * - Alignment: left / center / right (and front / center / back) line up with
 *   nearby parts.
 * Hold Alt while dragging to move freely on the 1 mm grid.
 */

export type Seg = [THREE.Vector3Tuple, THREE.Vector3Tuple]

export interface SnapTarget {
  box: THREE.Box3
  name: string
  solid: boolean
}

export const useSnapGuides = create<{ segs: Seg[]; label: string | null; at: THREE.Vector3Tuple | null }>(() => ({ segs: [], label: null, at: null }))
export const clearSnapGuides = () => useSnapGuides.setState({ segs: [], label: null, at: null })

let altHeld = false
if (typeof window !== 'undefined') {
  const track = (e: KeyboardEvent) => {
    altHeld = e.altKey
    // Stop Alt from moving focus to the browser menu while it's used as a modifier.
    if (e.key === 'Alt') e.preventDefault()
  }
  window.addEventListener('keydown', track)
  window.addEventListener('keyup', track)
  window.addEventListener('pointermove', (e) => (altHeld = e.altKey), { passive: true })
  window.addEventListener('blur', () => (altHeld = false))
}
export const freeMove = () => altHeld

const EPS = 0.05

const overlapArea = (a: THREE.Box3, b: THREE.Box3) => {
  const w = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x)
  const d = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y)
  return w > 0 && d > 0 ? w * d : 0
}
const footArea = (b: THREE.Box3) => (b.max.x - b.min.x) * (b.max.y - b.min.y)

/** Clearly over the target: a real share of either footprint overlaps, or our center is above it. */
const isOver = (a: THREE.Box3, t: THREE.Box3) => {
  const ov = overlapArea(a, t)
  if (!ov) return false
  if (ov >= 0.25 * Math.min(footArea(a), footArea(t))) return true
  const cx = (a.min.x + a.max.x) / 2
  const cy = (a.min.y + a.max.y) / 2
  return cx > t.min.x && cx < t.max.x && cy > t.min.y && cy < t.max.y
}

/** Is a part with this box resting on the bed or on top of another solid? */
export function isResting(box: THREE.Box3, targets: SnapTarget[]) {
  if (Math.abs(box.min.z) < EPS) return true
  return targets.some((t) => t.solid && Math.abs(box.min.z - t.box.max.z) < EPS && overlapArea(box, t.box) > 0)
}

const topOutline = (b: THREE.Box3): Seg[] => {
  const z = b.max.z + 0.05
  const p: THREE.Vector3Tuple[] = [
    [b.min.x, b.min.y, z],
    [b.max.x, b.min.y, z],
    [b.max.x, b.max.y, z],
    [b.min.x, b.max.y, z],
  ]
  return p.map((q, i) => [q, p[(i + 1) % 4]] as Seg)
}

interface Opts {
  /** gizmo axis being dragged: X, Y, Z, XY, YZ, XZ or XYZ */
  axis: string
  solid: boolean
  restingAtStart: boolean
  /** snap distance in mm (scaled with zoom) */
  tol: number
}

/** Returns how far to shift the dragged part, plus guides to draw. */
export function snapMove(box: THREE.Box3, targets: SnapTarget[], o: Opts) {
  const delta = new THREE.Vector3()
  const segs: Seg[] = []
  let label: string | null = null
  const b = box.clone()
  const others = targets.filter((t) => !t.box.isEmpty())

  // Side-to-side alignment of edges and centers.
  for (const k of ['x', 'y'] as const) {
    if (!o.axis.includes(k.toUpperCase())) continue
    const mine = [b.min[k], (b.min[k] + b.max[k]) / 2, b.max[k]]
    let best: { d: number; v: number; t: THREE.Box3 } | null = null
    for (const t of others) {
      const theirs = [t.box.min[k], (t.box.min[k] + t.box.max[k]) / 2, t.box.max[k]]
      for (const m of mine)
        for (const v of theirs) {
          const d = v - m
          if (Math.abs(d) < o.tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, v, t: t.box }
        }
    }
    if (!best) continue
    delta[k] = best.d
    b.translate(k === 'x' ? new THREE.Vector3(best.d, 0, 0) : new THREE.Vector3(0, best.d, 0))
    // Guide line along the other horizontal axis, spanning both parts, on the lower floor.
    const j = k === 'x' ? 'y' : 'x'
    const lo = Math.min(b.min[j], best.t.min[j]) - 4
    const hi = Math.max(b.max[j], best.t.max[j]) + 4
    const z = Math.min(b.min.z, best.t.min.z) + 0.05
    segs.push(k === 'x' ? [[best.v, lo, z], [best.v, hi, z]] : [[lo, best.v, z], [hi, best.v, z]])
  }

  if (!o.axis.includes('Z')) {
    // Sideways drag: a resting solid sits on whatever it's over.
    if (o.solid && o.restingAtStart) {
      let top = 0
      let on: SnapTarget | null = null
      for (const t of others) {
        if (!t.solid || !isOver(b, t.box)) continue
        if (t.box.max.z > top) {
          top = t.box.max.z
          on = t
        }
      }
      delta.z = top - b.min.z
      b.translate(new THREE.Vector3(0, 0, delta.z))
      if (on) {
        segs.push(...topOutline(on.box))
        label = `On ${on.name}`
      }
    }
  } else {
    // Up / down: bottom to the bed or a top face; top flush with a top or bottom.
    let best: { d: number; t: SnapTarget | null; what: string } | null = null
    const consider = (d: number, t: SnapTarget | null, what: string) => {
      if (Math.abs(d) < o.tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t, what }
    }
    consider(0 - b.min.z, null, 'On the bed')
    for (const t of others) {
      if (!overlapArea(b, t.box)) continue
      consider(t.box.max.z - b.min.z, t, `On ${t.name}`)
      consider(t.box.max.z - b.max.z, t, `Flush with ${t.name}`)
      consider(t.box.min.z - b.min.z, t, `Level with ${t.name}`)
    }
    const hit = best as { d: number; t: SnapTarget | null; what: string } | null
    if (hit) {
      delta.z = hit.d
      b.translate(new THREE.Vector3(0, 0, hit.d))
      label = hit.what
      if (hit.t) segs.push(...topOutline(hit.t.box))
    }
  }

  const at: THREE.Vector3Tuple = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z]
  return { delta, segs, label, at }
}
