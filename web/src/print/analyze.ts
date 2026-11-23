import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { effectiveSize, holeIsSideways, isRoundHole, matrixOf, quatOf, type Body } from '../model/geometry'
import { lineWidth, wallMin, type PrintContext, type SceneNode, type ShapeNode, type Vec3 } from '../model/types'

// Overlay categories. 0 = clean. Order is also severity for picking the worst spot.
export const CAT = { ok: 0, overhang: 1, thin: 2, bridge: 3, tiny: 4 } as const
export type IssueKind =
  | 'overhang' | 'thin' | 'bridge' | 'tiny' | 'supports'
  | 'bed' | 'offbed' | 'floating' | 'sideways' | 'loosehole'

export type Fix =
  | { type: 'drop'; nodeId: string }
  | { type: 'center'; nodeId: string }
  | { type: 'rotate90'; nodeId: string }
  | { type: 'orient'; nodeId: string }
  | { type: 'setSize'; nodeId: string; size: Vec3 }
  | { type: 'remove'; nodeId: string }
  | { type: 'teardrop'; nodeId: string }
  | { type: 'bridgeLayer'; nodeId: string }
  | { type: 'combine'; ids: string[] }
  | { type: 'select'; nodeId: string }

export interface Issue {
  id: string
  kind: IssueKind
  nodeId: string
  message: string
  fixes: { label: string; fix: Fix }[]
  point?: Vec3
}

export interface BodyOverlay {
  id: string
  /** One category per vertex (3 per triangle), matches body geometry */
  cats: Float32Array
}

export interface Estimate {
  volume: number
  grams: number
  minutes: number
  cost: number
  height: number
}

export interface Analysis {
  issues: Issue[]
  overlays: BodyOverlay[]
  worst?: { point: Vec3; kind: IssueKind }
  estimate: Estimate
  bounds: THREE.Box3
  outOfBed: boolean
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString()
const up = (v: number, step = 0.05) => Math.ceil(v / step - 1e-9) * step

const a = new THREE.Vector3()
const b = new THREE.Vector3()
const c = new THREE.Vector3()
const n = new THREE.Vector3()
const ab = new THREE.Vector3()
const ac = new THREE.Vector3()

/** Per-triangle classification shared by the overlay and orientation scoring. */
export function classifyTriangles(geo: THREE.BufferGeometry, ctx: PrintContext, withThickness: boolean) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const triCount = pos.count / 3
  const cats = new Uint8Array(triCount)
  const areas = new Float32Array(triCount)
  // Half a degree of slack so faces built exactly at the limit (teardrops, chamfers) pass.
  const overhangSin = Math.sin(((ctx.material.overhang_deg + 0.5) * Math.PI) / 180)
  const minWall = wallMin(ctx.printer, ctx.material)
  const flats = new Map<number, number[]>()
  let overhangArea = 0
  let thinMin = Infinity
  let thinTri = -1

  let bvh: MeshBVH | null = null
  const ray = new THREE.Ray()
  if (withThickness) bvh = new MeshBVH(geo, { indirect: true })
  const step = withThickness && triCount > 30000 ? Math.ceil(triCount / 30000) : 1

  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, t * 3)
    b.fromBufferAttribute(pos, t * 3 + 1)
    c.fromBufferAttribute(pos, t * 3 + 2)
    ab.subVectors(b, a)
    ac.subVectors(c, a)
    n.crossVectors(ab, ac)
    const len = n.length()
    if (len < 1e-12) continue
    areas[t] = len / 2
    n.divideScalar(len)
    const minZ = Math.min(a.z, b.z, c.z)
    const onBed = minZ < 0.05 && Math.max(a.z, b.z, c.z) < 0.05

    if (n.z < -0.985) {
      if (!onBed) {
        const key = Math.round(minZ * 20)
        let list = flats.get(key)
        if (!list) flats.set(key, (list = []))
        list.push(t)
      }
    } else if (-n.z > overhangSin && !onBed) {
      cats[t] = CAT.overhang
      overhangArea += areas[t]
    }

    if (bvh && Math.abs(n.z) < 0.7 && t % step === 0) {
      ray.origin.set((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3)
      ray.direction.copy(n).negate()
      ray.origin.addScaledVector(ray.direction, 1e-4)
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide)
      if (hit && hit.distance < minWall) {
        cats[t] = hit.distance < ctx.printer.nozzle ? CAT.tiny : CAT.thin
        if (hit.distance < thinMin) {
          thinMin = hit.distance
          thinTri = t
        }
      }
    }
  }

  // Flat downward faces: bridges. Short spans are fine, long ones are flagged.
  let bridgeMax = 0
  let bridgeArea = 0
  for (const tris of flats.values()) {
    const box = new THREE.Box2()
    for (const t of tris) {
      for (let k = 0; k < 3; k++) box.expandByPoint(new THREE.Vector2(pos.getX(t * 3 + k), pos.getY(t * 3 + k)))
    }
    const span = Math.min(box.max.x - box.min.x, box.max.y - box.min.y)
    if (span > ctx.material.bridge_mm) {
      bridgeMax = Math.max(bridgeMax, span)
      for (const t of tris) {
        cats[t] = CAT.bridge
        bridgeArea += areas[t]
      }
    }
  }

  return { cats, areas, overhangArea, bridgeArea, bridgeMax, thinMin, thinTri, triCount }
}

