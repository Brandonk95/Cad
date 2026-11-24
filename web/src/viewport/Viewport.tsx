import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Html, Line, OrbitControls, TransformControls } from '@react-three/drei'
import { buildShapeGeometries, groupGeometry, nodeWorldBox, solidWorldBox, featureEdges } from '../model/geometry'
import { patternCopies, findNode, mapNodes, round } from '../model/ops'
import { usePatternPreview } from './pattern'
import { setViewCamera } from './viewDir'
import { clearSnapGuides, freeMove, snapMove, useSnapGuides, type SnapTarget } from './snap'
import type { Clearances, SceneNode, Vec3 } from '../model/types'
import { contextOf, useEditor, usePrintContext } from '../store/editor'
import { useAnalysis } from '../store/analysis'
import { NO_PLANES, placeSectionPlane, SECTION_PLANES, useSection } from './section'
import { setCanvasHover, setDropProbe } from './probe'
import type { Analysis, Issue } from '../print/analyze'
import { makeOverlayMaterial } from './overlayMaterial'
import { useThemeColors, type ThemeColors } from './theme'
import { FitTag, SizeTags } from './Tags'
import { SketchLayer } from '../sketch/SketchLayer'
import { MeasureLayer } from './MeasureLayer'
import { useMeasure } from './measure'
import { useSketch } from '../sketch/store'

THREE.Object3D.DEFAULT_UP.set(0, 0, 1)

const DEG = Math.PI / 180
let lastGizmo = 0
/** When a box selection last ended; its mouse-up shouldn't also clear the selection. */
let lastBox = 0

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

