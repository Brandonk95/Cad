import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import type { ShapeNode } from './types'

/**
 * Detail parameters for basic shapes: rounded corners, chamfered or rounded edges,
 * flat-sided (polygon) cylinders and cones, domes, and hollow shells with a wall,
 * floor and optional opening.
 *
 * Plain shapes skip this file and use the fast unit-primitive path in geometry.ts.
 * Everything here is built in real millimetres because edge sizes and walls
 * must not stretch when a shape isn't a cube.
 */

export const ROUND_SIDES = 64
export const DEFAULT_WALL = 2
export const DEFAULT_FLOOR = 2

export const HOLLOW_KINDS: ShapeNode['kind'][] = ['box', 'cylinder', 'cone', 'sphere', 'wedge']
export const EDGE_KINDS: ShapeNode['kind'][] = ['box', 'cylinder', 'pin']
export const SIDED_KINDS: ShapeNode['kind'][] = ['cylinder', 'cone', 'pin']

/** Opening only makes sense for prisms (and the flat base of a dome). */
export const canOpen = (n: ShapeNode) => n.kind === 'box' || n.kind === 'cylinder' || n.kind === 'cone' || (n.kind === 'sphere' && !!n.params.half)
export const hasFloor = (n: ShapeNode) => n.kind === 'box' || n.kind === 'cylinder' || n.kind === 'cone' || (n.kind === 'sphere' && !!n.params.half)

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

/** True when the shape uses a parameter that needs the detailed builder. */
export function hasDetails(n: ShapeNode): boolean {
  const p = n.params
  const hollow = !n.hole && !!p.hollow && HOLLOW_KINDS.includes(n.kind)
  switch (n.kind) {
    case 'box':
      return (p.cornerRadius ?? 0) > 0 || (p.edge ?? 0) > 0 || hollow
    case 'cylinder':
    case 'pin':
      return (p.edge ?? 0) > 0 || hollow
    case 'cone':
      return hollow
    case 'sphere':
      return !!p.half || hollow
    case 'wedge':
      return hollow
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// 2D profiles (mm)

const roundedRect = (hx: number, hy: number, r: number) => {
  const s = new THREE.Shape()
  r = Math.max(0, Math.min(r, hx - 0.001, hy - 0.001))
  if (r <= 0) {
    s.moveTo(-hx, -hy)
    s.lineTo(hx, -hy)
    s.lineTo(hx, hy)
    s.lineTo(-hx, hy)
    s.lineTo(-hx, -hy)
    return s
  }
  s.moveTo(-hx + r, -hy)
  s.lineTo(hx - r, -hy)
  s.absarc(hx - r, -hy + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hx, hy - r)
  s.absarc(hx - r, hy - r, r, 0, Math.PI / 2, false)
  s.lineTo(-hx + r, hy)
  s.absarc(-hx + r, hy - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(-hx, -hy + r)
  s.absarc(-hx + r, -hy + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

/** Polygon inscribed in an ellipse, with a flat side facing -Y (so it can sit on a face). */
const polygon = (rx: number, ry: number, sides: number) => {
  const s = new THREE.Shape()
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + Math.PI / sides + (i * 2 * Math.PI) / sides
    const x = rx * Math.cos(a)
    const y = ry * Math.sin(a)
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  s.closePath()
  return s
}

/** Extrude a profile to height h, centered on Z, with an optional edge bevel of size `edge`. */
const extrude = (shape: THREE.Shape, h: number, edge = 0, round = false, curveSegments = 12) => {
  const b = Math.max(0, Math.min(edge, h / 2 - 0.01))
  const depth = h - 2 * b
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: 0,
    bevelSegments: round ? 6 : 1,
    curveSegments,
  })
  g.translate(0, 0, -depth / 2)
  return g
}

/** Triangular prism from XZ points, extruded along Y by `depth`, centered. */
const prismXZ = (pts: [number, number][], depth: number) => {
  const s = new THREE.Shape()
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)))
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
  g.rotateX(Math.PI / 2) // shape y -> z, extrusion -> -y
  g.translate(0, depth / 2, 0)
  return g
}

const frustum = (rTop: number, rBot: number, h: number, sides: number, yScale: number) => {
  const g = new THREE.CylinderGeometry(Math.max(rTop, 0.001), Math.max(rBot, 0.001), h, sides, 1, false, Math.PI / sides)
  g.rotateX(Math.PI / 2)
  g.scale(1, yScale, 1)
  return g
}

/** Half sphere: flat base at -Z, dome up, unit-sized then scaled. */
const dome = (sx: number, sy: number, sz: number) => {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -0.5)]
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2)
    pts.push(new THREE.Vector2(i === steps ? 0 : 0.5 * Math.cos(a), -0.5 + Math.sin(a)))
  }
  const g = new THREE.LatheGeometry(pts, 48)
  g.rotateX(Math.PI / 2) // lathe axis Y -> Z
  g.scale(sx, sy, sz)
  return g
}

// ---------------------------------------------------------------------------
// Outer shapes (mm)

