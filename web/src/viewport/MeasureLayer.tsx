import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { useEditor } from '../store/editor'
import type { ThemeColors } from './theme'
import { useMeasure } from './measure'

/**
 * Click two points to read the distance between them. Points snap to the
 * corners and edge middles of the face under the cursor; on the bed they snap
 * to the 1 mm grid (Alt for free placement). A third click starts again.
 */

type V3 = THREE.Vector3Tuple
interface Hover {
  p: V3
  snapped: boolean
}

const SNAP_PX = 12
const CLICK_PX = 5
const fmt = (v: number) => (Math.round(v * 100) / 100).toString()

export function MeasureLayer({ c }: { c: ThemeColors }) {
  const { camera, gl, scene } = useThree()
  const [pts, setPtsState] = useState<V3[]>([])
  const [hover, setHover] = useState<Hover | null>(null)
  const live = useRef({ pts })
  const setPts = (p: V3[]) => {
    live.current.pts = p
    setPtsState(p)
  }
  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  const locate = (px: [number, number], free: boolean): Hover | null => {
    const r = gl.domElement.getBoundingClientRect()
    raycaster.setFromCamera(new THREE.Vector2((px[0] / r.width) * 2 - 1, -(px[1] / r.height) * 2 + 1), camera)
    const ids = new Set(useEditor.getState().nodes.map((n) => n.id))
    const toPx = (v: THREE.Vector3) => {
      const q = v.clone().project(camera)
      return [((q.x + 1) / 2) * r.width, ((1 - q.y) / 2) * r.height]
    }
    for (const h of raycaster.intersectObjects(scene.children, true)) {
      const mesh = h.object as THREE.Mesh
      if (!mesh.isMesh || !h.face) continue
      let o: THREE.Object3D | null = mesh
      while (o && !ids.has(o.name)) o = o.parent
      if (!o) continue
      if (free) return { p: h.point.toArray() as V3, snapped: false }
      // Corners and edge middles of the triangle under the cursor.
      const pos = mesh.geometry.getAttribute('position')
      const v = [h.face.a, h.face.b, h.face.c].map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld))
      const cands = [...v, v[0].clone().lerp(v[1], 0.5), v[1].clone().lerp(v[2], 0.5), v[2].clone().lerp(v[0], 0.5)]
      let best: THREE.Vector3 | null = null
      let bestD = SNAP_PX
      for (const q of cands) {
        const s = toPx(q)
        const d = Math.hypot(s[0] - px[0], s[1] - px[1])
        if (d < bestD) {
          bestD = d
          best = q
        }
      }
      return best ? { p: best.toArray() as V3, snapped: true } : { p: h.point.toArray() as V3, snapped: false }
    }
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3())
    if (!hit) return null
    return free ? { p: [hit.x, hit.y, 0], snapped: false } : { p: [Math.round(hit.x), Math.round(hit.y), 0], snapped: false }
  }

  useEffect(() => {
    const el = gl.domElement
    const pxOf = (e: PointerEvent): [number, number] => {
      const r = el.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    let down: { px: [number, number]; id: number } | null = null
    const move = (e: PointerEvent) => setHover(locate(pxOf(e), e.altKey))
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) down = { px: pxOf(e), id: e.pointerId }
    }
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return
      const px = pxOf(e)
      const moved = Math.hypot(px[0] - down.px[0], px[1] - down.px[1])
      down = null
      if (moved > CLICK_PX) return // that was an orbit
      const h = locate(px, e.altKey)
      if (!h) return
      const cur = live.current.pts
      setPts(cur.length === 1 ? [cur[0], h.p] : [h.p])
    }
    const leave = () => setHover(null)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', leave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, scene])

  // Esc clears the points, then leaves the tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (live.current.pts.length) setPts([])
      else useMeasure.getState().setOn(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const a = pts[0]
  const b = pts.length === 2 ? pts[1] : pts.length === 1 ? hover?.p : undefined
  const d = a && b ? new THREE.Vector3(...b).sub(new THREE.Vector3(...a)) : null
  const mid: V3 | null = a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] : null
  const dot = (p: V3, color: string, k: string) => (
    <mesh key={k} position={p} renderOrder={40}>
      <sphereGeometry args={[0.7, 16, 12]} />
      <meshBasicMaterial color={color} depthTest={false} transparent />
    </mesh>
  )

  return (
    <group>
      {hover && pts.length !== 2 && dot(hover.p, hover.snapped ? c['print-ok'] : c.accent, 'hover')}
      {pts.map((p, i) => dot(p, c.accent, `p${i}`))}
      {a && b && d && d.length() > 1e-6 && (
        <>
          {/* Axis legs: X, then Y, then Z, like a corner of a box */}
          <Line points={[a, [b[0], a[1], a[2]], [b[0], b[1], a[2]], b]} color={c['text-secondary']} lineWidth={1} dashed dashSize={1.5} gapSize={1} depthTest={false} renderOrder={39} />
          <Line points={[a, b]} color={c.accent} lineWidth={2.5} depthTest={false} renderOrder={41} />
        </>
      )}
      {mid && d && d.length() > 1e-6 && (
        <Html position={mid} zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
          <div className="measure-label">
            <b>{fmt(d.length())} mm</b>
            <span>X {fmt(Math.abs(d.x))} · Y {fmt(Math.abs(d.y))} · Z {fmt(Math.abs(d.z))}</span>
          </div>
        </Html>
      )}
    </group>
  )
}
