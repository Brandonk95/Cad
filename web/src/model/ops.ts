import * as THREE from 'three'
import { matrixOf, nodeWorldBox, solidWorldBox } from './geometry'
import type { Clearances, GroupNode, SceneNode, Vec3 } from './types'
import { uid } from './catalog'

const RAD = 180 / Math.PI

export const findNode = (nodes: SceneNode[], id: string): SceneNode | undefined => {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'group') {
      const f = findNode(n.children, id)
      if (f) return f
    }
  }
}

export const mapNodes = (nodes: SceneNode[], id: string, fn: (n: SceneNode) => SceneNode): SceneNode[] =>
  nodes.map((n) => {
    if (n.id === id) return fn(n)
    if (n.type === 'group') return { ...n, children: mapNodes(n.children, id, fn) }
    return n
  })

export const removeNodes = (nodes: SceneNode[], ids: Set<string>): SceneNode[] =>
  nodes
    .filter((n) => !ids.has(n.id))
    .map((n) => (n.type === 'group' ? { ...n, children: removeNodes(n.children, ids) } : n))

export const decompose = (m: THREE.Matrix4): { position: Vec3; rotation: Vec3 } => {
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  m.decompose(p, q, s)
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
  const r = (v: number) => Math.round(v * 1e4) / 1e4
  return { position: [r(p.x), r(p.y), r(p.z)], rotation: [r(e.x * RAD), r(e.y * RAD), r(e.z * RAD)] }
}

/** Combine top-level nodes into a group whose origin is the center of their bounds. */
export function combine(nodes: SceneNode[], ids: string[], clr: Clearances): { nodes: SceneNode[]; group?: GroupNode } {
  const picked = nodes.filter((n) => ids.includes(n.id))
  if (picked.length < 2) return { nodes }
  const box = new THREE.Box3()
  for (const n of picked) box.union(nodeWorldBox(n, clr))
  const c = box.getCenter(new THREE.Vector3())
  const inv = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)
  const children = picked.map((n) => ({ ...n, ...decompose(inv.clone().multiply(matrixOf(n))) }))
  const firstSolid = picked.find((n) => n.type === 'group' || !n.hole)
  const group: GroupNode = {
    id: uid(),
    type: 'group',
    name: 'Combined',
    position: [c.x, c.y, c.z],
    rotation: [0, 0, 0],
    color: firstSolid?.color ?? '#C9CED6',
    children,
  }
  const at = nodes.findIndex((n) => ids.includes(n.id))
  const rest = nodes.filter((n) => !ids.includes(n.id))
  rest.splice(Math.min(at, rest.length), 0, group)
  return { nodes: rest, group }
}

/** Split a group back into top-level nodes, baking the group transform into each child. */
export function ungroup(nodes: SceneNode[], id: string): { nodes: SceneNode[]; ids: string[] } {
  const g = nodes.find((n) => n.id === id)
  if (!g || g.type !== 'group') return { nodes, ids: [] }
  const m = matrixOf(g)
  const kids = g.children.map((c) => ({ ...c, ...decompose(m.clone().multiply(matrixOf(c))) }))
  const at = nodes.indexOf(g)
  const out = [...nodes]
  out.splice(at, 1, ...kids)
  return { nodes: out, ids: kids.map((k) => k.id) }
}

export const cloneWithNewIds = (n: SceneNode): SceneNode =>
  n.type === 'group'
    ? { ...n, id: uid(), children: n.children.map(cloneWithNewIds) }
    : { ...n, id: uid(), params: { ...n.params } }

/** Moves a top-level node so its lowest printed point sits on the bed (holes sticking out don't count). */
export function dropToBed(n: SceneNode, clr: Clearances): SceneNode {
  const box = solidWorldBox(n, clr)
  const dz = -box.min.z
  if (Math.abs(dz) < 1e-6) return n
  return { ...n, position: [n.position[0], n.position[1], round(n.position[2] + dz)] }
}

export const round = (v: number, p = 3) => Math.round(v * 10 ** p) / 10 ** p

/** Rotate a top-level node about a world axis around its bounding-box center. */
export function rotateWorld(n: SceneNode, axis: 'x' | 'y' | 'z', deg: number): SceneNode {
  const q = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0),
    (deg * Math.PI) / 180,
  )
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q).multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...n.rotation.map((r) => (r * Math.PI) / 180) as Vec3, 'XYZ'))))
  const { rotation } = decompose(m)
  return { ...n, rotation }
}

/** Sets an absolute world-space rotation built from a quaternion. */
export function withQuaternion(n: SceneNode, q: THREE.Quaternion): SceneNode {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
  return { ...n, rotation: [round(e.x * RAD, 4), round(e.y * RAD, 4), round(e.z * RAD, 4)] }
}

/** Local axis (0..2) of a rotation most aligned with the given parent axis. */
const alignedAxis = (rotation: Vec3, axis: number) => {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(rotation.map((r) => (r * Math.PI) / 180) as Vec3), 'XYZ'))
  const e = m.elements
  let best = 0
  let bestV = -1
  for (let i = 0; i < 3; i++) {
    const v = Math.abs(e[i * 4 + axis])
    if (v > bestV) {
      bestV = v
      best = i
    }
  }
  return best
}

