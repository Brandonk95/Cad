import * as THREE from 'three'
import { quatOf, worldBodies } from '../model/geometry'
import { dropToBed, withQuaternion } from '../model/ops'
import type { PrintContext, SceneNode } from '../model/types'
import { classifyTriangles, estimate } from './analyze'

export interface OrientationOption {
  label: string
  node: SceneNode
  supportArea: number
  height: number
  minutes: number
  grams: number
  score: number
}

const H = Math.PI / 2
const CANDIDATES: { label: string; q: THREE.Quaternion }[] = [
  { label: 'As placed', q: new THREE.Quaternion() },
  { label: 'Flip over', q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI) },
  { label: 'Front down', q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), H) },
  { label: 'Back down', q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -H) },
  { label: 'Left side down', q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), H) },
  { label: 'Right side down', q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -H) },
]

/**
 * Ranks rotations by support area first, then print time (height is a proxy for
 * layer count). Strength and surface finish come with Show face / Load direction.
 */
export function suggestOrientations(node: SceneNode, ctx: PrintContext): OrientationOption[] {
  const base = quatOf(node.rotation)
  const out: OrientationOption[] = []
  for (const cand of CANDIDATES) {
    const rotated = dropToBed(withQuaternion(node, cand.q.clone().multiply(base)), ctx.clearances)
    const bodies = worldBodies([rotated], ctx.clearances)
    if (!bodies.length) continue
    let supportArea = 0
    for (const b of bodies) {
      const r = classifyTriangles(b.geometry, ctx, false)
      supportArea += r.overhangArea + r.bridgeArea
    }
    const est = estimate(bodies, ctx)
    out.push({
      label: cand.label,
      node: rotated,
      supportArea,
      height: est.height,
      minutes: est.minutes,
      grams: est.grams,
      score: supportArea * 1.0 + est.height * 0.8,
    })
  }
  return out.sort((x, y) => x.score - y.score)
}
