import { useEffect, useMemo } from 'react'
import { closedModel } from '../model/ops'
import { create } from 'zustand'
import { worldBodies, type Body } from '../model/geometry'
import { analyze, type Analysis } from '../print/analyze'
import { useEditor, usePrintContext } from './editor'

interface AnalysisState {
  bodies: Body[]
  analysis: Analysis | null
  busy: boolean
}

export const useAnalysis = create<AnalysisState>(() => ({ bodies: [], analysis: null, busy: false }))

/** Re-checks the whole model shortly after every edit or printer change. */
export function useLiveAnalysis() {
  const live = useEditor((s) => s.nodes)
  const stack = useEditor((s) => s.groupEdit)
  const ctx = usePrintContext()
  // A part opened for editing is checked (and exported) as it will print: put back together.
  const nodes = useMemo(() => (stack.length ? closedModel(live, stack, ctx.clearances) : live), [live, stack, ctx.clearances])
  useEffect(() => {
    useAnalysis.setState({ busy: true })
    const t = setTimeout(() => {
      try {
        const bodies = worldBodies(nodes, ctx.clearances)
        const analysis = analyze(nodes, bodies, ctx)
        useAnalysis.setState({ bodies, analysis, busy: false })
      } catch (e) {
        console.error('analysis failed', e)
        useAnalysis.setState({ busy: false })
      }
    }, 140)
    return () => clearTimeout(t)
  }, [nodes, ctx])
}
