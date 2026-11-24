import { create } from 'zustand'

export type SketchTool = 'select' | 'rect' | 'circle' | 'line'

export const SKETCH_TOOLS: { id: SketchTool; label: string; key: string; icon: 'pointer' | 'rect' | 'circle' | 'line'; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: 'pointer', hint: 'Click a part to select it. Pick a drawing tool to sketch.' },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: 'rect', hint: 'Click one corner, then the opposite corner.' },
  { id: 'circle', label: 'Circle', key: 'C', icon: 'circle', hint: 'Click the center, then click to set the size.' },
  { id: 'line', label: 'Line', key: 'L', icon: 'line', hint: 'Click each corner. Click the first point or press Enter to close.' },
]

interface SketchState {
  tool: SketchTool
  /** Live instruction shown over the canvas */
  hint: string | null
  setTool: (t: SketchTool) => void
  setHint: (h: string | null) => void
}

export const useSketch = create<SketchState>((set) => ({
  tool: 'rect',
  hint: null,
  setTool: (tool) => set({ tool }),
  setHint: (hint) => set({ hint }),
}))