const centroid = (geo: THREE.BufferGeometry, t: number): Vec3 => {
  const p = geo.getAttribute('position')
  return [
    (p.getX(t * 3) + p.getX(t * 3 + 1) + p.getX(t * 3 + 2)) / 3,
    (p.getY(t * 3) + p.getY(t * 3 + 1) + p.getY(t * 3 + 2)) / 3,
    (p.getZ(t * 3) + p.getZ(t * 3 + 1) + p.getZ(t * 3 + 2)) / 3,
  ]
}

export function volumeAndArea(geo: THREE.BufferGeometry) {
  const p = geo.getAttribute('position')
  let vol = 0
  let area = 0
  for (let t = 0; t < p.count / 3; t++) {
    a.fromBufferAttribute(p, t * 3)
    b.fromBufferAttribute(p, t * 3 + 1)
    c.fromBufferAttribute(p, t * 3 + 2)
    vol += a.dot(n.crossVectors(b, c)) / 6
    area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2
  }
  return { volume: Math.abs(vol), area }
}

export function estimate(bodies: Body[], ctx: PrintContext): Estimate {
  const { printer, material } = ctx
  let volume = 0
  let extruded = 0
  const bounds = new THREE.Box3()
  for (const body of bodies) {
    const { volume: v, area } = volumeAndArea(body.geometry)
    volume += v
    bounds.union(body.geometry.boundingBox!)
    if (printer.technology === 'resin') {
      extruded += v
    } else {
      // Shell of perimeters plus 15% infill. An estimate; the slicer has final say.
      const shell = Math.min(v, area * wallMin(printer, material))
      extruded += shell + (v - shell) * 0.15
    }
  }
  const grams = (extruded / 1000) * material.density
  const height = bodies.length ? Math.max(0, bounds.max.z) : 0
  let minutes: number
  if (printer.technology === 'resin') {
    const layer = Math.max(printer.layer_min, 0.05)
    minutes = bodies.length ? ((height / layer) * 9) / 60 + 5 : 0
  } else {
    const flow = 7 * (printer.nozzle / 0.4) ** 2 // mm^3/s average including slowdowns
    minutes = bodies.length ? (extruded / flow / 60) * 1.25 + 3 : 0
  }
  return { volume, grams, minutes, cost: (grams / 1000) * material.price_per_kg, height }
}

const walk = (nodes: SceneNode[], fn: (n: ShapeNode, parentQuat: THREE.Quaternion) => void, q = new THREE.Quaternion()) => {
  for (const node of nodes) {
    if (node.type === 'group') walk(node.children, fn, q.clone().multiply(quatOf(node.rotation)))
    else fn(node, q)
  }
}

