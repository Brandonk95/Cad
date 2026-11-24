import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Html, Line, OrbitControls, TransformControls } from '@react-three/drei'
import { buildShapeGeometries, groupGeometry, nodeWorldBox, solidWorldBox, featureEdges } from '../model/geometry'
import { findNode, mapNodes, round } from '../model/ops'
import { clearSnapGuides, freeMove, snapMove, useSnapGuides, type SnapTarget } from './snap'
import type { Clearances, SceneNode, Vec3 } from '../model/types'
import { contextOf, useEditor, usePrintContext } from '../store/editor'
import { useAnalysis } from '../store/analysis'
import { makeOverlayMaterial } from './overlayMaterial'
import { useThemeColors, type ThemeColors } from './theme'
import { FitTag, SizeTags } from './Tags'
import { SketchLayer } from '../sketch/SketchLayer'
import { useSketch } from '../sketch/store'

THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

const DEG = Math.PI / 180
let lastGizmo = 0

// ---------------------------------------------------------------------------

function Bed({ size, out, c }: { size: Vec3; out: boolean; c: ThemeColors }) {
  const [bx, by, bz] = size
  const grid = useMemo(() => {
    const minor: number[] = []
    const major: number[] = []
    const step = 10
    for (let x = -Math.floor(bx / 2 / step) * step; x <= bx / 2 + 1e-6; x += step) (Math.round(x) % 50 === 0 ? major : minor).push(x, -by / 2, 0.01, x, by / 2, 0.01)
    for (let y = -Math.floor(by / 2 / step) * step; y <= by / 2 + 1e-6; y += step) (Math.round(y) % 50 === 0 ? major : minor).push(-bx / 2, y, 0.01, bx / 2, y, 0.01)
    const g = (arr: number[]) => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    return { minor: g(minor), major: g(major) }
  }, [bx, by])

  const box = useMemo(() => {
    const x = bx / 2, y = by / 2
    const p: Vec3[] = [
      [-x, -y, 0], [x, -y, 0], [x, -y, 0], [x, y, 0], [x, y, 0], [-x, y, 0], [-x, y, 0], [-x, -y, 0],
      [-x, -y, bz], [x, -y, bz], [x, -y, bz], [x, y, bz], [x, y, bz], [-x, y, bz], [-x, y, bz], [-x, -y, bz],
      [-x, -y, 0], [-x, -y, bz], [x, -y, 0], [x, -y, bz], [x, y, 0], [x, y, bz], [-x, y, 0], [-x, y, bz],
    ]
    return p
  }, [bx, by, bz])

  return (
    <group>
      <mesh position={[0, 0, -0.05]} receiveShadow>
        <planeGeometry args={[bx, by]} />
        <meshStandardMaterial color={c.bed} roughness={0.95} />
      </mesh>
      <lineSegments geometry={grid.minor}>
        <lineBasicMaterial color={c['grid-minor']} />
      </lineSegments>
      <lineSegments geometry={grid.major}>
        <lineBasicMaterial color={c['grid-major']} />
      </lineSegments>
      <Line points={box} segments dashed dashSize={4} gapSize={3} color={out ? c['print-thin'] : c['text-secondary']} transparent opacity={out ? 0.9 : 0.35} lineWidth={1} />
      {/* Front marker so orientation is never ambiguous */}
      <Line points={[[-12, -by / 2 - 4, 0], [12, -by / 2 - 4, 0]]} color={c['text-secondary']} transparent opacity={0.5} lineWidth={2} />
    </group>
  )
}

// ---------------------------------------------------------------------------

