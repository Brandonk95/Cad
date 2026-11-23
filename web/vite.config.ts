import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface Release {
  version: string
  date: string
  changes: string[]
}

/** Reads ../CHANGELOG.md: "## 0.2.0 — 2026-11-23" headings with "- " bullets. */
function readReleases(): Release[] {
  const file = resolve(__dirname, '../CHANGELOG.md')
  if (!existsSync(file)) return [{ version: '0.0.0', date: '', changes: [] }]
  const releases: Release[] = []
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const h = line.match(/^##\s+v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.+))?$/)
    if (h) releases.push({ version: h[1], date: (h[2] ?? '').trim(), changes: [] })
    else if (releases.length && /^\s*[-*]\s+/.test(line)) releases[releases.length - 1].changes.push(line.replace(/^\s*[-*]\s+/, '').trim())
  }
  return releases.length ? releases : [{ version: '0.0.0', date: '', changes: [] }]
}

const releases = readReleases()
// One id per image build. CI passes the commit sha; local builds get a timestamp.
const build = process.env.STRATUM_BUILD || `${releases[0].version}+${Date.now().toString(36)}`

/** Emits /version.json, which running tabs poll to notice a new deploy. */
const versionFile = (): Plugin => ({
  name: 'stratum-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: releases[0].version, build, releases: releases.slice(0, 10) }, null, 2),
    })
  },
})

// In dev, PocketBase runs on :8090 and Vite proxies the API to it.
// In production, PocketBase serves the built files from pb_public.
export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __STRATUM_VERSION__: JSON.stringify(releases[0].version),
    __STRATUM_BUILD__: JSON.stringify(build),
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8090',
      '/_': 'http://127.0.0.1:8090',
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
})
