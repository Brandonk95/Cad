import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import fontData from '../assets/fonts/droid_sans_bold.typeface.json'

/**
 * Text shapes: letters outlined with Droid Sans Bold (Apache 2.0), a bold
 * sans that stays legible when printed small. The geometry fills a unit box
 * like every other shape and is stretched to the node's size.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const font = new FontLoader().parse(fontData as any)

const outlines = new Map<string, { shapes: THREE.Shape[]; min: THREE.Vector2; max: THREE.Vector2 } | null>()

function outlineOf(text: string) {
  if (outlines.has(text)) return outlines.get(text)!
  const shapes = text.trim() ? font.generateShapes(text, 1) : []
  let out = null
  if (shapes.length) {
    const box = new THREE.Box2()
    for (const s of shapes) for (const p of s.getPoints(4)) box.expandByPoint(p)
    if (!box.isEmpty() && box.max.x - box.min.x > 1e-4 && box.max.y - box.min.y > 1e-4) out = { shapes, min: box.min, max: box.max }
  }
  outlines.set(text, out)
  return out
}

/** Width over height of the letters, so new text keeps its letter height. */
export function textAspect(text: string): number {
  const o = outlineOf(text)
  return o ? (o.max.x - o.min.x) / (o.max.y - o.min.y) : 1
}

const cache = new Map<string, THREE.BufferGeometry>()

/** Letters filling -0.5..0.5 on all three axes, or null when there is nothing to draw. */
export function unitTextGeometry(text: string, flipX = false): THREE.BufferGeometry | null {
  const key = `${flipX ? 1 : 0}${text}`
  const hit = cache.get(key)
  if (hit) return hit.clone()
  const o = outlineOf(text)
  if (!o) return null
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(o.shapes, { depth: 1, bevelEnabled: false, curveSegments: 6 })
  if (g.index) g = g.toNonIndexed()
  const w = o.max.x - o.min.x
  const h = o.max.y - o.min.y
  g.translate(-(o.min.x + o.max.x) / 2, -(o.min.y + o.max.y) / 2, -0.5)
  g.scale((flipX ? -1 : 1) / w, 1 / h, 1)
  if (flipX) {
    // A mirror turns triangles inside out; swap two corners to face them out again.
    const p = g.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1)
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2))
      p.setXYZ(i + 2, x, y, z)
    }
  }
  if (cache.size > 200) cache.clear()
  cache.set(key, g)
  return g.clone()
}
