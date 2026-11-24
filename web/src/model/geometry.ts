import * as THREE from 'three'
import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg'
import { SCREWS } from './catalog'
import { detailedGeometry } from './details'
import { unitTextGeometry } from './text'
import { noseGeometry } from './nosecone'
import type { Clearances, GroupNode, SceneNode, ShapeNode, Vec3 } from './types'

const DEG = Math.PI / 180
const WORLD_UP = new THREE.Vector3(0, 0, 1)

export const eulerOf = (r: Vec3) => new THREE.Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'XYZ')
export const quatOf = (r: Vec3) => new THREE.Quaternion().setFromEuler(eulerOf(r))
export const matrixOf = (n: { position: Vec3; rotation: Vec3 }) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...n.position), quatOf(n.rotation), new THREE.Vector3(1, 1, 1))

/** Round shapes whose local Z axis can lie sideways and get teardrop / bridge profiles. */
export const isRoundHole = (n: ShapeNode) =>
  n.hole && (n.kind === 'cylinder' || n.kind === 'magnetPocket' || (n.kind === 'screwHole' && n.params.screwType !== 'nut'))

/** True when the hole's axis is close to horizontal in world space. */
export const holeIsSideways = (n: ShapeNode, parentQuat = new THREE.Quaternion()) => {
  const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(parentQuat.clone().multiply(quatOf(n.rotation)))
  return Math.abs(axis.z) < 0.5
}

/** Effective size of a node: nominal size plus calibrated diametral clearance on holes. */
export const effectiveSize = (n: ShapeNode, clr: Clearances): Vec3 => {
  const c = n.hole && n.fit ? clr[n.fit] : 0
  return [n.size[0] + c, n.size[1] + c, n.size[2]]
}

const clean = (g: THREE.BufferGeometry) => {
  let out = g.index ? g.toNonIndexed() : g
  out.deleteAttribute('uv')
  out.deleteAttribute('uv1')
  out.computeVertexNormals()
  out.clearGroups()
  return out
}

/** Unit cylinder along Z. thetaStart = PI/seg puts a flat side facing -Y, matching details.ts. */
const cylinderZ = (rTop: number, rBot: number, seg: number, thetaStart = 0) => {
  const g = new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1, false, thetaStart)
  g.rotateX(Math.PI / 2) // +Y (top) -> +Z
  return g
}

const extrudeZ = (shape: THREE.Shape, curveSegments = 48) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments })
  g.translate(0, 0, -0.5)
  return g
}

/** Unit-diameter teardrop with its tip pointing +Y. */
const teardropShape = () => {
  const r = 0.5
  const s = new THREE.Shape()
  s.moveTo(0, r * Math.SQRT2)
  s.lineTo(r * Math.cos(135 * DEG), r * Math.sin(135 * DEG))
  s.absarc(0, 0, r, 135 * DEG, 405 * DEG, false)
  s.lineTo(0, r * Math.SQRT2)
  return s
}

/** Unit-diameter circle with a flat top at +Y: prints as one short bridge. */
const bridgedShape = () => {
  const r = 0.5
  const s = new THREE.Shape()
  s.moveTo(-r, 0)
  s.absarc(0, 0, r, Math.PI, 2 * Math.PI, false)
  s.lineTo(r, r)
  s.lineTo(-r, r)
  s.lineTo(-r, 0)
  return s
}

const wedge = () => {
  const s = new THREE.Shape()
  s.moveTo(-0.5, -0.5)
  s.lineTo(0.5, -0.5)
  s.lineTo(-0.5, 0.5)
  s.lineTo(-0.5, -0.5)
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false })
  g.rotateX(Math.PI / 2) // shape y -> world z, extrusion -> -y
  g.translate(0, 0.5, 0)
  return g
}

/**
 * Builds the local-space geometry for one shape, already scaled to its effective size.
 * Returns several pieces for compound print primitives (captive nut = hex pocket + bore).
 */
