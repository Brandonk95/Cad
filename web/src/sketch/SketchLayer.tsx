import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { buildShapeGeometries } from '../model/geometry'
import { contextOf, useEditor } from '../store/editor'
import type { ThemeColors } from '../viewport/theme'
import { applySketch, MIN_PULL, outline, profileBounds, profileOk, sketchNode, type Profile, type V2 } from './build'
import { SKETCH_TOOLS, useSketch } from './store'

/**
 * Draws outlines on the bed or on the top face of a part, then pulls them
 * into a part. Drawing is click, move, click, so dragging still orbits.
 *
 * Auto-constraints: points snap to the 1 mm grid (Alt for 0.1 mm), line
 * segments snap to horizontal or vertical, and the last point closes onto the first.
 */

type Phase =
  | { t: 'idle' }
  | { t: 'draw'; z: number; host: string | null; pts: V2[] }
  | { t: 'pull'; z: number; host: string | null; profile: Profile; h: number; start: V2; typed: string }

interface Cursor {
  p: V2
  z: number
  host: string | null
  /** Constraint the point snapped to, shown next to the cursor */
  tag: string | null
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString()
const CLICK_PX = 5
const AXIS_SNAP = Math.tan((6 * Math.PI) / 180)

export function SketchLayer({ c }: { c: ThemeColors }) {
  const { camera, gl, scene, size } = useThree()
  const tool = useSketch((s) => s.tool)
  const nodes = useEditor((s) => s.nodes)
  const [phase, setPhaseState] = useState<Phase>({ t: 'idle' })
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const live = useRef({ phase, cursor, tool, nodes })
  live.current = { phase, cursor, tool, nodes }
  // Keys can arrive faster than React renders, so the live copy updates right away.
  const setPhase = (p: Phase) => {
    live.current.phase = p
    setPhaseState(p)
  }
  const mouse = useRef<V2>([0, 0])

  // A new tool starts a fresh sketch.
  useEffect(() => {
    setPhase({ t: 'idle' })
  }, [tool])

  // ---- helpers ------------------------------------------------------------

  const raycaster = useMemo(() => new THREE.Raycaster(), [])

  const rayAt = (px: V2) => {
    const r = gl.domElement.getBoundingClientRect()
    raycaster.setFromCamera(new THREE.Vector2((px[0] / r.width) * 2 - 1, -(px[1] / r.height) * 2 + 1), camera)
    return raycaster.ray
  }

  /** The face under the cursor: a part's flat top, or else the bed. */
  const pickPlane = (px: V2): { z: number; host: string | null } => {
    rayAt(px)
    const tops = new Set(live.current.nodes.filter((n) => n.type === 'group' || !n.hole).map((n) => n.id))
    for (const h of raycaster.intersectObjects(scene.children, true)) {
      if (!(h.object as THREE.Mesh).isMesh || !h.face) continue
      let o: THREE.Object3D | null = h.object
      let id: string | null = null
      while (o) {
        if (tops.has(o.name)) {
          id = o.name
          break
        }
        o = o.parent
      }
      if (!id) continue
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld)
      if (n.z > 0.98) return { z: Math.round(h.point.z * 1000) / 1000, host: id }
      break
    }
    return { z: 0, host: null }
  }

