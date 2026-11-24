import { create } from 'zustand'
import type { PatternOpts } from '../model/ops'

interface PatternPreview {
  /** Pattern being set up in the inspector, previewed as ghosts on the canvas. */
  opts: PatternOpts | null
  /** While set, the next click on a part picks it instead of selecting it. */
  onPick: ((id: string) => void) | null
}

export const usePatternPreview = create<PatternPreview>(() => ({ opts: null, onPick: null }))