const scaleInto = (n: SceneNode, axis: number, f: number): SceneNode => {
  const local = alignedAxis(n.rotation, axis)
  if (n.type === 'shape') {
    // Screw holes and magnet pockets keep their diameter; only depth follows.
    if (HARDWARE.has(n.kind) && local < 2) return n
    const size = [...n.size] as Vec3
    size[local] = round(Math.max(0.05, size[local] * f), 3)
    return { ...n, size }
  }
  return {
    ...n,
    children: n.children.map((c) => {
      const p = [...c.position] as Vec3
      p[local] = round(p[local] * f, 4)
      return scaleInto({ ...c, position: p }, local, f)
    }),
  }
}

/** Resize a top-level node so its world extent along `axis` becomes `len`. Bottom stays put. */
export function resizeWorld(n: SceneNode, axis: 0 | 1 | 2, len: number, clr: Clearances): SceneNode {
  const before = solidWorldBox(n, clr)
  const cur = before.max.getComponent(axis) - before.min.getComponent(axis)
  if (cur <= 1e-6 || len <= 0) return n
  const scaled = scaleInto(n, axis, len / cur)
  const after = solidWorldBox(scaled, clr)
  const dz = before.min.z - after.min.z
  return { ...scaled, position: [scaled.position[0], scaled.position[1], round(scaled.position[2] + dz)] }
}

/** Hardware pockets keep their diameter when a part is scaled; only their depth follows. */
const HARDWARE = new Set(['screwHole', 'magnetPocket'])

/** Scale a node by factors along its own local axes. */
function scaleLocalAxes(n: SceneNode, f: Vec3): SceneNode {
  if (n.type === 'shape') {
    const keep = HARDWARE.has(n.kind)
    const size = n.size.map((v, i) => (keep && i < 2 ? v : round(Math.max(0.05, v * f[i]), 3))) as Vec3
    return { ...n, size }
  }
  return {
    ...n,
    children: n.children.map((c) => {
      let out: SceneNode = { ...c, position: c.position.map((v, i) => round(v * f[i], 4)) as Vec3 }
      // Children may be rotated: map each group axis onto the child's closest local axis.
      for (const a of [0, 1, 2]) if (Math.abs(f[a] - 1) > 1e-9) out = scaleInto(out, a, f[a])
      return out
    }),
  }
}

/**
 * Scale a top-level node by factors along its local axes (1 = unchanged), about its center,
 * keeping its bottom where it was so it doesn't sink into or lift off the bed.
 */
export function scaleNode(n: SceneNode, f: Vec3, clr: Clearances): SceneNode {
  const before = solidWorldBox(n, clr)
  const scaled = scaleLocalAxes(n, f)
  const after = solidWorldBox(scaled, clr)
  const dz = before.min.z - after.min.z
  return { ...scaled, position: [scaled.position[0], scaled.position[1], round(scaled.position[2] + dz)] }
}

export interface CircularPatternOpts {
  /** Total number of items, including the original */
  count: number
  /** Total sweep in degrees. 360 spreads the items evenly around the full circle. */
  angle: number
  /** Center of the circle on the bed (world X, Y) */
  center: [number, number]
}

/** Angle of copy k (1..count-1) in degrees. A full circle doesn't put the last copy on top of the first. */
export const patternAngle = (k: number, o: CircularPatternOpts) =>
  Math.abs(o.angle) >= 360 ? (360 * k) / o.count : o.count > 1 ? (o.angle * k) / (o.count - 1) : 0

/**
 * Copies of the given top-level nodes, rotated about a vertical axis through
 * `center`. Each copy also turns with the circle, like spokes on a wheel.
 */
export function circularCopies(nodes: SceneNode[], ids: string[], o: CircularPatternOpts): SceneNode[] {
  const picked = nodes.filter((n) => ids.includes(n.id))
  const out: SceneNode[] = []
  const count = Math.max(1, Math.min(360, Math.round(o.count)))
  for (let k = 1; k < count; k++) {
    const deg = patternAngle(k, { ...o, count })
    const t = (deg * Math.PI) / 180
    const c = Math.cos(t)
    const s = Math.sin(t)
    for (const n of picked) {
      const dx = n.position[0] - o.center[0]
      const dy = n.position[1] - o.center[1]
      const turned = rotateWorld(cloneWithNewIds(n), 'z', deg)
      out.push({ ...turned, position: [round(o.center[0] + dx * c - dy * s), round(o.center[1] + dx * s + dy * c), n.position[2]] })
    }
  }
  return out
}

/**
 * The part the selection sits on or in (a hub or plate), if any: the smallest
 * other solid whose footprint contains the selection's center. Patterns
 * default to turning around its center.
 */
export function findHub(nodes: SceneNode[], ids: string[], clr: Clearances): SceneNode | null {
  const sel = new THREE.Box3()
  for (const n of nodes) if (ids.includes(n.id)) sel.union(solidWorldBox(n, clr))
  if (sel.isEmpty()) return null
  const c = sel.getCenter(new THREE.Vector3())
  let best: { n: SceneNode; area: number } | null = null
  for (const n of nodes) {
    if (ids.includes(n.id) || (n.type === 'shape' && n.hole)) continue
    const b = solidWorldBox(n, clr)
    if (c.x < b.min.x || c.x > b.max.x || c.y < b.min.y || c.y > b.max.y) continue
    const area = (b.max.x - b.min.x) * (b.max.y - b.min.y)
    if (!best || area < best.area) best = { n, area }
  }
  return best?.n ?? null
}