  const onPlane = (px: V2, z: number): V2 | null => {
    const ray = rayAt(px)
    const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3())
    return hit ? [hit.x, hit.y] : null
  }

  const tolAt = (p: V2, z: number) => THREE.MathUtils.clamp(camera.position.distanceTo(new THREE.Vector3(p[0], p[1], z)) * 0.015, 1, 8)

  const toPx = (v: THREE.Vector3): V2 => {
    const q = v.clone().project(camera)
    return [((q.x + 1) / 2) * size.width, ((1 - q.y) / 2) * size.height]
  }

  /** Pull height from how far the mouse moved along the on-screen up direction. */
  const pullHeight = (ph: Extract<Phase, { t: 'pull' }>, px: V2, fine: boolean) => {
    const { min, max } = profileBounds(ph.profile)
    const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, ph.z)
    const a = toPx(center)
    const b = toPx(center.clone().add(new THREE.Vector3(0, 0, 1)))
    let s: V2 = [b[0] - a[0], b[1] - a[1]]
    if (Math.hypot(s[0], s[1]) < 0.25) {
      // Looking straight down: moving the mouse up the screen pulls up.
      const e = toPx(center.clone().add(new THREE.Vector3(1, 0, 0)))
      s = [0, -Math.hypot(e[0] - a[0], e[1] - a[1])]
    }
    const len2 = s[0] * s[0] + s[1] * s[1]
    let h = ((px[0] - ph.start[0]) * s[0] + (px[1] - ph.start[1]) * s[1]) / len2
    const step = fine ? 0.1 : 1
    h = Math.round(h / step) * step
    if (!ph.host) h = Math.max(MIN_PULL, h)
    return Math.round(h * 1000) / 1000
  }

  /** Snapped point for the current tool and phase. */
  const locate = (px: V2, fine: boolean): Cursor | null => {
    const ph = live.current.phase
    const plane = ph.t === 'draw' ? { z: ph.z, host: ph.host } : pickPlane(px)
    const raw = onPlane(px, plane.z)
    if (!raw) return null
    const step = fine ? 0.1 : 1
    let p: V2 = [Math.round(raw[0] / step) * step, Math.round(raw[1] / step) * step]
    let tag: string | null = null
    if (ph.t === 'draw' && live.current.tool === 'line' && ph.pts.length) {
      const first = ph.pts[0]
      const last = ph.pts[ph.pts.length - 1]
      const tol = tolAt(p, plane.z)
      if (ph.pts.length >= 3 && Math.hypot(raw[0] - first[0], raw[1] - first[1]) < tol) {
        p = first
        tag = 'Close'
      } else {
        const dx = p[0] - last[0]
        const dy = p[1] - last[1]
        if (Math.abs(dy) <= Math.abs(dx) * AXIS_SNAP) {
          p = [p[0], last[1]]
          tag = 'Horizontal'
        } else if (Math.abs(dx) <= Math.abs(dy) * AXIS_SNAP) {
          p = [last[0], p[1]]
          tag = 'Vertical'
        }
      }
    }
    return { p: [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000], z: plane.z, host: plane.host, tag }
  }

  const finish = (ph: Extract<Phase, { t: 'pull' }>, h: number) => {
    if (Math.abs(h) < MIN_PULL) {
      useEditor.getState().toast('Pull up to make a part, or down into a part to cut it.', 'info')
      return
    }
    if (!ph.host && h < 0) return
    const s = useEditor.getState()
    const node = sketchNode(ph.profile, ph.z, h)
    const r = applySketch(s.nodes, node, ph.host, contextOf(s).clearances)
    s.commit(r.label, 'sketch', r.nodes, r.selection)
    setPhase({ t: 'idle' })
  }

  const startPull = (z: number, host: string | null, profile: Profile) => {
    if (!profileOk(profile)) {
      useEditor.getState().toast('That outline is too small to make a part.', 'info')
      return setPhase({ t: 'idle' })
    }
    setPhase({ t: 'pull', z, host, profile, h: host ? 0 : MIN_PULL, start: mouse.current, typed: '' })
  }

  const click = (cur: Cursor) => {
    const { phase: ph, tool: tl } = live.current
    if (ph.t === 'pull') return finish(ph, ph.typed ? parseFloat(ph.typed) || 0 : ph.h)
    if (ph.t === 'idle') return setPhase({ t: 'draw', z: cur.z, host: cur.host, pts: [cur.p] })
    const first = ph.pts[0]
    if (tl === 'rect') return startPull(ph.z, ph.host, { kind: 'rect', a: first, b: cur.p })
    if (tl === 'circle') return startPull(ph.z, ph.host, { kind: 'circle', c: first, r: Math.hypot(cur.p[0] - first[0], cur.p[1] - first[1]) })
    // Line
    if (cur.tag === 'Close') return startPull(ph.z, ph.host, { kind: 'poly', pts: ph.pts })
    const last = ph.pts[ph.pts.length - 1]
    if (last[0] === cur.p[0] && last[1] === cur.p[1]) return
    setPhase({ ...ph, pts: [...ph.pts, cur.p] })
  }

  // ---- pointer and keys ---------------------------------------------------

  useEffect(() => {
    const el = gl.domElement
    let down: { px: V2; id: number } | null = null
    const pxOf = (e: PointerEvent): V2 => {
      const r = el.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    const move = (e: PointerEvent) => {
      const px = pxOf(e)
      mouse.current = px
      const ph = live.current.phase
      if (ph.t === 'pull') {
        if (!ph.typed) setPhase({ ...ph, h: pullHeight(ph, px, e.altKey) })
        return
      }
      setCursor(locate(px, e.altKey))
    }
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) down = { px: pxOf(e), id: e.pointerId }
    }
    const onUp = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return
      const px = pxOf(e)
      const moved = Math.hypot(px[0] - down.px[0], px[1] - down.px[1])
      down = null
      if (moved > CLICK_PX) return // that was an orbit
      mouse.current = px
      if (live.current.phase.t === 'pull') return click(live.current.cursor ?? { p: [0, 0], z: 0, host: null, tag: null })
      const cur = locate(px, e.altKey)
      if (cur) click(cur)
    }
    const leave = () => live.current.phase.t !== 'pull' && setCursor(null)
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
  }, [gl, camera, scene, size])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t?.closest?.('input, textarea, select, [contenteditable]')) return
      const ph = live.current.phase
      if (ph.t === 'idle') return
      const eat = () => {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      if (e.key === 'Escape') {
        eat()
        return setPhase({ t: 'idle' })
      }
      if (ph.t === 'draw') {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          eat()
          return setPhase(ph.pts.length > 1 ? { ...ph, pts: ph.pts.slice(0, -1) } : { t: 'idle' })
        }
        if (e.key === 'Enter' && live.current.tool === 'line') {
          eat()
          if (ph.pts.length >= 3) startPull(ph.z, ph.host, { kind: 'poly', pts: ph.pts })
          return
        }
        if (e.key.startsWith('Arrow') || e.key === 'PageUp' || e.key === 'PageDown') eat()
        return
      }
      // Pull: type an exact height, Enter to finish.
      if (/^[0-9.]$/.test(e.key) || (e.key === '-' && !ph.typed)) {
        eat()
        const typed = ph.typed + e.key
        return setPhase({ ...ph, typed, h: parseFloat(typed) || ph.h })
      }
      if (e.key === 'Backspace') {
        eat()
        return setPhase({ ...ph, typed: ph.typed.slice(0, -1) })
      }
      if (e.key === 'Enter') {
        eat()
        return finish(ph, ph.typed ? parseFloat(ph.typed) || 0 : ph.h)
      }
      if (e.key.length === 1 || e.key.startsWith('Arrow') || e.key === 'Delete') eat()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- hint ---------------------------------------------------------------

  const hostName = (id: string | null) => (id ? nodes.find((n) => n.id === id)?.name ?? 'the part' : null)
  useEffect(() => {
    const set = useSketch.getState().setHint
    const base = SKETCH_TOOLS.find((x) => x.id === tool)?.hint ?? null
    if (phase.t === 'pull') {
      const on = hostName(phase.host)
      set(on ? `Move up to add to ${on}, down to cut into it. Click or type a height and press Enter.` : 'Move up to set the height. Click or type a height and press Enter.')
    } else if (phase.t === 'draw') {
      set(`${base} Esc cancels${tool === 'line' ? ', Backspace undoes a point' : ''}.`)
    } else {
      const on = hostName(cursor?.host ?? null)
      set(on ? `${base} Drawing on top of ${on}.` : base)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tool, cursor?.host, nodes])
  useEffect(() => () => useSketch.getState().setHint(null), [])

  // ---- drawing ------------------------------------------------------------

  const clr = contextOf(useEditor.getState()).clearances
  const preview = useMemo(() => {
    if (phase.t !== 'pull') return null
    const h = phase.typed ? parseFloat(phase.typed) || 0 : phase.h
    const node = sketchNode(phase.profile, phase.z, phase.host ? h : Math.max(MIN_PULL, h))
    return { node, geos: buildShapeGeometries(node, clr), h }
  }, [phase, clr])

  let outlinePts: V2[] | null = null
  let label: { at: THREE.Vector3Tuple; text: string } | null = null
  const z = phase.t === 'idle' ? cursor?.z ?? 0 : phase.z
  const lift = z + 0.06

  if (phase.t === 'draw' && cursor) {
    const a = phase.pts[0]
    const b = cursor.p
    if (tool === 'rect') {
      outlinePts = outline({ kind: 'rect', a, b })
      label = { at: [b[0], b[1], lift], text: `${fmt(Math.abs(b[0] - a[0]))} × ${fmt(Math.abs(b[1] - a[1]))} mm` }
    } else if (tool === 'circle') {
      const r = Math.hypot(b[0] - a[0], b[1] - a[1])
      outlinePts = r > 0 ? outline({ kind: 'circle', c: a, r }) : null
      label = { at: [b[0], b[1], lift], text: `⌀ ${fmt(r * 2)} mm` }
    } else {
      outlinePts = [...phase.pts, b]
      const last = phase.pts[phase.pts.length - 1]
      const len = Math.hypot(b[0] - last[0], b[1] - last[1])
      label = { at: [b[0], b[1], lift], text: `${fmt(len)} mm${cursor.tag ? ` · ${cursor.tag}` : ''}` }
    }
  } else if (phase.t === 'pull' && preview) {
    outlinePts = outline(phase.profile)
    const { min, max } = profileBounds(phase.profile)
    const top = preview.h < 0 ? phase.z : phase.z + Math.max(MIN_PULL, preview.h)
    const text = phase.typed ? `${phase.typed}▏mm` : preview.h < 0 ? `Cut ${fmt(-preview.h)} mm` : `${fmt(Math.max(MIN_PULL, preview.h))} mm`
    label = { at: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, top + 2], text }
  }

  const cut = !!preview && preview.h < 0
  return (
    <group>
      {/* Cursor dot on the sketch plane */}
      {cursor && phase.t !== 'pull' && (
        <mesh position={[cursor.p[0], cursor.p[1], cursor.z + 0.08]} renderOrder={30}>
          <circleGeometry args={[Math.max(0.6, tolAt(cursor.p, cursor.z) * 0.18), 20]} />
          <meshBasicMaterial color={c.accent} depthTest={false} transparent />
        </mesh>
      )}
      {/* Points placed so far */}
      {phase.t === 'draw' &&
        phase.pts.map((p, i) => (
          <mesh key={i} position={[p[0], p[1], phase.z + 0.08]} renderOrder={30}>
            <circleGeometry args={[Math.max(0.5, tolAt(p, phase.z) * 0.15), 16]} />
            <meshBasicMaterial color={i === 0 && cursor?.tag === 'Close' ? c['print-thin'] : c.accent} depthTest={false} transparent />
          </mesh>
        ))}
      {outlinePts && outlinePts.length >= 2 && (
        <Line points={outlinePts.map(([x, y]) => [x, y, lift] as THREE.Vector3Tuple)} color={c.accent} lineWidth={2} depthTest={false} renderOrder={31} />
      )}
      {preview &&
        preview.geos.map((g, i) => (
          <mesh key={i} geometry={g} position={preview.node.position} renderOrder={6}>
            <meshStandardMaterial color={cut ? c['print-thin'] : c.accent} transparent opacity={cut ? 0.35 : 0.5} depthWrite={false} />
          </mesh>
        ))}
      {label && (
        <Html position={label.at} zIndexRange={[25, 0]} style={{ pointerEvents: 'none' }}>
          <div className="sketch-label">{label.text}</div>
        </Html>
      )}
    </group>
  )
}