function NodeMesh({ node, selected, clr, c, dim, pickable }: { node: SceneNode; selected: boolean; clr: Clearances; c: ThemeColors; dim: boolean; pickable: boolean }) {
  const select = useEditor((s) => s.select)
  const geos = useMemo(() => {
    if (node.type === 'group') {
      const g = groupGeometry(node, clr)
      return g ? [g] : []
    }
    return buildShapeGeometries(node, clr)
  }, [node, clr])

  const isHole = node.type === 'shape' && node.hole
  // Combined parts get their own outline finder; the stock one draws merge seams as lines.
  const groupOutline = useMemo(() => (node.type === 'group' && selected && geos[0] ? featureEdges(geos[0], 20) : null), [geos, node.type, selected])
  const color = isHole ? c['text-secondary'] : node.color

  // Holes inside a selected group are shown as ghosts so you can find them.
  const ghosts = useMemo(() => {
    if (!selected || node.type !== 'group') return []
    const out: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = []
    const walk = (nodes: SceneNode[], parent: THREE.Matrix4) => {
      for (const n of nodes) {
        const m = parent.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...n.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(n.rotation[0] * DEG, n.rotation[1] * DEG, n.rotation[2] * DEG)), new THREE.Vector3(1, 1, 1)))
        if (n.type === 'group') walk(n.children, m)
        else if (n.hole) for (const g of buildShapeGeometries(n, clr)) out.push({ g, m })
      }
    }
    walk(node.children, new THREE.Matrix4())
    return out
  }, [node, selected, clr])

  return (
    <group
      name={node.id}
      position={node.position}
      rotation={[node.rotation[0] * DEG, node.rotation[1] * DEG, node.rotation[2] * DEG]}
      onClick={(e) => {
        if (!pickable) return
        e.stopPropagation()
        if (Date.now() - lastGizmo < 250) return
        select([node.id], e.shiftKey || e.ctrlKey || e.metaKey)
      }}
    >
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} castShadow={!isHole} receiveShadow={!isHole} renderOrder={isHole ? 2 : 0}>
          <meshStandardMaterial
            color={color}
            roughness={0.62}
            metalness={0.02}
            transparent={isHole || dim}
            opacity={isHole ? 0.32 : dim ? 0.55 : 1}
            depthWrite={!isHole}
            emissive={selected ? c.accent : '#000000'}
            emissiveIntensity={selected ? 0.12 : 0}
          />
          {(selected || isHole) && !groupOutline && <Edges threshold={20} color={selected ? c.accent : c['text-secondary']} />}
          {groupOutline && groupOutline.length > 1 && <Line points={groupOutline} segments color={c.accent} lineWidth={1} />}
        </mesh>
      ))}
      {ghosts.map(({ g, m }, i) => (
        <mesh key={'g' + i} geometry={g} matrix={m} matrixAutoUpdate={false} renderOrder={3}>
          <meshBasicMaterial color={c['text-secondary']} transparent opacity={0.12} depthWrite={false} depthTest={false} />
          <Edges threshold={20} color={c['text-secondary']} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------

function Overlay({ c }: { c: ThemeColors }) {
  const bodies = useAnalysis((s) => s.bodies)
  const analysis = useAnalysis((s) => s.analysis)
  const material = useMemo(() => makeOverlayMaterial(c), [c])
  const meshes = useMemo(() => {
    if (!analysis) return []
    return bodies
      .map((b) => {
        const ov = analysis.overlays.find((o) => o.id === b.id)
        if (!ov || !ov.cats.some((x) => x > 0)) return null
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', b.geometry.getAttribute('position'))
        g.setAttribute('cat', new THREE.BufferAttribute(ov.cats, 1))
        return { id: b.id, g }
      })
      .filter(Boolean) as { id: string; g: THREE.BufferGeometry }[]
  }, [bodies, analysis])

  const worst = analysis?.worst
  const dotColor = worst ? { overhang: c['print-overhang'], thin: c['print-thin'], bridge: c['print-bridge'], tiny: c['print-tiny'] }[worst.kind as 'overhang'] ?? c['print-thin'] : ''
  return (
    <group>
      {meshes.map((m) => (
        <mesh key={m.id} geometry={m.g} material={material} renderOrder={5} raycast={() => null} />
      ))}
      {worst && (
        <Html position={worst.point} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="issue-dot" style={{ background: dotColor }} />
        </Html>
      )}
    </group>
  )
}

// ---------------------------------------------------------------------------

interface DragStart {
  pos: THREE.Vector3
  box: THREE.Box3
  targets: SnapTarget[]
}

function Gizmo({ id }: { id: string }) {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const mode = useEditor((s) => s.transformMode)
  const [obj, setObj] = useState<THREE.Object3D | null>(null)
  const ctrl = useRef<{ axis: string | null } | null>(null)
  const drag = useRef<DragStart | null>(null)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setObj(scene.getObjectByName(id) ?? null))
    return () => cancelAnimationFrame(raf)
  }, [id, scene])
  if (!obj) return null

  const begin = () => {
    lastGizmo = Date.now()
    drag.current = null
    if (mode !== 'translate') return
    const s = useEditor.getState()
    const node = findNode(s.nodes, id)
    if (!node) return
    const clr = contextOf(s).clearances
    const box = solidWorldBox(node, clr)
    const targets: SnapTarget[] = s.nodes
      .filter((n) => n.id !== id)
      .map((n) => ({ box: solidWorldBox(n, clr), name: n.name, solid: n.type === 'group' || !n.hole }))
    drag.current = { pos: obj.position.clone(), box, targets }
  }

  const snap = () => {
    const d = drag.current
    const axis = ctrl.current?.axis
    if (!d || !axis || freeMove()) return clearSnapGuides()
    const moved = obj.position.clone().sub(d.pos)
    const box = d.box.clone().translate(moved)
    // Snap distance grows as you zoom out, so it feels the same on screen.
    const tol = THREE.MathUtils.clamp(camera.position.distanceTo(obj.position) * 0.012, 2, 6)
    const r = snapMove(box, d.targets, { axis, tol })
    obj.position.add(r.delta)
    useSnapGuides.setState({ segs: r.segs, label: r.label, at: r.at })
  }

  const sync = () => {
    lastGizmo = Date.now()
    if (mode === 'scale') {
      // The mesh stretches live; the model is rebuilt once on release. Show the factor meanwhile.
      const f = obj.scale.toArray().map((v) => Math.round(v * 100))
      const label = f[0] === f[1] && f[1] === f[2] ? `${f[0]}%` : `W ${f[0]}%  D ${f[1]}%  H ${f[2]}%`
      const box = new THREE.Box3().setFromObject(obj)
      useSnapGuides.setState({ segs: [], label, at: [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z] })
      return
    }
    if (mode === 'translate') snap()
    const s = useEditor.getState()
    const p = obj.position
    const r = obj.rotation
    s.setLive(
      mapNodes(s.nodes, id, (n) => ({
        ...n,
        position: [round(p.x, 3), round(p.y, 3), round(p.z, 3)],
        rotation: [round(r.x / DEG, 3), round(r.y / DEG, 3), round(r.z / DEG, 3)],
      })),
    )
  }
  return (
    <TransformControls
      ref={ctrl as never}
      object={obj}
      mode={mode}
      size={0.8}
      translationSnap={1}
      rotationSnap={15 * DEG}
      scaleSnap={0.05}
      onObjectChange={sync}
      onMouseDown={begin}
      onMouseUp={() => {
        lastGizmo = Date.now()
        drag.current = null
        clearSnapGuides()
        const s = useEditor.getState()
        if (mode === 'scale') {
          const f = obj.scale.toArray().map((v) => Math.max(0.01, round(v, 3))) as Vec3
          obj.scale.set(1, 1, 1)
          if (f.some((v) => Math.abs(v - 1) > 1e-6)) s.scaleSelected(f)
          return
        }
        s.commit(mode === 'rotate' ? 'Rotate' : 'Move', mode === 'rotate' ? 'rotate' : 'move', s.nodes)
      }}
    />
  )
}

