/// <reference path="../pb_data/types.d.ts" />

// The app shell must revalidate so upgrades show up right away.
// Hashed build assets never change, so they can be cached for a year.
routerUse((e) => {
  const path = e.request.url.path
  if (!path.startsWith("/api/") && !path.startsWith("/_/")) {
    e.response.header().set(
      "Cache-Control",
      path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    )
  }
  return e.next()
})