function outer(n: ShapeNode, sx: number, sy: number, sz: number, seg: number): THREE.BufferGeometry {
  const p = n.params
  const edge = Math.max(0, Math.min(p.edge ?? 0, Math.min(sx, sy) / 2 - 0.05, sz / 2 - 0.05))
  const round = p.edgeStyle === 'round'
  switch (n.kind) {
    case 'box': {
      const cr = Math.max(0, p.cornerRadius ?? 0)
      return extrude(roundedRect(sx / 2 - edge, sy / 2 - edge, Math.max(0, cr - edge)), sz, edge, round, 12)
    }
    case 'cylinder':
    case 'pin':
      return extrude(polygon(sx / 2 - edge, sy / 2 - edge, seg), sz, edge, round)
    case 'cone':
      return frustum((sx / 2) * (p.topRatio ?? 0), sx / 2, sz, seg, sy / sx)
    case 'sphere': {
      if (p.half) return dome(sx, sy, sz)
      const g = new THREE.SphereGeometry(0.5, 48, 32)
      g.rotateX(Math.PI / 2)
      g.scale(sx, sy, sz)
      return g
    }
    case 'wedge':
    default:
      return prismXZ([[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [-sx / 2, sz / 2]], sy)
  }
}

// ---------------------------------------------------------------------------
// Inner cavity for hollow shapes (mm). Returns null when the walls leave no room.

function inner(n: ShapeNode, sx: number, sy: number, sz: number, seg: number): THREE.BufferGeometry | null {
  const p = n.params
  const w = Math.max(0.1, p.wall ?? DEFAULT_WALL)
  const f = Math.max(0.1, p.floor ?? DEFAULT_FLOOR)
  const open = canOpen(n) ? p.opening ?? 'closed' : 'closed'
  // Z range of the cavity. Open faces poke 1 mm through so the cut never shares a face.
  const z0 = open === 'both' ? -sz / 2 - 1 : -sz / 2 + f
  const z1 = open === 'closed' ? sz / 2 - w : sz / 2 + 1
  const h = z1 - z0
  const zc = (z0 + z1) / 2
  if (h <= 0.1) return null

  switch (n.kind) {
    case 'box': {
      const hx = sx / 2 - w
      const hy = sy / 2 - w
      if (hx <= 0.05 || hy <= 0.05) return null
      const g = extrude(roundedRect(hx, hy, Math.max(0, (p.cornerRadius ?? 0) - w)), h)
      g.translate(0, 0, zc)
      return g
    }
    case 'cylinder': {
      // Polygon size is measured to the corners; keep the wall across the flats.
      const inset = w / Math.cos(Math.PI / seg)
      const rx = sx / 2 - inset
      const ry = sy / 2 - inset
      if (rx <= 0.05 || ry <= 0.05) return null
      const g = extrude(polygon(rx, ry, seg), h)
      g.translate(0, 0, zc)
      return g
    }
    case 'cone': {
      // Keep the slanted wall `w` thick by insetting horizontally w / cos(slope).
      const rb = sx / 2
      const rt = rb * (p.topRatio ?? 0)
      const k = (rb - rt) / sz
      const inset = (w * Math.sqrt(1 + k * k)) / Math.cos(Math.PI / seg)
      const rAt = (z: number) => rb - k * (z + sz / 2)
      const rBot = rAt(z0) - inset
      const rTop = rAt(z1) - inset
      if (rBot <= 0.05) return null
      const g = frustum(Math.max(0.001, rTop), rBot, h, seg, sy / sx)
      g.translate(0, 0, zc)
      return g
    }
    case 'sphere': {
      if (sx - 2 * w <= 0.1 || sy - 2 * w <= 0.1) return null
      if (!p.half) {
        if (sz - 2 * w <= 0.1) return null
        const g = new THREE.SphereGeometry(0.5, 48, 32)
        g.rotateX(Math.PI / 2)
        g.scale(sx - 2 * w, sy - 2 * w, sz - 2 * w)
        return g
      }
      // Dome: cavity from the floor (or through the base) up to `w` under the top.
      const base = open === 'closed' ? -sz / 2 + f : -sz / 2 - 0.5
      const top = sz / 2 - w
      if (top - base <= 0.1) return null
      const g = dome(sx - 2 * w, sy - 2 * w, top - base)
      g.translate(0, 0, (base + top) / 2)
      return g
    }
    case 'wedge': {
      // Shrink the triangle about its incenter so every wall is `w` thick.
      const a = sx
      const b = sz
      const c = Math.hypot(a, b)
      const r = (a + b - c) / 2
      if (r <= w + 0.05 || sy - 2 * w <= 0.1) return null
      const ix = -sx / 2 + r
      const iz = -sz / 2 + r
      const t = (r - w) / r
      const pts: [number, number][] = [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [-sx / 2, sz / 2]].map(([x, z]) => [ix + (x - ix) * t, iz + (z - iz) * t])
      return prismXZ(pts, sy - 2 * w)
    }
    default:
      return null
  }
}

/**
 * Local geometry for a shape with detail parameters, in mm at its effective size.
 * Returns null for plain shapes so the caller uses the fast path.
 */
export function detailedGeometry(n: ShapeNode, sx: number, sy: number, sz: number): THREE.BufferGeometry | null {
  if (!hasDetails(n)) return null
  const seg = Math.max(3, Math.round(n.params.segments ?? ROUND_SIDES))
  const key = JSON.stringify([n.kind, n.hole, sx, sy, sz, n.params])
  const hit = cache.get(key)
  if (hit) return hit.clone()

  let g = prep(outer(n, sx, sy, sz, seg))
  if (!n.hole && n.params.hollow && HOLLOW_KINDS.includes(n.kind)) {
    const cav = inner(n, sx, sy, sz, seg)
    if (cav) {
      const a = new Brush(g)
      const b = new Brush(prep(cav))
      a.updateMatrixWorld()
      b.updateMatrixWorld()
      g = prep(ev.evaluate(a, b, SUBTRACTION).geometry.clone())
    }
  }
  if (cache.size > 300) cache.clear()
  cache.set(key, g)
  return g.clone()
}
