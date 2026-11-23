import { useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import { nodeWorldBox, solidWorldBox } from '../model/geometry'
import { mapNodes, resizeWorld } from '../model/ops'
import { FIT_CLASSES, type FitClass, type Vec3 } from '../model/types'
import { useEditor, usePrintContext } from '../store/editor'

const fmt = (v: number) => (Math.round(v * 100) / 100).toString()

function Tag({ position, value, axis, onCommit }: { position: Vec3; value: number; axis: string; onCommit: (v: number) => void }) {
  const [edit, setEdit] = useState<string | null>(null)
  return (
    <Html position={position} center zIndexRange={[20, 0]}>
      {edit === null ? (
        <button
          className="size-tag"
          title={`${axis} size. Click to edit`}
          onClick={(e) => {
            e.stopPropagation()
            setEdit(fmt(value))
          }}
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
    </Html>
  )
}

/** Width, depth and height pills on the selection's bounding box. */
export function SizeTags({ id }: { id: string }) {
  const node = useEditor((s) => s.nodes.find((n) => n.id === id))
  const ctx = usePrintContext()
  const box = useMemo(() => (node ? solidWorldBox(node, ctx.clearances) : null), [node, ctx.clearances])
  if (!node || !box || box.isEmpty()) return null
  const { min, max } = box
  const commit = (axis: 0 | 1 | 2) => (v: number) => {
    const s = useEditor.getState()
    s.commit('Resize', 'size', mapNodes(s.nodes, id, (n) => resizeWorld(n, axis, v, ctx.clearances)))
  }
  const off = 6
  return (
    <group>
      <Tag axis="Width" position={[(min.x + max.x) / 2, min.y - off, min.z]} value={max.x - min.x} onCommit={commit(0)} />
      <Tag axis="Depth" position={[max.x + off, (min.y + max.y) / 2, min.z]} value={max.y - min.y} onCommit={commit(1)} />
      <Tag axis="Height" position={[max.x + off, min.y - off, (min.z + max.z) / 2]} value={max.z - min.z} onCommit={commit(2)} />
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
