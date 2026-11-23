# Stratum: 3D Print-First CAD Platform Design

Nov 23, 2026 · @Brandon K

## Overview

Stratum is a browser-based parametric CAD platform built only for 3D printing. It opens as simple as Tinkercad and scales to Onshape-level parametric modeling, and it treats your printer, your material, and your measured tolerances as design inputs rather than export settings.

### Target users

| User | Starts in | Needs |
| --- | --- | --- |
| Students and first-time makers | Block mode | Fast results, no jargon, no dead ends |
| Hobbyists and print farm sellers | Sketch mode | Functional parts that fit on the first try, sizes for listings |
| Engineers and product designers | Pro mode | Parametrics, assemblies, configurations, version control |
| Teachers | Block mode, locked | Classroom control, unlockable layers, shared templates |

### Core principles

1. **Printer-aware from the first click.** Every fit, hole and wall uses the active printer profile and calibration data.
2. **One model, three depths.** Block, Sketch and Pro are views of the same parametric model. Nothing converts or rebuilds when you switch.
3. **Feedback, not errors.** Print problems show as a quiet overlay with one-click fixes, never as blocking dialogs.
4. **Test small, print once.** Any joint can be cut out and test-printed in minutes.
5. **The loop closes.** Fit results from real prints feed back into calibration, so the tool gets more accurate per printer over time.

## Function design

Every feature serves one loop: set up the printer, model, get live print feedback, test a joint, print, report the fit.

### 1. Printer profiles and calibration

- **Profile:** bed size, nozzle diameter, layer height range, technology (FDM, resin, SLS), multi-material support.
- **Materials:** PLA, PETG, TPU, ABS/ASA, resin, each with overhang limit, minimum wall, flex rating and spool price.
- **Calibration coupon:** a 10 minute print of pegs and holes in 0.05 mm steps. The user reports which peg fit Press, Snug and Slide, and those clearances are saved per printer and material.
- **Printer badge:** always visible in the top bar. Switching it re-checks the entire model.

### 2. Modeling modes

| Mode | Tools | Hidden underneath |
| --- | --- | --- |
| Block | Drag primitives, size tags, Combine, snap, print primitives | Extrudes, booleans, constraints, patterns |
| Sketch | Sketch on face, auto-constraints, Pull, edge fillet and chamfer | Fully parametric sketch features |
| Pro | Feature tree, rollback, variables, configurations, scripting | Nothing. Everything is visible. |

Mode is a view toggle, not a file type. A Block mode model opened in Pro shows its full feature tree.

### 3. Print primitives

- **Screw hole:** pick a size (M2 to M8) and a type (clearance, tapped, heat-set insert, captive nut).
- **Snap-fit clip:** cantilever sized for the active material's flex.
- **Magnet pocket:** pick magnet size, clearance is added from calibration.
- **Pin and peg:** paired parts with fit class.
- **Print-in-place hinge:** knuckle hinge with built-in gap.
- **Living hinge:** only offered for flexible materials.
- **Text:** emboss or engrave, warns below nozzle resolution.

### 4. Fit classes

When two faces mate, a tag offers **Press / Snug / Slide / Loose**. The gap comes from calibration data, never a typed number. In Pro mode each class is a variable (`clearance_snug`) that can be overridden.

### 5. Live print overlay

Toggle with P. Painted directly on the model and updated as you edit.

| Color | Problem | One-click fix |
| --- | --- | --- |
| Orange | Overhang past material limit | Convert to 45 degree chamfer, or add support |
| Red | Wall under 2 perimeters | Thicken to minimum |
| Purple | Bridge longer than limit | Add arch or support rib |
| Blue | Feature below printable size | Enlarge or remove |
| Striped gray | Needs supports in current orientation | Suggest new orientation |

Holes facing sideways get a special fix: **Convert to teardrop** or **Add sacrificial bridge layer**.

### 6. Orientation

- **Suggest** ranks rotations by support grams, print time, surface finish and strength.
- **Show face:** mark the side people see, so supports avoid it.
- **Load direction:** mark where force goes, and orientations that load across layer lines get flagged.
- Orientation is saved with the part and drives the overlay.

### 7. Parametric layer (Pro)

- Built-in print variables: `nozzle`, `layer`, `wall_min`, `clearance_snug`, all pulled from the profile.
- User variables and equations.
- **Configurations** table for sizes and variants, plus built-in **Draft**, **Final** and **Fit Test** configs.
- **Print just this:** select a joint and it slices out a thin test section.
- Feature scripting for custom print features, shareable as a library.

