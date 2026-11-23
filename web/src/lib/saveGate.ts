// Lets the update notice wait for a pending autosave before reloading the page.
let flush: (() => Promise<void>) | null = null

export const registerFlush = (fn: (() => Promise<void>) | null) => {
  flush = fn
}

export const flushPendingSave = async () => {
  if (flush) await flush().catch(() => undefined)
}
