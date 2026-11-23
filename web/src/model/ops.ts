import * as THREE from 'three'
import { matrixOf, nodeWorldBox } from './geometry'
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

const decompose = (m: THREE.Matrix4): { position: Vec3; rotation: Vec3 } => {
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

/** Moves a top-level node so its lowest point sits on the bed. */
export function dropToBed(n: SceneNode, clr: Clearances): SceneNode {
  const box = nodeWorldBox(n, clr)
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
  const before = nodeWorldBox(n, clr)
  const cur = before.max.getComponent(axis) - before.min.getComponent(axis)
  if (cur <= 1e-6 || len <= 0) return n
  const scaled = scaleInto(n, axis, len / cur)
  const after = nodeWorldBox(scaled, clr)
  const dz = before.min.z - after.min.z
  return { ...scaled, position: [scaled.position[0], scaled.position[1], round(scaled.position[2] + dz)] }
}
