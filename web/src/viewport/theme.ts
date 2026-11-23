import { useEffect, useState } from 'react'
import { useEditor } from '../store/editor'

const KEYS = ['bg-canvas', 'bed', 'grid-minor', 'grid-major', 'model', 'accent', 'text-secondary', 'border', 'print-overhang', 'print-thin', 'print-bridge', 'print-tiny', 'print-ok', 'print-support'] as const
export type ThemeColors = Record<(typeof KEYS)[number], string>

const read = (): ThemeColors => {
  const cs = getComputedStyle(document.documentElement)
  return Object.fromEntries(KEYS.map((k) => [k, cs.getPropertyValue('--' + k).trim() || '#888'])) as ThemeColors
}

/** Canvas colors come from the same CSS tokens as the rest of the UI. */
export function useThemeColors() {
  const theme = useEditor((s) => s.theme)
  const [c, setC] = useState<ThemeColors>(read)
  useEffect(() => {
    const id = requestAnimationFrame(() => setC(read()))
    return () => cancelAnimationFrame(id)
  }, [theme])
  return c
}