function SnapGuides({ c }: { c: ThemeColors }) {
  const segs = useSnapGuides((s) => s.segs)
  const label = useSnapGuides((s) => s.label)
  const at = useSnapGuides((s) => s.at)
  return (
    <group>
      {segs.length > 0 && <Line points={segs.flat()} segments color={c.accent} lineWidth={2} depthTest={false} renderOrder={20} />}
      {label && at && (
        <Html position={at} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div className="snap-label">{label}</div>
        </Html>
      )}
    </group>
  )
}

// ---------------------------------------------------------------------------

let pendingFrame: THREE.Box3 | null = null

function CameraRig() {
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const camera = useThree((s) => s.camera)
  const goal = useRef<{ target: THREE.Vector3; pos: THREE.Vector3 } | null>(null)
  const reduced = useEditor((s) => s.reducedMotion)

  useEffect(() => {
    const apply = (box: THREE.Box3) => {
      if (!controls) return false
      const center = box.getCenter(new THREE.Vector3())
      const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 15)
      let dir = camera.position.clone().sub(controls.target)
      // Fall back to the default three-quarter view if the camera state is degenerate.
      if (!Number.isFinite(dir.x + dir.y + dir.z) || dir.lengthSq() < 1e-6) dir = new THREE.Vector3(0.45, -0.7, 0.55)
      dir.normalize()
      const dist = (radius / Math.sin(((camera as THREE.PerspectiveCamera).fov * DEG) / 2)) * 1.6
      goal.current = { target: center, pos: center.clone().addScaledVector(dir, dist) }
      if (reduced) {
        controls.target.copy(center)
        camera.position.copy(goal.current.pos)
        goal.current = null
        controls.update()
      }
      return true
    }
    // A frame request made before the controls existed (e.g. right after load) runs now.
    if (pendingFrame && apply(pendingFrame)) pendingFrame = null
    const onFrame = (e: Event) => {
      const box = (e as CustomEvent<THREE.Box3>).detail
      if (apply(box)) pendingFrame = null
    }
    window.addEventListener('stratum:frame', onFrame)
    return () => window.removeEventListener('stratum:frame', onFrame)
  }, [controls, camera, reduced])

  useFrame((_, dt) => {
    if (!goal.current || !controls) return
    const k = 1 - Math.exp(-dt / 0.06) // ~250 ms settle
    controls.target.lerp(goal.current.target, k)
    camera.position.lerp(goal.current.pos, k)
    controls.update()
    if (camera.position.distanceTo(goal.current.pos) < 0.05) goal.current = null
  })
  return null
}

