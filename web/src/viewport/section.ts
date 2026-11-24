import * as THREE from 'three'
import { create } from 'zustand'

/**
 * Section view: cuts the model with a plane across one bed axis so you can
 * look inside. Only the side at or below the cut (or above, when flipped) shows.
 */
interface SectionState {
  on: boolean
  axis: 0 | 1 | 2
  /** Cut position along the axis, in mm. Null puts it through the middle of the model. */
  at: number | null
  flip: boolean
  set: (p: Partial<Omit<SectionState, 'set'>>) => void
}

export const useSection = create<SectionState>((set) => ({ on: false, axis: 2, at: null, flip: false, set: (p) => set(p) }))

/** The one cutting plane every part material shares. */
export const SECTION_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
export const SECTION_PLANES = [SECTION_PLANE]
export const NO_PLANES: THREE.Plane[] = []

/** Faces lying exactly on the cut stay whole instead of flickering. */
const SLACK = 0.01

/** Cuts at `at` along `axis`, keeping the low side (`keepHigh` false) or the high side. */
export function placeSectionPlane(axis: 0 | 1 | 2, at: number, keepHigh: boolean) {
  const n = new THREE.Vector3(axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0)
  // Three keeps points where normal . p + constant >= 0.
  if (keepHigh) SECTION_PLANE.set(n, -at + SLACK)
  else SECTION_PLANE.set(n.negate(), at + SLACK)
}
