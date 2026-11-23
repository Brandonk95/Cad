import { uid } from '../model/catalog'
import type { SceneNode } from '../model/types'

/** Diametral clearances tested by the coupon, left to right. Hole 1 is next to the notch. */
export const COUPON_STEPS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35]
export const COUPON_PEG = 5

const SOLID = '#C9CED6'

/**
 * Calibration coupon: one plate with eight 5 mm holes, each 0.05 mm bigger than
 * the last, and one 5 mm peg. About ten minutes on a typical FDM printer.
 */
export function couponNodes(): SceneNode[] {
  const pitch = 9
  const width = pitch * COUPON_STEPS.length + 4
  const holes: SceneNode[] = COUPON_STEPS.map((c, i) => ({
    id: uid(), type: 'shape', kind: 'cylinder', name: `Hole ${i + 1}`,
    position: [-width / 2 + 2 + pitch / 2 + i * pitch, 0, 2], rotation: [0, 0, 0],
    size: [COUPON_PEG + c, COUPON_PEG + c, 4.2], hole: true, color: SOLID, fit: null, params: { segments: 64 },
  }))
  // Tally marks: hole N has N small dimples beside it so you can count without labels.
  const marks: SceneNode[] = []
  COUPON_STEPS.forEach((_, i) => {
    for (let k = 0; k <= i; k++) {
      const col = k % 4
      const row = Math.floor(k / 4)
      marks.push({
        id: uid(), type: 'shape', kind: 'box', name: 'Mark', position: [-width / 2 + 2 + pitch / 2 + i * pitch - 3 + col * 2, 5 + row * 1.6, 3.6],
        rotation: [0, 0, 0], size: [1, 1, 1], hole: true, color: SOLID, fit: null, params: {},
      })
    }
  })
  const plate: SceneNode = {
    id: uid(), type: 'group', name: 'Fit coupon', position: [0, 0, 0], rotation: [0, 0, 0], color: SOLID,
    children: [
      { id: uid(), type: 'shape', kind: 'box', name: 'Plate', position: [0, 1.5, 2], rotation: [0, 0, 0], size: [width, 17, 4], hole: false, color: SOLID, params: {} },
      ...holes,
      ...marks,
    ],
  }
  const peg: SceneNode = {
    id: uid(), type: 'shape', kind: 'pin', name: '5 mm peg', position: [0, 18, 6], rotation: [0, 0, 0],
    size: [COUPON_PEG, COUPON_PEG, 12], hole: false, color: SOLID, params: { segments: 64 },
  }
  return [plate, peg]
}