export function frameSelection() {
  const s = useEditor.getState()
  const { clearances } = usePrintContextSnapshot()
  const nodes = s.selection.length ? s.nodes.filter((n) => s.selection.includes(n.id)) : s.nodes
  const box = new THREE.Box3()
  for (const n of nodes) box.union(nodeWorldBox(n, clearances))
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(0, 0, 20), new THREE.Vector3(120, 120, 40))
  pendingFrame = box
  window.dispatchEvent(new CustomEvent('stratum:frame', { detail: box }))
}

const usePrintContextSnapshot = () => contextOf(useEditor.getState())

// ---------------------------------------------------------------------------

export function Viewport() {
  const c = useThemeColors()
  const nodes = useEditor((s) => s.nodes)
  const selection = useEditor((s) => s.selection)
  const select = useEditor((s) => s.select)
  const overlay = useEditor((s) => s.overlay)
  const ctx = usePrintContext()
  const outOfBed = useAnalysis((s) => s.analysis?.outOfBed ?? false)
  const mode = useEditor((s) => s.mode)
  const tool = useSketch((s) => s.tool)
  // Drawing in Sketch mode: clicks place points instead of selecting, and handles hide.
  const drawing = mode === 'sketch' && tool !== 'select'
  const single = !drawing && selection.length === 1 && nodes.some((n) => n.id === selection[0]) ? selection[0] : null
  const bed = ctx.printer.bed
  const camDist = Math.max(bed[0], bed[1]) * 1.1

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [camDist * 0.55, -camDist * 0.85, camDist * 0.62], fov: 40, near: 0.5, far: 20000 }}
      onPointerMissed={() => {
        if (drawing || Date.now() - lastGizmo < 250) return
        select([])
      }}
    >
      <color attach="background" args={[c['bg-canvas']]} />
      <hemisphereLight args={['#ffffff', '#3a3f47', 0.9]} />
      <directionalLight position={[120, -160, 260]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-300} shadow-camera-right={300} shadow-camera-top={300} shadow-camera-bottom={-300} />
      <directionalLight position={[-160, 120, 80]} intensity={0.45} />
      <Bed size={bed} out={outOfBed} c={c} />
      {nodes.map((n) => (
        <NodeMesh key={n.id} node={n} selected={selection.includes(n.id)} clr={ctx.clearances} c={c} dim={false} pickable={!drawing} />
      ))}
      {overlay && <Overlay c={c} />}
      {single && <Gizmo id={single} />}
      <SnapGuides c={c} />
      {drawing && <SketchLayer c={c} />}
      {single && <SizeTags id={single} />}
      {single && <FitTag id={single} />}
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} target={[0, 0, 10]} maxPolarAngle={Math.PI * 0.95} />
      <CameraRig />
    </Canvas>
  )
}

export const captureThumbnail = (): Promise<Blob | null> =>
  new Promise((resolve) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.canvas canvas')
    if (!canvas) return resolve(null)
    const w = 400, h = 300
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')!
    const scale = Math.max(w / canvas.width, h / canvas.height)
    const sw = w / scale, sh = h / scale
    ctx.drawImage(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, 0, 0, w, h)
    out.toBlob((b) => resolve(b), 'image/png')
  })
