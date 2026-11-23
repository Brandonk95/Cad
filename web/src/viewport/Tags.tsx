import { useMemo, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { nodeWorldBox, solidWorldBox } from '../model/geometry'
import { mapNodes, resizeWorld } from '../model/ops'
import { FIT_CLASSES, type FitClass, type Vec3 } from '../model/types'
import { beginScrub, endScrub, useEditor, usePrintContext } from '../store/editor'

const fmt = (v: number) => (Math.round(v * 100) / 100).toString()

const PX_PER_STEP = 4

function Tag({ position, value, axis, onCommit, boxRef }: { position: Vec3; value: number; axis: string; onCommit: (v: number) => void; boxRef?: (el: HTMLDivElement | null) => void }) {
  const [edit, setEdit] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const latest = useRef({ value, onCommit })
  latest.current = { value, onCommit }

  // Drag the pill (right / up = bigger) to resize. A click without moving edits as text.
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const sx = e.clientX
    const sy = e.clientY
    const start = latest.current.value
    let moved = false
    let last = start
    const move = (ev: PointerEvent) => {
      const d = ev.clientX - sx - (ev.clientY - sy)
      if (!moved && Math.abs(d) < 3) return
      if (!moved) {
        moved = true
        setDragging(true)
        beginScrub()
      }
      const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1
      const v = Math.max(0.1, Math.round((start + Math.round(d / PX_PER_STEP) * k) * 1000) / 1000)
      if (v !== last) {
        last = v
        latest.current.onCommit(v)
      }
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      if (moved) {
        endScrub()
        setDragging(false)
      } else setEdit(fmt(latest.current.value))
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  return (
    <Html position={position} center zIndexRange={[20, 0]}>
      <div ref={boxRef} className="size-tag-wrap">
      {edit === null ? (
        <button
          className={`size-tag scrub${dragging ? ' dragging' : ''}`}
          title={`${axis} size. Drag to change (Shift: faster, Alt: finer), click to type`}
          onPointerDown={onPointerDown}
          onClick={(e) => e.stopPropagation()}
        >
          {fmt(value)}
          <span className="unit">mm</span>
        </button>
      ) : (
        <span className="size-tag">
          <input
            autoFocus
            className="mono"
            value={edit}
            inputMode="decimal"
            aria-label={`${axis} size in mm`}
            onChange={(e) => setEdit(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') setEdit(null)
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            onBlur={() => {
              const v = parseFloat(edit)
              if (Number.isFinite(v) && v > 0 && Math.abs(v - value) > 1e-6) onCommit(v)
              setEdit(null)
            }}
          />
          <span className="unit">mm</span>
        </span>
      )}
      </div>
    </Html>
  )
}

const GAP = 4
const v3 = new THREE.Vector3()

/**
 * Pushes tags apart on screen so they never cover each other, however small the
 * part is or wherever the camera is. Works on screen pixels, every frame.
 */
function useSpreadTags(anchors: Vec3[], els: React.RefObject<(HTMLDivElement | null)[]>) {
  useFrame(({ camera, size }) => {
    const list = els.current
    const pts = anchors.map((a, i) => {
      v3.set(a[0], a[1], a[2]).project(camera)
      const el = list[i]
      return {
        el,
        x: ((v3.x + 1) / 2) * size.width,
        y: ((1 - v3.y) / 2) * size.height,
        w: el?.offsetWidth ?? 0,
        h: el?.offsetHeight ?? 0,
        dx: 0,
        dy: 0,
      }
    })
    for (let it = 0; it < 12; it++) {
      let moved = false
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i]
          const b = pts[j]
          if (!a.el || !b.el) continue
          const cx = b.x + b.dx - (a.x + a.dx)
          const cy = b.y + b.dy - (a.y + a.dy)
          const ox = (a.w + b.w) / 2 + GAP - Math.abs(cx)
          const oy = (a.h + b.h) / 2 + GAP - Math.abs(cy)
          if (ox <= 0 || oy <= 0) continue
          moved = true
          // Separate along the cheaper direction, half each.
          if (oy <= ox) {
            const sy = (cy === 0 ? (j > i ? 1 : -1) : Math.sign(cy)) * (oy / 2)
            a.dy -= sy
            b.dy += sy
          } else {
            const sx = (cx === 0 ? 1 : Math.sign(cx)) * (ox / 2)
            a.dx -= sx
            b.dx += sx
          }
        }
      if (!moved) break
    }
    for (const p of pts) if (p.el) p.el.style.transform = p.dx || p.dy ? `translate(${p.dx.toFixed(1)}px, ${p.dy.toFixed(1)}px)` : ''
  })
}

/** Width, depth and height pills on the selection's bounding box. */
export function SizeTags({ id }: { id: string }) {
  const node = useEditor((s) => s.nodes.find((n) => n.id === id))
  const ctx = usePrintContext()
  const box = useMemo(() => (node ? solidWorldBox(node, ctx.clearances) : null), [node, ctx.clearances])
  const els = useRef<(HTMLDivElement | null)[]>([null, null, null])
  const off = 6
  const anchors: Vec3[] = useMemo(() => {
    if (!box || box.isEmpty()) return []
    const { min, max } = box
    return [
      [(min.x + max.x) / 2, min.y - off, min.z],
      [max.x + off, (min.y + max.y) / 2, min.z],
      [max.x + off, min.y - off, (min.z + max.z) / 2],
    ]
  }, [box])
  useSpreadTags(anchors, els)
  if (!node || !box || box.isEmpty()) return null
  const { min, max } = box
  const commit = (axis: 0 | 1 | 2) => (v: number) => {
    const s = useEditor.getState()
    s.commit('Resize', 'size', mapNodes(s.nodes, id, (n) => resizeWorld(n, axis, v, ctx.clearances)))
  }
  const sizes = [max.x - min.x, max.y - min.y, max.z - min.z]
  const names = ['Width', 'Depth', 'Height']
  return (
    <group>
      {anchors.map((a, i) => (
        <Tag key={names[i]} axis={names[i]} position={a} value={sizes[i]} onCommit={commit(i as 0 | 1 | 2)} boxRef={(el) => (els.current[i] = el)} />
      ))}
    </group>
  )
}

const LABEL: Record<FitClass, string> = { press: 'Press', snug: 'Snug', slide: 'Slide', loose: 'Loose' }

/** Press / Snug / Slide / Loose pill on holes. The gap comes from calibration. */
export function FitTag({ id }: { id: string }) {
  const node = useEditor((s) => s.nodes.find((n) => n.id === id))
  const ctx = usePrintContext()
  const box = useMemo(() => (node ? nodeWorldBox(node, ctx.clearances) : null), [node, ctx.clearances])
  if (!node || node.type !== 'shape' || !node.hole || !box) return null
  const set = (f: FitClass | null) => useEditor.getState().updateNode(id, { fit: f }, f ? `Fit: ${LABEL[f]}` : 'Fit off', 'size')
  return (
    <Html position={[(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z + 6]} center zIndexRange={[20, 0]}>
      <div className="fit-tag" role="group" aria-label="Fit class" onClick={(e) => e.stopPropagation()}>
        {FIT_CLASSES.map((f) => (
          <button key={f} aria-pressed={node.fit === f} onClick={() => set(node.fit === f ? null : f)} title={`${LABEL[f]}: +${ctx.clearances[f].toFixed(2)} mm from ${ctx.calibrated ? 'your calibration' : 'defaults (not calibrated yet)'}`}>
            {LABEL[f]}
          </button>
        ))}
        <span className="gap">{node.fit ? `+${ctx.clearances[node.fit].toFixed(2)}` : 'exact'}</span>
      </div>
    </Html>
  )
}