export function buildShapeGeometries(n: ShapeNode, clr: Clearances, parentQuat = new THREE.Quaternion()): THREE.BufferGeometry[] {
  const [sx, sy, sz] = effectiveSize(n, clr)
  const seg = n.params.segments ?? 64
  let g: THREE.BufferGeometry
  const extra: THREE.BufferGeometry[] = []

  const profiled = isRoundHole(n) && (n.params.teardrop || n.params.sacrificial) && holeIsSideways(n, parentQuat)

  if (profiled) {
    g = extrudeZ(n.params.teardrop ? teardropShape() : bridgedShape(), seg)
    // Spin the profile about its axis so the tip points to world +Z.
    const q = parentQuat.clone().multiply(quatOf(n.rotation)).invert()
    const up = WORLD_UP.clone().applyQuaternion(q)
    g.scale(sx, sy, sz)
    g.rotateZ(Math.atan2(up.y, up.x) - Math.PI / 2)
  } else {
    const detailed = detailedGeometry(n, sx, sy, sz)
    if (detailed) return [clean(detailed)]
    switch (n.kind) {
      case 'box':
        g = new THREE.BoxGeometry(1, 1, 1)
        break
      case 'sphere':
        g = new THREE.SphereGeometry(0.5, 48, 32)
        g.rotateX(Math.PI / 2)
        break
      case 'cone':
        g = cylinderZ(0.5 * (n.params.topRatio ?? 0), 0.5, seg, Math.PI / seg)
        break
      case 'wedge':
        g = wedge()
        break
      case 'extrude': {
        const pts = n.params.profile ?? []
        if (pts.length < 3) {
          g = new THREE.BoxGeometry(1, 1, 1)
          break
        }
        g = extrudeZ(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), 12)
        break
      }
      case 'nosecone': {
        // Built at full size so the hollow wall keeps its thickness.
        const p = n.params
        return [clean(noseGeometry({ shape: p.noseShape ?? 'ogive', shoulder: p.shoulder ?? 0, shoulderRatio: p.shoulderRatio ?? 0.93, wall: p.noseWall ?? 0 }, sx, sy, sz, seg))]
      }
      case 'text':
        g = unitTextGeometry(n.params.text ?? '', n.params.flipX) ?? new THREE.BoxGeometry(1, 1, 1)
        break
      case 'screwHole': {
        if (n.params.screwType === 'nut') {
          const s = SCREWS[n.params.screwSize ?? 'M3']
          // Hex pocket at the top of the hole, bore through the rest.
          const hexDepth = Math.min(sz, s.nutThick + 0.3)
          g = cylinderZ(0.5, 0.5, 6)
          g.scale(sx, sy, hexDepth)
          g.translate(0, 0, sz / 2 - hexDepth / 2)
          const c = n.fit ? clr[n.fit] : 0
          const bore = cylinderZ(0.5, 0.5, seg)
          bore.scale(s.clearance + c, s.clearance + c, sz)
          extra.push(bore)
          return [clean(g), ...extra.map(clean)]
        }
        g = cylinderZ(0.5, 0.5, seg)
        break
      }
      case 'cylinder':
      case 'magnetPocket':
      case 'pin':
      default:
        g = cylinderZ(0.5, 0.5, seg, n.kind === 'magnetPocket' ? 0 : Math.PI / seg)
    }
    g.scale(sx, sy, sz)
  }
  return [clean(g), ...extra.map(clean)]
}

/**
 * Outline segments for a merged mesh: creases sharper than `thresholdDeg` and
 * open borders. Merging leaves T-junctions (a corner sitting partway along a
 * neighbour's edge) and slivers, which a plain edges helper draws as stray lines
 * across flat faces. Here an edge counts as inside a flat face when a
 * neighbouring triangle with the same facing covers its midpoint.
 */
