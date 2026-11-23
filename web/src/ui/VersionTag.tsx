import { CURRENT_BUILD, CURRENT_VERSION } from '../lib/updates'

/** Small version label. Fixed to the bottom-right corner unless placed inline. */
export function VersionTag({ inline = false }: { inline?: boolean }) {
  const short = CURRENT_BUILD.length > 12 ? CURRENT_BUILD.slice(0, 7) : CURRENT_BUILD
  return (
    <span className={`version-tag${inline ? '' : ' fixed'}`} title={`Stratum ${CURRENT_VERSION} · build ${short}`}>
      v{CURRENT_VERSION}
    </span>
  )
}
