# Changelog

Newest first. The top section is shown in the in-app "new version" notice, so keep
each bullet short and written for makers, not developers. Bump the version in the
heading for every release you want people to notice.

## 0.19.2 — 2026-11-25

- A fin can with an odd number of fins (3 or 5) now stays centred on its tube. Align, Center on each other, size tags, circular pattern centres and placing new parts beside it all use the full circle the fin tips sweep. Before, they used the lopsided outline of the fins, which pulled them about 15 mm off the tube's axis. This also holds after combining the fin can with a tube.

## 0.19.1 — 2026-11-25

- **New part** now opens a draft. It isn't saved, and doesn't show up in Your parts, until you add something to it, so opening a new part and leaving no longer leaves an empty "Untitled part" behind. The top bar says "Not saved yet" until then.

## 0.19.0 — 2026-11-25

- New **Rocketry** section on the tool shelf, with the nose cone and seven new parts for model rockets.
- **Body tube** (U): set the wall, match a standard tube size (BT-5 to BT-80), or make a motor mount tube for a 13, 18, 24 or 29 mm motor in one click.
- **Fin can** (I): 3 to 6 fins on a sleeve that slides over the body tube. Choose Clipped delta, Delta, Square or Elliptical fins, set root, span, tip, sweep and thickness, and add root fillets for strength. Set the sleeve wall to 0 for fins only, ready to combine with a tube. Fins print standing on their trailing edges without support.
- **Transition** (J): joins tubes of two sizes, as a reducer or a boat tail. It has shoulders at both ends and can be solid or hollow; the hollow inside never needs support.
- **Coupler**: joins two tubes, with a stop band in the middle.
- **Centering ring**: holds a motor tube in the middle of a body tube. Pick both tubes from the list.
- **Bulkhead**: closes off a tube, with an eye for the shock cord.
- **Launch lug** (L): sized for 1/8″, 3/16″ or 1/4″ launch rods.
- Parts that slide into or over a tube get your snug fit clearance automatically, so they fit the tube sizes you pick. The nose cone can now pick its shoulder from the tube list too.

## 0.18.0 — 2026-11-24

- New **Nose cone** shape (E) for rocketry. Pick Cone, Ogive, Parabolic, Elliptical or Von Kármán, with a preview of each profile.
- Add a **shoulder** that slides into a body tube, and set its length and diameter. It steps out at 45°, so the nose prints tip up without supports.
- Set a **wall** to make the nose hollow and open at the bottom. The inside tip comes to a 45° point, so it needs no support, and the wall keeps its full thickness all the way round.

## 0.17.0 — 2026-11-24

- **Drop onto a face:** press a shape key with the mouse over the canvas, or drag a shape from the shelf, and it lands where you point, standing on that face. Holes sink straight into it.
- **Edit inside a combined part:** double-click it to change its pieces one by one, or add new ones. Press Done or Esc to put it back together. Undo steps in and out too.
- **Box select:** Shift-drag on empty space to select every part inside the box.
- **Section view:** the new button by Measure cuts the model across X, Y or Z so you can see inside. Slide the cut along; Flip shows the other side.

## 0.16.0 — 2026-11-24

- Hover the glowing problem dot to read what's wrong with that part, right on the canvas.
- The camera can now orbit all the way to looking straight down from above or straight up from under the bed.

## 0.15.0 — 2026-11-24

- **Mirror:** flip parts left–right, front–back (as seen from the camera) or top–bottom. Tick "Keep the original" to add the mirror image right beside it.
- **Text (T):** raised or engraved letters in a bold, print-friendly font. Type in the inspector; the letters keep their height as you edit.
- **Measure (Q):** click two points to read the distance and its X, Y and Z parts. Snaps to corners and edge middles; Alt places freely.
- Circular pattern: untick "Turn copies with the circle" to keep every copy facing the same way.
- Print check no longer reports sharp tips (like the slanted end of a letter) as thin walls.

## 0.14.0 — 2026-11-24

- Circular pattern: **Center on part** lets you click any part to turn around its center. The center follows that part.
- New **Distance** field slides your selection toward or away from the center, so you can set the ring size directly.
- Esc or a click on empty space cancels picking.

## 0.13.0 — 2026-11-24

- Arrow keys now move parts the way you're looking. Up moves away from you, Left and Right move left and right on screen, from any camera angle.
- The Align buttons follow the camera too: Left, Right, Front and Back are as you see them
- Both snap to the closest bed direction, so parts still move straight along the grid

## 0.12.0 — 2026-11-24

