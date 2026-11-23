import { create } from 'zustand'
import { useMemo } from 'react'
import * as THREE from 'three'
import { ALL_TEMPLATES, FALLBACK_MATERIALS, PRINTER_PRESETS, uid } from '../model/catalog'
import { combine, cloneWithNewIds, dropToBed, findNode, mapNodes, removeNodes, rotateWorld, ungroup, round } from '../model/ops'
import { nodeWorldBox } from '../model/geometry'
import { DEFAULT_CLEARANCES, type Clearances, type Material, type PrintContext, type PrinterProfile, type SceneNode, type ShapeKind, type ShapeNode, type Vec3 } from '../model/types'
import type { Calibration } from '../lib/pb'
import type { Fix } from '../print/analyze'

export type HistoryIcon = ShapeKind | 'group' | 'ungroup' | 'move' | 'rotate' | 'size' | 'delete' | 'fix' | 'start' | 'hole' | 'color' | 'duplicate' | 'orient'

export interface HistoryEntry {
  label: string
  icon: HistoryIcon
  nodes: SceneNode[]
}

export interface Toast {
  id: string
  text: string
  tone?: 'ok' | 'warn' | 'info'
}

export type Mode = 'block' | 'sketch' | 'pro'
export type Theme = 'dark' | 'light'

interface EditorState {
  projectId: string | null
  projectName: string
  nodes: SceneNode[]
  selection: string[]
  history: HistoryEntry[]
  cursor: number
  dirty: number

  mode: Mode
  theme: Theme
  overlay: boolean
  shelfOpen: boolean
  transformMode: 'translate' | 'rotate'
  orientFor: string | null
  dialog: null | 'printer' | 'calibrate' | 'shortcuts'
  reducedMotion: boolean

  printers: PrinterProfile[]
  materials: Material[]
  calibrations: Calibration[]
  printerId: string | null
  materialId: string | null

  toasts: Toast[]

  // actions
  load: (id: string | null, name: string, nodes: SceneNode[]) => void
  setProjectName: (n: string) => void
  commit: (label: string, icon: HistoryIcon, nodes: SceneNode[], selection?: string[]) => void
  setLive: (nodes: SceneNode[]) => void
  undo: () => void
  redo: () => void
  jumpTo: (i: number) => void
  select: (ids: string[], additive?: boolean) => void
  add: (kind: ShapeKind) => void
  updateNode: (id: string, patch: Partial<ShapeNode> | Partial<SceneNode>, label?: string, icon?: HistoryIcon) => void
  removeSelected: () => void
  duplicateSelected: () => void
  combineSelected: () => void
  ungroupSelected: () => void
  toggleHole: () => void
  dropSelected: () => void
  rotateSelected: (axis: 'x' | 'y' | 'z', deg: number) => void
  nudge: (dx: number, dy: number, dz: number) => void
  applyFix: (fix: Fix) => void

  setMode: (m: Mode) => void
  setTheme: (t: Theme) => void
  toggleOverlay: () => void
  setShelfOpen: (b: boolean) => void
  setTransformMode: (m: 'translate' | 'rotate') => void
  setOrientFor: (id: string | null) => void
  setDialog: (d: EditorState['dialog']) => void
  setReducedMotion: (b: boolean) => void

  setLibrary: (p: PrinterProfile[], m: Material[], c: Calibration[]) => void
  setPrinterId: (id: string | null) => void
  setMaterialId: (id: string | null) => void
  upsertCalibration: (c: Calibration) => void
  upsertPrinter: (p: PrinterProfile) => void

  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

const pref = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem('stratum.' + k)
    return v === null ? d : (JSON.parse(v) as T)
  } catch {
    return d
  }
}
export const savePref = (k: string, v: unknown) => {
  try {
    localStorage.setItem('stratum.' + k, JSON.stringify(v))
  } catch {
    /* private mode */
  }
}

const GUEST_PRINTER: PrinterProfile = { id: 'guest', ...PRINTER_PRESETS[0] }

