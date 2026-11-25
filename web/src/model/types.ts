// The Stratum document model. One model, three depths: Block mode edits this
// tree directly. Sketch mode draws outlines that become ordinary shapes (box,
// cylinder or extrude) in the same tree, so Block mode can edit them too.

export type Vec3 = [number, number, number]

export type FitClass = 'press' | 'snug' | 'slide' | 'loose'
export const FIT_CLASSES: FitClass[] = ['press', 'snug', 'slide', 'loose']

export type ShapeKind =
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'cone'
  | 'wedge'
  | 'screwHole'
  | 'magnetPocket'
  | 'pin'
  /** Closed outline drawn in Sketch mode, pulled straight up */
  | 'extrude'
  /** Raised letters, or engraved ones as a hole */
  | 'text'
  /** Rocket nose cone turned around Z, tip up, with an optional shoulder */
  | 'nosecone'
  /** Rocketry: tube, fins on a sleeve, reducer, tube joiner, motor mount ring, bulkhead with eye, rod guide */
  | 'bodytube'
  | 'fincan'
  | 'transition'
  | 'coupler'
  | 'centeringring'
  | 'bulkhead'
  | 'launchlug'

export type ScrewSize = 'M2' | 'M2.5' | 'M3' | 'M4' | 'M5' | 'M6' | 'M8'
export type ScrewType = 'clearance' | 'tapped' | 'insert' | 'nut'

export interface ShapeParams {
  /** Cylinder / cone segment count */
  segments?: number
  /** Cone top radius ratio 0..1 */
  topRatio?: number
  /** Screw hole */
  screwSize?: ScrewSize
  screwType?: ScrewType
  /** Horizontal holes: teardrop profile so the top prints without support */
  teardrop?: boolean
  /** Horizontal holes: one sacrificial bridge layer (drilled out after print) */
  sacrificial?: boolean
  /** Magnet pocket */
  magnetDia?: number
  magnetThick?: number

  // Details (basic shapes). All lengths in mm.
  /** Box: radius of the vertical corners */
  cornerRadius?: number
  /** Box, cylinder, pin: chamfer or fillet on the top and bottom edges */
  edge?: number
  edgeStyle?: 'chamfer' | 'round'
  /** Sphere: flat-bottomed dome */
  half?: boolean
  /** Hollow shell */
  hollow?: boolean
  /** Side and top wall thickness */
  wall?: number
  /** Bottom thickness */
  floor?: number
  /** Which faces are left open: none, the top, or top and bottom (a tube) */
  opening?: 'closed' | 'top' | 'both'

  /** Extrude: outline points, scaled so the outline fills -0.5..0.5 on X and Y (counter-clockwise) */
  profile?: [number, number][]
  /** Text: the letters */
  text?: string
  /** Text: drawn mirror-image (set by Mirror) */
  flipX?: boolean
  /** Nose cone profile */
  noseShape?: 'cone' | 'ogive' | 'parabolic' | 'elliptical' | 'haack'
  /** Nose cone shoulder length as a share of the height (0 = none) */
  shoulder?: number
  /** Nose cone shoulder diameter as a share of the base diameter */
  shoulderRatio?: number
  /** Nose cone hollow wall in mm, open at the bottom (0 = solid) */
  noseWall?: number

  // Rocketry parts. Lengths in mm.
  /** Body tube wall; for coupler and transition, the wall of the tube they slide into */
  tubeWall?: number
  /** Bore: centering ring (motor tube ⌀), launch lug (rod bore), fin can (tube ⌀ it slides over) */
  innerDia?: number
  /** Coupler's own wall and the length of its centre band */
  couplerWall?: number
  band?: number
  /** Transition top ⌀, shoulder length at each end, and hollow wall (0 = solid) */
  topDia?: number
  shoulderLen?: number
  transWall?: number
  /** Bulkhead plate thickness and shock cord eye */
  plate?: number
  eyelet?: boolean
  /** Fin can */
  finCount?: number
  finShape?: 'trapezoid' | 'elliptical'
  finTip?: number
  finSweep?: number
  finThick?: number
  finFillet?: number
  /** Sleeve wall around the tube (0 = fins only) */
  finSleeve?: number
}

export interface ShapeNode {
  id: string
  type: 'shape'
  kind: ShapeKind
  name: string
  /** Center of the shape's local bounding box, in mm */
  position: Vec3
  /** Euler XYZ, degrees */
  rotation: Vec3
  /** Full extents along local X, Y, Z in mm (nominal, before fit clearance) */
  size: Vec3
  hole: boolean
  color: string
  /** Fit class for holes. Clearance comes from calibration, never typed. */
  fit?: FitClass | null
  params: ShapeParams
}

export interface GroupNode {
  id: string
  type: 'group'
  name: string
  position: Vec3
  rotation: Vec3
  color: string
  children: SceneNode[]
}

export type SceneNode = ShapeNode | GroupNode

export interface ModelDoc {
  version: 1
  units: 'mm'
  nodes: SceneNode[]
}

export const emptyModel = (): ModelDoc => ({ version: 1, units: 'mm', nodes: [] })

// ---------------------------------------------------------------------------
// Printer, material, calibration (mirrors PocketBase collections)

export type Technology = 'fdm' | 'resin' | 'sls'

export interface PrinterProfile {
  id: string
  name: string
  technology: Technology
  bed: Vec3
  nozzle: number
  layer_min: number
  layer_max: number
  multi_material: boolean
}

export interface Material {
  id: string
  name: string
  kind: string
  /** Max overhang from vertical, degrees */
  overhang_deg: number
  /** Max unsupported bridge span, mm */
  bridge_mm: number
  /** Minimum perimeters for a wall */
  min_perimeters: number
  /** 0 rigid .. 1 very flexible */
  flex: number
  density: number
  price_per_kg: number
  color: string
}

/** Diametral clearance in mm per fit class */
export type Clearances = Record<FitClass, number>

export const DEFAULT_CLEARANCES: Clearances = {
  press: 0.05,
  snug: 0.15,
  slide: 0.25,
  loose: 0.4,
}

export interface PrintContext {
  printer: PrinterProfile
  material: Material
  clearances: Clearances
  calibrated: boolean
}

export const lineWidth = (p: PrinterProfile) => p.nozzle * 1.125
export const wallMin = (p: PrinterProfile, m: Material) => lineWidth(p) * m.min_perimeters