function NodeMesh({ node, selected, clr, c, dim, pickable, outside = false }: { node: SceneNode; selected: boolean; clr: Clearances; c: ThemeColors; dim: boolean; pickable: boolean; outside?: boolean }) {
  const select = useEditor((s) => s.select)
  const sectionOn = useSection((s) => s.on)
  const planes = sectionOn ? SECTION_PLANES : NO_PLANES
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
        const pick = usePatternPreview.getState().onPick
        if (pick) return pick(node.id)
        // A part outside the group being edited closes that group, then selects the part.
        if (outside) useEditor.getState().closeGroup()
        select([node.id], !outside && (e.shiftKey || e.ctrlKey || e.metaKey))
      }}
      onDoubleClick={(e) => {
        if (!pickable || outside || node.type !== 'group') return
        e.stopPropagation()
        useEditor.getState().openGroup(node.id)
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
            clippingPlanes={planes}
          />
          {(selected || isHole) && !groupOutline && !sectionOn && <Edges threshold={20} color={selected ? c.accent : c['text-secondary']} />}
          {groupOutline && groupOutline.length > 1 && !sectionOn && <Line points={groupOutline} segments color={c.accent} lineWidth={1} />}
        </mesh>
      ))}
      {/* Section view: inside faces show through the cut in a flat colour, so cut solid reads as filled. */}
      {sectionOn && !isHole &&
        geos.map((g, i) => (
          <mesh key={'cap' + i} geometry={g} renderOrder={1} raycast={() => null}>
            <meshBasicMaterial color={c.accent} side={THREE.BackSide} clippingPlanes={planes} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
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

const ISSUE_TITLES: Record<string, string> = { thin: 'Thin wall', tiny: 'Too small to print', overhang: 'Overhang', bridge: 'Long bridge', supports: 'Needs supports' }

/** The pulsing dot on the worst spot. Hover it to read the problems on that part. */
function IssueDot({ color, worst, issues }: { color: string; worst: NonNullable<Analysis['worst']>; issues: Issue[] }) {
  const [open, setOpen] = useState(false)
  const here = issues.filter((i) => i.nodeId === worst.nodeId)
  // The worst kind first, then the rest on the same part. Fall back to every problem.
  const list = (here.length ? here : issues).slice().sort((a, b) => Number(b.kind === worst.kind) - Number(a.kind === worst.kind))
  const name = findNode(useEditor.getState().nodes, worst.nodeId)?.name
  return (
    <div className="issue-dot-hit" onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)} aria-label="Print problem">
      <div className="issue-dot" style={{ background: color }} />
      {open && (
        <div className="issue-tip" role="tooltip">
          <b>{list.length > 1 ? `${list.length} problems` : ISSUE_TITLES[worst.kind] ?? 'Problem'}{name ? ` on ${name}` : ''}</b>
          {list.length ? (
            <ul>
              {list.map((i) => (
                <li key={i.id}>
                  <span className="issue-swatch" data-kind={i.kind} />
                  {i.message}
                </li>
              ))}
            </ul>
          ) : (
            <p>{ISSUE_TITLES[worst.kind] ?? 'Problem'} here. Turn on the print overlay (P) to see where.</p>
          )}
        </div>
      )}
    </div>
  )
}

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
        <Html position={worst.point} center zIndexRange={[10, 0]}>
          <IssueDot color={dotColor} worst={worst} issues={analysis?.issues ?? []} />
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

/** Ghost copies (and the circle, for circular patterns) while a pattern is being set up. */
function PatternGhosts({ c, clr }: { c: ThemeColors; clr: Clearances }) {
  const opts = usePatternPreview((s) => s.opts)
  const nodes = useEditor((s) => s.nodes)
  const selection = useEditor((s) => s.selection)
  const ghosts = useMemo(() => {
    if (!opts) return []
    return patternCopies(nodes, selection, opts).map((n) => ({
      n,
      geos: n.type === 'group' ? [groupGeometry(n, clr)].filter(Boolean) as THREE.BufferGeometry[] : buildShapeGeometries(n, clr),
    }))
  }, [opts, nodes, selection, clr])
  const ring = useMemo(() => {
    if (!opts || opts.kind !== 'circular') return null
    const picked = nodes.filter((n) => selection.includes(n.id))
    if (!picked.length) return null
    const box = new THREE.Box3()
    for (const n of picked) box.union(solidWorldBox(n, clr))
    const mid = box.getCenter(new THREE.Vector3())
    const r = Math.hypot(mid.x - opts.center[0], mid.y - opts.center[1])
    const z = box.min.z + 0.05
    const pts: Vec3[] = []
    for (let i = 0; i <= 96; i++) pts.push([opts.center[0] + r * Math.cos((i / 96) * Math.PI * 2), opts.center[1] + r * Math.sin((i / 96) * Math.PI * 2), z])
    return { pts, z, r }
  }, [opts, nodes, selection, clr])
  if (!opts) return null
  const [cx, cy] = opts.kind === 'circular' ? opts.center : [0, 0]
  const arm = Math.max(3, (ring?.r ?? 10) * 0.12)
  const z = ring?.z ?? 0.05
  return (
    <group>
      {ghosts.map(({ n, geos }) => (
        <group key={n.id} position={n.position} rotation={[n.rotation[0] * DEG, n.rotation[1] * DEG, n.rotation[2] * DEG]}>
          {geos.map((g, i) => (
            <mesh key={i} geometry={g} renderOrder={4} raycast={() => null}>
              <meshStandardMaterial color={c.accent} transparent opacity={0.35} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
      {ring && ring.r > 0.01 && <Line points={ring.pts} color={c.accent} lineWidth={1} dashed dashSize={2} gapSize={2} depthTest={false} renderOrder={20} />}
      {opts.kind === 'circular' && <Line points={[[cx - arm, cy, z], [cx + arm, cy, z], [cx, cy - arm, z], [cx, cy + arm, z]]} segments color={c.accent} lineWidth={2} depthTest={false} renderOrder={21} />}
    </group>
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

/** Lets arrow keys and align buttons read where the camera is looking. */
/** Top-level part a mesh belongs to, if it is one of `ids`. */
function partOf(o: THREE.Object3D | null, ids: Set<string>): string | null {
  while (o) {
    if (ids.has(o.name)) return o.name
    o = o.parent
  }
  return null
}

const AXES = ['x', 'y', 'z'] as const

/** Lets shortcut keys and drag-and-drop find the face under the cursor. */
function DropProbe() {
  const { camera, gl, scene } = useThree()
  useEffect(() => {
    const ray = new THREE.Raycaster()
    setDropProbe((x, y) => {
      const r = gl.domElement.getBoundingClientRect()
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera)
      const s = useEditor.getState()
      const outside = new Set(s.groupEdit[s.groupEdit.length - 1]?.outside ?? [])
      const solids = new Set(s.nodes.filter((n) => (n.type === 'group' || !n.hole) && !outside.has(n.id)).map((n) => n.id))
      for (const h of ray.intersectObjects(scene.children, true)) {
        if (!(h.object as THREE.Mesh).isMesh || !h.face || !partOf(h.object, solids)) continue
        const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
        // Faces within a degree of a bed axis count as exactly on it.
        for (let i = 0; i < 3; i++) {
          const v = n.getComponent(i)
          if (Math.abs(v) > 0.9998) {
            n.set(0, 0, 0).setComponent(i, Math.sign(v))
            break
          }
        }
        const p = h.point
        const r1 = (v: number) => Math.round(v * 10) / 10
        return { point: [r1(p.x), r1(p.y), r1(p.z)], normal: AXES.map((k) => n[k]) as Vec3 }
      }
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3())
      return hit ? { point: [Math.round(hit.x), Math.round(hit.y), 0], normal: [0, 0, 1] } : null
    })
    const el = gl.domElement
    const move = (e: PointerEvent) => setCanvasHover({ x: e.clientX, y: e.clientY })
    const leave = () => setCanvasHover(null)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      setDropProbe(null)
      setCanvasHover(null)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [camera, gl, scene])
  return null
}

/**
 * Shift-drag on empty space draws a box and adds the parts whose middle falls
 * inside it to the selection. Double-click on empty space closes an opened group.
 */
function BoxSelect() {
  const { camera, gl, scene } = useThree()
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  useEffect(() => {
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const overPart = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const ids = new Set(useEditor.getState().nodes.map((n) => n.id))
      return ray.intersectObjects(scene.children, true).some((h) => (h.object as THREE.Mesh).isMesh && !!partOf(h.object, ids))
    }
    let start: { x: number; y: number; id: number } | null = null
    let rect: HTMLDivElement | null = null
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !e.shiftKey || overPart(e)) return
      // Take the drag before the orbit controls see it.
      e.stopImmediatePropagation()
      e.preventDefault()
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* pointer already gone */
      }
      start = { x: e.clientX, y: e.clientY, id: e.pointerId }
      if (controls) controls.enabled = false
      rect = document.createElement('div')
      rect.className = 'box-select'
      el.parentElement?.appendChild(rect)
    }
    const box = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return {
        l: Math.min(start!.x, e.clientX) - r.left,
        t: Math.min(start!.y, e.clientY) - r.top,
        r: Math.max(start!.x, e.clientX) - r.left,
        b: Math.max(start!.y, e.clientY) - r.top,
      }
    }
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id || !rect) return
      const b = box(e)
      Object.assign(rect.style, { left: `${b.l}px`, top: `${b.t}px`, width: `${b.r - b.l}px`, height: `${b.b - b.t}px` })
    }
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const b = box(e)
      start = null
      rect?.remove()
      rect = null
      if (controls) controls.enabled = true
      lastBox = Date.now()
      if (b.r - b.l < 4 && b.b - b.t < 4) return
      const r = el.getBoundingClientRect()
      const s = useEditor.getState()
      const outside = new Set(s.groupEdit[s.groupEdit.length - 1]?.outside ?? [])
      const clr = contextOf(s).clearances
      const hits = s.nodes
        .filter((n) => !outside.has(n.id))
        .filter((n) => {
          const q = nodeWorldBox(n, clr).getCenter(new THREE.Vector3()).project(camera)
          const x = ((q.x + 1) / 2) * r.width
          const y = ((1 - q.y) / 2) * r.height
          return q.z < 1 && x >= b.l && x <= b.r && y >= b.t && y <= b.b
        })
        .map((n) => n.id)
      s.select([...new Set([...s.selection, ...hits])])
    }
    const dbl = (e: MouseEvent) => {
      if (useEditor.getState().groupEdit.length && !overPart(e)) useEditor.getState().closeGroup()
    }
    el.addEventListener('pointerdown', down, true)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('dblclick', dbl)
    return () => {
      el.removeEventListener('pointerdown', down, true)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('dblclick', dbl)
      rect?.remove()
    }
  }, [camera, gl, scene, controls])
  return null
}

