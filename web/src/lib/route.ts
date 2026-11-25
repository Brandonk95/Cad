import { useEffect, useState } from 'react'

export type Route = { name: 'home' } | { name: 'project'; id: string }

const parse = (): Route => {
  const m = window.location.hash.match(/^#\/p\/([\w]+)/)
  return m ? { name: 'project', id: m[1] } : { name: 'home' }
}

/** A new part that isn't saved yet. It becomes a real project once something is added. */
export const DRAFT_ID = 'new'

export const go = (r: Route) => {
  window.location.hash = r.name === 'project' ? `#/p/${r.id}` : '#/'
}

export function useRoute() {
  const [r, setR] = useState<Route>(parse)
  useEffect(() => {
    const on = () => setR(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}
