import { create } from 'zustand'
import { createProject, me } from '../lib/pb'
import { go } from '../lib/route'
import { useEditor } from '../store/editor'
import { TOUR } from './steps'

interface TourState {
  active: boolean
  step: number
  /** Set when a tour project is being opened; the editor starts the tour once it loads. */
  pending: boolean
  start: () => void
  next: () => void
  back: () => void
  stop: (finished?: boolean) => void
}

const key = () => `stratum.tour.${me()?.id ?? 'anon'}`

/** 'done' after finishing, 'off' after "Don't ask again". */
export const tourStatus = (): string | null => {
  try {
    return localStorage.getItem(key())
  } catch {
    return null
  }
}
export const setTourStatus = (v: 'done' | 'off') => {
  try {
    localStorage.setItem(key(), v)
  } catch {
    /* storage blocked */
  }
}

export const useTour = create<TourState>((set, get) => ({
  active: false,
  step: 0,
  pending: false,
  start: () => set({ active: true, step: 0, pending: false }),
  next: () => {
    const step = get().step + 1
    if (step >= TOUR.length) return get().stop(true)
    set({ step })
  },
  back: () => set({ step: Math.max(0, get().step - 1) }),
  stop: (finished) => {
    if (finished) {
      setTourStatus('done')
      useEditor.getState().toast('Tour done. Replay it any time from the keyboard shortcuts menu (?).', 'ok')
    }
    set({ active: false, step: 0, pending: false })
  },
}))

/** Opens a fresh practice part and runs the tour in it, so real projects stay untouched. */
export async function startTour() {
  const s = useEditor.getState()
  try {
    const p = await createProject('My first part', s.printerId ?? undefined, s.materialId ?? undefined)
    s.setDialog(null)
    useTour.setState({ pending: true, active: false, step: 0 })
    go({ name: 'project', id: p.id })
  } catch (e) {
    s.toast(`Couldn't start the tour: ${(e as Error).message}`, 'warn')
  }
}