/** Keeps the section plane where the panel says and draws its outline. */
function SectionSync({ c }: { c: ThemeColors }) {
  const { on, axis, at, flip } = useSection()
  const camera = useThree((s) => s.camera)
  const bounds = useAnalysis((s) => s.analysis?.bounds)
  const box = bounds && !bounds.isEmpty() ? bounds : new THREE.Box3(new THREE.Vector3(-10, -10, 0), new THREE.Vector3(10, 10, 20))
  const pos = at ?? (box.min.getComponent(axis) + box.max.getComponent(axis)) / 2
  // Keep the half away from the camera so the cut faces you; across Z keep the bottom.
  const camHigh = axis !== 2 && camera.position.getComponent(axis) > pos
  const keepHigh = axis !== 2 && !camHigh
  placeSectionPlane(axis, pos, keepHigh !== flip)
  if (!on) return null
  // Outline of the cut, a little larger than the model.
  const m = 4
  const lo = box.min.clone().subScalar(m)
  const hi = box.max.clone().addScalar(m)
  const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]
  const corner = (a: number, b: number): THREE.Vector3Tuple => {
    const p = new THREE.Vector3()
    p.setComponent(axis, pos)
    p.setComponent(u, a ? hi.getComponent(u) : lo.getComponent(u))
    p.setComponent(v, b ? hi.getComponent(v) : lo.getComponent(v))
    return p.toArray() as THREE.Vector3Tuple
  }
  return <Line points={[corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1), corner(0, 0)]} color={c.accent} lineWidth={1.5} dashed dashSize={3} gapSize={2} transparent opacity={0.8} />
}

