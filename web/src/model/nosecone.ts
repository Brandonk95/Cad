import * as THREE from 'three'

/**
 * Nose cones: a profile turned around the part's Z axis, tip up, with an
 * optional shoulder below that slides into a body tube. Built at full size so
 * a hollow wall keeps its real thickness.
 */

export type NoseShape = 'cone' | 'ogive' | 'parabolic' | 'elliptical' | 'haack'

export const NOSE_SHAPES: { id: NoseShape; label: string; hint: string }[] = [
  { id: 'cone', label: 'Cone', hint: 'Straight sides to a sharp point. Simplest, most drag.' },
  { id: 'ogive', label: 'Ogive', hint: 'Tangent ogive: curved sides that blend smoothly into the body.' },
  { id: 'parabolic', label: 'Parabolic', hint: 'Fuller shoulders and a rounder tip. Low drag below the speed of sound.' },
  { id: 'elliptical', label: 'Elliptical', hint: 'Blunt, rounded nose. Least drag at low speeds, toughest tip.' },
  { id: 'haack', label: 'Von Kármán', hint: 'Haack series (C = 0): the classic low-drag rocket nose, also good near the speed of sound.' },
]

/**
 * Radius of a nose of length L and base radius R at distance x from the tip.
 */
export function noseRadius(shape: NoseShape, x: number, L: number, R: number): number {
  const t = Math.min(1, Math.max(0, x / L))
  switch (shape) {
    case 'cone':
      return R * t
    case 'ogive': {
      const rho = (R * R + L * L) / (2 * R)
      const d = L - x
      return Math.max(0, Math.sqrt(Math.max(0, rho * rho - d * d)) + R - rho)
    }
    case 'parabolic':
      return R * (2 * t - t * t)
    case 'elliptical':
      return R * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)))
    case 'haack': {
      const th = Math.acos(1 - 2 * t)
      return (R / Math.sqrt(Math.PI)) * Math.sqrt(Math.max(0, th - Math.sin(2 * th) / 2))
    }
  }
}

export interface NoseParams {
  shape: NoseShape
  /** Shoulder length as a share of the total height (0 = none) */
  shoulder: number
  /** Shoulder diameter as a share of the base diameter */
  shoulderRatio: number
  /** Hollow wall in mm, open at the bottom (0 = solid) */
  wall: number
}

/** Steps along the nose. More near the tip, where blunt shapes curve fastest. */
const STEPS = 48

