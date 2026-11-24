import { create } from 'zustand'
import type { CircularPatternOpts } from '../model/ops'

/** Pattern being set up in the inspector, previewed as ghosts on the canvas. */
export const usePatternPreview = create<{ opts: CircularPatternOpts | null }>(() => ({ opts: null }))
