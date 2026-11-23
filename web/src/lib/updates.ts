import { useEffect, useState } from 'react'

export const CURRENT_VERSION = __STRATUM_VERSION__
export const CURRENT_BUILD = __STRATUM_BUILD__
export const CHECK_EVERY_MS = 5 * 60 * 1000

interface Release {
  version: string
  date: string
  changes: string[]
}
interface VersionFile {
  version: string
  build: string
  releases: Release[]
}

export interface Update {
  version: string
  build: string
  changes: string[]
}

const KEY_OFF = 'stratum.updateNotices'
const KEY_SEEN = 'stratum.updateDismissedBuild'

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* storage blocked: notices still work for this tab */
  }
}

export const noticesEnabled = () => read(KEY_OFF) !== 'off'
export const setNoticesEnabled = (on: boolean) => write(KEY_OFF, on ? null : 'off')
export const dismissBuild = (build: string) => write(KEY_SEEN, build)

const newer = (a: string, b: string) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

/** Short list of what changed between the running version and the deployed one. */
const summarize = (v: VersionFile): string[] => {
  const fresh = v.releases.filter((r) => newer(r.version, CURRENT_VERSION))
  const lines = fresh.flatMap((r) => r.changes)
  if (!lines.length) return ['Fixes and small improvements.']
  return lines.length > 4 ? [...lines.slice(0, 3), `And ${lines.length - 3} more changes.`] : lines
}

async function check(): Promise<Update | null> {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  const v = (await res.json()) as VersionFile
  if (!v.build || v.build === CURRENT_BUILD) return null
  return { version: v.version, build: v.build, changes: summarize(v) }
}

/**
 * Polls /version.json every 5 minutes (and when the tab comes back into view).
 * Returns the waiting update unless the user dismissed that build or turned notices off.
 */
export function useUpdateCheck() {
  const [update, setUpdate] = useState<Update | null>(null)
  const [, force] = useState(0)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let alive = true
    const run = () =>
      check()
        .then((u) => alive && setUpdate(u))
        .catch(() => undefined) // server restarting mid-update; try again next round
    const first = setTimeout(run, 15_000)
    const timer = setInterval(run, CHECK_EVERY_MS)
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    const onPrefs = () => force((n) => n + 1)
    window.addEventListener('stratum:update-prefs', onPrefs)
    return () => {
      alive = false
      clearTimeout(first)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('stratum:update-prefs', onPrefs)
    }
  }, [])

  const visible = update && noticesEnabled() && read(KEY_SEEN) !== update.build ? update : null
  return { update: visible, refresh: () => force((n) => n + 1) }
}
