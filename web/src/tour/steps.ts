import * as THREE from 'three'
import { nodeWorldBox } from '../model/geometry'
import { mapNodes } from '../model/ops'
import type { SceneNode, ShapeNode } from '../model/types'
import { contextOf, useEditor } from '../store/editor'

type EditorState = ReturnType<typeof useEditor.getState>

export interface TourStep {
  id: string
  /** data-tour attribute of the element to point at; omit for a centered card */
  anchor?: string
  place: 'right' | 'left' | 'below' | 'above' | 'canvas'
  title: string
  body: string
  /** When set, the step waits for the user to do this and advances on its own. */
  done?: (s: EditorState) => boolean
  /** "Do it for me" for steps that wait on the user */
  assist?: { label: string; run: (s: EditorState) => void }
}

const shapes = (s: EditorState, kind: ShapeNode['kind']) =>
  s.nodes.filter((n): n is ShapeNode => n.type === 'shape' && n.kind === kind)

const contains = (n: SceneNode, kind: ShapeNode['kind']): boolean =>
  n.type === 'group' ? n.children.some((c) => contains(c, kind)) : n.kind === kind

const combinedWithHole = (s: EditorState) => s.nodes.some((n) => n.type === 'group' && contains(n, 'screwHole'))
const firstSolid = (s: EditorState) => s.nodes.find((n) => n.type === 'group' || !n.hole)

export const TOUR: TourStep[] = [
  {
    id: 'printer',
    anchor: 'printer',
    place: 'below',
    title: 'This is your printer',
    body: 'Every hole, wall and overhang is checked against it as you model. Switch printer or material here at any time.',
  },
  {
    id: 'box',
    anchor: 'tool-box',
    place: 'right',
    title: 'Add a box',
    body: 'Click Box, or just press B.',
    done: (s) => shapes(s, 'box').length > 0 || s.nodes.some((n) => contains(n, 'box')),
    assist: { label: 'Add it for me', run: (s) => s.add('box') },
  },
  {
    id: 'size',
    anchor: 'canvas',
    place: 'canvas',
    title: 'Set exact sizes',
    body: 'Click the box, then click a number tag next to it and type a size. Try making it 40 mm wide. The inspector on the right works too.',
    done: (s) => shapes(s, 'box').some((b) => b.size.some((v) => Math.abs(v - 20) > 1e-6)) || combinedWithHole(s),
    assist: {
      label: 'Make it 40 mm wide',
      run: (s) => {
        const b = shapes(s, 'box')[0]
        if (b) s.updateNode(b.id, { size: [40, b.size[1], b.size[2]] }, 'Resize', 'size')
      },
    },
  },
  {
    id: 'screw',
    anchor: 'tool-screwHole',
    place: 'right',
    title: 'Add a screw hole',
    body: 'Print primitives know real hardware. This one is an M3 clearance hole; you can switch it to tapped, heat-set insert or captive nut. Click Screw hole or press X.',
    done: (s) => s.nodes.some((n) => contains(n, 'screwHole')),
    assist: { label: 'Add it for me', run: (s) => s.add('screwHole') },
  },
  {
    id: 'place',
    anchor: 'canvas',
    place: 'canvas',
    title: 'Put the hole in the box',
    body: 'Holes only cut where they overlap a solid. Click the hole and drag its arrows into the box. Arrow keys nudge it 1 mm at a time.',
    done: (s) => {
      if (combinedWithHole(s)) return true
      const clr = contextOf(s).clearances
      const hole = shapes(s, 'screwHole')[0]
      if (!hole) return false
      const hb = nodeWorldBox(hole, clr)
      return s.nodes.some((n) => n.id !== hole.id && (n.type === 'group' || !n.hole) && nodeWorldBox(n, clr).intersectsBox(hb))
    },
    assist: {
      label: 'Move it for me',
      run: (s) => {
        const hole = shapes(s, 'screwHole')[0]
        const solid = firstSolid(s)
        if (!hole || !solid) return
        const b = nodeWorldBox(solid, contextOf(s).clearances)
        const c = b.getCenter(new THREE.Vector3())
        const h = b.max.z - b.min.z
        s.commit(
          'Move',
          'move',
          mapNodes(s.nodes, hole.id, (n) => ({ ...(n as ShapeNode), position: [c.x, c.y, c.z], rotation: [0, 0, 0], size: [hole.size[0], hole.size[1], h + 2] })),
          [hole.id],
        )
      },
    },
  },
  {
    id: 'combine',
    anchor: 'print-panel',
    place: 'left',
    title: 'Combine to cut it',
    body: 'Shift-click the box and the hole, then press G. Or use the "Combine with" fix that Print check is offering.',
    done: combinedWithHole,
    assist: {
      label: 'Combine for me',
      run: (s) => {
        const hole = shapes(s, 'screwHole')[0]
        const solid = firstSolid(s)
        if (hole && solid) s.applyFix({ type: 'combine', ids: [solid.id, hole.id] })
      },
    },
  },
  {
    id: 'check',
    anchor: 'print-panel',
    place: 'left',
    title: 'Print check has your back',
    body: 'It watches for overhangs, thin walls, long bridges and parts that hang off the bed. The colors painted on the model match these cards, and most come with a one-click fix. Press P to hide the colors.',
  },
  {
    id: 'calibrate',
    anchor: 'printer',
    place: 'below',
    title: 'Fits that work first time',
    body: 'Holes can be Press, Snug, Slide or Loose. Print the 10 minute fit coupon once from this menu and every fit matches your printer.',
  },
  {
    id: 'send',
    anchor: 'send',
    place: 'below',
    title: 'Send it to your slicer',
    body: 'When it looks right, export a 3MF for Bambu Studio, PrusaSlicer, OrcaSlicer or Cura. That is the whole loop. Happy printing.',
  },
]