### 8. Bed-size splitting

1. Part outlined red when larger than the bed.
2. **Split for bed** proposes cut planes that avoid thin walls and show faces.
3. Each cut gets a joint: dowel pins, dovetail, puzzle key or screw tabs.
4. Pieces get embossed labels (A1, A2) on hidden faces.

### 9. Assemblies

- Mates from snapping, the same as Block mode.
- Hardware library (screws, inserts, magnets, bearings) feeds a shopping list instead of the print.
- Interference check and motion preview.
- **Plate layout:** lays every printed part flat in its best orientation across one or more beds.

### 10. Multi-material and resin

- Paint faces or bodies with filament colors from the material list.
- Color changes as layer pause or multi-material, based on the printer profile.
- Resin mode replaces this with hollowing and drain hole placement.

### 11. Preview

- Layer slider to scrub through the build.
- Estimated time, grams and cost.
- Support preview and strength view.
- Labeled as estimates. The slicer has final say.

### 12. Output

- **Send to slicer:** 3MF with orientation, colors and plate layout, opened in Bambu Studio, PrusaSlicer, OrcaSlicer or Cura.
- **Send to printer:** for networked printers.
- **Batch export:** every configuration as separate 3MF or STL files.
- **Publish:** shareable listing with print notes and the parametric model, so others can resize it.

### 13. Post-print loop

- **Print log:** notes and photos pinned to a version.
- **Fit report:** tap Too tight, Good or Too loose on any joint, and that fit class adjusts for future designs.
- **Branches:** try a fix without touching the working version. Merge or discard.

## UI design language

The interface feels like a clean workshop: a calm neutral canvas where the model is the brightest thing on screen, and color is reserved for print feedback.

### Layout

| Region | Position | Contents |
| --- | --- | --- |
| Top bar | Top, 48 px | Project name, mode switch (Block / Sketch / Pro), printer badge, share, Send to slicer |
| Tool shelf | Left, 64 px collapsed, 240 px expanded | Primitives and print primitives in Block, sketch tools in Sketch, feature list in Pro |
| Canvas | Center | Model, bed outline, grid, on-model size tags and fit tags |
| Inspector | Right, 300 px, auto-hides | Properties of the selection, variables, configurations |
| History strip | Bottom, 56 px | Icon timeline in Block and Sketch, expands to full feature tree in Pro |
| Print panel | Floating, bottom right | Overlay toggle, warning count, orientation, estimates |

Rule: Block mode shows only the top bar, tool shelf, canvas and history strip. Panels appear as the user goes deeper.

### Color system

**Interface neutrals** (dark theme default, light theme available):

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| bg-canvas | #16181C | #F4F5F7 | 3D viewport background |
| bg-panel | #1F2228 | #FFFFFF | Panels and bars |
| border | #2E323A | #DDE0E5 | Dividers |
| text-primary | #E8EAED | #1A1C20 | Labels |
| text-secondary | #9AA0A8 | #5F6670 | Hints, units |

**Brand accent:** Filament Teal `#1FB5A8`. Used for the selected object, primary buttons, active mode and valid constraints.

**Print feedback colors** (reserved, never used for decoration):

| Token | Hex | Meaning |
| --- | --- | --- |
| print-overhang | #F28C28 | Overhang |
| print-thin | #E5484D | Thin wall or failure |
| print-bridge | #9B6BF2 | Long bridge |
| print-tiny | #3B9EF0 | Below resolution |
| print-ok | #3FB950 | Passed checks |

**Variable binding:** purple `#B48CF2` marks any dimension bound to a variable.

### Typography

- **UI font:** Inter, 13 px base, 12 px for tags, 15 px semibold for panel titles.
- **Numbers and code:** JetBrains Mono for dimensions, variables and scripts, so digits line up.
- Units always shown in secondary text color after the value: `120 mm`.

### Iconography

- 1.5 px stroke line icons on a 20 px grid, rounded joins.
- Print primitives use a small layered-line motif in the corner of their icon, so users learn that these are print-specific.
- Mode icons: a cube (Block), a pencil on a plane (Sketch), a stacked tree (Pro).

### Shape and spacing

- 8 px spacing grid.
- Corner radius 8 px on panels and buttons, 6 px on tags, full pill on fit tags.
- No drop shadows on panels. Elevation shown with a 1 px border and slight background step.

