import * as THREE from 'three'
import { uid } from '../model/catalog'
import { combine, decompose } from '../model/ops'
import { matrixOf } from '../model/geometry'
import type { Clearances, SceneNode, ShapeNode, Vec3 } from '../model/types'

/**
 * Sketch mode turns a closed outline into an ordinary shape in the model tree:
 * a rectangle becomes a box, a circle a cylinder, any other outline an extrude.
 * That keeps one model: Block mode can resize, round or hollow what you sketched.
 */

export type V2 = [number, number]

export type Profile =
  | { kind: 'rect'; a: V2; b: V2 }
  | { kind: 'circle'; c: V2; r: number }
  | { kind: 'poly'; pts: V2[] }

/** Smallest pull that makes a part, in mm. */
export const MIN_PULL = 0.2
/** A cut pokes this far above the face so it cleanly opens it. */
const CUT_LIP = 0.05
const SOLID = '#C9CED6'

const r3 = (v: number) => Math.round(v * 1000) / 1000

export function profileBounds(p: Profile) {
  if (p.kind === 'rect') {
    return { min: [Math.min(p.a[0], p.b[0]), Math.min(p.a[1], p.b[1])] as V2, max: [Math.max(p.a[0], p.b[0]), Math.max(p.a[1], p.b[1])] as V2 }
  }
  if (p.kind === 'circle') return { min: [p.c[0] - p.r, p.c[1] - p.r] as V2, max: [p.c[0] + p.r, p.c[1] + p.r] as V2 }
  const xs = p.pts.map((q) => q[0])
  const ys = p.pts.map((q) => q[1])
  return { min: [Math.min(...xs), Math.min(...ys)] as V2, max: [Math.max(...xs), Math.max(...ys)] as V2 }
}

/** Outline as a closed list of points, for drawing. */
export function outline(p: Profile, seg = 64): V2[] {
  if (p.kind === 'rect') {
    const { min, max } = profileBounds(p)
    return [min, [max[0], min[1]], max, [min[0], max[1]], min]
  }
  if (p.kind === 'circle') {
    const out: V2[] = []
    for (let i = 0; i <= seg; i++) out.push([p.c[0] + p.r * Math.cos((i / seg) * Math.PI * 2), p.c[1] + p.r * Math.sin((i / seg) * Math.PI * 2)])
    return out
  }
  return [...p.pts, p.pts[0]]
}

/** True when the outline is big enough to make a part. */
export function profileOk(p: Profile): boolean {
  const { min, max } = profileBounds(p)
  const w = max[0] - min[0]
  const d = max[1] - min[1]
  if (p.kind === 'circle') return p.r >= 0.25
  if (w < 0.5 || d < 0.5) return false
  if (p.kind === 'poly') return p.pts.length >= 3 && Math.abs(THREE.ShapeUtils.area(p.pts.map(([x, y]) => new THREE.Vector2(x, y)))) > 0.25
  return true
}

const NAMES = { rect: 'Rectangle', circle: 'Circle', poly: 'Outline' }

/**
 * The shape a sketch makes when pulled by h mm from a face at height z.
 * Negative h cuts down into the part below as a hole.
 */
export function sketchNode(p: Profile, z: number, h: number): ShapeNode {
  const cut = h < 0
  const H = Math.max(MIN_PULL, Math.abs(h))
  const sz = cut ? H + CUT_LIP : H
  const pz = cut ? z + CUT_LIP - sz / 2 : z + H / 2
  const { min, max } = profileBounds(p)
  const cx = (min[0] + max[0]) / 2
  const cy = (min[1] + max[1]) / 2
  const w = max[0] - min[0]
  const d = max[1] - min[1]
  const base = {
    id: uid(),
    type: 'shape' as const,
    name: cut ? `${NAMES[p.kind]} cut` : NAMES[p.kind],
    rotation: [0, 0, 0] as Vec3,
    hole: cut,
    color: SOLID,
    position: [r3(cx), r3(cy), r3(pz)] as Vec3,
  }
  if (p.kind === 'rect') return { ...base, kind: 'box', size: [r3(w), r3(d), r3(sz)], params: {} }
  if (p.kind === 'circle') return { ...base, kind: 'cylinder', size: [r3(p.r * 2), r3(p.r * 2), r3(sz)], params: { segments: 64 } }
  let profile: V2[] = p.pts.map(([x, y]) => [r3((x - cx) / w), r3((y - cy) / d)])
  if (THREE.ShapeUtils.isClockWise(profile.map(([x, y]) => new THREE.Vector2(x, y)))) profile = profile.reverse()
  return { ...base, kind: 'extrude', size: [r3(w), r3(d), r3(sz)], params: { profile } }
}

/**
 * Adds a sketched shape to the model. On a part's face it joins that part
 * (pull up) or cuts into it (pull down); on the bed it is a new part.
 */
export function applySketch(nodes: SceneNode[], node: ShapeNode, host: string | null, clr: Clearances): { nodes: SceneNode[]; selection: string[]; label: string } {
  const what = node.kind === 'box' ? 'rectangle' : node.kind === 'cylinder' ? 'circle' : 'outline'
  const target = host ? nodes.find((n) => n.id === host) : undefined
  if (!target) return { nodes: [...nodes, node], selection: [node.id], label: `Pull ${what}` }
  const label = node.hole ? `Cut ${what}` : `Pull ${what}`
  if (target.type === 'group') {
    // Add straight into the existing part, in its own frame.
    const local = { ...node, ...decompose(matrixOf(target).invert().multiply(matrixOf(node))) }
    const out = nodes.map((n) => (n.id === target.id ? { ...target, children: [...target.children, local] } : n))
    return { nodes: out, selection: [target.id], label }
  }
  const r = combine([...nodes, node], [target.id, node.id], clr)
  if (!r.group) return { nodes: [...nodes, node], selection: [node.id], label }
  const group = { ...r.group, name: target.name }
  return { nodes: r.nodes.map((n) => (n.id === group.id ? group : n)), selection: [group.id], label }
}
