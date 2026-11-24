import type { Vec3 } from '../model/types'

/**
 * Where a new shape should land for a point on screen: the solid face under
 * it (with its outward normal), or the bed. The canvas registers the probe.
 */
export type DropTarget = { point: Vec3; normal: Vec3 }

let probe: ((clientX: number, clientY: number) => DropTarget | null) | null = null
export const setDropProbe = (p: typeof probe) => {
  probe = p
}
export const dropTargetAt = (clientX: number, clientY: number) => (probe ? probe(clientX, clientY) : null)

/** Last pointer position over the canvas, so a shortcut key drops the shape under the cursor. */
let hover: { x: number; y: number } | null = null
export const setCanvasHover = (h: typeof hover) => {
  hover = h
}
export const canvasHover = () => hover
