import { create } from 'zustand'

/** Measure tool: on while the ruler button is pressed. */
export const useMeasure = create<{ on: boolean; setOn: (on: boolean) => void }>((set) => ({
  on: false,
  setOn: (on) => set({ on }),
}))