export function featureEdges(g: THREE.BufferGeometry, thresholdDeg = 20): THREE.Vector3Tuple[] {
  const pos = (g.index ? g.toNonIndexed() : g).getAttribute('position')
  const cos = Math.cos((thresholdDeg * Math.PI) / 180)
  const tris: { n: THREE.Vector3; v: THREE.Vector3[] }[] = []
  for (let i = 0; i < pos.count; i += 3) {
    const v = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, i + k))
    const cr = new THREE.Vector3().subVectors(v[2], v[1]).cross(new THREE.Vector3().subVectors(v[0], v[1]))
    const longest = Math.max(v[0].distanceTo(v[1]), v[1].distanceTo(v[2]), v[2].distanceTo(v[0]))
    if (!longest || cr.length() / longest < 1e-3) continue // sliver: no real facing
    tris.push({ n: cr.normalize(), v })
  }
  // Grid of edges so "which edges pass through this point" is quick.
  const CELL = 2
  const key = (x: number, y: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`
  const grid = new Map<string, number[]>()
  const edges: { a: THREE.Vector3; b: THREE.Vector3; t: number }[] = []
  tris.forEach((t, ti) => {
    for (let k = 0; k < 3; k++) {
      const a = t.v[k]
      const b = t.v[(k + 1) % 3]
      const id = edges.push({ a, b, t: ti }) - 1
      const len = a.distanceTo(b)
      const steps = Math.max(1, Math.ceil(len / (CELL / 2)))
      const seen = new Set<string>()
      for (let s = 0; s <= steps; s++) {
        const p = new THREE.Vector3().lerpVectors(a, b, s / steps)
        const kk = key(p.x, p.y, p.z)
        if (seen.has(kk)) continue
        seen.add(kk)
        const list = grid.get(kk)
        if (list) list.push(id)
        else grid.set(kk, [id])
      }
    }
  })
  const onSegment = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
    const ab = new THREE.Vector3().subVectors(b, a)
    const l2 = ab.lengthSq()
    if (!l2) return false
    const t = new THREE.Vector3().subVectors(p, a).dot(ab) / l2
    if (t < -1e-6 || t > 1 + 1e-6) return false
    return a.clone().addScaledVector(ab, t).distanceToSquared(p) < 1e-8
  }
  const out: THREE.Vector3Tuple[] = []
  for (const e of edges) {
    const mid = new THREE.Vector3().addVectors(e.a, e.b).multiplyScalar(0.5)
    const me = tris[e.t].n
    let flat = false
    let neighbour = false
    for (const id of grid.get(key(mid.x, mid.y, mid.z)) ?? []) {
      const o = edges[id]
      if (o.t === e.t || !onSegment(mid, o.a, o.b)) continue
      neighbour = true
      if (tris[o.t].n.dot(me) > cos) {
        flat = true
        break
      }
    }
    if (flat) continue
    // A crease is seen from both sides; keep one copy.
    if (neighbour && e.a.x + e.a.y + e.a.z > e.b.x + e.b.y + e.b.z) continue
    out.push(e.a.toArray(), e.b.toArray())
  }
  return out
}

// ---------------------------------------------------------------------------
// CSG

const evaluator = new Evaluator()
evaluator.attributes = ['position', 'normal']
evaluator.useGroups = false

const csgCache = new Map<string, THREE.BufferGeometry>()

// The placement is baked into the geometry so every brush shares the group's frame.
// three-bvh-csg returns its result in the first brush's local frame, so a brush
// with its own position or rotation would shift (or re-rotate) the combined part.
const brushFrom = (g: THREE.BufferGeometry, m: THREE.Matrix4) => {
  const b = new Brush(g.clone().applyMatrix4(m))
  b.updateMatrixWorld()
  return b
}

/** How far a stacked solid reaches into the one below while merging, in mm. */
const SEAT = 0.01

/**
 * A solid whose bottom lies exactly on another solid's top (a part stacked on a
 * part, or a sketch pulled up from a face) merges into thousands of sliver
 * triangles. Stretching it down a hair into the part below avoids the touching
 * faces. Only the merged mesh changes: the saved sizes stay exact.
 */
function seatStacked(solids: Brush[]) {
  const boxes = solids.map((b) => {
    b.geometry.computeBoundingBox()
    return b.geometry.boundingBox!.clone()
  })
  solids.forEach((b, i) => {
    const me = boxes[i]
    const h = me.max.z - me.min.z
    if (h <= SEAT * 2) return
    const sits = boxes.some((o, j) => j !== i && Math.abs(o.max.z - me.min.z) < 1e-4 && o.max.x > me.min.x && o.min.x < me.max.x && o.max.y > me.min.y && o.min.y < me.max.y)
    if (!sits) return
    // Scale along Z about the top face so the bottom moves down by SEAT.
    const top = me.max.z
    const k = (h + SEAT) / h
    b.geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, top).multiply(new THREE.Matrix4().makeScale(1, 1, k)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -top)))
    b.geometry.computeBoundingBox()
  })
}

/**
 * Combines a group into one solid in group-local space.
 * Tinkercad semantics: union every solid, then cut every hole.
 */
export function groupGeometry(g: GroupNode, clr: Clearances, parentQuat = new THREE.Quaternion()): THREE.BufferGeometry | null {
  const key = JSON.stringify([g.children, clr, parentQuat.toArray(), g.rotation])
  const hit = csgCache.get(key)
  if (hit) return hit

  const groupQuat = parentQuat.clone().multiply(quatOf(g.rotation))
  const solids: Brush[] = []
  const holes: Brush[] = []
  for (const c of g.children) {
    const m = matrixOf(c)
    if (c.type === 'group') {
      const sub = groupGeometry(c, clr, groupQuat)
      if (sub) solids.push(brushFrom(sub, m))
      continue
    }
    for (const piece of buildShapeGeometries(c, clr, groupQuat)) {
      ;(c.hole ? holes : solids).push(brushFrom(piece, m))
    }
  }
  if (!solids.length) return null
  seatStacked(solids)

  let acc = solids[0]
  for (let i = 1; i < solids.length; i++) acc = evaluator.evaluate(acc, solids[i], ADDITION)
  for (const h of holes) acc = evaluator.evaluate(acc, h, SUBTRACTION)

  const out = acc.geometry.clone()
  // Result geometry is in world space of the brushes (group-local here).
  out.computeBoundingBox()
  out.computeVertexNormals()
  if (csgCache.size > 200) csgCache.clear()
  csgCache.set(key, out)
  return out
}

/** A printable body: one top-level solid or combined group, in world (bed) space. */
export interface Body {
  id: string
  name: string
  color: string
  geometry: THREE.BufferGeometry
}

export function worldBodies(nodes: SceneNode[], clr: Clearances): Body[] {
  const out: Body[] = []
  for (const n of nodes) {
    const m = matrixOf(n)
    if (n.type === 'group') {
      const g = groupGeometry(n, clr)
      if (g) out.push({ id: n.id, name: n.name, color: n.color, geometry: g.clone().applyMatrix4(m) })
    } else if (!n.hole) {
      const pieces = buildShapeGeometries(n, clr)
      out.push({ id: n.id, name: n.name, color: n.color, geometry: pieces[0].applyMatrix4(m) })
    }
  }
  for (const b of out) b.geometry.computeBoundingBox()
  return out
}

/** World-space bounding box of a node (used for drop-to-bed, size tags, groups). */
export function nodeWorldBox(n: SceneNode, clr: Clearances, parent = new THREE.Matrix4()): THREE.Box3 {
  const m = parent.clone().multiply(matrixOf(n))
  const box = new THREE.Box3()
  if (n.type === 'group') {
    for (const c of n.children) box.union(nodeWorldBox(c, clr, m))
    return box
  }
  for (const g of buildShapeGeometries(n, clr)) {
    g.applyMatrix4(m)
    g.computeBoundingBox()
    box.union(g.boundingBox!)
  }
  return box
}

/**
 * World box of what actually prints for a top-level node. For a combined group this is
 * the cut result, so a hole poking out of the bottom or top doesn't count as material.
 * Standalone shapes (solid or hole) use their own box.
 */
export function solidWorldBox(n: SceneNode, clr: Clearances): THREE.Box3 {
  if (n.type === 'group') {
    const g = groupGeometry(n, clr)
    if (g) {
      const w = g.clone().applyMatrix4(matrixOf(n))
      w.computeBoundingBox()
      const box = w.boundingBox!.clone()
      w.dispose()
      if (!box.isEmpty()) return box
    }
  }
  return nodeWorldBox(n, clr)
}
