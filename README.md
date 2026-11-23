# Stratum

Browser-based CAD built only for 3D printing. Your printer, material and measured fits are design inputs, not export settings. The design doc is [Stratum 3D Print-First CAD Platform Design.md](Stratum%203D%20Print-First%20CAD%20Platform%20Design.md).

This is the **MVP loop in Block mode**: set up the printer, calibrate fits, model, see print problems live, export.

## What works today

| Area | Status |
| --- | --- |
| Printer profiles | Presets (Bambu, Prusa, Creality, Voron, resin) or custom. Badge in the top bar; switching re-checks the model. |
| Materials | PLA, PETG, TPU, ABS/ASA, resin seeded with overhang limit, bridge span, min perimeters, density, price. |
| Fit calibration | 10 minute coupon (one 5 mm peg, eight holes in 0.05 mm steps, counted by dimples). Pick Press / Snug / Slide, saved per printer + material. |
| Block mode | Box, cylinder, sphere, cone, wedge. Solid / hole, Combine (union then cut), ungroup, duplicate, move / rotate handles with snapping, size tags on canvas, undo history strip. |
| Print primitives | Screw hole M2 to M8 (clearance, tapped, heat-set insert, captive nut), magnet pocket, pin with matching hole. |
| Fit classes | Any hole gets Press / Snug / Slide / Loose. Clearance comes from calibration, never typed. |
| Live print overlay (P) | Overhang (orange stripes), thin wall (red crosshatch, ray-cast thickness), long bridge (purple dots), below nozzle size (blue lines), pulsing dot on the worst spot. Patterns make it work without color. |
| One-click fixes | Drop to bed, center on bed, rotate to fit, thicken to minimum, enlarge or remove tiny features, teardrop or bridged profile for sideways holes, combine a loose hole. |
| Orientation | Suggest ranks six lay-flat options by support area, then height / time. |
| Estimates | Time, grams, cost. Labeled as estimates. |
| Output | 3MF (per-part objects, colors) and STL. Selected-part export. |
| Storage | PocketBase: users, printers, materials, calibrations, projects (model JSON + thumbnail). Autosave. Per-user access rules. |
| UI | Design language tokens (dark default, light theme), Inter + JetBrains Mono self-hosted, 1.5 px icons with the layered-line motif on print primitives, single-key shortcuts (press `?`), reduced motion. |

Sketch and Pro modes are visible in the mode switch but disabled until the next phase.

## Run on CasaOS

The container serves both the app and the API on port 8090. Data lives in `/DATA/AppData/stratum/pb_data`.

**Option A: build on the CasaOS box** (no registry needed). Copy this folder to the server, then:

```sh
docker compose up -d --build
```

**Option B: prebuilt image with auto-updates (recommended).** Every push to `master` runs [.github/workflows/image.yml](.github/workflows/image.yml), which publishes `ghcr.io/brandonk95/stratum` for amd64 and arm64. In CasaOS go to App Store, Custom Install, Import, and paste [casaos/docker-compose.yml](casaos/docker-compose.yml).

The CasaOS dashboard icon is [assets/icon.svg](assets/icon.svg), served from this public repo.

### Auto-updates

[casaos/docker-compose.yml](casaos/docker-compose.yml) includes [Watchtower](https://github.com/nicholas-fedor/watchtower) (the maintained fork; the original `containrrr/watchtower` doesn't work with Docker 29+). It checks GHCR every 5 minutes and restarts Stratum when a new image is published. It is scoped to `stratum`, so it never touches your other containers.

Open Stratum tabs also check `/version.json` every 5 minutes (and whenever the tab comes back into view). When a new build is live, a card in the top right lists what changed, taken from [CHANGELOG.md](CHANGELOG.md), with three choices:

- **Reload to update**: saves the open part first, then reloads.
- **Got it**: hides the card until the next release.
- **Don't show again**: turns the cards off. Turn them back on under Keyboard shortcuts (`?`).

Option A builds locally, so Watchtower has no registry to pull from; update with `git pull && docker compose up -d --build`.

### Releasing

1. Add a `## X.Y.Z — date` section at the top of [CHANGELOG.md](CHANGELOG.md) with short bullets (these show in the update card).
2. Set the same version in [web/package.json](web/package.json).
3. Commit, tag `vX.Y.Z`, and push `master` with tags. CI publishes `latest`, `X.Y.Z` and a commit tag.

Open `http://<casaos-ip>:8090`, create an account, and pick your printer.

### Settings

| Env var | Default | |
| --- | --- | --- |
| `PB_ADMIN_EMAIL` | `admin@stratum.local` | PocketBase dashboard login at `/_/`. Reset to this on every start. |
| `PB_ADMIN_PASSWORD` | `change-this-password` | **Change before first start.** |
| `TZ` | `UTC` | |

Anyone who can reach the server can create an account. To lock sign-ups after you've made yours: dashboard, `users` collection, API rules, set the create rule to admin-only.

## Develop

```sh
# PocketBase (download the binary for your OS into pocketbase/, then):
cd pocketbase && ./pocketbase serve --dev

# Web app with hot reload, proxies /api to :8090
cd web && npm install && npm run dev
```

`npm run build` type-checks and builds to `web/dist`. `scripts/smoke-test.sh http://localhost:8090` runs an API check (sign-up, printers, calibration, projects, per-user isolation).

## Layout

```
web/src/model      document model, primitives, hardware tables, geometry + CSG (three-bvh-csg)
web/src/print      print analysis, orientation ranking, calibration coupon
web/src/export     3MF and STL writers
web/src/store      editor state + history (zustand), live analysis
web/src/viewport   three.js canvas (react-three-fiber), overlay shader, size and fit tags
web/src/ui         top bar, tool shelf, inspector, history strip, print panel, dialogs
pocketbase/        schema migration and cache-header hook
docker/            entrypoint (migrate, admin upsert, serve)
```

## Next up (from the roadmap)

- Bed-size splitting with dowel / dovetail joints and embossed labels
- Snap-fit clip, print-in-place hinge, living hinge, text emboss / engrave
- Show face and load direction feeding orientation ranking
- Plate layout across beds, multi-material painting, resin hollowing
- Print log, fit reports (Too tight / Good / Too loose) feeding calibration, branches
- Sketch mode, then Pro mode (feature tree, variables like `clearance_snug`, configurations)