/** Profile points (radius, height) for a nose filling -h/2..h/2, from the bottom up. */
export function noseProfile(p: NoseParams, d: number, h: number): THREE.Vector2[] {
  const R = d / 2
  const ls = Math.min(0.9, Math.max(0, p.shoulder)) * h
  const rs = R * Math.min(1, Math.max(0.2, p.shoulderRatio))
  const L = h - ls
  const z0 = -h / 2
  const zb = z0 + ls
  // Sample from the base to the tip; squaring bunches samples near the tip.
  const outer: THREE.Vector2[] = []
  for (let i = 0; i <= STEPS; i++) {
    const u = 1 - i / STEPS
    const x = L * u * u
    const y = zb + (L - x)
    let r = noseRadius(p.shape, x, L, R)
    // Step out from the shoulder at 45° instead of a flat ledge, so it prints tip up without support.
    if (ls > 0) r = Math.min(r, rs + (y - zb))
    outer.push(new THREE.Vector2(r, y))
  }
  if (ls > 0 && rs < R) {
    // A point exactly where the 45° step meets the nose keeps that corner crisp.
    let lo = 0
    let hi = L
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2
      const y = zb + (L - m)
      // Near the tip the nose is inside the 45° line; near the base it is outside.
      if (noseRadius(p.shape, m, L, R) > rs + (y - zb)) hi = m
      else lo = m
    }
    const y = zb + (L - lo)
    const at = outer.findIndex((q) => q.y > y)
    if (at > 0) outer.splice(at, 0, new THREE.Vector2(rs + (y - zb), y))
  }
  outer[outer.length - 1].set(0, z0 + h)

  const wall = Math.max(0, p.wall)
  const base: THREE.Vector2[] = ls > 0 ? [new THREE.Vector2(rs, z0), new THREE.Vector2(rs, zb)] : []
  if (wall <= 0 || wall >= rs * 0.95 || wall >= R * 0.95) {
    // Solid: start and end on the axis so the surface is closed.
    return [new THREE.Vector2(0, z0), ...(ls > 0 ? base : [new THREE.Vector2(R, z0)]), ...outer]
  }

  // Hollow: the same profile moved in by the wall, measured square to the surface.
  // At a corner the steeper of the two sides sets the offset, so the wall never thins there.
  const slopeOf = (a: THREE.Vector2, b: THREE.Vector2) => Math.abs((b.x - a.x) / Math.max(1e-6, b.y - a.y))
  const inset = (s: number) => wall * Math.sqrt(1 + s * s)
  const inner: THREE.Vector2[] = []
  for (let i = 0; i < outer.length - 1; i++) {
    const a = outer[i]
    const s = Math.max(slopeOf(a, outer[i + 1]), i > 0 ? slopeOf(outer[i - 1], a) : 0)
    const r = a.x - inset(s)
    if (r <= 0.05) break
    inner.push(new THREE.Vector2(r, a.y))
  }
  if (inner.length < 2) return [new THREE.Vector2(0, z0), ...(ls > 0 ? base : [new THREE.Vector2(R, z0)]), ...outer]

  // Printed tip up, the inside ceiling has nothing under it. It rises at 45° to
  // a point (no support needed), starting low enough that the whole cone still
  // keeps the wall thickness under the outside.
  const outerAt = (y: number) => {
    for (let i = 1; i < outer.length; i++) {
      const a = outer[i - 1]
      const b = outer[i]
      if (y <= b.y) return { r: a.x + ((b.x - a.x) * (y - a.y)) / Math.max(1e-9, b.y - a.y), s: slopeOf(a, b) }
    }
    return { r: 0, s: 0 }
  }
  const roof = z0 + h - wall
  const fits = (q: THREE.Vector2) => {
    if (q.y + q.x > roof) return false
    const n = Math.max(8, Math.ceil(q.x / 0.25))
    for (let j = 1; j <= n; j++) {
      const t = (q.x * j) / n
      const o = outerAt(q.y + t)
      if (q.x - t > o.r - inset(o.s) + 1e-6) return false
    }
    return true
  }
  // First point where the offset ceiling leans past 45°, then step down until a 45° cone fits.
  let k = inner.findIndex((q, i) => i > 0 && inner[i - 1].x - q.x > q.y - inner[i - 1].y)
  if (k < 0) k = inner.length
  k = Math.max(1, k - 1)
  while (k > 0 && !fits(inner[k])) k--
  inner.length = k + 1
  const last = inner[k]
  const steps = Math.max(4, Math.ceil(last.x / 0.5))
  for (let j = 1; j < steps; j++) {
    const t = (last.x * j) / steps
    inner.push(new THREE.Vector2(last.x - t, last.y + t))
  }
  const apex = last.y + last.x
  const innerDown = [new THREE.Vector2(0, apex), ...inner.reverse()]
  const ri = (ls > 0 ? rs : R) - wall
  const start = new THREE.Vector2(ri, z0)
  const out = [start, ...(ls > 0 ? base : [new THREE.Vector2(R, z0)]), ...outer, ...innerDown]
  // Down the inside of the shoulder, then close the ring at the bottom.
  // The nose inside starts a little further in than the shoulder inside; meet it at 45° so no ledge hangs.
  if (ls > 0) {
    const r0 = out[out.length - 1].x
    out.push(new THREE.Vector2(ri, Math.max(z0 + 0.01, zb - Math.max(0, ri - r0))))
  }
  if (out[out.length - 1].distanceTo(start) > 1e-6) out.push(start.clone())
  return out
}

/** Drops points that repeat the one before, which would make zero-size faces. */
const dedupe = (pts: THREE.Vector2[]) => pts.filter((q, i) => i === 0 || q.distanceTo(pts[i - 1]) > 1e-5)

/** Nose cone geometry, tip along +Z, filling the box d × d × h around the origin. */
export function noseGeometry(p: NoseParams, dx: number, dy: number, h: number, segments = 64): THREE.BufferGeometry {
  const d = Math.max(dx, dy)
  const g = new THREE.LatheGeometry(dedupe(noseProfile(p, d, h)), Math.max(8, segments))
  g.rotateX(Math.PI / 2) // lathe axis Y -> Z
  if (Math.abs(dx - dy) > 1e-6) g.scale(dx / d, dy / d, 1)
  return g
}