function ViewCameraTracker() {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    setViewCamera(camera)
    return () => setViewCamera(null)
  }, [camera])
  return null
}

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
  const measuring = useMeasure((s) => s.on)
  // Measuring works like drawing: clicks place points, handles and tags hide.
  const drawing = (mode === 'sketch' && tool !== 'select') || measuring
  const single = !drawing && selection.length === 1 && nodes.some((n) => n.id === selection[0]) ? selection[0] : null
  // Editing inside a combined part: everything else is dimmed and a click on it closes the group.
  const frame = useEditor((s) => s.groupEdit[s.groupEdit.length - 1])
  const outsideIds = useMemo(() => new Set(frame?.outside ?? []), [frame])
  const bed = ctx.printer.bed
  const camDist = Math.max(bed[0], bed[1]) * 1.1

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true, localClippingEnabled: true }}
      camera={{ position: [camDist * 0.55, -camDist * 0.85, camDist * 0.62], fov: 40, near: 0.5, far: 20000 }}
      onPointerMissed={() => {
        if (drawing || Date.now() - lastGizmo < 250 || Date.now() - lastBox < 250) return
        if (usePatternPreview.getState().onPick) return usePatternPreview.setState({ onPick: null })
        select([])
      }}
    >
      <color attach="background" args={[c['bg-canvas']]} />
      <hemisphereLight args={['#ffffff', '#3a3f47', 0.9]} />
      <directionalLight position={[120, -160, 260]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-300} shadow-camera-right={300} shadow-camera-top={300} shadow-camera-bottom={-300} />
      <directionalLight position={[-160, 120, 80]} intensity={0.45} />
      <Bed size={bed} out={outOfBed} c={c} />
      {nodes.map((n) => (
        <NodeMesh key={n.id} node={n} selected={selection.includes(n.id)} clr={ctx.clearances} c={c} dim={outsideIds.has(n.id)} outside={outsideIds.has(n.id)} pickable={!drawing} />
      ))}
      {overlay && <Overlay c={c} />}
      {single && <Gizmo id={single} />}
      <SnapGuides c={c} />
      <PatternGhosts c={c} clr={ctx.clearances} />
      {drawing && !measuring && <SketchLayer c={c} />}
      {measuring && <MeasureLayer c={c} />}
      {single && <SizeTags id={single} />}
      {single && <FitTag id={single} />}
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} target={[0, 0, 10]} minPolarAngle={0} maxPolarAngle={Math.PI} />
      <CameraRig />
      <ViewCameraTracker />
      <DropProbe />
      {!drawing && <BoxSelect />}
      <SectionSync c={c} />
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
