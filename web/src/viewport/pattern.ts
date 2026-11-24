import { create } from 'zustand'
import type { PatternOpts } from '../model/ops'

/** Pattern being set up in the inspector, previewed as ghosts on the canvas. */
export const usePatternPreview = create<{ opts: PatternOpts | null }>(() => ({ opts: null }))
