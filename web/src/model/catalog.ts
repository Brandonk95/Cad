import { textAspect } from './text'
import type { Material, PrinterProfile, ScrewSize, ScrewType, ShapeKind, ShapeNode, Vec3 } from './types'

let counter = 0
export const uid = () => `n${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

// ISO metric hardware, sized for FDM. All values in mm.
export const SCREWS: Record<ScrewSize, {
  clearance: number
  tapped: number
  insert: number
  insertDepth: number
  nutAF: number
  nutThick: number
}> = {
  M2: { clearance: 2.4, tapped: 1.7, insert: 3.2, insertDepth: 4.0, nutAF: 4.0, nutThick: 1.6 },
  'M2.5': { clearance: 2.9, tapped: 2.1, insert: 3.6, insertDepth: 4.5, nutAF: 5.0, nutThick: 2.0 },
  M3: { clearance: 3.4, tapped: 2.6, insert: 4.0, insertDepth: 5.7, nutAF: 5.5, nutThick: 2.4 },
  M4: { clearance: 4.5, tapped: 3.4, insert: 5.6, insertDepth: 8.1, nutAF: 7.0, nutThick: 3.2 },
  M5: { clearance: 5.5, tapped: 4.3, insert: 6.4, insertDepth: 9.5, nutAF: 8.0, nutThick: 4.0 },
  M6: { clearance: 6.6, tapped: 5.1, insert: 8.0, insertDepth: 12.7, nutAF: 10.0, nutThick: 5.0 },
  M8: { clearance: 8.4, tapped: 6.9, insert: 10.0, insertDepth: 12.7, nutAF: 13.0, nutThick: 6.5 },
}
export const SCREW_SIZES = Object.keys(SCREWS) as ScrewSize[]
export const SCREW_TYPES: { id: ScrewType; label: string }[] = [
  { id: 'clearance', label: 'Clearance' },
  { id: 'tapped', label: 'Tapped' },
  { id: 'insert', label: 'Heat-set insert' },
  { id: 'nut', label: 'Captive nut' },
]

export const MAGNETS: { dia: number; thick: number }[] = [
  { dia: 3, thick: 2 }, { dia: 5, thick: 2 }, { dia: 6, thick: 2 }, { dia: 6, thick: 3 },
  { dia: 8, thick: 3 }, { dia: 10, thick: 2 }, { dia: 10, thick: 3 }, { dia: 12, thick: 3 },
]

export const screwHoleSize = (size: ScrewSize, type: ScrewType, depth: number): Vec3 => {
  const s = SCREWS[size]
  if (type === 'nut') {
    const r = s.nutAF / Math.sqrt(3)
    return [r * 2, r * 2, depth]
  }
  const d = type === 'clearance' ? s.clearance : type === 'tapped' ? s.tapped : s.insert
  return [d, d, depth]
}

const SOLID = '#C9CED6'
const round1 = (v: number) => Math.round(v * 10) / 10

export interface ShapeTemplate {
  kind: ShapeKind
  label: string
  key: string
  print?: boolean
  make: () => Omit<ShapeNode, 'id' | 'position'>
}

export const SHAPES: ShapeTemplate[] = [
  { kind: 'box', label: 'Box', key: 'B', make: () => ({ type: 'shape', kind: 'box', name: 'Box', rotation: [0, 0, 0], size: [20, 20, 20], hole: false, color: SOLID, params: {} }) },
  { kind: 'cylinder', label: 'Cylinder', key: 'C', make: () => ({ type: 'shape', kind: 'cylinder', name: 'Cylinder', rotation: [0, 0, 0], size: [20, 20, 20], hole: false, color: SOLID, params: { segments: 64 } }) },
  { kind: 'sphere', label: 'Sphere', key: 'O', make: () => ({ type: 'shape', kind: 'sphere', name: 'Sphere', rotation: [0, 0, 0], size: [20, 20, 20], hole: false, color: SOLID, params: {} }) },
  { kind: 'cone', label: 'Cone', key: 'K', make: () => ({ type: 'shape', kind: 'cone', name: 'Cone', rotation: [0, 0, 0], size: [20, 20, 20], hole: false, color: SOLID, params: { segments: 64, topRatio: 0 } }) },
  { kind: 'wedge', label: 'Wedge', key: 'W', make: () => ({ type: 'shape', kind: 'wedge', name: 'Wedge', rotation: [0, 0, 0], size: [20, 20, 20], hole: false, color: SOLID, params: {} }) },
  { kind: 'text', label: 'Text', key: 'T', make: () => ({ type: 'shape', kind: 'text', name: 'Text', rotation: [0, 0, 0], size: [round1(textAspect('Text') * 10), 10, 2], hole: false, color: SOLID, params: { text: 'Text' } }) },
]

export const PRINT_PRIMITIVES: ShapeTemplate[] = [
  {
    kind: 'screwHole', label: 'Screw hole', key: 'X', print: true,
    make: () => ({ type: 'shape', kind: 'screwHole', name: 'M3 screw hole', rotation: [0, 0, 0], size: screwHoleSize('M3', 'clearance', 10), hole: true, color: SOLID, fit: null, params: { screwSize: 'M3', screwType: 'clearance', segments: 48 } }),
  },
  {
    kind: 'magnetPocket', label: 'Magnet pocket', key: 'M', print: true,
    make: () => ({ type: 'shape', kind: 'magnetPocket', name: '6×3 magnet pocket', rotation: [0, 0, 0], size: [6, 6, 3.2], hole: true, color: SOLID, fit: 'press', params: { magnetDia: 6, magnetThick: 3, segments: 48 } }),
  },
  {
    kind: 'pin', label: 'Pin and hole', key: 'N', print: true,
    make: () => ({ type: 'shape', kind: 'pin', name: 'Pin', rotation: [0, 0, 0], size: [5, 5, 10], hole: false, color: SOLID, params: { segments: 48 } }),
  },
]

export const ALL_TEMPLATES = [...SHAPES, ...PRINT_PRIMITIVES]

export const FILAMENT_COLORS = ['#C9CED6', '#F4F5F7', '#2B2E34', '#E8C547', '#D9534F', '#4A90D9', '#5CB85C', '#9B59B6', '#E67E22', '#8B5A2B']

// Printer presets offered at setup. Bed sizes are the printable volume in mm.
export const PRINTER_PRESETS: Omit<PrinterProfile, 'id'>[] = [
  { name: 'Bambu Lab X1 / P1', technology: 'fdm', bed: [256, 256, 256], nozzle: 0.4, layer_min: 0.08, layer_max: 0.28, multi_material: true },
  { name: 'Bambu Lab A1', technology: 'fdm', bed: [256, 256, 256], nozzle: 0.4, layer_min: 0.08, layer_max: 0.28, multi_material: true },
  { name: 'Bambu Lab A1 mini', technology: 'fdm', bed: [180, 180, 180], nozzle: 0.4, layer_min: 0.08, layer_max: 0.28, multi_material: true },
  { name: 'Prusa MK4', technology: 'fdm', bed: [250, 210, 220], nozzle: 0.4, layer_min: 0.05, layer_max: 0.3, multi_material: false },
  { name: 'Prusa MINI+', technology: 'fdm', bed: [180, 180, 180], nozzle: 0.4, layer_min: 0.05, layer_max: 0.25, multi_material: false },
  { name: 'Creality Ender 3', technology: 'fdm', bed: [220, 220, 250], nozzle: 0.4, layer_min: 0.1, layer_max: 0.3, multi_material: false },
  { name: 'Voron 2.4 (350)', technology: 'fdm', bed: [350, 350, 340], nozzle: 0.4, layer_min: 0.1, layer_max: 0.3, multi_material: false },
  { name: 'Elegoo Saturn (resin)', technology: 'resin', bed: [218, 123, 250], nozzle: 0.05, layer_min: 0.025, layer_max: 0.1, multi_material: false },
  { name: 'Custom FDM printer', technology: 'fdm', bed: [220, 220, 220], nozzle: 0.4, layer_min: 0.1, layer_max: 0.3, multi_material: false },
]

// Used before the user is signed in or when the server has no materials yet.
export const FALLBACK_MATERIALS: Material[] = [
  { id: 'pla', name: 'PLA', kind: 'PLA', overhang_deg: 45, bridge_mm: 20, min_perimeters: 2, flex: 0.1, density: 1.24, price_per_kg: 20, color: '#C9CED6' },
  { id: 'petg', name: 'PETG', kind: 'PETG', overhang_deg: 40, bridge_mm: 12, min_perimeters: 2, flex: 0.3, density: 1.27, price_per_kg: 22, color: '#C9CED6' },
  { id: 'tpu', name: 'TPU 95A', kind: 'TPU', overhang_deg: 35, bridge_mm: 6, min_perimeters: 3, flex: 0.9, density: 1.21, price_per_kg: 30, color: '#C9CED6' },
  { id: 'abs', name: 'ABS / ASA', kind: 'ABS', overhang_deg: 40, bridge_mm: 15, min_perimeters: 2, flex: 0.25, density: 1.05, price_per_kg: 22, color: '#C9CED6' },
  { id: 'resin', name: 'Standard resin', kind: 'Resin', overhang_deg: 30, bridge_mm: 5, min_perimeters: 1, flex: 0.05, density: 1.12, price_per_kg: 35, color: '#C9CED6' },
]