export const useEditor = create<EditorState>((set, get) => {
  const commitWith = (label: string, icon: HistoryIcon, nodes: SceneNode[], selection?: string[]) => {
    const { history, cursor } = get()
    const next = history.slice(0, cursor + 1).concat({ label, icon, nodes })
    set({ nodes, history: next, cursor: next.length - 1, dirty: get().dirty + 1, ...(selection ? { selection } : {}) })
  }
  const clr = () => contextOf(get()).clearances
  const topLevel = () => get().selection.filter((id) => get().nodes.some((n) => n.id === id))

  return {
    projectId: null,
    projectName: 'Untitled part',
    nodes: [],
    selection: [],
    history: [{ label: 'Start', icon: 'start', nodes: [] }],
    cursor: 0,
    dirty: 0,

    mode: 'block',
    theme: pref<Theme>('theme', 'dark'),
    overlay: pref('overlay', true),
    shelfOpen: pref('shelfOpen', true),
    transformMode: 'translate',
    orientFor: null,
    dialog: null,
    reducedMotion: pref('reducedMotion', false),

    printers: [],
    materials: FALLBACK_MATERIALS,
    calibrations: [],
    printerId: null,
    materialId: null,
    toasts: [],

    load: (id, name, nodes) =>
      set({ projectId: id, projectName: name, nodes, selection: [], history: [{ label: 'Opened', icon: 'start', nodes }], cursor: 0, dirty: 0 }),
    setProjectName: (projectName) => set({ projectName, dirty: get().dirty + 1 }),
    commit: commitWith,
    setLive: (nodes) => set({ nodes }),
    undo: () => {
      const { cursor, history } = get()
      if (cursor <= 0) return
      set({ cursor: cursor - 1, nodes: history[cursor - 1].nodes, dirty: get().dirty + 1, selection: [] })
    },
    redo: () => {
      const { cursor, history } = get()
      if (cursor >= history.length - 1) return
      set({ cursor: cursor + 1, nodes: history[cursor + 1].nodes, dirty: get().dirty + 1 })
    },
    jumpTo: (i) => {
      const { history } = get()
      if (i < 0 || i >= history.length) return
      set({ cursor: i, nodes: history[i].nodes, dirty: get().dirty + 1, selection: [] })
    },
    select: (ids, additive) => {
      if (!additive) return set({ selection: ids })
      const cur = new Set(get().selection)
      for (const id of ids) cur.has(id) ? cur.delete(id) : cur.add(id)
      set({ selection: [...cur] })
    },

    add: (kind) => {
      const t = ALL_TEMPLATES.find((x) => x.kind === kind)
      if (!t) return
      const base = t.make()
      // Place new shapes on the bed, next to whatever is already there.
      const box = get().nodes.reduce((b, n) => b.union(nodeWorldBox(n, clr())), new THREE.Box3())
      const x = box.isEmpty() ? 0 : round(box.max.x + base.size[0] / 2 + 5, 1)
      const node: ShapeNode = { ...base, id: uid(), position: [x, 0, base.size[2] / 2] }
      const added: SceneNode[] = [node]
      if (kind === 'pin') {
        // Pins come with their matching hole, sized from calibration.
        added.push({ ...node, id: uid(), kind: 'cylinder', name: 'Pin hole', hole: true, fit: 'slide', position: [x, node.size[1] + 5, node.size[2] / 2] })
      }
      commitWith(`Add ${t.label.toLowerCase()}`, kind, [...get().nodes, ...added], [node.id])
    },

    updateNode: (id, patch, label = 'Edit', icon = 'size') => {
      commitWith(label, icon, mapNodes(get().nodes, id, (n) => ({ ...n, ...patch }) as SceneNode))
    },

    removeSelected: () => {
      const ids = new Set(get().selection)
      if (!ids.size) return
      commitWith(ids.size > 1 ? `Delete ${ids.size} shapes` : 'Delete', 'delete', removeNodes(get().nodes, ids), [])
    },
    duplicateSelected: () => {
      const sel = topLevel()
      if (!sel.length) return
      const copies = sel.map((id) => {
        const n = findNode(get().nodes, id)!
        const c = cloneWithNewIds(n)
        const w = nodeWorldBox(n, clr())
        return { ...c, position: [round(c.position[0] + (w.max.x - w.min.x) + 5, 2), c.position[1], c.position[2]] as Vec3 }
      })
      commitWith('Duplicate', 'duplicate', [...get().nodes, ...copies], copies.map((c) => c.id))
    },
    combineSelected: () => {
      const sel = topLevel()
      if (sel.length < 2) return get().toast('Select two or more shapes to combine. Shift-click adds to the selection.', 'info')
      const picked = get().nodes.filter((n) => sel.includes(n.id))
      if (picked.every((n) => n.type === 'shape' && n.hole)) return get().toast('Holes need a solid to cut. Add a solid to the selection.', 'info')
      const { nodes, group } = combine(get().nodes, sel, clr())
      commitWith('Combine', 'group', nodes, group ? [group.id] : [])
    },
    ungroupSelected: () => {
      const sel = topLevel()
      const g = sel.map((id) => get().nodes.find((n) => n.id === id)).find((n) => n?.type === 'group')
      if (!g) return
      const { nodes, ids } = ungroup(get().nodes, g.id)
      commitWith('Ungroup', 'ungroup', nodes, ids)
    },
    toggleHole: () => {
      const sel = get().selection
      let nodes = get().nodes
      let changed = false
      for (const id of sel) {
        const n = findNode(nodes, id)
        if (n?.type === 'shape') {
          nodes = mapNodes(nodes, id, (x) => ({ ...(x as ShapeNode), hole: !(x as ShapeNode).hole }))
          changed = true
        }
      }
      if (changed) commitWith('Solid / hole', 'hole', nodes)
    },
    dropSelected: () => {
      const sel = topLevel()
      if (!sel.length) return
      let nodes = get().nodes
      for (const id of sel) nodes = mapNodes(nodes, id, (n) => dropToBed(n, clr()))
      commitWith('Drop to bed', 'move', nodes)
    },
    rotateSelected: (axis, deg) => {
      const sel = topLevel()
      if (!sel.length) return
      let nodes = get().nodes
      for (const id of sel) nodes = mapNodes(nodes, id, (n) => rotateWorld(n, axis, deg))
      commitWith(`Rotate ${deg}° ${axis.toUpperCase()}`, 'rotate', nodes)
    },
    nudge: (dx, dy, dz) => {
      const sel = topLevel()
      if (!sel.length) return
      let nodes = get().nodes
      for (const id of sel)
        nodes = mapNodes(nodes, id, (n) => ({ ...n, position: [round(n.position[0] + dx), round(n.position[1] + dy), round(n.position[2] + dz)] }))
      commitWith('Move', 'move', nodes)
    },

    applyFix: (fix) => {
      const s = get()
      const nodes = s.nodes
      switch (fix.type) {
        case 'select':
          return set({ selection: [fix.nodeId] })
        case 'combine': {
          const { nodes: out, group } = combine(nodes, fix.ids, clr())
          return commitWith('Combine', 'group', out, group ? [group.id] : [])
        }
        case 'drop':
          return commitWith('Drop to bed', 'fix', mapNodes(nodes, fix.nodeId, (n) => dropToBed(n, clr())))
        case 'center': {
          const n = findNode(nodes, fix.nodeId)!
          const b = nodeWorldBox(n, clr())
          const c = b.getCenter(b.min.clone())
          return commitWith('Center on bed', 'fix', mapNodes(nodes, fix.nodeId, (x) => ({ ...x, position: [round(x.position[0] - c.x), round(x.position[1] - c.y), x.position[2]] })))
        }
        case 'rotate90':
          return commitWith('Rotate 90°', 'fix', mapNodes(nodes, fix.nodeId, (n) => rotateWorld(n, 'z', 90)))
        case 'orient':
          return set({ orientFor: fix.nodeId, selection: [fix.nodeId] })
        case 'setSize':
          return commitWith('Thicken', 'fix', mapNodes(nodes, fix.nodeId, (n) => ({ ...n, size: fix.size }) as SceneNode))
        case 'remove':
          return commitWith('Remove tiny feature', 'fix', removeNodes(nodes, new Set([fix.nodeId])))
        case 'teardrop':
          return commitWith('Teardrop hole', 'fix', mapNodes(nodes, fix.nodeId, (n) => ({ ...(n as ShapeNode), params: { ...(n as ShapeNode).params, teardrop: true, sacrificial: false } })))
        case 'bridgeLayer':
          return commitWith('Bridged hole', 'fix', mapNodes(nodes, fix.nodeId, (n) => ({ ...(n as ShapeNode), params: { ...(n as ShapeNode).params, sacrificial: true, teardrop: false } })))
      }
    },

    setMode: (mode) => set({ mode }),
    setTheme: (theme) => {
      savePref('theme', theme)
      set({ theme })
    },
    toggleOverlay: () => {
      savePref('overlay', !get().overlay)
      set({ overlay: !get().overlay })
    },
    setShelfOpen: (b) => {
      savePref('shelfOpen', b)
      set({ shelfOpen: b })
    },
    setTransformMode: (transformMode) => set({ transformMode }),
    setOrientFor: (orientFor) => set({ orientFor }),
    setDialog: (dialog) => set({ dialog }),
    setReducedMotion: (b) => {
      savePref('reducedMotion', b)
      set({ reducedMotion: b })
    },

    setLibrary: (printers, materials, calibrations) => {
      const printerId = get().printerId && printers.some((p) => p.id === get().printerId) ? get().printerId : printers[0]?.id ?? null
      const mats = materials.length ? materials : FALLBACK_MATERIALS
      const materialId = get().materialId && mats.some((m) => m.id === get().materialId) ? get().materialId : mats[0].id
      set({ printers, materials: mats, calibrations, printerId, materialId })
    },
    setPrinterId: (printerId) => set({ printerId, dirty: get().dirty + 1 }),
    setMaterialId: (materialId) => set({ materialId, dirty: get().dirty + 1 }),
    upsertCalibration: (c) => set({ calibrations: [...get().calibrations.filter((x) => x.id !== c.id), c] }),
    upsertPrinter: (p) => {
      const exists = get().printers.some((x) => x.id === p.id)
      set({ printers: exists ? get().printers.map((x) => (x.id === p.id ? p : x)) : [...get().printers, p], printerId: p.id })
    },

    toast: (text, tone = 'info') => {
      const id = uid()
      set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] })
      setTimeout(() => get().dismissToast(id), 4200)
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  }
})