### On-canvas elements

- **Size tags:** pill with monospaced value, appears on hover or selection, click to edit inline.
- **Fit tags:** pill with four segments (Press, Snug, Slide, Loose), active one filled teal.
- **Constraint hints:** faint lock icon at 40 percent opacity, solid when accepted.
- **Bed outline:** dashed translucent box, turns red where geometry exceeds it.
- **Overlay:** painted as a semi-transparent tint on faces, with a pulsing dot on the worst issue.

### Motion

- 150 ms ease-out for panels and tags, 250 ms for camera moves.
- Model rebuilds crossfade instead of popping.
- Fixes animate the geometry change so the user sees what was altered.
- Reduced-motion setting disables all non-essential animation.

### Feedback tone in UI

- Warnings are written as plain facts with a fix: "Wall is 0.6 mm. Your nozzle needs 0.8 mm. Thicken?"
- No modal error dialogs during modeling. Errors live on the feature, in red, with a cause and a button.

### Accessibility

- Overlay colors also carry patterns (stripes, dots, crosshatch) so they work for color-blind users.
- All text meets WCAG AA contrast on both themes.
- Full keyboard control: every tool has a single-key shortcut shown in its tooltip.

## Branding

The working name is **Stratum**: a layer, which is exactly how every 3D print is built. The brand should feel like a precise, friendly tool from a good workshop, not a corporate engineering suite.

Open question: name and domain availability have not been checked. Run a trademark and domain search before committing.

### Name alternatives

| Name | Angle |
| --- | --- |
| Stratum | Layers, foundation, technical but short |
| Layerline | Literal, instantly says 3D printing |
| Plyform | Ply (layer) + form |
| Firstfit | Promise of parts that fit on the first print |

### Logo concept

- **Mark:** three stacked horizontal bars of slightly different lengths, offset like layer lines, forming a subtle S shape. Reads as both a print in progress and the letter S.
- **Wordmark:** "stratum" in lowercase geometric sans, medium weight, tight letter spacing.
- **App icon:** the mark in Filament Teal on a near-black rounded square.
- **Small sizes:** mark alone, minimum 16 px.

### Brand palette

| Role | Name | Hex |
| --- | --- | --- |
| Primary | Filament Teal | #1FB5A8 |
| Dark base | Build Plate Black | #16181C |
| Light base | Raft White | #F4F5F7 |
| Warm accent | Nozzle Orange | #F28C28 |
| Support | Layer Gray | #9AA0A8 |

Nozzle Orange is shared with the overhang warning on purpose: in marketing it means heat and making, and it is never used decoratively inside the app.

### Voice

- **Plain:** "Wall is too thin" instead of "Geometry validation failed."
- **Maker to maker:** talks like an experienced friend at the hackerspace, not a manual.
- **Confident, never smug:** suggests fixes, does not lecture.
- **Short:** one line per message when possible.

| Instead of | Say |
| --- | --- |
| Boolean operation failed | These shapes do not overlap. Move them together to combine. |
| Insufficient clearance detected | This fit is tighter than your printer can do. Loosen to Snug? |
| Export successful | Sent to OrcaSlicer. Happy printing. |

### Taglines

- Design it. Print it once.
- CAD that knows your printer.
- From first block to final part.
- Fits the first time.

### Imagery

- Real printed parts on real desks, visible layer lines, natural light.
- Close-ups of snap-fits clicking, hinges moving, parts assembling.
- No glossy renders presented as real prints.

## Roadmap and open questions

The MVP is the printer-aware loop in Block mode alone: profile, calibrate, model, see print problems, export. Depth comes after that loop proves parts fit on the first print.

&#91;embedded content: roadmap · 4 phases, 3 gates\]

Each gate must pass before the next phase starts. Phases are in order only, with no dates set yet.

### Open questions

- [ ] Geometry kernel: build on an open-source kernel such as OpenCascade, or license a commercial one?
- [ ] Runs fully in the browser (WebAssembly), or does heavy rebuilding happen server-side?
- [ ] Business model: free for students and hobbyists with a paid Pro tier, or one paid tier?
- [ ] Which slicers and printer APIs get first-class integration at launch?
- [ ] Is Stratum (or an alternative) available as a trademark and domain?
- [ ] How is calibration data shared: per user only, or a community database per printer model?