export function analyze(nodes: SceneNode[], bodies: Body[], ctx: PrintContext): Analysis {
  const { printer, material, clearances } = ctx
  const issues: Issue[] = []
  const overlays: BodyOverlay[] = []
  const minWall = wallMin(printer, material)
  const lw = lineWidth(printer)
  const bedHalf = [printer.bed[0] / 2, printer.bed[1] / 2]
  const bounds = new THREE.Box3()
  let outOfBed = false
  let worst: Analysis['worst']
  let worstRank = 0
  const rank: Record<number, number> = { [CAT.thin]: 4, [CAT.overhang]: 3, [CAT.bridge]: 2, [CAT.tiny]: 1 }
  const kindOf: Record<number, IssueKind> = { [CAT.thin]: 'thin', [CAT.overhang]: 'overhang', [CAT.bridge]: 'bridge', [CAT.tiny]: 'tiny' }

  for (const body of bodies) {
    const geo = body.geometry
    const box = geo.boundingBox!
    bounds.union(box)
    const r = classifyTriangles(geo, ctx, true)
    const cats = new Float32Array(geo.getAttribute('position').count)
    let bestArea = 0
    let bestTri = -1
    let bestCat = 0
    for (let t = 0; t < r.triCount; t++) {
      const k = r.cats[t]
      cats[t * 3] = cats[t * 3 + 1] = cats[t * 3 + 2] = k
      if (!k) continue
      const rk = rank[k]
      const rb = rank[bestCat] ?? 0
      if (rk > rb || (k === bestCat && r.areas[t] > bestArea)) {
        bestCat = k
        bestArea = r.areas[t]
        bestTri = t
      }
    }
    overlays.push({ id: body.id, cats })
    if (bestTri >= 0 && (rank[bestCat] ?? 0) > worstRank) {
      worstRank = rank[bestCat]
      worst = { point: centroid(geo, bestTri), kind: kindOf[bestCat] }
    }

    const w = box.max.x - box.min.x
    const d = box.max.y - box.min.y
    const h = box.max.z - box.min.z

    // Bed fit
    if (w > printer.bed[0] + 1e-6 || d > printer.bed[1] + 1e-6 || h > printer.bed[2] + 1e-6) {
      outOfBed = true
      const fixes: Issue['fixes'] = []
      if (d <= printer.bed[0] && w <= printer.bed[1] && h <= printer.bed[2]) fixes.push({ label: 'Rotate 90°', fix: { type: 'rotate90', nodeId: body.id } })
      fixes.push({ label: 'Try other orientations', fix: { type: 'orient', nodeId: body.id } })
      const over = w > printer.bed[0] ? `${fmt(w)} mm wide. Your bed fits ${printer.bed[0]} mm.`
        : d > printer.bed[1] ? `${fmt(d)} mm deep. Your bed fits ${printer.bed[1]} mm.`
        : `${fmt(h)} mm tall. Your printer reaches ${printer.bed[2]} mm.`
      issues.push({ id: `bed-${body.id}`, kind: 'bed', nodeId: body.id, message: `${body.name} is ${over}`, fixes })
    } else if (box.min.x < -bedHalf[0] - 1e-6 || box.max.x > bedHalf[0] + 1e-6 || box.min.y < -bedHalf[1] - 1e-6 || box.max.y > bedHalf[1] + 1e-6) {
      outOfBed = true
      issues.push({ id: `off-${body.id}`, kind: 'offbed', nodeId: body.id, message: `${body.name} hangs off the edge of the bed.`, fixes: [{ label: 'Center on bed', fix: { type: 'center', nodeId: body.id } }] })
    }

    // Bed contact
    // Resting on another part (e.g. snapped on top): slicers place separate parts on the
    // plate one by one, so it has to be joined to print where it is.
    const under = box.min.z > 0.01 ? bodies.find((o) => {
      if (o === body) return false
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      const ob = o.geometry.boundingBox!
      return Math.abs(ob.max.z - box.min.z) < 0.05 && Math.min(ob.max.x, box.max.x) > Math.max(ob.min.x, box.min.x) && Math.min(ob.max.y, box.max.y) > Math.max(ob.min.y, box.min.y)
    }) : undefined
    if (under) {
      issues.push({
        id: `float-${body.id}`, kind: 'floating', nodeId: body.id,
        message: `${body.name} sits on ${under.name} but isn't joined to it. Combine them so they print as one part.`,
        fixes: [{ label: `Combine with ${under.name}`, fix: { type: 'combine', ids: [under.id, body.id] } }, { label: 'Drop to bed', fix: { type: 'drop', nodeId: body.id } }],
      })
    } else if (box.min.z > 0.01) {
      issues.push({ id: `float-${body.id}`, kind: 'floating', nodeId: body.id, message: `${body.name} floats ${fmt(box.min.z)} mm above the bed.`, fixes: [{ label: 'Drop to bed', fix: { type: 'drop', nodeId: body.id } }] })
    } else if (box.min.z < -0.01) {
      issues.push({ id: `sink-${body.id}`, kind: 'floating', nodeId: body.id, message: `${body.name} sits ${fmt(-box.min.z)} mm below the bed. That part won't print.`, fixes: [{ label: 'Raise to bed', fix: { type: 'drop', nodeId: body.id } }] })
    }

    // Supports
    const supportArea = r.overhangArea + r.bridgeArea
    const orient = [{ label: 'Suggest orientation', fix: { type: 'orient', nodeId: body.id } as Fix }]
    if (supportArea >= 25) {
      issues.push({
        id: `sup-${body.id}`, kind: 'supports', nodeId: body.id,
        message: `${body.name} needs about ${(supportArea / 100).toFixed(1)} cm² of support as placed.`,
        fixes: orient,
        point: bestTri >= 0 ? centroid(geo, bestTri) : undefined,
      })
    } else if (r.overhangArea > 1) {
      issues.push({ id: `oh-${body.id}`, kind: 'overhang', nodeId: body.id, message: `Small overhang past ${material.overhang_deg}° on ${body.name}. ${material.name} may droop there.`, fixes: orient })
    }
    if (r.bridgeMax > 0) {
      issues.push({ id: `br-${body.id}`, kind: 'bridge', nodeId: body.id, message: `Bridge is ${fmt(r.bridgeMax)} mm. ${material.name} bridges about ${material.bridge_mm} mm.`, fixes: [{ label: 'Suggest orientation', fix: { type: 'orient', nodeId: body.id } }] })
    }
    if (r.thinTri >= 0) {
      const tiny = r.thinMin < printer.nozzle
      issues.push({
        id: `tw-${body.id}`, kind: tiny ? 'tiny' : 'thin', nodeId: body.id,
        message: `Wall is ${fmt(r.thinMin)} mm on ${body.name}. Your ${printer.nozzle} mm nozzle needs ${fmt(minWall)} mm.`,
        fixes: [{ label: 'Show me', fix: { type: 'select', nodeId: body.id } }],
        point: centroid(geo, r.thinTri),
      })
    }
  }

  // Primitive-level checks with direct fixes
  walk(nodes, (s, parentQuat) => {
    const eff = effectiveSize(s, clearances)
    if (!s.hole) {
      const minXY = Math.min(s.size[0], s.size[1])
      const axis = s.size[0] <= s.size[1] ? 0 : 1
      if (minXY < printer.nozzle) {
        const size = [...s.size] as Vec3
        size[axis] = up(lw * 2)
        issues.push({ id: `tiny-${s.id}`, kind: 'tiny', nodeId: s.id, message: `${s.name} is ${fmt(minXY)} mm. Your ${printer.nozzle} mm nozzle can't draw it.`, fixes: [{ label: `Enlarge to ${fmt(size[axis])} mm`, fix: { type: 'setSize', nodeId: s.id, size } }, { label: 'Remove', fix: { type: 'remove', nodeId: s.id } }] })
      } else if (minXY < minWall - 1e-6) {
        const size = [...s.size] as Vec3
        size[axis] = up(minWall)
        issues.push({ id: `thin-${s.id}`, kind: 'thin', nodeId: s.id, message: `Wall is ${fmt(minXY)} mm. Your nozzle needs ${fmt(minWall)} mm. Thicken?`, fixes: [{ label: 'Thicken to minimum', fix: { type: 'setSize', nodeId: s.id, size } }] })
      }
    }
    if (isRoundHole(s) && !s.params.teardrop && !s.params.sacrificial && holeIsSideways(s, parentQuat) && Math.min(eff[0], eff[1]) >= 3) {
      issues.push({
        id: `side-${s.id}`, kind: 'sideways', nodeId: s.id,
        message: `${s.name} faces sideways. The top of a ${fmt(Math.min(eff[0], eff[1]))} mm hole will sag.`,
        fixes: [{ label: 'Convert to teardrop', fix: { type: 'teardrop', nodeId: s.id } }, { label: 'Add bridge layer', fix: { type: 'bridgeLayer', nodeId: s.id } }],
      })
    }
  })

  // Top-level holes that are not combined with anything do nothing.
  for (const node of nodes) {
    if (node.type !== 'shape' || !node.hole) continue
    const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(...node.size)).applyMatrix4(matrixOf(node))
    const target = bodies.find((bd) => bd.geometry.boundingBox!.intersectsBox(box))
    issues.push({
      id: `hole-${node.id}`, kind: 'loosehole', nodeId: node.id,
      message: target ? `${node.name} overlaps ${target.name} but isn't cutting it yet.` : `${node.name} isn't cutting anything. Move it into a solid and combine.`,
      fixes: target ? [{ label: `Combine with ${target.name}`, fix: { type: 'combine', ids: [target.id, node.id] } }] : [{ label: 'Select it', fix: { type: 'select', nodeId: node.id } }],
    })
  }

  return { issues, overlays, worst, estimate: estimate(bodies, ctx), bounds, outOfBed }
}