export function contextOf(s: Pick<EditorState, 'printers' | 'materials' | 'calibrations' | 'printerId' | 'materialId'>): PrintContext {
  const printer = s.printers.find((p) => p.id === s.printerId) ?? GUEST_PRINTER
  const material = s.materials.find((m) => m.id === s.materialId) ?? s.materials[0] ?? FALLBACK_MATERIALS[0]
  const cal = s.calibrations.find((c) => c.printer === printer.id && c.material === material.id)
  const clearances: Clearances = cal?.clearances ?? DEFAULT_CLEARANCES
  return { printer, material, clearances, calibrated: !!cal }
}

/** Stable selector for the print context. */
export const usePrintContext = () => {
  const printers = useEditor((s) => s.printers)
  const materials = useEditor((s) => s.materials)
  const calibrations = useEditor((s) => s.calibrations)
  const printerId = useEditor((s) => s.printerId)
  const materialId = useEditor((s) => s.materialId)
  return useMemoCtx(printers, materials, calibrations, printerId, materialId)
}

const useMemoCtx = (printers: PrinterProfile[], materials: Material[], calibrations: Calibration[], printerId: string | null, materialId: string | null) =>
  useMemo(() => contextOf({ printers, materials, calibrations, printerId, materialId }), [printers, materials, calibrations, printerId, materialId])