- Linear pattern. Select a part and pick Pattern, then Linear in the inspector to copy it in a row, or in a grid with rows going back.
- Set how many go across and back and the step between them. The default leaves a 5 mm gap, and negative steps go left or to the front.
- A linear pattern on a plate can combine with it in one step, for example to cut a grid of holes

## 0.11.0 — 2026-11-24

- Circular pattern. Select a part (or several), open Circular pattern in the inspector, and set the count and angle. A preview shows the copies before you make them.
- Patterns turn around the part they sit on, like holes around a hub, and can combine with it in one step to cut the holes
- Set the center X and Y to turn around any other point, or use an angle under 360° for an arc

## 0.10.0 — 2026-11-24

- Sketch mode is here. Draw a rectangle (R), circle (C) or any outline with the line tool (L) on the bed or on top of a part.
- After drawing, move the mouse up to pull it into a part, or type a height and press Enter
- Pull down into a part to cut a hole in it. Pulling up from a part's top adds to that part.
- Lines snap to horizontal and vertical, and click the first point to close an outline
- Parts stacked on each other and combined now merge cleanly, without stray lines across flat faces

## 0.9.0 — 2026-11-23

- Align parts. Select two or more and use the Align buttons in the inspector to line them up left, center or right, front, middle or back, and bottom, middle or top.
- "Center on each other" centers the parts left to right and front to back in one click

## 0.8.2 — 2026-11-23

- Combining parts keeps them exactly where they were. Before, the combined part could jump sideways or up, and a rotated part could turn again.

## 0.8.1 — 2026-11-23

- Size tags on small parts no longer pile on top of each other. They spread apart so you can read and drag each one.

## 0.8.0 — 2026-11-23

- Drag the size tags on the 3D view to resize a part. Drag right or up to grow it. Shift goes faster, Alt finer, and a click still lets you type.
- A whole tag drag is one undo step, and the part stays on the bed

## 0.7.0 — 2026-11-23

- Drag left or right on any number in the inspector to change it. Shift goes faster, Alt finer, and a click still lets you type.
- A whole drag is one undo step
- Changing a size in the inspector keeps the part on the bed instead of growing from its middle

## 0.6.0 — 2026-11-23

- New scale tool: press S (or the new toolbar button) for scale handles. Drag one axis, or the center to scale evenly in 5% steps.
- Scale by any percentage in the inspector, or use the ½× and 2× buttons
- Scaled parts stay on the bed, and screw holes and magnet pockets keep their hardware size

## 0.5.1 — 2026-11-23

- The view no longer jumps when the inspector opens or closes. It slides over the model instead.

## 0.5.0 — 2026-11-23

- Hollow any box, cylinder, cone, sphere or wedge with your own wall and floor thickness
- Leave the top open for trays and cups, or open both ends for tubes
- Rounded box corners, plus chamfered or rounded top and bottom edges
- Flat-sided cylinders and cones: triangle, square, hexagon, octagon and more
- Half spheres (domes) with a flat base, and a lead-in chamfer for pins
- Walls thinner than your printer handles are flagged as you type

## 0.4.2 — 2026-11-23

- Dragging sideways no longer lifts parts onto other parts. Drag up or down near a part's top to snap onto it.

## 0.4.1 — 2026-11-23

- Holes poking out the bottom no longer make a part float when you drop it to the bed
- Size tags and snapping measure the printed part, not the holes sticking out of it

## 0.4.0 — 2026-11-23

- Smarter snapping: drag a part over another and it lands on top; drag it off and it drops back to the bed
- Edges and centers line up with nearby parts, and dragging up or down snaps to tops, bottoms and the bed
- Print check spots a part sitting on another and offers to combine them
- Hold Alt while dragging to move freely

## 0.3.1 — 2026-11-23

- Sketch and Pro modes now say "Coming soon" when you hover them

## 0.3.0 — 2026-11-23

- New guided tour: builds your first part with you in nine short steps
- Offered once on the projects page, and you can replay it any time from Keyboard shortcuts (?)

## 0.2.3 — 2026-11-23

- The version number now shows in the bottom-right corner

## 0.2.2 — 2026-11-23

- Auto-updates always install the newest release, never an older one

## 0.2.1 — 2026-11-23

- Update notices save your open part before reloading
- Opening a part always frames it in view
- Images now build on every push to master

## 0.2.0 — 2026-11-23

- Stratum now tells you when a new version is ready, with what changed
- Updates install themselves on CasaOS (Watchtower checks every 5 minutes)
- New Stratum logo and app icon

## 0.1.0 — 2026-11-23

- First version: Block mode with live print checks
- Printer profiles, materials and fit calibration coupon
- Screw holes, magnet pockets, pins with calibrated fits
- Export to 3MF and STL
