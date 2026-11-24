import * as THREE from 'three'

/**
 * Screen directions snapped to the bed's axes, so "forward", "left" and
 * "right" mean what they look like from where the camera is, like Tinkercad.
 */

export interface AxisDir {
  /** 0 = world X, 1 = world Y */
  axis: 0 | 1
  /** +1 or -1 along that axis */
  sign: 1 | -1
}

let camera: THREE.Camera | null = null
export const setViewCamera = (c: THREE.Camera | null) => {
  camera = c
}

const snap = (x: number, y: number): AxisDir =>
  Math.abs(x) >= Math.abs(y) ? { axis: 0, sign: x >= 0 ? 1 : -1 } : { axis: 1, sign: y >= 0 ? 1 : -1 }

/** Bed axes closest to "away from the camera" and "to the right on screen". */
export function viewAxes(): { forward: AxisDir; right: AxisDir } {
  if (!camera) return { forward: { axis: 1, sign: 1 }, right: { axis: 0, sign: 1 } }
  const dir = camera.getWorldDirection(new THREE.Vector3())
  let fx = dir.x
  let fy = dir.y
  // Looking almost straight down: screen-up decides what forward is.
  if (Math.hypot(fx, fy) < 0.2) {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    fx = up.x
    fy = up.y
  }
  const forward = snap(fx, fy)
  // Right on screen is forward turned a quarter clockwise seen from above.
  // Taken from the snapped forward so the two never land on the same axis.
  const f = forward.axis === 0 ? [forward.sign, 0] : [0, forward.sign]
  const right = snap(f[1], -f[0])
  return { forward, right }
}

/** World offset for a move of `screenRight` to the right and `screenForward` away from the camera. */
export function viewMove(screenRight: number, screenForward: number): [number, number] {
  const { forward, right } = viewAxes()
  const d: [number, number] = [0, 0]
  d[right.axis] += right.sign * screenRight
  d[forward.axis] += forward.sign * screenForward
  return d
}
