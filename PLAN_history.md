# PLAN: Toy Stage on the real table (Specs, TypeScript, SIK)

Status (2026-10-26): **Steps 1 to 5 built and tested in the Editor Preview** (audio, stage, pads, carry, settings). **Not built, by instruction:** table taps, ripples, class presets. The tray-era plan is saved as `PLAN_tray_version.md`.

Legend: **[verified]** = read in `Support/StudioLib.d.ts`, SIK source, the CLAD skills, or the docs. **[unverified]** = needs a Preview test or a Specs device.

---

## 1. Research

**1. World Query** [verified: docs, type file, CLAD skill]
- `createHitTestSession(WithOptions)`, then `start()`, then `hitTest(rayStart, rayEnd, cb)`. A hit has `position`, `normal`, `classification`. Option `filter` smooths over several hits.
- Depth data updates at about **5 Hz**: for static surfaces only. A ray outside the camera field of view returns **null**.
- Surface types: only `None` and `Ground`, and only with Experimental APIs on. A table comes back as `None` with an upward normal; there is no table class, so "table" is a heuristic (horizontal normal, above the floor).
- Accuracy: Snap's depth hit tests are about +/-10% of depth (Instant World Hit Test docs, not a World Query figure). At 52 cm that is up to about 5 cm. [unverified for World Query]
- Every World Query class is tagged `@wearableOnly`. **Preview behaviour and the default rooms are not documented** (the docs only say to test by moving the mouse and tapping). [unverified] Needs a read-only Preview test before we rely on it.
- A stage must also work when no surface is found (null, Editor, no depth), so the floating fallback is also the Editor default.

**2. Hand tracking** [verified: SIK source and docs]
- `TrackedHand` has 21 keypoints per hand (wrist plus 4 joints per finger), each with world position and rotation. Shortcuts: `wrist`, `thumbTip`, `indexTip`, `middleTip`, `ringTip`, `pinkyTip`, finger arrays, `getPalmCenter()` (approximate: there is no palm landmark).
- Update rate: **not documented** (SIK caches positions per frame).
- **The Editor Preview gives no hand joints.** Raw `HandInputData` and gesture events do not fire there; only SIK's `MouseInteractor` events do (CLAD interaction skill). Table-tap detection cannot be tested in the Editor without a mock.
- **Too coarse?** Contact detection needs the fingertip height above the table to about 1 cm. The table height itself can be off by several cm (point 1), and hand tracking near a surface (occlusion, jitter) is unknown. Joint-to-plane contact is **likely too coarse to be reliable alone** [unverified, needs a device]. Pads through SIK poke do not depend on it, so pads are the reliable volume path and table taps are best-effort.

**3. A pad as a SIK interactable** [verified: `Interactable.ts`, `MouseInteractor.ts`]
- Flat thin box collider plus `Interactable`, `targetingMode` 5 (Direct + Poke; 7 adds Indirect). Use `onTriggerStart`; `interactor.interactionStrength` gives poke depth.
- In the Editor `MouseInteractor` fires the same event on a click, so pads are testable there.
- Collider top sits slightly above the real surface so a fingertip meets it first. Pad hit areas will overlap at 5 cm toy spacing, so a router picks the nearest pad centre. A poke and a detected table tap on one pad are de-duplicated within a short Inspector window.
- Toys drop Poke from their targeting mode (Direct + Indirect = 3), so a finger on a pad is never also a toy poke.

**4. Real-world collision or occlusion** (report only) [verified: docs]
- World Mesh (`worldOptions.enableWorldMeshesTracking`, `hitTestWorldMesh`) and the World Depth Texture can occlude content. `DepthSetter` is deprecated for a `PostEffectVisual` with `WorldDepthTextureProvider`. Nothing found on using the world mesh as a physics collider. Spectacles support is unconfirmed (docs list Spectacles 2021). Nothing proposed.

**5. Old section 14 (table slots and sticky walls)**

| # | Question | Status |
|---|---|---|
| 1 | Virtual or real table | **Answered:** real via World Query; the floating fallback is the virtual option |
| 2 | Walls | Superseded (parked) |
| 3 | Slots only, or anywhere | Superseded: anywhere inside the stage circle |
| 4 | Number and layout of slots | Superseded (slots parked); pads are one per toy |
| 5 | Slot taken: nearest or swap | Superseded; overlap nudging stays |
| 6 | "To the music" return | Superseded (sticky walls parked); audio-reactive motion is unchanged |
| 7 | Stuck blobs: poke, grab, timing | Superseded |
| 8 | Keep or rename `Tray*` scripts | **Still open** (recommend rename to `Stage*`) |

---

## 2. What was built (and what was removed)

**Audio (Step 1).** The eight `RS_Mp3_ABR` stems are wired by name: 01_MixBase_B to the foundation (owned by the stage), 02 to 08 to Toy_01 to Toy_07 (PianoMel, PianoVar, Cello, Violin, Chimes, SFX, MixPerc). `MusicSync` is unchanged: start-together pre-seek, looping, foundation volume. Preview log: 8 stems start with spread 0.022 s, lags 0 to 75 ms, sync checks 0.000 s. Toy_08 (no stem left for it) was deleted from the scene (decided 2026-10-26).

**Stage (Step 2).** `StageAnchor` (was TrayPlacer) searches with World Query along the gaze, judges every result, places the stage on the table, faces you, and leaves it. Floating fallback when no accepted hit arrives within Search Seconds, on a null hit, or when World Query is unavailable. Re-place: hold a palm tap (R key in the Editor). `StageBounds` (was TrayBounds) keeps the circle landing logic, rescue, overlap nudging, the debug outline, and now sizes the optional marker. `StageGeometry` (was TrayGeometry) is unchanged maths. **Removed:** `TrayModel` (Floor, Lip) objects and `buildRimMesh` (the code-built lip ring), the rim/floor settings, `trayFloor` and `rimPiece` inputs.

**Pads (Step 3).** `ToyPad` (one per toy, `Pads/Pad_01..07`): follows its toy flat on the stage floor, SIK Interactable with a generous box, poke and click cycle the volume, presses down a tiny bit, shows the state by writing 0..3 to a material property and tinting a placeholder colour, emits `onPadTap`. Placeholder assets I made in the editor (replace freely): `Materials/Pad_Mat_Placeholder.mat`, `Materials/Stage_Mat_Placeholder.mat`, `Meshes/Stage_Disc.mesh`, `Pad_Plane` mesh.

**Carry (Step 4).** Unchanged `ToyInteraction`: pinch grabs, release floats down and settles on the stage, grabbing never changes volume. Air-poke stays on (toggle) and uses the same volume door as the pads.

**Settings (Step 5).** Every tolerance is an Inspector value in `StageConfig` (list in section 5).

### How one finger can never change a volume twice (the pad + toy case)
All changes go through `ToyVolume.requestCycle(source, hand)`:
1. **Cooldown** (Volume Cooldown, 0.3 s): after any change on a toy, every further request on that toy is ignored.
2. **Same-hand lock** (Same Hand Cooldown, 1.0 s): a second change on that toy from the same hand is ignored. Why: in the Preview a simulated finger tapped the pad, then brushed the toy on its way out, and an air-poke fired 0.4 s and 0.9 s later, both past the 0.3 s cooldown. With the lock the log shows `airPoke ignored (same hand changed it 0.90 s ago)`. A different hand, and the mouse, are not blocked.
3. **Pad-already-counted rule:** an air-poke is decided when the touch ends; if the volume changed since that touch began, it is dropped.
4. **Overlapping pad boxes:** whichever pad receives a touch hands it to the pad whose centre is nearest to the touch point.
Trade-off: a deliberate second tap by the same hand on the same toy within 1.0 s is ignored. Lower Same Hand Cooldown if that feels sluggish.

## 3. Scripts

| Script | Job | State |
|---|---|---|
| `StageConfig` | the one global config (stage, World Query, pads, volume, motion, audio, squish) | built (was TrayConfig) |
| `StageAnchor` | World Query placement, fallback, lock, re-place, hand-move API; events `onPlaced`, `onSearchStart`, `onMoved` | changed (was TrayPlacer) |
| `StageMoveHandle` | pinch-drag handle that slides the stage over the table | built (section 13) |
| `StageBounds`, `StageGeometry`, `FramePath`, `StageFrame` | half-ellipse-like bounds (bezier back), landing, nudging, debug outline, visible frame | changed (sections 13, 14) |
| `ToyPad`, `PadShape` | lollipop pad per toy (circle + rounded strip, generated shapes); tap and slide; routing; press animation; `onPadTap` | rebuilt (section 16) |
| `ToyVolume` | volume state, `requestCycle`, cooldown, continuous slide level (`setLevel`, `endSlide`), `onStateChange` with source | changed |
| `ToyInteraction` | pinch carry; air-poke behind the toggle | changed |
| `MusicSync`, `ToyAudioReact`, `ToySquish`, `ToyConfig` | as before (Tray words renamed to Stage) | kept |
| `TableTapDetector`, `TapRipple`, `ToyClassPreset` | table taps, ripples, class presets | **not built** |

## 4. Scene structure (as built, updated 2026-10-26)
```
Camera Object, SpectaclesInteractionKit      (existing)
Stage                  StageConfig, StageAnchor, StageBounds, MusicSync
 +- StageFrame         the visible outline: pieces are made at run time from the Frame Segment Prefab
 +- BoundsOutline      32 debug segments (31 used), hidden unless Debug > Show Bounds Outline
 +- FoundationTrack    01 MixBase AudioComponent
 +- Pads               Pad_01..07, each: Collider (the strip's touch box), Interactable, ToyPad, and children
 |                      Visual (the strip), BaseVisual (the circle under the toy), BaseHit (optional circle touch box)
 +- Toys               Toy_01_PianoMel .. Toy_07_MixPerc
 +- MoveHandle         pinch-drag handle for moving the stage: Collider, Interactable, StageMoveHandle, child Visual (placeholder)
```
Order matters only for transparent render order: pads, then toys (toys draw on top). The circle and strip are ordered by `Render Mesh Visual > Render Order` (circle 0, strip 1), not by hierarchy. Reorder in the Scene panel.

## 5. Inspector values (all in StageConfig unless noted)
- **Stage placement:** Enforce Bounds (layout mode), Stage Width / Depth / Back Handle / Side Handle, Gaze Depth Ratio, Distance From User (fallback), Height Offset (above the table), Fallback Height Offset (vs eyes), Placement Delay, Replace Hold Seconds, Enable Replace Gesture. **Moving the stage:** Move Enabled, Handle Offset / Size, Face User, Hand Scale, Smooth Seconds, Min / Max Distance.
- **World Query:** Use World Query, Query Filter, Query Refresh Rate (Hz), Search Seconds, Hits Required, Search Ray Length, Min/Max Hit Distance, Min Surface Up, Min/Max Drop Below Eye, Use Classification, Log Queries.
- **Toy spacing and edge:** Toy Size, Spacing Ratio, Edge Padding Ratio, Nudge Enabled, Required Free Slots. Rescue: Max Rescue Distance, Rescue Speed.
- **Pads:** strip (Shape, Width, Length, Roundness, Mesh), circle (Shape, Width, Length, Roundness, Offset, Mesh, Shade, Touchable), Curve Steps, Hit Margin, Collider Height, Lift, Base Drop, Front Offset, Press Depth / Seconds, Follow Speed, Accepts Poke / Click, slide (Enabled, Threshold, Snap, Hand Scale), Volume Cooldown, Same Hand Cooldown, Pad State Param. Per pad (ToyPad): the four state colours, blend seconds, colour parameter name. (Pad Size, Pad Hit Area, Pad Tint By State and Clone Pad Material no longer exist.)
- **Air-poke:** Air Poke Cycles Volume (on), Poke Debounce, Poke Min Depth, Poke Lockout After Release, Mouse Hold Seconds. Grab: Grab Follow Speed, Grab Move Scale.
- Kept: volume states, drift and settle, rescue, audio-reactive, squish (global, with per-toy overrides in `ToyConfig`).

## 6. Numbers (starting values; each needs a one-line reason once chosen)
- Stage about 19 cm across (radius 9.55): holds 7 toys with a spare slot; this was the verified size. 7 toys leave more free space than the old 8.
- Stage distance: starting at 52 cm from the head along the line of sight (the old tray value), **but see Risk 1.**
- Height: taken from the table, not a number; the fallback stage reuses 10 cm below eye level.
- Toy footprint 4 cm, spacing 25%: unchanged.
- Pad hit area: larger than the toy footprint; value to be chosen with the overlap issue (Risk 4).

## 7. Carried-over verified results (Editor Preview, tray era; not re-run on the current eight stems)
- **Audio-reactive:** reading the stem level works; set the provider position to the playing position before each read; reading is before volume, so motion is scaled in script. Stem reading cost about 1.0 ms per frame on the development Mac in the tray era (not on a device; not re-measured).
- **Sync:** `AudioComponent`s started in a loop land about 85 ms apart; pre-seeking each stem by its measured lag gives about 1 ms spread. Nudging a playing stem made it worse.
- The poke/pinch, landing, overlap and squish results are in `PLAN_tray_version.md`; the poke rules no longer apply by default.

## 8. Design-time risks (original, before the build; see section 10 for the current list)
1. **Geometry.** A real table is about 40 cm below a seated user's eyes (**my assumption; the docs give no figure**). A stage 52 cm along the line of sight is then about 33 cm ahead horizontally and about 50 degrees below the horizon. A flat distance of 52 cm would be about 66 cm from the head, outside the 35 to 60 cm near-field. So: place by gaze and keep every toy within 60 cm of the head; "centred in view" means looking down at the table. [calculated, not measured]
2. Table height accuracy (about +/-10% of depth) and the 5 Hz depth rate: the stage may float or sink a few cm. Options: `filter`, a touch-to-calibrate step, using the fallback.
3. Table taps are probably coarse, untestable in the Editor, with unknown update rate; fist, palm and typing may false-trigger. Pad poke is the reliable path.
4. Pad hit areas overlap at 5 cm toy spacing.
5. World Query is wearable-only and its Preview behaviour is unknown.
6. A rule change: settings are now in three layers, not two.
7. Nothing is verified on a device.

## 9. Test results (Editor Preview, 2026-10-26)
- **Compiles and runs** with no errors; 7 toys, 8 stems, spread 0.022 s at start, 0.000 s at sync checks.
- **World Query:** `createHitTestSession` and `start()` work in the Preview, but **every query returned null** in all three rooms tried (Sunlit Room, Colorful Home, Plane): 14 misses, 0 hits each, so the floating fallback was always used. Not tried: Evening Outdoor, Evening Room, Sunlit Outdoor. **So the table-hit path (acceptance rules, table placement) has never run**; it needs a device or a depth-capable Preview. Surface type is only logged (and only with Experimental APIs and Use Classification on).
- **Pads:** a simulated poke on a pad (outside the toy's box) cycled the volume (`padPoke`); poking the pad's centre under the toy is intercepted by the toy (the toy sits on top of it; usable pad area is the margin and the gaps).
- **One finger twice:** reproduced (pad, then air-poke 0.4 s and 0.9 s later), fixed by the same-hand lock; verified in the log. See section 2.
- **Carry:** pinch, drag 31 cm outside, release: landed inside the circle at the nearest free spot (reason overlap), pad followed, no volume change while carrying.
- **Not tested:** real hands, real table, pad press animation visually, Evening/Sunlit Outdoor rooms, re-place gesture (R key).

## 10. Risks and open questions
1. Geometry: a real table is about 40 cm below a seated user's eyes (**assumption**); see the design-time Risk 1 in section 8: place by gaze and keep toys within 60 cm of the head.
2. Table height accuracy (about +/-10% of depth, **unverified for World Query**) and the 5 Hz depth rate: Query Filter and Hits Required help; a touch-to-calibrate step is not built.
3. A pinch aimed at a pad can compete with pinching a toy standing on it (Pad Accepts Click). Toys sit above pads, so a ray at a toy hits the toy first.
4. The pad's touch box is thicker than the artwork (Pad Collider Height 1.5 cm); in the Preview the tool reported the pad box as "obstructing" a drag aimed at the toy's base point (an artefact of aiming at the toy pivot, not the body).
5. Toys 02 to 07 are moved at start because their old saved positions were laid out for 8 toys and overlap at the 7-toy spacing. Each toy now has its own `ToyConfig > Home Position` (vec3, stage-local cm: X left/right, Y height above the floor, Z back/front). Replaces the old two-number Start Position; Toy_07 was given its own spot (9.6, 0, -7.5) because it duplicated Toy_01.
6. Nothing is verified on a device.
7. Decided: Toy_08 deleted. Open: keep air-poke long-term? Build table taps and ripples next (needs the device test first)? Class presets next?

---

## 11. Stage frame revision (2026-10-26): outline only, rounded rectangle (SUPERSEDED: the shape is now section 14; the outline-only, piece-based frame still applies)

**What changed.** The filled stage surface is removed. The stage is a landscape rounded rectangle, drawn as an outline. Bounds and visuals are separate: `StageBounds` + `StageGeometry` decide where toys can go; `StageFrame` only draws.

**Shape (my pick): rounded rectangle, not an oval.** A table-top layout reads wider than deep, and the same width fits the horizontal field of view; rounded corners keep it soft and let corner brackets read as a quiet viewfinder. Default 28 x 19 cm (about 3:2), corner radius 4 cm. At 52 cm that is about 30 degrees wide, which should sit inside the Specs view. **[unverified: the field-of-view figure is from memory of the docs and needs a device check; the "stage-sizing items below" referred to in the request were not in the pasted text, so these sizes are placeholders.]**

**Style (my pick): corner brackets, thin, light, 35% opacity.** Brackets use the fewest pieces (40), stay out of the way of the toys and still show the whole extent and the smooth corners. Thin line (28 to 36 pieces) and dashed (about 64) are one Inspector dropdown away. Defaults: colour (0.92, 0.94, 1), opacity 0.35, thickness 0.15 cm, bracket arm 3 cm, 8 steps per corner, height 0.05 cm above the stage floor.

**Built from authored assets, constant thickness.** The frame is cut into short straight pieces. Each piece is a copy of ONE authored prefab (`Prefabs/FrameSegment.prefab`: a flat unit quad `Pad_Plane.mesh` + `Materials/Frame_Mat_Placeholder.mat`, a transparent, two-sided, no-depth-write unlit material). Only the length is stretched; the width is set separately, so thickness is identical on every side and corner at any stage size. No mesh or material is made in code (the script clones the authored material once so tinting never edits your asset; `Tint Material` off uses it exactly as authored). Swap the mesh or material inside the prefab, or point `Frame Segment Prefab` at your own. Limitation: pieces meet end to end (butt joints), so the outside of a corner has a gap of about 0.13 x thickness; invisible at this thickness.

**Surface orientation.** `StageAnchor.surfaceNormal()` (new) returns the World Query normal (null in the fallback). `StageFrame` tilts to it, in stage space, and lifts along it. In the fallback it lies level. **[Table-tilt path unverified: World Query returns no hits in the Preview, so only the level (fallback) path has run.]** Toys, pads and bounds stay level in stage space.

**Optional foundation follow (off by default).** Done: it reads the foundation stem's loudness the same way `ToyAudioReact` reads a toy stem (auto-levelled), smooths it, and adds `Foundation Amount` to the opacity. Preview log showed raw level 0.04 to 0.69 moving the opacity as expected.

**Shared level reader (2026-10-28).** `ToyAudioReact` and `StageFrame` now share one reader, `StemLevel.ts` (`StemLevelReader`: RMS of a stem, auto-levelled; each instance keeps its own peak). The four global motion sliders (`reactAmount`, `scaleAmount`, `positionAmount`, `rotationAmount`) were removed from StageConfig; motion amounts come only from each toy's `ToyShape > Feel`, and a toy without a ToyShape (or on its first frame) falls back to the `ToyFeel.ts` defaults. Compiles; not re-run in the Preview.

**Scripts.** New: `FramePath.ts` (piece layout maths), `StageFrame.ts`. Changed: `StageGeometry.ts` (circle -> rounded rectangle `Area`), `StageBounds.ts` (marker code removed, area-based, debug outline = real bounds), `StageConfig.ts` (`stageRadius`, `stageMarker`, `autoSizeMarker` replaced by `stageWidth/Depth/CornerRadius`, `frameSegmentPrefab` and a "Stage frame" group), `StageAnchor.ts` (`surfaceNormal()`), `ToyInteraction.ts` (comments only).

**Tests.** Node tests of the geometry (nearest-point clamp checked against brute force, landing of the 7 saved start spots, frame piece closure and bracket/dash lengths) passed; Preview: no errors, 0 start-position warnings, frame rendered in all three styles, debug bounds outline matched the frame; LEAF `pad-cycle-volume`, `pad-one-tap-one-change`, `pads-are-independent` still pass. Not tested: a real drag release near the new corners, the tilted-table path, a device.

**Leftovers.** `Materials/Stage_Mat_Placeholder.mat` and `Meshes/Stage_Disc.mesh` are no longer used by the scene (left in place for you to delete or reuse).


## 12. Pads in front, per-state colours, resets (2026-10-26)

- **Pads** sit in front of each toy along the stage's fixed front (+Z in stage space), default offset `StageConfig > Pad Front Offset` = 5 cm; per pad: `ToyPad > Pad position` (Use Default Offset / Offset). Pad Size 4.5 cm artwork, Pad Hit Area 6 cm.
- **Unit**: toy + pad are discs (`StageGeometry` `Unit`/`Limits`). Edge padding, clamping, free-spot search and nudging use every disc. `ToyConfig.unitDiscs()` builds it; `ToyPad` supplies the pad disc.
- **Layout**: seven units do not fit in one gentle arc in a stage that fits the view (a single row needs about 41 cm width). Default is two interleaved gentle arcs (back row toys 1,3,5,7, front row 2,4,6) in a 27 x 24 cm stage. Start positions stay editable on each ToyConfig.
- **Colours**: `StateColours.ts`; per toy (`ToyConfig > Toy colours`) and per pad (`ToyPad > Pad colours`): base colour, off/low/medium/high, blend seconds (0.15), material parameter name (baseColor). Material cloned first; one warning if the parameter is missing.
- **Resets**: four tick-boxes in `StageConfig > Resets (all toys)`, and the matching ones on each ToyConfig / ToyPad. Each runs only its own reset and un-ticks itself at runtime. Limit: the Inspector keeps showing the tick after the Lens clears it, so un-tick and tick again to repeat.
- `Meshes/Pad_Plane.mesh` is now a project copy; the pad visuals and FrameSegment prefab point to it.

## 13. Half-circle stage and moving it (2026-10-26) (the half circle is SUPERSEDED by section 14; the origin at the flat edge, gaze placement, moving by hand and Enforce Bounds still apply)

**Shape.** The stage is a half circle, an orchestra fanned out in front of the user as conductor. Stage-local axes are unchanged (+Z toward the user), but the stage ORIGIN is now the middle of the flat edge (the conductor's spot), and the stage reaches away from the user (-Z). Bounds are `x^2 + z^2 <= r^2` and `z <= 0`. One Inspector value, `StageConfig > Stage Placement > Stage Radius` (default 22 cm: 44 wide, 22 deep), replaces Stage Width / Depth / Corner Radius (those no longer exist). Reason for 22: seven toy-and-pad units fit at R = 20 only with zero spare margin (checked numerically on the pure maths); 22 leaves room. **[Width 44 cm against the field of view at about 60 cm is unmeasured: check on a device.]**

**Geometry.** `StageGeometry.Area` is now a disc of radius `r` cut at `z <= zMax` (the stage is `zMax = 0`; every inset is a smaller disc cut further back, so one shape covers edge padding too). `clampToArea` takes the nearest of: point on the arc, point on the straight cut, the corner. Checked in Node against the area formula (628.3 = pi r^2 / 2 at r = 20) and a set of clamp points. Everything above `Limits` (units, pads, nudging, landing) is unchanged.

**Pads limit the layout (known trade-off).** Pads still sit a fixed 5 cm toward the user (+Z, the flat edge), not toward the conductor along the radius. So a toy needs its pad inside the stage too, which keeps toys out of the front band (about the first 7.5 cm behind the flat edge). A radial pad direction would be a separate change (the pad offset would depend on the toy's position, which the unit maths does not support today).

**Home positions** for the new shape (found with the same landing solver, all land unchanged): Toy_01..07 = (-16.2, -8.8), (-10.8, -12.2), (-5.3, -9.5), (0, -12.5), (5.3, -9.5), (10.8, -12.2), (16.2, -8.8) (X, Z; Y 0). A shallow two-row stagger. Edit per toy in `ToyConfig > Home Position`.

**Outline.** Same piece-based style. `FramePath` now draws an arc (chords, `Arc Steps` per quarter turn, so two quarter turns) and, if `Frame Flat Edge` is on, one long piece for the flat edge. Brackets: marks at both corners, `Frame Arc Marks` (default 3: 45, 90, 135 degrees round the arc) and the middle of the flat edge (the conductor's spot); arm length `Bracket Length`, shortened if marks would meet. Thin line and dashed work on the whole path. Piece counts at 22 cm: line 17, brackets about 11, dashed about 67 (limit 120). Seen in the Preview top view: brackets drawn as intended.

**Placement.** The gaze point (a World Query hit, or the floating fallback point) becomes the middle of the half circle's surface, not its origin: the origin is moved back toward the user by `Gaze Depth Ratio` (default 0.42, the half disc's centroid at 4/(3 pi) of the radius) times the radius. So the flat edge sits nearer to you and the stage is centred on what you look at. World Query still returns no hits in the Preview, so only the fallback path has run here. **[The table path is unverified, as before.]**

**Moving it.** Both ways, as requested. (1) The palm-tap hold re-places by gaze, unchanged. (2) New `StageMoveHandle` on `Stage/MoveHandle`, `Move Handle Offset` (4 cm) in front of the flat edge. Pinch (or mouse button in the Editor) and drag: the stage slides over the surface it is on (height fixed), optionally turning to keep its flat edge facing the user (`Move Face User`). Hand drag moves the stage by the hand's travel times `Move Hand Scale`; mouse drag follows the cursor on the table plane. A search is stopped and the hold gesture paused while dragging. Distance from the head is held between `Move Min / Max Distance` (20 / 100 cm). Pokes do not move it (targeting mode Direct + Indirect). **[Drag is not tested: the Preview hand simulation was not driven for it. Needs a Preview drag test and a device test.]** The handle is a copy of a pad (placeholder picture, shared placeholder material): replace its Visual's mesh and material freely.

**Scripts.** New: `StageMoveHandle.ts`. Changed: `StageGeometry.ts`, `FramePath.ts`, `StageFrame.ts`, `StageBounds.ts`, `StageConfig.ts`, `StageAnchor.ts` (placement, `isMovingByHand`, `beginUserMove`, `userMoveTo`, `endUserMove`, `onMoved`).

**Layout mode (added 2026-10-26, TEMPORARY).** `StageConfig > Stage Placement > Enforce Bounds`, default OFF. While OFF, Home Position and release spots are used exactly as given: no clamping into the half circle, no overlap nudging, no rescue of far releases. Reason: the clamp kept pushing toys back (a toy plus its pad must fit inside, so nothing could go forward of about 7.5 cm behind the flat edge). Verified in the Preview: Cello home (-5.3, 0, 6) landed at exactly that spot. To restore the rules, tick Enforce Bounds ON; then re-check the homes (section 13).

## 14. Wide-back half ellipse (2026-10-26; replaces the half circle of section 13)

**Why.** Snap's placement guide ([Positioning & Sizing Content](https://developers.snap.com/spectacles/best-practices/design-for-spectacles/positioning-sizing-content)) gives the comfortable (binocular) display width as 13 cm at 35 cm, 23 cm at 55 cm and 53 cm at 110 cm; the display is portrait (about 3:4); near field (35 to 60 cm) allows direct hand interaction, beyond 60 cm is indirect. A half circle big enough for the toy layout was about 54 cm wide, far over that. The table recedes along the view, so depth costs less display than width: a narrow, deep stage fits better. The stage is now a half ellipse whose back can be pulled wider.

**Shape.** `StageConfig > Stage placement`: `Stage Width` (26 cm, at the flat edge), `Stage Depth` (29 cm, flat edge to far point), `Stage Back Handle` (0.85) and `Stage Side Handle` (0.55). The curved back is two cubic beziers meeting at the far point, as handles: corner handle `(halfWidth, -sideHandle*depth)`, far-point handle `(backHandle*halfWidth, -depth)`. Both at 0.5523 is an exact half ellipse; a bigger Back Handle pulls the far-point handle out sideways (flatter, wider back). Both limited to 0.05..1 (keeps the shape convex). Stage Radius no longer exists.

**Geometry.** `StageGeometry.Area` is now a convex polygon (24 pieces per quarter) with half-plane edges. An inset (edge padding) clips the polygon against every edge moved inward, so vanished edges are handled and the result is exact; results are cached. `clampToArea` takes the nearest boundary point. Checked in Node: exact half ellipse area 659.5 against pi*a*b/2 = 659.7; clamp points land on the inset edge; frame piece counts: line 17, brackets 13, dashed 67.

**Your layout against it** (homes Toy_01..07 = (3,-10), (-3,-10), (10,-7), (-10,-7), (-7,-22), (0,-25), (7,-22)): extent 24.5 cm wide, 27.3 cm deep including pads; spacing fine (tightest +0.4 cm). With Stage Back Handle 0.85 at 26 x 29 everything is inside except the Cello and Violin PADS, which stick out 0.7 cm past the flat edge's padding (pad at z = -2, limit -2.7). With a pure ellipse (0.55) Chimes and MixPerc also fall outside, which is why the back is wider. Fix when enforcing: move those two toys 1 cm back, or lower `Pad Front Offset`. **Width 26 cm is slightly over the 23 cm comfortable width at 55 cm (interpolated, not a measured figure); distance from the eyes of the back toys (about 60 to 68 cm, assuming the table is 40 cm below the eyes, **unverified**) is beyond the 35 to 60 cm near field, so back pads need a reach.**

**Also changed.** Gaze placement uses `Gaze Depth Ratio` x Stage Depth. `Enforce Bounds` moved to the Stage placement group (it is OFF; layout mode). Scripts changed: `StageGeometry`, `FramePath`, `StageFrame`, `StageBounds`, `StageConfig`, `StageAnchor`.

**Revision (2026-10-26): narrower front, wider back.** Defaults and scene now: Stage Width 23 cm (was 26), Stage Depth 29, Stage Back Handle 1.0 (was 0.85), Stage Side Handle 0.8 (was 0.55). The widest point is the flat edge at 23 cm, the comfortable width Snap gives at 55 cm. Widths measured on the pure maths: at depth 1 / 10 / 20 / 24 / 27 cm the stage is now 23.0 / 22.9 / 21.6 / 19.5 / 15.4 cm wide, against 26.0 / 25.3 / 21.6 / 18.0 / 12.6 before. So the front is 3 cm thinner and the back wider. Toys are placed by the user, so no home positions were changed. **Unmeasured on a device.**

## 15. Snowman pads (2026-10-26) (SUPERSEDED by section 16)

**What.** The pad is no longer one square. It is a snowman: a BIG base circle under the toy and a SMALLER circle in front of it (toward the user, the stage's +Z). Both circles are one pad: touching either changes that toy's volume, and both show the same state colour.

**Pieces (per `Pads/Pad_xx`).** `Visual` = the small circle (its mesh is now `Stage_Disc`, an existing project mesh); new child `BaseVisual` = the big circle (a copy of Visual); new child `BaseHit` = an empty object holding a ColliderComponent for the base's touch disc. `ToyPad` has two new optional inputs, `Base Visual` and `Base Hit`; empty `Base Visual` = a single small pad as before. The small circle's touch disc is the collider already on the pad object. Touch discs are flat cylinders (radius = circle radius + `Pad Hit Margin`, height `Pad Collider Height`), set by the script. SIK collects colliders from the whole hierarchy under an Interactable (read in `InteractionManager.findCollidersForSceneObject`), so no second Interactable is needed. `BaseVisual` renders under `Visual` by Render Order (0 and 1), not by hierarchy order.

**Settings (StageConfig > Pads).** `Pad Size` 3.5 cm (diameter of the small circle, was a 4.5 cm square), `Pad Base Size` 5.5 cm (new), `Pad Hit Margin` 0.75 cm (new; replaces `Pad Hit Area`, which no longer exists), `Pad Base Drop` 0.03 cm (new, base sits a hair below the small circle), `Pad Front Offset` 4.3 cm (was 5; the circles overlap a little: touching would be 4.5). The base follows the toy exactly (it is the pad's offset back from the small circle).

**Stage maths.** The unit's first disc is now the base circle when it is bigger than the toy: `ToyConfig.unitDiscs()` uses `max(toy footprint, Pad Base Size)` (via `baseDiameterProvider`, set by `ToyPad`). The small circle is the second disc. Edge padding, spacing and nudging, and the free-space check, all use these. Effect: units need MORE room than before (a 5.5 cm base counts instead of a 4 cm toy): with the spacing ratio of 0.25, bases must be 6.9 cm apart (it was 5.0). With Enforce Bounds on, a layout built for the old sizes will be pushed apart (seen in the Preview log: Toy_02 to Toy_07 moved). Routing: when pads overlap, a touch goes to the pad whose snowman is nearest (distance to the nearest circle edge), so a touch on one pad's base ring never goes to a neighbour's button.

**Tested (Editor Preview).** Compiles; runs with no errors; top view shows the big circle under each toy and the small circle in front; a poke on `Pad_03` (small circle) logged `Pad_03 touched (padPoke)` and `Toy_03_Cello state 0 -> 1`. **Not verified:** a poke on the base ring. My test pokes at the ring (2.4 and 3.2 cm from the toy centre) reached the toy instead (`airPoke`), because the simulated finger meets the toy's body first. The ring outside the toy is narrow (about 0.75 cm plus margin), so on a device most base touches may land on the toy. **Not measured:** that `Stage_Disc` is exactly 1 cm across at scale 1 (it looks right in the top view; check the sizes in the Scene panel).

## 16. Lollipop pads: strip and circle, tap and slide (2026-10-26; replaces the snowman of section 15)

**Shape.** Each pad is a small CIRCLE under the toy (picture only, like a shadow) and a narrow rounded STRIP in front of it (toward the user), like a piano key or a mixing-board fader. `Visual` = the strip, `BaseVisual` = the circle, `BaseHit` = an optional touch box for the circle (off by default: `Pad Base Touchable`). Both meshes are drawn by `PadShape.ts` (MeshBuilder, one flat triangle fan, normals up, UVs across the shape, shared between pads). No material is made: the pad keeps its own (`Pad_Mat_Placeholder`: a shader-graph material, blend mode Normal, depth write on, one-sided). Your own mesh can replace either shape (`Pad Strip Mesh`, `Pad Base Mesh`, 1 cm x 1 cm, stretched).

**Inspector (StageConfig > Pads).** Strip: Shape (Rounded / Ellipse), Width 2.2, Length 7, Roundness 1 (0 = square corners, 1 = pill). Circle: Shape, Width 3.4, Length 3.4, Roundness 1, Offset (picture only), Shade 0.55, Touchable off. Shared: Curve Steps 6 (pieces per rounded corner), Hit Margin 0.75, Base Drop 0.03, Front Offset 5 (strip centre from the toy centre; the strip starts at 1.5 cm, inside the circle's edge so it grows out of it like a lollipop stick). The circle is SMALLER than the toy's footprint (3.4 against 4 cm); a console warning is printed once per pad if it is not.

**Sizes never change.** Strip and circle sizes come only from these numbers. Nothing in `ToyPad` reads the toy's size or the volume (checked in the code and at runtime: the strip and circle stayed at scale 1 and the circle at the toy's position after a volume change). The stage maths uses the toy's REST footprint, so audio-reactive scaling and squish never move it either; the circle only joins the unit when it is bigger than the footprint.

**Tap or slide.** A touch that ends within `Pad Slide Threshold` (0.8 cm) of where it began is a TAP and steps the volume when the finger lifts (a change from before: the tap counts on release, not on contact). A touch that travels further along the strip is a SLIDE: the volume follows the finger, the end nearest the toy is loudest, the end nearest the user is off. `ToyVolume.setLevel` joins the four state volumes at 0, 1/3, 2/3, 1 by straight lines; the state (colours) follows the nearest. `Pad Slide Snap` (off) settles on the nearest state when the finger lifts. A hand is tracked by how far it has moved along the strip since the touch began, times `Pad Slide Hand Scale` (1); the mouse by where its ray meets the strip. The base state value written to the shader parameter (`Pad State Param`) is smooth (0 to 3) while sliding.

**Tested (Editor Preview).** Compiles, no errors. Top view shows rounded strips in front of the toys; changing roundness, width and the circle shape from the Inspector redrew them. A poke on a strip logged the touch and stepped the volume 0 -> 1 on lift. A simulated hand drag along the strip started a slide and the level followed the hand (0.13, 0.21, 0.28, 0.36, 0.43 while the hand moved 2.5 cm of a 5.9 cm travel). The simulated hand starts at a different point from where it pokes (and the poke turns into a pinch), which made the first reading jump; the slide now re-measures when the trigger type changes. **Not verified:** slide with a real hand on a device (what a real fingertip reports during a poke is not documented; I use the hand's own point); the optional circle touch box; your own meshes; the LEAF pad scenarios were not run (they expect a change on touch, which now happens on lift).

## 17. Possible next steps for the strips (reported 2026-10-26, NOT built; each waits for a go-ahead)

Checked against the Lens API type definitions and Snap's material docs. The strip's current material (`Pad_Mat_Placeholder`) is a shader-graph material: blend mode Normal, depth write and depth test on, one-sided.

1. **Stroke around the strip (colour, size, texture, opacity, blend mode): possible.** Draw a second, slightly bigger shape behind the strip (an outline ring from `PadShape`, same shape numbers plus a stroke width), with its own material slot. Colour and opacity are the material's `baseColor` (alpha); texture is `baseTex`; blend mode is `Pass.blendMode` (settable at run time: Normal, Add, Screen, Multiply, Min, Max and others). Size and roundness follow the strip. Cost: one extra mesh per pad. A ring (not a filled shape behind) avoids doubled alpha where the stroke and a see-through strip would overlap. The look depends on the material you assign; I would expose a material slot for it. New Inspector values: stroke width, colour, opacity, texture, blend mode, on/off.
2. **Push-button movement: partly there.** A press dip already runs on taps (`Pad Press Depth` 0.2 cm for `Pad Press Seconds` 0.14 s) but only when a tap registers, and a flat shape moving down is barely visible from above. A key that visibly goes down needs thickness (a short extruded mesh with sides) plus a small shrink or darkening on press, and the dip would follow the finger touching the strip (and sliding) instead of only a registered tap. Cost: moderate (an extruded mesh variant in `PadShape`, tie the dip to the touch).
3. **Groove with a slider, like a mixing board: possible.** A thin, darker groove mesh down the middle of the strip and a small knob mesh moving along it; the knob position is the current volume (the slide level, or the state spread over 0 to 1). `Pad State Param` already gives a smooth 0 to 3 value, so a custom shader could draw a fill instead of a knob. The groove would also be the slide's touch zone. Cost: moderate (two small meshes per pad and a knob mover; the groove width, length and knob size would be Inspector values).

Other open items: slide with a real hand on a device; the optional circle touch box; your own meshes in the override slots; the LEAF pad scenarios were not re-run (they expect a change on touch, which now happens when the finger lifts); World Query on a table; the stage drag handle on a device.


## 18. Sync: the foundation is the clock (2026-10-27)

**Why.** Drift was heard first on Chimes (swapping the stem onto another toy gave the same result, so it is the file or perception, not the toy). The foundation is the only stem audible the whole time, so what matters is each stem's agreement with it. Specs docs (checked 2026-10-27): 25 MB published Lens limit; File Audio Tracks are mono (stereo planned); no per-channel API, so a multitrack WAV cannot give separate stems. AudioComponent defaults to `Audio.PlaybackMode.LowPower` on Specs (adds latency; settable from script only; not set anywhere in this project; Preview may not simulate it) [type definitions].

**Built (`MusicSync`, `StageConfig > Music and sync`).** Each `driftCheckInterval` (default now 1 s) every toy stem's offset from the foundation (`stem.position - foundation.position`) is measured. Over `driftTolerance` (default now 0.02 s): that stem alone fades out (`ToyVolume.silenced`, max `syncFadeSeconds` 0.3 s), is stopped, seeked to foundation position + a learned lead, played, and fades back in. 0.25 s later it is measured again and the lead is corrected by the leftover; it is accepted only inside HALF the tolerance, else it retries (up to `syncMaxFixTries`, 3, then a full restart). If `syncOddOneOutFraction` (0.5) of the stems are off the same way, the foundation is judged to have slipped and everything restarts together. `syncLog` prints every check. `syncTestKnock` / `syncTestKnockMs` push Chimes out of sync once, for testing.

**Preview results.** A knock of 80 ms read as 38 to 48 ms; the check caught it at the next check, the first restart landed at about -20 ms, the second (learned lead about 31 ms) at 0 ms, and it stayed at 0 ms for the rest of the run. Compiles, no errors, start spread unchanged (0.021 s).

**Not verified.** (1) In every Preview run all stems read exactly 0 ms from the foundation, all toys at volume 0, for 14 s: natural drift was NOT reproduced, and `position` may not reflect what is audible. (2) The fade with a toy audible (the tests had every toy off, so the fade was instant). (3) The "foundation is the odd one out" restart. (4) Anything on a device, including LowPower latency. Possible next step: an explicit `playbackMode` Inspector choice.


## 19. Fit To Mesh Bounds: any mesh as a toy (2026-10-27)

**Why.** The 1 x 1 x 1 box was never a Lens Studio rule: it came from `Tools/make_blob_meshes.py` (the placeholder blobs are normalised to it) so that Mesh Scale in cm would be the real size and a 1x1x1 collider would fit. Now the artist makes the meshes in Blender, so the mesh's own bounds are used instead.

**Built (`ToyConfig`, per toy, default OFF so the other six toys are unchanged).** New input `Fit To Mesh Bounds` (Shape group). ON: Mesh Scale x Size Multiplier = the blob's REAL size in cm (x width, y height, z depth), whatever the mesh file's size; the Visual's scale is that size divided by the mesh's own size (`RenderMesh.aabbMin/aabbMax`, checked in `StudioLib.d.ts`). The touch box is set to the mesh's own size, the footprint stays the widest side of the real box (`realSize()`), and Auto Rest On Floor lifts by the mesh's real lowest point (so the pivot can be anywhere). Squish keeps the base on the floor with the same rule. Visual Rotation, Visual Offset, Collider Size Override and Footprint Override still work as before.

**Limits.** The collider is a box centred on the pivot (a box shape has no offset), so an off-centre mesh is fitted in size, not shifted. With a Visual Rotation, the resting height uses the rotated box corner, so the blob rests a touch high. The mesh must be Y-up (rotate with Visual Rotation otherwise).

**Test (Toy_01_PianoMel, Blob_03 `FlatBlob`).** Compiles, no errors. Runtime: Visual scale (3.995, 4.056, 3.995), local y 1.3175 = 0.325 x 4.056 (the base is on the floor), real size 4 x 3.2 x 4 cm. Not read back at runtime: the collider box size (the runtime query does not list it). Not tested: squish and audio-reactive on this toy, a real poke or pinch.

**Blender rules for new meshes (with Fit ON):** Y up in the vertex data (apply rotation and scale in Blender, as for Blob_01 and Blob_03; the FBX node's -90 / x100 is ignored by the mesh asset), one UV island, about 1,350 to 1,550 vertices. Size and pivot no longer matter.

## 20. Base blob scale (2026-10-27)
- `StageConfig > Base Blob Scale` (BASE_BLOB_SCALE, default 4 cm) is the base blob's longest side and the reference toy size for spacing, edge padding and slot counts (`StageConfig.toySize` now just returns it).
- Per toy (`ToyConfig`): `sizeMultiplier` (unitless, clamped 0.75 - 1.3 with a one-time warning) and optional `shapeProportions` (default 1,1,1). `restScale() = Base Blob Scale x Size Multiplier x Shape Proportions` is the only source of settled size; it replaces `meshScale` and `shapeScale()`.
- Music, squish and poke multiply on `restScale()`; footprint, collider, rest height and landing derive from it. Pads and the shadow circle stay fixed-size (decision: pads do not follow the toy's size, see BRIEF).
- Blob_03 (`FlatBlob`) is 1.001 x 0.789 x 1.001, so the old 4 x 3.2 x 4 cm toys are now 4.005 x 3.156 x 4.005 cm (about 1% smaller in height).

## 21. Blob shape toolkit, phase 1: Form + Surface bake (2026-10-27)
- Scripts: `BlobProfile.ts` (BlobParams, min/max/default table, clamp, presets), `BlobBake.ts` (BlobBaker: private copy of the base mesh via `MeshBuilder.createFromMesh`, deformed once), `ToyShape.ts` (per toy: preset + per-section Override, bake, live re-bake). `ToyConfig.restScale()` also multiplies the preset's suggested proportions (`presetProportions`, each <= 1).
- Verified in the Preview (not assumed): the copy is a separate asset, the shared mesh is unchanged, vertex count stays 1649, attribute layout is position(3) normal(3) texture0(2) tangent(4), `updateMesh()` recomputes the bounds, writing 1649 vertices ~14 ms, a full bake 17-21 ms per blob in the Editor (one blob per frame, nothing per frame afterwards except a hash of ~21 numbers when Live Edit is on).
- Bake order: soft cube, taper, flat bottom, bend, then ruffles / lumps / dimples / ridges (functions of position + seed only, so seam vertices never split), welded smooth normals, tangents re-squared, re-centre and scale so the longest side is exactly 1.0 and the bounds centre is the origin.
- Stem presets: PianoMel Keys, PianoVar Keys + own lumps (count 6, seed 8), Cello Strings, Violin Strings, Chimes HiHat, SFX Pad, MixPerc Kick. Bass, Snare and Lead exist but are unassigned.
- BRIEF.md rule 1 ("no runtime-generated meshes") is relaxed on the artist's request: blob meshes are now baked at startup from the shared Blob_03 mesh. Pads were already generated in code (PadShape).
- Phase 2 (Feel, comfort limiter, beat responses), phase 3 (tuning mode, randomize, gallery, face, glow, shader hooks) are not built yet.

## 22. Independent toys: prefab is structure only; per-toy Feel; comfort limiter; per-toy materials (2026-10-27)
Why: editing one toy changed the others. Cause (found by listing the in-memory Toy prefab): the prefab itself held 4 ToySquish and 2 ToyShape components (presets 6 and 3, a PianoVar-style lump override) that every toy inherited, plus movement overrides (damping 1.0, bulge 4, ...) stored in the prefab. My own Editor-API adds had landed in the prefab. Earlier "enumeration artifact" note was WRONG.
- Toy prefab now: Interactable, AudioComponent, ToyConfig, ToyVolume, ToyInteraction, ToyAudioReact, ONE ToySquish. No ToyShape, no feel values.
- Each toy instance has exactly ONE ToyShape (instance level). Shape and Feel for that toy live there only.
- ToyConfig: the Override react / motion / squish groups were removed. r* values come from `toyCfg.feel` (set every frame by that toy's ToyShape); StageConfig values are only the fallback when a toy has no ToyShape.
- New ToyFeel.ts (plain data): FeelParams, FEEL_RANGES, limitFeel(). New StageConfig group "Comfort limiter (all toys)" (squash, stretch, bulge, overshoot, damping, spring Hz, wobble Hz/degrees, music pulse, bounce).
- Damping is always below 1 (hard max 0.9, limiter default max 0.9; lowest allowed comes from Max Overshoot: 0.25 -> 0.40).
- Wobble: each toy has Feel Seed -> its own wobble rate (+-15% of Wobble Hz) and phase. ToyAudioReact uses sin(t * rate + phase) instead of one shared sin(t * 7); pulse, bounce and wobble are capped by the limiter.
- Materials: Toy_Mat_01..07 (Pink, Peach, Yellow, Mint, Sky, Lilac, Coral), one per toy, assigned on each toy's Visual as an instance override; all share one texture. Material base colour = that toy's ToyConfig Base Color. StateColours still clones the material at runtime (kept: it also protects the asset from runtime edits).

## 23. ToyShape clean-up (2026-10-28)
- Rule added to CLAUDE.md and BRIEF rule 1: warn and wait for approval before any new change that creates runtime meshes.
- `ToyShape`: the change-detection hash is now taken on the values as typed (before clamping), so an out-of-range value can no longer cause a re-bake every 0.3 s. `fillEffective` and `updateFeel` are table-driven (loops over `PARAM_KEYS` / `FEEL_KEYS`); preset values are cached per toy, no per-frame allocation. With `StageConfig > Blob shape > Live Edit` OFF, Feel is worked out once, not every frame.
- `StageConfig`: removed the dead global Feel fallbacks (driftSpeed, settleDuration, pokeSquash, landSquash, grabStretch, squishBulge, squishFrequency, squishDamping). `ToyConfig` fallbacks (a toy without a ToyShape) now use the `FEEL_RANGES` defaults. Kept: pokePressSeconds, landPressSeconds, squishEnabled, hover/drift limits.
- NOT done: slider ranges in the decorators are still literal numbers (see report); Preview check: 7 bakes at start, no repeats, no errors.
- Follow-up (2026-10-28, same day): `ToyShape` Bend Axis and Ridge Direction were `SliderWidget(0,1,step 1)`, which cannot be dragged. Now dropdowns (`ComboBoxWidget`): Bend Axis = Left-right (x) 0 / Front-back (z) 1; Ridge Direction = Top to bottom 0 / Rings around 1. Stored values are still 0 and 1. Compiles; the dropdowns have NOT been tested in the Inspector yet.
- The `ruffleAmp` hint was wrong by 10x (said 0.02 = 0.8 cm). Amplitudes are fractions of the blob's longest side (4 cm): 0.02 = 0.08 cm = 0.8 mm; caps: ruffle 0.06 = 2.4 mm. Hint corrected.
- Open question ("Override does nothing except Form"): the override logic (`sectionOf`, `fillEffective`) reads correctly. Likely cause: surface effects are only ~1.6-3.2 mm at their caps and the soft shading hides them; Count also defaults to 0 in an override, so ticking alone adds nothing until Count is raised. NOT confirmed visually (a close-up capture failed). Toy_01 `overrideRuffles` is still unticked in the scene (I toggled it for a test and put it back). Setting a property via the editor resets the Lens and re-bakes all toys (not a live drag update).
- DECISION PENDING (artist): (1) raise the amplitude caps ~3-4x (recommended), (2) make the presets stronger, or (3) leave as is.

## 24. Surface amplitude caps and spacing-based lump size (2026-10-28)
- Investigation: base mesh `Models_Import/Blob_03.fbx` is a cube-sphere (16x16 quads per face, 1,536 quads, 1,649 vertices in the Lens); widest ring 64 vertices (about 0.1 rad apart). Clean limits: about 10 ruffles or longitudinal ridges (creased ruffles about 8), about 5 ring-direction ridges, bump width sigma >= 0.2 rad. Stress test on Toy_01 (caps raised temporarily, then reverted): ruffles 10 / amp 0.15 gave an offset of -0.109..+0.134; lumps 6 / amp 0.12 / sigma 0.2 gave 0..+0.1185; overlapping lumps reach about 1.3x their amp. The capture tool shows silhouettes only (no shading).
- New caps (sliders in `ToyShape.ts`, `RANGES` in `BlobProfile.ts`, kept in step by hand since slider ranges are literal numbers): ruffleAmp 0.15, lumpAmp 0.15, dimpleDepth 0.10, ridgeAmp 0.08; ruffleCount 10, ridgeCount 10. The last clamp is `MAX_OFFSET = 0.2` (exported from `BlobProfile.ts`, used in `BlobBake.apply`; was a literal +-0.1). Defaults and presets' amplitudes are unchanged (0.02 to 0.03 is still only about 1 mm: raise them per toy).
- Lump and dimple size is now a FRACTION OF THE GAP between neighbouring bumps (0.1 to 0.5, default 0.3): `sigma = max(0.2 rad, size x sqrt(area / count))`, where area is the part of the unit sphere the bumps are spread over (lumps 2 pi x 1.2, dimples 2 pi x 0.9). The look no longer changes with Count and bumps don't fuse into a swell. Hint in cm terms rewritten (the old "0.5 = finger-tip" was wrong: it was a sigma in radians).
- Existing sizes reset to the default 0.3 (artist's choice) on all 7 toys' ToyShape (lumpSize and dimpleSize); presets HiHat, Keys and Pad no longer set their own lump size. All other toy settings untouched.
- No mesh change and no size growth. A 32x32-per-face base mesh (about 6,600 vertices) was NOT done: it would only help counts above 10 or bumps narrower than 0.2 rad, and needs your approval.
- Compiles; Preview: 7 bakes, no errors. Not looked at shaded in the Editor.

## 25. Springy music motion (option A) and the vertex-deform shader contract (option B) (2026-10-28)
**Option A, built** (`ToyAudioReact.ts`, new `ToyMotionMath.ts`, `ToyFeel.ts`, `ToyShape.ts`, `ToyConfig.meshHeightRange()`):
- Hits (onsets) in the stem loudness kick springs, not the raw loudness. `OnsetDetector`: a hit is the level rising above its slow average (0.35 s) by a threshold set by Onset Sensitivity (0.3 down to 0.04), at most one per 0.1 s.
- Pop spring: height x (1 + pop), width and depth x 1/sqrt(1 + pop), so the volume is kept. Slightly underdamped (Kick Damping default 0.7, about 5% overshoot). Sustain (0-1) lets steady loudness lean the pop a little.
- Rocking: two springs (roll, pitch); each hit rocks in a new direction (golden angle). The Visual turns about the BASE of the blob (mesh lowest point), not its middle.
- Comfort limiter caps: pop (maxSquash / maxScalePulse), bounce, tilt; Kick Hz <= Fastest Spring; Kick Damping >= the Furthest Overshoot setting.
- Music Class (ToyShape > Feel): Custom, Strings, Piano, Chimes / FX, Percussion. A class REPLACES the 12 music-motion values (table in `ToyFeel.ts`). Set on the 7 toys by name (Piano x2, Strings x2, Chimes/FX x2, Percussion). Poke / landing / grab values are not part of a class. Set a toy back to Custom to use its sliders.
- Verified in Preview (React When Off on, then reverted): a hit made a toy 4% taller, volume held to 0.1%, with bounce and rocking, then it settled.

**Option B, the parameter contract** (script side built: `ToyShaderDeform.ts`; the graph is the artist's). StageConfig > Audio-reactive motion > Shader Deform (default OFF). When ON: squash, sway and ripples go to the material, only bounce stays on the Visual. Written every frame to the Visual's `mainPassOverrides` (`MaterialMeshVisual.mainPassOverrides: PassPropertyOverrides`, StudioLib.d.ts; the material asset is never edited). Reading it back and graph parameters: the d.ts only documents `mainPass.<ScriptName>`; the overrides object is the same pattern. UNVERIFIED until the graph exists.
All are Float Parameter nodes at the graph root, exact Script Names:
| Script Name | Type | Range | Unit / meaning | Set by |
|---|---|---|---|---|
| deformAmount | float | 0-1 | 0 = off, 1 = full; default 0 | script (1 when on) |
| kick | float | -1 to 1.5 | beat spring, unitless | script |
| squash | float | -0.4 to 0.4 | fraction; + flatter and wider, - taller and thinner | script |
| swayX | float | about -0.25 to 0.25 (graph allows -1 to 1) | mesh units, object space; lean of the top along x (changed 2026-10-31 from the vec3 swayOffset) | script |
| swayZ | float | about -0.25 to 0.25 (graph allows -1 to 1) | mesh units, object space; lean of the top along z | script |
| swayGain | float | 0-20, default 4 | unitless multiplier on swayX and swayZ (one node feeds both axes); chain is (sway x swayGain) x deformAmount x reach^2. Added 2026-11-01 because the script's lean (swayAmount 0.07 x hit) was too small to see in mode On | material only, NOT set by the script (each toy's material copy keeps its own value) |
| noiseGain | float | 0-50 (artist tests used 40), default 8 | unitless multiplier on noiseStrength, applied inside the graph: (noise - 0.5) x (noiseStrength x noiseGain). Added 2026-11-01 because the script's strength (noiseAmount 0.01 default, 0.06 max, x volume x loudness) is about 0.4 mm on a 4 cm toy in mode On | material only, NOT set by the script (each toy's material copy keeps its own value) |
| noiseStrength | float | 0-0.06 | fraction of the longest side | script |
| noiseScale | float | 0.5-6 | noise cycles across the blob | script |
| noiseTime | float | 0-1000 | seconds, this toy's own clock | script |
| noiseSeed | float | 0-100 | per-toy offset | script |
| reachBaseY | float | about -0.5 | mesh units, height of the base | script (mesh bounds) |
| reachHeight | float | about 1 | mesh units, base to top | script (mesh bounds) |
| reachPower | float | 0.5-3 | curve of the reach, default 1.5 | you, in the material |
Nodes (names from this Lens Studio's node list): Surface Position (Space: Object), Surface Normal (Space: Object), Transform Vector (From Object, To World), Split Vector, Construct Vector, Subtract, Divide, Clamp, Pow, Dot Product, Add, Multiply, Noise ( Simplex ), One Minus, Inverse Sqrt, Mix, Float Parameter. Output goes to the Shader node's World Position (Vertex). World Normal (Vertex) is left unconnected (original normals).
Recipe and checks are in the chat reply of this date; the order is position, reach, noise, sway, squash, output.
- Normal handling is deferred: no thinness channel, reach-based flexibility only. No mesh change, no size growth.

## 26. BlobShader_01 deform graph and blob look, built so far (2026-10-31)
Shader is now `Assets/Materials/BlobShader_01.graphShader`, material `Toy_Piano.mat` (Toy_01_PianoMel first; duplicate to the other toys later). Wherever this plan says Toy_pbr for the toys, read BlobShader_01.
**State look (built):** `BlobLookDriver` in `StateColours.ts`, driven by `ToyConfig` > "Blob look". The material's Graph Parameters (bodyColor, edgeColor, bodyOpacity, edgeOpacity) are the OFF baseline; low / medium / loud are multipliers of it (defaults colour 1/1.8/2.7/3.3, edge opacity 1/1.7/2.3/2.7, body opacity 1/1.7/2.3/3), clamped 0-1, faded over 0.25 s. `audioEdge` = audioLevel x (0 / 0.4 / 0.7 / 1.0) because the analyzer reads before volume (`ToyConfig.setAudioEdgeLevel`, called from `ToyAudioReact`). Falls back to the old `StateColourDriver` if the material has no `edgeColor`. Opaque-looking blobs on an additive display are NOT verified on a device.
**Per-toy Shader Deform switch (built):** `ToyConfig` > "Shader deform (this toy)": Follow Stage / On / Off. `ToyAudioReact` uses it in place of the stage switch when set to On or Off.
**Deform graph, as built and tested by hand in the Inspector (not yet script-driven):**
- Vertex = Surface Position (World) + Transform Vector(Object to World, Apply Translation OFF, Apply Rotation on)(displacement). Apply Translation ON made the toy appear about twice its world distance away; keep it off.
- s = deformAmount x squash; h = clamp(1 - s); w = 1/sqrt(h). dX = x(w-1), dZ = z(w-1), dY = (y - reachBaseY)(h-1): squash about the base, volume kept.
- reach = clamp((y - reachBaseY) / reachHeight, 0, 1); reach squared is the weight for kick and sway.
- kick lift added to dY = kick x deformAmount x reach^2 x a constant (now 0.4 mesh units; 0.1 was too small to see). Confirmed working.
- sway added to dX and dZ = swayX / swayZ x deformAmount x reach^2. Wired correctly in the graph, but NOT visible yet (see open items).
- Defaults in the graph: reachBaseY -0.4, reachHeight 0.8 (min 0.05), kick 0, deformAmount 1. The script overrides reachBaseY / reachHeight from the mesh bounds.
**Script change:** `ToyShaderDeform.ts` now writes swayX and swayZ (two floats) instead of one swayOffset vec3.
**Open items:**
1. Sway (RESOLVED 2026-11-01): it worked in Follow Stage when set by hand. In mode On it was only too small (script lean = swayAmount 0.07 x a hit of about 1, about 3 mm on a 4 cm toy). Fixed in the graph with a `swayGain` Float Parameter (default 4) multiplying swayX and swayZ; artist confirmed it works as planned. The vec3 `swayOffset` no longer exists. Mode On still needs a check that kick and squash reach the cloned material the same way (sway visibly moving suggests the overrides do arrive).
2. Shader Deform Mode = On (script driving `mainPassOverrides` into the runtime clone "Clone of Toy_Piano"): sway and noise now visibly work in On (2026-11-01), so the overrides do arrive. Not formally checked: kick and squash in On, and that the overrides coexist with the `mainPass` writes (state look).
3. Noise (BUILT 2026-11-01): Surface Position (object space) -> Split Vector. Seed = Construct Vector(X + noiseSeed + Z, Y + noiseTime); Scale = Construct Vector(noiseScale, noiseScale); both into Noise ( Simplex ) 2D. Then Subtract 0.5 (the Simplex output is 0 to 1), Multiply by (noiseStrength x noiseGain), Multiply by Normalize(Surface Position) (outward from the mesh centre), and Add as the last step before the vertex Position. Artist-tested in mode On: noiseScale 6 with noiseGain 40 reads well. Known look: a slow undulating blobby wobble, not fine waves, and noiseScale changes only make it somewhat finer (2D Simplex on three axes). Accepted as good enough. Follow Stage hand-testing is far more sensitive than mode On because the script's strength is tiny, so judge noise only in mode On. Hand-test noiseSeed with values like 7/37/71 and noiseTime with 0/10/20; 0 to 1 hardly changes the pattern.
4. Normals / rim glow on deformed geometry not checked (World Normal (Vertex) unconnected).
5. Preview stage-fallback puts the stage far away (z about -265 to -1200 cm) because the World Query keeps missing the table; this is a Preview behaviour, separate from the shader.
6. Still open from section 25: raise preset amplitudes, test Bend Axis / Ridge Direction dropdowns, `dimpleDepth 0.1` warning, duplicate the working toy and material to the other six toys (each gets its own material, with its own swayGain and noiseGain), then remove the obsolete Toy Colors section. DROPPED 2026-11-01 by the artist: the denser mesh and thinness channel (one shared base mesh, 25 MB budget).

## 27. Glowing core and glitter sparkles (planned 2026-11-01; glitter built, see section 29)
**Step 1, core glow (script side BUILT 2026-11-01; graph is the artist's).**
| Script Name | Type | Range | Unit / meaning | Set by |
|---|---|---|---|---|
| coreHeat | float | 0-1 | unitless: 0 = cold, 1 = hot. Slow follower of the stem loudness (level x toy volume state x React Amount). Written whether or not Shader Deform is on; 0 when audio-reactive is off | script (`ToyAudioReact` via `ShaderDeformWriter.writeCore`) |
| coreColorLow | color | | deep red-orange, core colour at coreHeat 0 | material only |
| coreColorHigh | color | | yellow-white, core colour at coreHeat 1 | material only |
| coreSize | float | | how far the glow reaches from the centre | material only |
| coreGain | float | | multiplier on the glow strength, like noiseGain | material only |
- Follower: `ToyAudioReact` Inspector fields Core Rise Seconds (default 1.5 s) and Core Fall Seconds (default 3 s), per toy.
- UNVERIFIED until the graph has a `coreHeat` Float Parameter: that writing an override for it reaches the material (sway and noise did, so likely).
- Tuning: if the edge opacity rise hides the core, lower the opacity near the edge.
**Step 2, glitter: BUILT (see section 29).** `GliterToy.graphVfx` + `GlitterDriver.ts`, one `GliterToy` child under each toy's Visual (from `Toy.prefab`). **Step 3, cost check (cap 40-80 particles per toy):** not started. No mesh is created in code.
**Update 2026-11-01 (core glow):** (a) `coreHeat` no longer uses React Amount (that is motion strength; it capped the glow at 0.63 on Toy_01). (b) The old per-toy colour system is REMOVED from `ToyConfig` (Base Color, four state colours, Colour Seconds, Colour Param, Reset Toy Colours) and the StageConfig "Reset Toy Colours" switch: colour comes only from the shader via BlobLookDriver. Toys whose material has no `edgeColor` keep the material's own colour until they get the shader. ToyPad colours are untouched. (c) Core is a centre glow, the reverse of the edge: the edge uses Camera Facing Ratio (Invert off), which the artist confirmed is high at the rim, so the core uses the same node reversed (One Minus). The body is opaque in play (opacity multipliers clamp to 1), so the core is painted on the surface and must also raise alpha.

## 28. Graph-owned look (2026-11-02; replaces the multiplier system of section 26 "State look")
**Why.** The per-state multipliers were applied to the material's Off values and clamped to 1, so with body opacity 0.76 the states collapsed (off 0.76, low 0.76, medium 1, loud 1), and the script overwrote the same material parameters you were editing. The Inspector preview also showed the material's saved `audioEdge` 1.0 and `coreHeat` 1.0 (a loud look) while a Off toy runs at 0. Core Colour Low was invisible because the core mask was multiplied by `coreHeat`.
**Built (script side).** `BlobLookDriver` (StateColours.ts) no longer writes colours or opacities and no longer clones the material. It writes two Float values to the Visual's `mainPassOverrides`: `lookState` (0 to 3, unitless, smoothed; 1.5 = halfway between low and medium) and `audioLevel` (0 to 1, unitless). Active only if the material has a `lookState` parameter; otherwise the material is untouched (so the other six toys keep their current materials). `coreHeat` is unchanged.
**Removed from ToyConfig > Blob look:** Colour Multiplier, Edge/Body Opacity Multiplier, Audio Scale, and the five parameter-name strings. Kept: Blob Look (on/off) and Blob Seconds (now seconds per state step). `ToyAudioReact`: Core Rise/Fall Seconds renamed Glow Warm-up / Glow Cool-down Seconds (same defaults 1.5 s / 3 s; the old saved values are not carried over). `setAudioEdgeLevel` is now `setAudioLevel`.
**Graph contract (artist builds; Toy_01 first).** Script Names: `lookState`, `audioLevel`, `coreHeat` (script); `bodyOpacityOff/Low/Med/High`, `edgeOpacityOff/...`, `bodyColorOff/...`, `edgeColorOff/...`, `coreRestOff/Low/Med/High`, `coreColorLow/High`, `coreSize`, `coreSoftness`, `coreGain`, `coreOpacityBoost`, `edgePower`, `rimPulse` (material). State picker: w1 = clamp(lookState), w2 = clamp(lookState - 1), w3 = clamp(lookState - 2); value = mix(mix(mix(Off, Low, w1), Med, w2), High, w3).
**Not verified:** that the overrides reach the material for lookState (the same route as coreHeat, which works); nothing seen in the Preview yet.

## 29. Audit before copying Toy_01's look to the other toys (2026-11-03)
Read-only audit of the saved project, plus one fix. Nothing else was changed. Toy_01_PianoMel is the reference.
**Fixed:** `Toy_Piano.mat` had a stale cached property `edgePowe` (CachedProperties). The shader's Script Name and the live value were always `edgePower` (1.2). Renamed the cache entry to `edgePower`. Lens Studio may rewrite the file on the next save; that is fine.
**Glitter as built (corrects section 27):** each toy has `Visual/GliterToy` (a VFX Component, RenderOrder 1, plus `GlitterDriver`). All seven VFX components point at the ONE asset `GliterToy.graphVfx`; its look (colours, shine, piece size, counts) is stored in the asset, not in the component. `GlitterDriver.cloneAsset` gives each toy a runtime copy so live signals are not shared, but the copy starts from the shared asset. For a per-toy glitter look, duplicate the asset (`GliterToy_01..07`) and assign one per VFX component, after the graph is final. While Keep Inside is ON the driver overwrites the graph's Band Bottom/Top, Radius, Drift and Pickup Lag Limit.
**Material rules for the copies:** colour, opacity, glow live in the toy's own material, so each toy needs its own copy of `Toy_Piano` (Toy_01 and Toy_02 currently share it). The scripts write only per-Visual overrides (`lookState`, `audioLevel`, `coreHeat`, deform values), never the asset. Toys 03 to 07 still use Toy_Mat_03..07 (no deform or look parameters), and every toy has Shader Deform = On, so toys 03 to 07 currently lose their music squash and sway until they get the new material.
**Findings, not yet changed (artist to decide):**
1. Toys 02 to 07 each carry TWO ToyShape components. `Toy.prefab` contains a ToyShape holding Toy_01's exact values (preset Keys, all overrides, Music Class Piano, feel seed 2785), and each of those toys has its own on top. Toy_01 has only the prefab one. Both bake the same Visual mesh and both write the toy's Feel, so which one wins is order dependent. This contradicts section 22 (prefab has no ToyShape). Fix idea: remove it from the prefab and give Toy_01 its own instance copy.
2. Toy_01 Music Class = Piano replaces its 12 hand-set Feel values (Scale Pulse, Bounce, Wobble, Wobble Hz, Onset, Sustain, Kick Hz, Kick Damping, Sway, Noise, Noise Scale, Noise Speed). Its tuned sliders (for example noise 0.06, scale 6, speed 3) are not used while the class is not Custom.
3. Shape Preset on Toy_01 (Keys): Form, Ruffles, Lumps and Dimples are overridden, and Keys has no ridges, so the preset contributes nothing there (Ridge values 6 / 0.015 are stored but unused, Override Ridges is off). The preset is still used by Toys 03 and 04 (Strings: lumps, dimples, ridges), 05 (HiHat: ruffles, lumps, dimples) and 07 (Kick: form). Removing it would change those four toys.
4. Unused assets: `Materials/Toy_Mat_01_Pink`, `Toy_Mat_02_Peach`, `Toy_Mat_08_Aqua`, `Stage_Mat_Placeholder`, `Tray_Mat`; `Meshes/Stage_Disc.mesh`, `Toy_Shape_Cylinder.mesh`; `Untitled TypeScript.ts` and `Untitled TypeScript 2.ts` (89 bytes each). Toy_pbr, simple_pbr, unlit and FrameMatPlaceholder shaders are only used by old materials.
5. `ToyConfig > Shape > Fit To Mesh Bounds` is ON for all seven toys, so its OFF branch (the old 1 x 1 x 1 box rule) is unused. Per-toy Shader Deform = On is redundant while StageConfig > Shader Deform is ON.


## 30. Shape preset removed (2026-11-03)
- ToyShape no longer has the Shape preset dropdown or the five Override tick-boxes; each section's own values are always used.
- Removed `PRESETS`/`presetParams`/`presetProportions` (BlobProfile.ts) and `ToyConfig.presetProportions`.
- Toy_01 `ridgeCount` set to 0 so its look is unchanged (the Keys preset had no ridges and Override Ridges was off).
- Correction to section 29: `Stage_Disc.mesh` is used by the scene and was kept.
- Other toys: any stored `preset`/`override*` values are now ignored; check their form/surface values still look right.

## 31. Toys 02 to 07 rebuilt from Toy_01 (2026-11-03)
- Old Toys 02 to 07 deleted. Six copies of Toy_01_PianoMel made (`Toy_02_PianoVar` to `Toy_07_MixPerc`, order 01 to 07 under `Stage/Toys`). No script changed. The copies carry Toy_01's values (ToyShape, Feel, Music Class Piano, Shader Deform On); they are not reset to defaults. The duplicate ToyShape on 02 to 07 (section 29, finding 1) is gone.
- Per toy: own material `Materials/Toy_0N_<Name>_Mat` (copy of `Toy_Piano`), own glitter asset `Toy_0N_<Name>_Glitter.graphVfx` (copy of `GliterToy`), stem, Feel Seed (Toy_02 1137, 03 3271, 04 4903, 05 6428, 06 7716, 07 9054; Toy_01 stays 2785), Home Position. Stems: 02 = 03_PianoVar_B, 03 = 04_Cello_B, 04 = 05_Violin_B, 05 = 06_Chimes_B, 06 = 07_SFX_B, 07 = 08_MixPerc_B. Before this, old Toy_02 pointed at 02_PianoMel_B (the same stem as Toy_01) and Toy_01's home.
- Toy_02 Home Position is new: (5.5, 0, -14.5), because its old value duplicated Toy_01's (-2.5, 0, -14). Others kept their old homes.
- Rewired: `StageConfig > Toys` (7 entries) and each `ToyPad > Toy` (Pad_02 to Pad_07).
- The shader graph `BlobShader_01` is still shared by all seven materials.
- NOT done (no API): the VFX component's asset slot cannot be set from the Editor API. Each toy's `Visual/GliterToy > VFX Component > VFX Asset` still points at `GliterToy` until assigned by hand.
- Preview: no errors; 7 bakes; 8 stems; sync 0 ms. Warnings: dimpleDepth clamp (inherited from Toy_01), `GliterToy` graph has no `toyVelocity` parameter, and toys 03 to 07 report "home position was outside the stage or overlapped": homes moved at start.
- Tooling note: `asset-graphql duplicateAsset` renames the source instead of copying. Materials were copied by file with new internal IDs instead.

## 32. Session review: materials, band split state, Chimes level floor (2026-11-04)
No code or asset was changed in this session. Review only.
**Undocumented until now (found in the code, built on 2026-11-04 or earlier):** the band split. `StemLevelReader.readBands` (StemLevel.ts) splits a stem at `ToyShape > Feel > Band Split Hz` (0 = off) into a low and a high band, each auto-levelled on its own. `Band Mix Kick / Sway / Vfx` (0 = lows only, 1 = highs only) choose what drives the kick (and material audioLevel and glow), the sway, and the glitter (`ToyAudioReact`). Method: two one-pole low-passes in series (12 dB per octave), highs = input minus lows, filter restarted on every read, `.x` channel only, 512 samples (about 11.6 ms). Limits: weak separation near the split, poor reading below about 150 Hz, no memory between frames. Not yet improved; this is the "band isolation" work still to do.
**Materials (Toy_Piano + Toy_02..07_*_Mat):** each toy's Visual uses its own material; all carry the full parameter set. Differences in colours, opacities, core, edge power, noise, kick and reach values are intentional (each instrument behaves differently): do not normalise them. Noted for the artist, not changed: `swayGain` is 0 on toys 01, 02, 05, 07; leftover saved preview values (squash +-0.4 on Cello / SFX, swayX / swayZ -1 on SFX, kick 1.45 on SFX, audioLevel 1.0 on Chimes, deformAmount 0.13 to 0.25 on toys 02, 03, 04, 06, 07); edge opacity identical on all seven. The script only resets `deformAmount` to 0 if Shader Deform was on and is then switched off, so a saved non-zero value shows when a toy has deform off from the start.
**VFX:** all seven GliterToy VFX components still point at the one shared `GliterToy` asset; the artist is assigning the `Toy_0N_*_Glitter` copies by hand.
**Chimes does not react (measured):** stems decoded read-only and RMS taken per 512-sample window. Median / loudest RMS: Cello 0.037 / 0.130, Violin 0.022 / 0.117, MixPerc 0.012 / 0.436, PianoMel 0.011 / 0.067, PianoVar 0.0019 / 0.025, SFX 0.0005 / 0.041, Chimes 0.0006 / 0.0145. Windows below the StageConfig Level Floor (0.005): Chimes 100%, SFX 82%, PianoVar 81%, MixPerc 23%, PianoMel 28%. The floor is absolute and applied before auto-level, so Chimes always reads 0 (PianoVar and SFX lose their quiet notes). The band split would make it worse (each band uses the same absolute floor).
**Decision (artist, 2026-11-04):** try the per-toy `ToyShape > Feel > Level Floor` first (about 0.0005 for Chimes; 0.0003 to 0.0005 for PianoVar and SFX if needed). Proposed, NOT built, waiting for a go-ahead: make the floor relative to each stem's own auto-level peak (absolute floor kept as a minimum for digital silence), so quiet stems work with no per-toy tuning and the band split inherits it.
**Next session:** (1) check the Level Floor results; (2) band isolation: ask for which stems and toys it fails, whether 2 or 3 bands, and whether a longer window or a filter that keeps state between frames is acceptable (CPU; keep sample count an Inspector value).

## 33. Table taps and ripples: PARKED, possible future feature (2026-11-05)
Not approved by the artist; do not build any of it. Replaced for now by the smaller home-position work. The design below is kept for reference only.
Nothing built. Snapshot taken first: `../Specs_Oct25_PT_A_backups/Scripts_2026-11-05_1559/` (Scripts, Prefabs, Scene.scene).
**Read and verified in the code (SIK Cache + project scripts):** `HandInputData.getInstance().getHand("left"|"right")` gives a `TrackedHand` with `points` (21 `Keypoint`s, each `.position` world, cached per frame), `wrist`, `indexTip`, `isTracked()`. `ToyPad.activate(source, hand)` is the one door a pad touch uses (-> `ToyVolume.requestCycle`, cooldowns, `onPadTap`). `ToyVolume` source type is `"padPoke" | "padClick" | "padSlide" | "airPoke" | "code"`. `StageAnchor.surfaceNormal()` is null in the fallback. `ToyPad` has a distance-to-pad measure used for routing overlapping pads (its exact public name still to confirm before coding).
**Proposed scripts (all TypeScript, each single-purpose):**
1. `TableTapDetector` (on Stage). Plane = the stage floor (stage world position + surface normal, level in the fallback). A joint counts as a tap when it comes within `Contact Height` (cm) of the plane while moving down faster than `Min Down Speed` (cm/s); one tap per hand per `Tap Cooldown` (seconds), so a palm pat or typing makes ONE event, at the average of the touching joints projected on the plane. The hand must rise above `Release Height` (cm) before it can tap again. Fingertips, finger bases, palm (wrist) and fist are all just "joints of the hand". Tap strength (joint down speed, cm/s) is recorded in the event but not used. `Detect In Fallback` (default OFF): in the floating fallback there is no real table, so hand taps are not trusted. Event: `onTableTap {worldPosition, stagePosition, strength, hand, source: "hand"|"mock"}`. **[Hand path unverified: no joints in the Editor Preview; needs a device.]**
2. Editor mock (same script, toggle): a click in the Preview, or a key, fires `onTableTap` with source "mock" at the point where the ray meets the stage plane. Lets the ripple, the toy bounce and the pad routing be tested in the Editor. Screen-to-ray API to be verified in StudioLib.d.ts before use.
3. `TapRipple`: listens to `onTableTap`, instantiates the AUTHORED ripple prefab (Inspector slot; a small pool, reused), places it flat on the plane at the tap, then over `Ripple Seconds` grows it to `Ripple Max Radius` (cm) and writes a 0..1 `rippleProgress` float to the Visual's `mainPassOverrides` (the same route as the other overrides; no material is cloned or made). The look (fade, ring, colour) is YOUR shader/material. Nothing is made in code, no mesh.
4. Toy bounce: toys within `Bounce Radius` (cm) of the tap get a kick scaled by falloff (1 at the tap, 0 at the radius; shape = Inspector curve choice) and delayed by distance / `Ripple Speed` (cm/s) so it feels like a wave. Needs a small public hook on `ToyAudioReact` to feed its existing pop spring (to be added; it changes only that script, no tuning values). Poke/squish is a second option; I'd pick the pop spring because it already has comfort limits.
5. Pad tap: if a tap lands within the pad's touch area (strip, plus its margin), call `ToyPad.activate("tableTap", hand)`. Needs `"tableTap"` added to `VolumeSource`. The existing cooldown and same-hand lock already stop a SIK poke and a detected tap on the same pad from counting twice.
**Events for your own animation:** `onTableTap` (above), `TapRipple.onRippleStart/onRippleEnd`, and the existing `onPadTap` / `onStateChange` (source `tableTap`).
**Inspector (new, in a "Table taps and ripples" group in StageConfig; units labelled):** Detect Taps, Detect In Fallback, Contact Height (cm), Release Height (cm), Min Down Speed (cm/s), Tap Cooldown (s), Mock Taps in Editor, Ripple Prefab, Max Ripples, Ripple Seconds (s), Ripple Max Radius (cm), Ripple Speed (cm/s), Bounce Radius (cm), Bounce Amount, Bounce Falloff, Taps Cycle Pads.
**Hook-up you will do:** author the ripple prefab (a flat quad with your material/shader, scale 1 = 1 cm radius, a `rippleProgress` Float parameter), assign it to `Ripple Prefab`; add `TableTapDetector` and `TapRipple` to the Stage object (I can add them by script if you say so).
**Size:** scripts only, no assets; far below 2 MB. No runtime mesh or material is created.
**Open questions:** (a) Contact Height default: the table height can be off by several cm (section 1), so a fixed 1.5 cm may never trigger or always trigger on a device; I'd start at 2.0 cm and flag it for device tuning. (b) Fingertip tap vs hovering finger over a pad: the pad's SIK poke covers that already.

## 34. Home-position marker under each blob (2026-11-05) - PLAN ONLY, nothing coded yet
Replaces the LOOK of `BaseVisual` (the circle under each toy) with a soft glow ring. Small step: nothing in the scene is moved, rearranged or resized; no table-tap or hand-joint work; ripples are their own later section.

**Left exactly as it is.** The strip (`Visual`), its Interactable, its collider, `BaseHit`, all pad behaviour and tuning, `ToyPad` follow logic, the base's position and `Pad Base Drop`. `PadShape.ts` stays in the project; it is just no longer used for the base. The strip becomes a push button in a later step.

**Spacing: no change (before / after).** `baseDiameterProvider`, `padDiscProvider`, `padEquivalentProvider` keep their code and their inputs (`Pad Base Width/Length`, strip settings). The new drawn size is a separate setting that nothing in the stage maths reads.
| Value | Before | After |
|---|---|---|
| baseDiameterProvider (cm) | 3.40 (max of Pad Base Width/Length) | 3.40 |
| padEquivalentProvider (cm) | 4.28 (strip 2.2 x 7, roundness 1) | 4.28 |
| padDiscProvider | strip discs, width 2.2, row along the strip | identical |
| Drawn base size (cm) | 3.4 circle | `Home Quad Size` (new, default 6.0 cm), picture only |
Note: the existing "circle not smaller than the toy's footprint" warning keeps using Pad Base Width/Length, not the quad.

**Mesh.** A flat unit quad (authored `Meshes/Pad_Plane.mesh`, already in the project) assigned through the existing `StageConfig > Pads > Pad Base Mesh` slot; the existing code already stretches your own mesh to a size. No MeshBuilder, no new mesh. Unverified: the plane's orientation and exact size (I assume 1 x 1 cm, facing +Y like the PadShape meshes; if it faces +Z, `ToyPad` sets a -90 degree X rotation on `BaseVisual` at run time, not in the scene). I will check the mesh before coding.

**Material `Home_Mat` (you author it; no textures).** Additive blend, depth write OFF, depth test ON, two-sided not needed. Black adds nothing, so it stays see-through. The graph draws a soft ring plus a dimmer centre (the centre reads as a contact shadow).
Float/colour parameters (Script Names): `homeColor` (colour), `brightness` (0..1), `ringRadius` (0..1 of the quad half-width), `ringSoftness` (0..1), `beatPulse` (0..1), `padState` (0..3).
- Can I create it through the MCP? Partly. `asset-graphql createAsset/createAssetFromPreset` can make an empty Material (`EmptyMaterialPreset`), and `setProperty` can set blend mode / depth flags on it. I have NOT found a way to author the node graph, so the ring shader must be built by you in Lens Studio. Unverified: whether blend/depth flags are settable on a graph material by `setProperty`. I will not generate it in code (your rule). Plan: you build `Home_Mat`; I can create the empty asset and set flags only if you ask.
- Step-by-step graph instructions (to build in Lens Studio): (1) Materials panel, right-click, Create Material > Shader Graph Material, name `Home_Mat`. (2) In the graph add Float Parameters `brightness`, `ringRadius`, `ringSoftness`, `beatPulse`, `padState` and a Color Parameter `homeColor` (Script Names exactly as listed). (3) UV0 minus (0.5, 0.5), Length, times 2: gives `d` (0 at centre, 1 at the edge). (4) Ring = 1 - Smoothstep(0, ringSoftness, Abs(d - ringRadius)). (5) Centre = Smoothstep(0, ringRadius, 1 - d) times 0.25 (the dim fill). (6) Shape = Max(Ring, Centre). (7) Level = brightness + beatPulse * 0.6, plus a small constant for `padState` (e.g. 0.1 * padState / 3). (8) Colour = homeColor.rgb * Shape * Level; wire to Final Color RGB; set Alpha = 1 (additive ignores it). (9) Settings: Blend Mode Add, Depth Write off, Depth Test on, Cull Back. (10) Fade to nothing at d >= 1 so the quad edge is never visible.

**One shared material, no cloning.** All seven `BaseVisual`s use `Home_Mat` as the asset. Per-visual values go through `mainPassOverrides` (the route `BlobLookDriver` already uses), so the asset is never cloned or edited. Needed changes:
- `StateColours.ts`: new small `HomeLookDriver` (writes the six parameters to `mainPassOverrides`). `StateColourDriver` is untouched for the strip.
- `ToyPad.ts`: `baseColours` for BaseVisual is replaced by the new driver (so no clone for the base only). IMPORTANT: today `writeStateParam` writes `padState` to `baseRMV.mainPass`; on a shared material that would change all seven. For the base it moves to `mainPassOverrides`; the strip keeps its current behaviour.

**Behaviour.**
- Hue: the toy's colour. Finding: the blob colour is set in each toy's shader graph (`bodyColorMed` etc. in `Toy_0N_*_Mat`), not in any script. Two options: (a) default: use the pad's own existing `colourMedium` (`ToyPad > Pad colours`), which you set to match the blob (verified, no new reading); (b) read `bodyColorMed` from the toy's Visual material at run time (unverified that this parameter is readable; I would test it first). Recommendation: (a), with (b) tried later if you want automatic matching.
- Brightness: from the volume state (`ToyVolume`), smoothed. Off = `Resting Glow` (default 0.12, never 0). Low/Med/High step up.
- Height / squash: ring tightens and brightens when the blob is lower or squashed, widens and fades as it rises. Source: the toy's height above its rest position in stage space (cm) plus its existing squash/pop value (the one already sent to the deform shader as `squash`/`kick`). Uses nothing new.
- Beat: `beatPulse` jumps to 1 on a stem hit and eases back over `Beat Fall Seconds`.
- Beat signal: `ToyAudioReact` already detects hits per stem (`onsets.update`, the local value `hit`), but does not publish it. Available now: `currentAudioLevel` (smoothed loudness, 0..1) and the `pop` spring (`kick`), both on this toy. Smallest change: `ToyAudioReact` stores the `hit` it already computes and passes it to `ToyConfig` through a new setter, in the same way `setAudioLevel` works. No new audio analysis, no tuning value changes. If you would rather not touch that script, the fallback is a rising edge on `pop.x`, which is less exact.

**Preview.** Keys 1 to 7 fire a fake beat for stem/toy 1 to 7 (editor only). API verified in `Support/StudioLib.d.ts`: `KeyPressEvent` with `key: Keys`, and `Keys.One` ... `Keys.Seven` exist (the same event type `StageAnchor` already uses for `Keys.R`). It feeds the same path as a real hit. `Mock Beats in Editor` switch (default on) so it can be turned off. Note: Preview focus and whether Lens Studio uses keys 1 to 7 for its own shortcuts are unverified.

**Inspector: one new group `StageConfig > Home`** (units labelled in every tooltip): Home Enabled, Home Quad Size (cm), Resting Glow (0..1), Brightness Off/Low/Medium/High (0..1), Ring Radius Rest (0..1 of half the quad), Ring Tighten By Height (0..1 per cm lowered), Ring Widen By Rise (0..1 per cm raised), Ring Softness (0..1), Beat Strength (0..1), Beat Fall Seconds (s), Brightness Blend Seconds (s), Mock Beats in Editor, Home Material Parameter names (six text fields, defaults above), Reset Home. No existing value is changed.

**Scripts that change:** `ToyPad.ts`, `StateColours.ts` (new class only), `ToyAudioReact.ts` (publish the hit), `ToyConfig.ts` (setter/getter), `StageConfig.ts` (the Home group), plus one small `HomeKeys` section or the mock inside `ToyPad` (to decide). **You do by hand:** build `Home_Mat`, assign it to the seven `BaseVisual` Visual materials (7 slot changes, or I do it by MCP if you say so), set `Pad Base Mesh` to `Pad_Plane.mesh`, set each pad's Medium colour to its blob colour.
**Size:** scripts and one small material; far below 2 MB. **Snapshot** before coding: Scripts, Prefabs, Scene.scene to the backups folder.
**Cannot verify in the Editor yet:** Pad_Plane orientation/size; `setProperty` for blend/depth on a graph material; reading a toy material colour at run time; keys 1-7 delivery in Preview; whether `mainPassOverrides` accepts all six parameters on a graph material (it does for the blob's, so likely yes).
**Open questions:** (1) colour option (a) or (b)? (2) default Home Quad Size 6 cm OK? (3) OK to add the small hit-publishing change to `ToyAudioReact`?

### 34a. Artist answers and revisions (2026-11-05)
**Colour (answer 1).** Hue comes from the TOY's material, not the pad. The toy materials (`Toy_Piano` plus `Toy_02..07_*_Mat`) all have `edgeColorOff/Low/Med/High` (vec3) and `bodyColorOff/Low/Med/High`. Start with `edgeColorLow` of each toy's own material, read at run time (`mainPass.edgeColorLow`). Unverified: that a graph-material colour parameter reads back at run time. The first coding step tests it and logs the six values; if it fails, I stop and tell you (fallback would be the pad's Medium colour, only with your OK). The state brightness still comes from `brightness`, not from switching to the Med/High colours. Inspector: `Home Colour Source` (choice: Edge Low / Edge Med / Edge High / Body Low / Body Med / Body High / Pad colour) so we can compare looks without code changes.

**Size and overlap (answer 2).** The quad can overlap neighbours. The material is additive with depth write off, so overlap just adds light and render order between homes does not matter. To compare sizes: `StageConfig > Home > Home Quad Size (cm)` is live, and each `ToyPad` gets an optional `Home Size Override (cm, 0 = use StageConfig)`. Neither feeds stage spacing.

**Audio signals (answer 3).** Everything the project already measures, per toy, in `ToyAudioReact`:
| Signal | Range | What it is | Published today? |
|---|---|---|---|
| hit | 0 or 0.3..1, one frame | onset on the kick loudness (`onsets`, Hit Spacing, Onset Sensitivity) | no (local) |
| swayHit | 0 or 0.3..1 | onset on the sway loudness (own band mix) | no (local) |
| level | 0..1 | smoothed stem loudness (kick band mix) | yes (`currentAudioLevel`) |
| levelSway / levelVfx | 0..1 | same, with the sway / glitter band mix | glitter only |
| bands low / high | 0..1 each | lows and highs of the stem, only when Band Split Hz > 0 | no |
| pop (kick spring) | about -1..1 | hit spring after Kick Hz / Damping | no (sent to shader) |
| rockRoll / rockPitch | spring units | sway springs | no (sent to shader) |
| coreHeat | 0..1 | slow loudness follower | sent to shader |
There is no tempo/BPM, spectral-flux, pitch or per-note detection in the project, and I will not add any (you said no new analysis). `MusicSync` only syncs the stems' start.

**Room for later (ripple size, colour, speed...).** One small struct, `ToySignals`, defined next to `ToyConfig`: `{ hit, swayHit, level, levelSway, levelVfx, bandLow, bandHigh, pop, rockX, rockZ, coreHeat, state, heightCm, squash }`. `ToyAudioReact` fills it once a frame (`toyCfg.signals`), replacing the single-purpose setters. Adding a new source later = one new field. On the consumer side, the home look is a short list of rows `{ shaderParam, source, amount, smoothing }` (so `beatPulse <- hit`, `ringRadius <- heightCm`, `brightness <- state`), kept as plain data in the code and mirrored by Inspector fields in the Home group; ripples (next section) will read the same struct, so their size, colour and speed can map from any signal without touching the audio script again. This version only uses `hit`, `state`, `heightCm`, `squash`; the rest are published but unused.
Touching `ToyAudioReact`: publish only; no tuning value, threshold or spring changes.

**Revised script list:** `ToyConfig.ts` (struct + field), `ToyAudioReact.ts` (fill it), `ToyPad.ts` (home driver, size override, no base clone), `StateColours.ts` (`HomeLookDriver`), `StageConfig.ts` (Home group), plus the Preview key mock.
**Still waiting for:** your go-ahead to snapshot and code.

### 34b. Built (2026-11-05) - code only, scene untouched
Snapshot first: `Specs_Oct25_PT_A_backups/Scripts_2026-11-05_1710_preHome` (Scripts, Prefabs, Scene.scene, PLAN.md). TypeScript compiles.
- `ToyConfig.ts`: `ToySignals` struct + `signals` + `fireHit()`. `ToyAudioReact.ts`: publishes into it (no tuning or motion change). `StateColours.ts`: new `HomeLookDriver`. `ToyPad.ts`: home driver (no base clone), `Home Size Override`, keys 1 to 7. `StageConfig.ts`: `Home` group.
- `Home Enabled` defaults OFF so nothing changes until `Home_Mat` exists. Turn it on after the hook-up.
- Hook-up (artist): build `Home_Mat`; assign it to the 7 `BaseVisual`s; set `StageConfig > Pads > Pad Base Mesh` = `Pad_Plane.mesh`; tick `Home Enabled`. Check in Preview whether the plane lies flat (if it stands up, tell me: ToyPad will rotate it at run time).
- Not yet verified in the running Lens: toy material colour read-back, `mainPassOverrides` on the Home material, keys 1 to 7 in Preview.

## 35. Sockets: fixed rings, toys return to them, rest glow, away pulse, landing flash and ripple (2026-11-05) - PLAN ONLY, nothing coded yet, WAITING FOR THE ARTIST'S CONFIRMATION
Vocabulary: SOCKET = the home ring (`BaseVisual`) plus the tab (`Visual`, the strip, a button later), fixed together at one stage-local spot. The look of the ring (shape, colours, thickness, quad size) and every default position are NOT changed.

**What the current drift does (read in `ToyInteraction.ts`, values from `StageConfig`).** On release, `target` = the spot where you let go (run through `resolveLanding`, which only moves it when Enforce Bounds is on; it is OFF now, so the toy lands exactly where released). Then:
1. Drift (state Drifting): falls and slides sideways together. Fall speed = the toy's Feel `Drift Speed` (default 4 cm/s, range 1-8), slowed to 30% over the last 3 cm, never slower than needed to finish within `Max Drift Seconds` (2.5 s). Sideways speed `Drift Lateral Speed` (8 cm/s) toward the target. It falls to `Hover Height` (1.5 cm above its rest height), or lower if released lower; it never rises.
2. Float: sway `Float Sway` (1.4 cm) at `Float Sway Speed` (1), and tilt `Float Tilt` (degrees); both fade to zero near the hover height, so it still lands on the target.
3. Settle (state Settling): a smooth lerp from the hover point to the floor over the toy's Feel `Settle Duration` (seconds), `Settle Easing`, levelling the tilt. Then Idle, and `onSettle` fires.
4. Safety: if the drift has not arrived after 3 x Max Drift Seconds (7.5 s) it settles anyway. A release more than `Max Rescue Distance` (150 cm) away, with Enforce Bounds ON, flies back at `Rescue Speed` (120 cm/s) instead.
Pickup (pinch, follow with `Grab Follow Speed`, `Grab Move Scale`) is not touched.

**Change A: sockets stay put (`ToyPad`, `ToyInteraction`, `ToyConfig`).**
- The socket position is the toy's resolved start spot (`ToyConfig > Home Position`, after `placeAtStart`, the same spot the toy stands at today), stored stage-local (cm). Default positions are unchanged. `ToyInteraction` exposes `socketLocal()`; editing Home Position and the existing reset tick still moves the socket.
- `ToyPad` stops following the toy: the tab goes to socket + its pad offset (same `Pad Front Offset` / per-pad offset as now), and the ring to the socket + `Pad Base Offset`. Both are still computed in stage space every frame, so moving the stage moves the sockets. `Pad Follow Speed` only matters on the first frame. The press dip, touch box and slide are unchanged.
- On release the drift target is the socket, not the release point. The same drift, float, sway and settle code runs (same feel, no new motion code); the fall and the sideways slide still run together. A long way from the socket (8 cm/s) the slide is the slow part; I will NOT change that speed unless you ask.
- New Inspector switch `StageConfig > Sockets > Toys Return To Sockets` (default ON). OFF = today's behaviour exactly (toy lands where let go, pad follows the toy), so you can compare.
- Effects to know: (1) carrying a toy elsewhere no longer re-arranges the stage: it always flies back (rearranging means editing Home Position). BRIEF "toys can be rearranged anywhere" and "the pad follows its toy" will be rewritten when this is built. (2) With a toy away, the stage maths still counts toy plus tab as one unit measured from the toy; with Enforce Bounds ON that is slightly off while it is away (the release landing check is skipped because the socket was already validated at start). Enforce Bounds is OFF, so nothing visible. (3) A neighbour never nudges a toy off its socket in this mode.

**Change B: rest glow (`HomeLookDriver`, `StageConfig > Home`).**
- New `Rest Brightness` (0 to 1, unitless, default 0.25) replaces `Resting Glow` (0.12). It is the brightness when the stem is OFF (volume state 0). Low / Medium / High brightness (0.35 / 0.6 / 0.9) are unchanged. Note the step from Rest to Low becomes small (0.25 to 0.35); I will not change Low unless you ask.
- `Brightness Blend Seconds` default 0.25 s becomes 0.4 s (still an Inspector value, seconds). The blend is the existing smoothing between the rest and active values.
- Applies to all 7 sockets the same way (each reads its own toy's state); no per-toy exception.
- "Silent" (stem playing but reading nothing): see question 2. Default plan: only volume state OFF counts as resting.

**Change C: away dim and slow pulse; landing flash and ripple (`HomeLookDriver`, `ToyPad`).**
- "Away" = the toy is not Idle (held, drifting, settling or rescued).
- While away the brightness is multiplied by `Away Dim` (0 to 1, default 0.7) and by a slow sine pulse of period `Away Pulse Seconds` (default 2.5 s) and depth `Away Pulse Amount` (0 to 1, default 0.2). Both fade in and out over `Brightness Blend Seconds`. Uses the existing `brightness` parameter only, so no new shader parameter.
- When the toy lands (`ToyInteraction.onSettle`, which already fires when it finishes settling), the ring flashes once: `beatPulse` is set to `Landing Flash Strength` (0 to 1, default 1) and eases back over `Landing Flash Seconds` (default 0.35 s). Existing parameter. It does not fire for the start-up placement or a position reset.
- Ripple: one ring expanding from the ring's edge and fading, once per landing. It needs a NEW Float parameter in `Home_Mat` that you author: `rippleProgress`, 0 = no ripple, then 0 to 1 over `Ripple Seconds` (default 0.8 s) at each landing. The shape, thickness, colour, fade and how far it travels are YOUR graph (the ripple is limited to the quad, so `Home Quad Size` (6 cm) may need to grow; that is picture-only). The script writes only the number, through the same `mainPassOverrides` route. Nothing is made in code, no mesh, no material, no new asset. Parameter name is an Inspector text field (`Ripple Param`).
- New event for your own reactions: `ToyPad.onSocketLanded {pad, toy}` (fires with the flash and ripple).

**New Inspector values** (all in `StageConfig`, units in each tooltip): `Toys Return To Sockets`, `Rest Brightness`, `Away Dim`, `Away Pulse Seconds`, `Away Pulse Amount`, `Landing Flash Strength`, `Landing Flash Seconds`, `Ripple Seconds`, `Ripple Param`. Changed defaults: `Brightness Blend Seconds` 0.4. Removed: `Resting Glow` (a saved value of it is lost; the new default applies).

**Scripts that would change:** `ToyPad.ts`, `StateColours.ts` (HomeLookDriver), `ToyInteraction.ts`, `ToyConfig.ts` (socket accessor), `StageConfig.ts`. **No scene change by me.** Snapshot first (Scripts, Prefabs, Scene.scene, PLAN.md) to the backups folder.
**You do by hand:** add the `rippleProgress` Float parameter and ripple to `Home_Mat`; retune `Home Quad Size` if the ripple needs room; check `Rest Brightness` against Low.
**Size:** scripts only, far below 2 MB. No runtime mesh. Audio is untouched.
**Cannot verify in the Editor:** the ripple look (your shader); `mainPassOverrides` for the new parameter on the shared material (same route as the other six, so likely fine); nothing on a device.
**Open questions:** (1) pulled back only on release (my reading), or also gently pulled while still held? (2) Should "silent" also count, and if so by what? The Chimes level reads 0 all the time under the current Level Floor, so a silence rule would dim Chimes while it plays. (3) Ripple through a new `rippleProgress` in `Home_Mat`: OK? (4) OK that carrying a toy elsewhere always flies back, with the switch to turn that off?

### 35a. Artist answers and revisions (2026-11-05) - still PLAN ONLY, waiting for the go-ahead
1. **Pull-back only on release.** Confirmed. Nothing pulls a held toy.
2. **"Silent" = "off".** Only the volume state OFF counts as resting; the word "silent" is dropped. The ring is visible in all four states (off = `Rest Brightness`, then Low / Medium / High) and is NOT audio reactive while off (no beat pulse from the stem; a landing flash still plays, it is not audio).
3. **Max Drift Seconds becomes 10 s** (was 2.5; the field stays an Inspector value). What it changes: the drift's minimum fall speed is height / Max Drift Seconds, so a toy released 30 cm up now falls at about 4 cm/s (its Feel Drift Speed) instead of being sped up to 12 cm/s; the 3 x timeout rises from 7.5 s to 30 s. Sideways speed (8 cm/s) is a separate value and is unchanged: a toy 40 cm from its socket needs about 5 s to get home. Tell me if you want that raised.
4. **Ripple: recommendation is A, a separate, larger quad.** Reasons: (a) ring size, thickness and softness are fractions of the Home quad, so B (growing the Home quad to make room) would change the ring look you asked me to keep; (b) A lets the ripple be any size, with its own material, colour, blend and render order, and the ring keeps its own; (c) a ripple wider than the neighbours' spacing is additive, so overlaps just add light. Costs of A: one more flat quad per socket (7 more objects, using the existing `Pad_Plane.mesh`, no new mesh), one more authored material (`Ripple_Mat`, additive, depth write off) with a `rippleProgress` Float parameter (0 = hidden, then 0 to 1), and its colour copied from the ring colour. Render cost is small because the quad is DISABLED when no ripple is playing. Design: new child `Ripple` under each `Pad_0N` (like `BaseVisual`), new slot `ToyPad > Ripple Visual`, new `StageConfig > Home > Ripple Size` (cm, square, default 16, unmeasured on a device). It sits at the socket, flat, a hair above the ring. I will add the seven child objects through the Editor API only after you say so (scene change); otherwise you add them. B stays possible later: with an empty `Ripple Visual` slot the script writes nothing.
5. **Later change (not now): users move sockets, and can reset them.** Nothing built now blocks it. How the plan keeps that open:
   - The socket is ONE stage-local value per toy, held in one place (`ToyInteraction`: `socketLocal()` plus a `setSocket(x, z)` that exists but nothing calls yet, and `resetSocket()` back to Home Position). Nothing caches the socket: the drift target, the ring, the tab and the ripple read it fresh every frame, so a moved socket is followed at once.
   - Ring, tab and ripple are positioned only from that value (never from the toy, never stored in the scene), so a socket drag moves all three together.
   - `Home Position` stays the default/reset value and is never overwritten at run time.
   - The tab's touch box and the socket's own touch area are separate; a later socket handle can be added without changing the tab's tap and slide.
   - Events (`onSocketLanded`, existing `onSettle`) say nothing about where the socket is, so they keep working if it moves. Saving user sockets between sessions is not decided (no storage is used now).

### 35b. Ripple objects created; Ripple_Mat recipe; wave behaviour (2026-11-05)
**Done in the scene (only this).** Snapshot first: `Specs_Oct25_PT_A_backups/Scripts_2026-11-05_1903_preSockets` (Scripts, Prefabs, Scene.scene, PLAN.md). Seven objects `Ripple` were added, one under each `Stage/Pads/Pad_01..07`, as copies of that pad's `BaseVisual` (so each has a RenderMeshVisual with the same mesh, and TEMPORARILY the Home_Mat material), and they are DISABLED. No script, no other object, no asset changed. Scene is not saved by me. Your steps: build `Ripple_Mat` (below), assign it to the seven `Ripple` Visuals (or one, then copy), and keep them disabled (the script will enable one only while its wave plays). The scripts that fill `ToyPad > Ripple Visual` and write the parameters are NOT written yet.

**What the waves do (my reading, to confirm).** Each wave is a ring that starts as wide and bright as the home ring, then travels outward getting thinner and paler, and fades out, like a sound wave leaving the toy. One wave plays at each landing, and (if you confirm) one at each hit of the toy's own stem while the toy is not OFF (Off is never audio reactive). Several waves can be alive at once (about 3).

**Inspector (StageConfig > Home > Ripple; units in each tooltip).** Ripple Size (cm, square quad, default 16), Ripple Seconds (s, default 0.8; the time one wave takes to travel), Start Width (cm, default = the home ring's thickness), End Width (cm, default 25% of the start), Start Brightness (0-1, default = the home ring's brightness at that state), End Brightness (0-1, default 0.5), Lighten To (0-1, how far the colour goes toward white by the end, default 0.5), Fade Distance (cm: the wave fades to nothing over its last this-many cm before the quad edge, default 4), Edge Softness (0-1, default 0.4), Max Waves (default 3). The script turns the cm values into the 0-1 numbers the graph needs (below), so the graph needs no unit maths.

**Parameters the SCRIPT writes (Script Names, Float unless noted; all fractions are of the quad's HALF width, so 1 = the quad edge).**
| Script Name | Range | Meaning |
|---|---|---|
| rippleProgress | 0-1 | 0 = no wave; the wave's travel from start to the edge. (Waves 2 and 3: rippleProgress1, rippleProgress2) |
| rippleStartRadius | 0-1 | radius of the home ring, so the wave starts exactly where the ring is |
| rippleEndRadius | 0-1 | radius at which the wave ends (just inside the edge, minus its half width) |
| rippleStartWidth / rippleEndWidth | 0-1 | ring thickness at start / end |
| rippleStartBrightness / rippleEndBrightness | 0-1 | brightness at start / end |
| rippleLighten | 0-1 | colour toward white by the end |
| rippleFadeStart | 0-1 | progress at which the fade-out begins (from Fade Distance) |
| rippleSoftness | 0-1 | softness of the ring edges |
| rippleColor | color | the ring colour (same as the home ring) |

**Recipe: `Ripple_Mat` (Lens Studio Shader Graph material; node names as in this Lens Studio).**
1. Materials panel, right-click, Create Material, Shader Graph Material, name it `Ripple_Mat`. Open the graph.
2. Add Float Parameter nodes with exactly these Script Names: `rippleProgress`, `rippleStartRadius`, `rippleEndRadius`, `rippleStartWidth`, `rippleEndWidth`, `rippleStartBrightness`, `rippleEndBrightness`, `rippleLighten`, `rippleFadeStart`, `rippleSoftness`. Add a Color Parameter (or Vec3/Vec4 parameter, same type as your `homeColor`) named `rippleColor`.
3. Distance from the centre: UV0 (Surface UV / Texture Coordinate node, channel 0) -> Subtract (0.5, 0.5) -> Length -> Multiply by 2. Call this `d` (0 at the centre, 1 at the quad edge).
4. Radius over time: Mix(rippleStartRadius, rippleEndRadius, rippleProgress) -> `r`.
5. Width over time: Mix(rippleStartWidth, rippleEndWidth, rippleProgress) -> `w`.
6. Ring: Subtract(d, r) -> Abs -> `dist`. Half width `h` = Multiply(w, 0.5). Inner edge `h0` = Multiply(h, One Minus(rippleSoftness)). Ring mask = One Minus(Smoothstep(h0, h, dist)). (Smoothstep node: edge0, edge1, x.) Clamp the width at a small minimum, e.g. Max(w, 0.002), so the ring never vanishes.
7. Brightness over time: Mix(rippleStartBrightness, rippleEndBrightness, rippleProgress) -> `b`.
8. Fade out: One Minus(Smoothstep(rippleFadeStart, 1.0, rippleProgress)) -> `fade` (1 until the fade starts, 0 at the end).
9. Hidden when idle: Step(0.0001, rippleProgress) -> `alive` (0 when progress is 0). Also multiply by One Minus(Step(1.0, d)) so nothing is drawn past the quad edge.
10. Paler as it travels: Mix(rippleColor.rgb, (1, 1, 1), Multiply(rippleLighten, rippleProgress)) -> `colour`.
11. Final: Multiply(colour, ring mask, b, fade, alive) -> Final Color RGB. Alpha = 1 (additive ignores it).
12. Material settings: Blend Mode Add, Depth Write OFF, Depth Test ON, Cull Back (as `Home_Mat`). Optionally Render Order one above the ring so waves draw over it.
13. More than one wave at once: select nodes 4 to 11 (up to the final Multiply, not including it), make them a Container/Subgraph with the same inputs plus its own progress input; instantiate it 3 times fed by `rippleProgress`, `rippleProgress1`, `rippleProgress2`; Combine the three results with Max (or Add for brighter overlaps) before Final Color. If you prefer one wave only, skip this step.
Checks to do by hand: set `rippleProgress` 0.3 / 0.6 / 0.9 in the material and look: the ring should be thinner and paler each time and gone at 1; at 0 nothing shows.

**Open questions (answer before I code):** (a) Waves on landing AND on each stem hit while the toy is not OFF (sound-wave look), or on landing only? (b) If on hits: how strong? My default is the same for every hit, with start brightness following the toy's state (Low/Medium/High). (c) "Lighter coloured" = paler toward white (as above), or brighter? (d) OK that the 7 Ripple copies keep Home_Mat until you assign Ripple_Mat (they are disabled, so nothing shows)?

### 35c. Built (2026-11-05): sockets, rest glow, away pulse, landing flash, waves (code and scene wiring)
Artist answers used: waves on every stem hit (from the existing audio analysis, `ToySignals.hitSeq`) while the toy is NOT off, plus a softer wave on landing (`Ripple Landing Strength` 0.5, "a soft landing in a puddle"); every hit uses the same width (hit strength is NOT used yet; a "harder hit = brighter" option is parked, the strength number is already a per-wave parameter so it can be added); "lighter" = paler toward white and less opaque, then fades out; Max Drift Seconds 10; "silent" = off.
**Scripts changed:** `ToyInteraction.ts` (socket value, `socketLocal()`, `setSocket()`, `resetSocket()`, `isAway()`, return-to-socket on release, no nudging in socket mode, idle toy slides to its socket), `ToyPad.ts` (tab, ring and ripple fixed to the socket; away dim and pulse; landing flash and wave; hit waves; `Ripple Visual` slot; `onSocketLanded` event), `StateColours.ts` (`HomeLookDriver`: away dim/pulse, flash, `level`), `StageConfig.ts` (groups Sockets and Ripples; `Rest Brightness` replaces `Resting Glow`; Max Drift Seconds default 10; Brightness Blend Seconds default 0.4). **New:** `SocketRipple.ts` (`RippleDriver`: up to 3 waves, writes numbers only, enables the Ripple object only while a wave lives).
**Scene changes:** 7 `Ripple` children (disabled) under `Pad_01..07` (35b); `ToyPad > Ripple Visual` set on all seven; `StageConfig` saved values `Max Drift Seconds` 2.5 -> 10 and `Brightness Blend Seconds` 0.25 -> 0.4 (the old saved values would otherwise override the new defaults). `Rest Brightness` 0.25, `Toys Return To Sockets` on (defaults).
**Compiled; Lens starts with no errors.** NOT tested: a release and return to the socket, the away pulse, the flash, any wave (needs `Ripple_Mat`), keys 1 to 7 (they only start a wave when the toy is not off).
**Recipe update (35b):** each wave also gets a strength, so the landing wave is softer. Per wave i the script writes `rippleProgress{,1,2}` AND `rippleStrength{,1,2}`. In step 11 of the recipe, multiply each wave's result by its strength (a Float Parameter `rippleStrength`, `rippleStrength1`, `rippleStrength2`) before combining the waves. Parameters `rippleStartRadius, rippleEndRadius, rippleStartWidth, rippleEndWidth, rippleStartBrightness, rippleEndBrightness, rippleLighten, rippleFadeStart, rippleSoftness, rippleColor` are exactly as in 35b. Paler and less opaque as it travels = the Lighten mix toward white (step 10) plus the brightness fall from start to end (step 7); the final fade uses `rippleFadeStart` (step 8).
**Note on the start values:** Start Width (1.2 cm), End Width (0.3 cm) and the 16 cm Ripple Size are my guesses; the home ring's real thickness comes from your Home_Mat graph, so compare the first wave against the ring and adjust `Ripple Start Width`.

### 35d. Ripples, Step 1: softer, throttled, merged (2026-11-06) - script only
Goal: pond / cymatics feel, and a wave model that carries over to the planned stage-wide pooled renderer (a wave is plain data: age + strength; position and colour at spawn come in Step 2). Backup: `Specs_Oct25_PT_A_backups/Scripts_2026-11-06_preRippleStep1`.
- **Throttle + merge (`RippleDriver.spawn`).** A hit closer than `Ripple Min Gap` (0.8 s) to the newest wave, or arriving when all `Max Waves` are busy, MERGES into the newest wave: strength += hit x `Ripple Merge Gain` (0.5), capped at 1. No new ring starts and no ring is ever dropped abruptly (the old code shifted out the oldest, which popped).
- **Slow fade.** New `Ripple Fade Seconds` (1.5 s): the fade starts at the earlier of that and `Fade Distance` before the quad edge (`rippleFadeStart`, same material parameter as before).
- **New defaults** (a value saved in the scene overrides these): Size 16 -> 20 cm, Seconds 0.8 -> 2.5 s, Start Width 1.2 -> 1.6 cm, End Width 0.3 -> 2.4 cm (rings now widen), Start Brightness 1 -> 0.7, End Brightness 0.5 -> 0.4, Fade Distance 4 -> 6 cm, Softness 0.4 -> 0.7.
- Scripts: `SocketRipple.ts`, `ToyPad.ts` (settings hand-over), `StageConfig.ts`. No scene, shader, mesh or asset change. Compiles; NOT run with a toy playing.
- Open: 2b (music-driven "breathing" pulse) not built; 2a only.

## 36. Shared wave field: waves that interfere like water (2026-11-06) - code built, scene and Wave_Mat NOT done yet
Artist answers: waves should interact and feel natural (not a strict Chladni pattern); additive blending (Lens opacity is brightness); the TABLE is the stage, so waves fade out softly at the quad edge (no reflection); one pulse per hit (no steady two-source sine).
Backup first: `Specs_Oct25_PT_A_backups/Scripts_2026-11-06_1846_preWaveField` (Scripts, Prefabs, Scene, PLAN.md). Size: scripts only, no asset. No runtime mesh (the quad reuses an authored flat quad such as `Pad_Plane.mesh`).

**Verified before coding** (`nodes.json` manifest, `code-node-reference.md`, `Support/StudioLib.d.ts`): the shader graph has a custom GLSL code node (GLSL ES 3.00, `input_vec4`, `system.getSurfaceUVCoord0()`); the Float Parameter node has a `Channels` option (xyzw, so a vec4 parameter exists); `cos`, `ddx`, `ddy`, `fwidth` nodes exist; `Pass` accepts any property name (`[index: string]: any`), the route the ring colour already uses. A Float Array Parameter node exists too, but how a script fills it is NOT verified, so 8 separate vec4 parameters are used.

**Design.** `WaveField.ts` (new, component on the Stage object, slot `Field Visual` = the big quad, kept DISABLED) keeps a pool of 8 waves (`{owner, x, z, age, strength}`, stage-local cm), sizes and lays the quad flat, enables it only while a wave lives, and writes numbers to the material. `ToyPad.spawnWave()` sends hits and landings there when `StageConfig > Wave field > Shared Wave Field` is ON (default OFF; OFF = the per-socket ripples exactly as before). A wave keeps the place where it started, so a socket moved later does not drag waves along; `spawn` reads `socketLocal()` fresh each time. Merging: a hit closer than `Wave Min Gap` to the same socket's newest wave merges into it; with all 8 slots busy the weakest wave gives up its slot. `WaveField.heightAt(x, z)` is the same formula in TypeScript and nothing calls it yet: it is the hook for the later gentle push on toys. Event `WaveField.onWaveStart {owner, x, z, strength}` for your own reactions. Preview: key 8 starts a test wave in the middle of the field.

**Wave formula** (shader and `heightAt` match): `d` = distance in cm from the start, `r = Speed x age`, `x = d - r`; `sigma = Width` ahead of the front, `Width x Trail` behind it; `height = strength x exp(-(x/sigma)^2) x cos(2 pi x / Length) / sqrt(1 + Falloff x r / Length)`. Heights of all waves are ADDED, the picture shows `max(sum, 0)`, so crest + trough cancels (that is the interference).

**New Inspector group `StageConfig > Wave field (shared)`** (units in each tooltip): Shared Wave Field, Field Size 60 cm, Field Center (0, -14) cm, Wave Speed 8 cm/s, Wave Seconds 4 s, Wave Length 3 cm, Wave Width 2.5 cm, Wave Trail 1.8, Wave Falloff 0.5, Edge Fade 10 cm, Fade Seconds 1.5 s, Wave Min Gap 0.6 s, Merge Gain 0.5, Flip U, Flip V, Param Prefix "wave". Reused from Ripples: Ripple Enabled, Ripple On Hits, Ripple Landing Strength, Ripple Start Brightness, Ripple Lift.

**Parameters the script writes (Script Names; all are Float Parameter nodes with Channels = xyzw):**
| Script Name | x | y | z | w |
|---|---|---|---|---|
| wave0 ... wave7 | u (0..1 across the quad) | v (0..1) | age (s) | strength 0..1 (0 = slot empty) |
| waveShape | speed (cm/s) | length (cm) | width (cm) | trail (x) |
| waveMisc | quad side (cm) | falloff | edge fade (cm) | unused |

**Recipe: `Wave_Mat` (one code node does all 8 waves, so no containers).**
1. Materials panel, right-click, Create Material, Shader Graph Material, name `Wave_Mat`. Open the graph.
2. Add 10 Float Parameter nodes. For each, set Channels to `xyzw` and the Script Name exactly: `wave0`, `wave1`, `wave2`, `wave3`, `wave4`, `wave5`, `wave6`, `wave7`, `waveShape`, `waveMisc`. (Script Names are camelCase, unique, and the nodes must sit at the graph root, not in a subgraph.)
3. Add a Color Parameter, Script Name `waveColor` (the wave colour; the script does not write it; one colour for all waves for now). Add a Float Parameter `waveGain` (Channels x, default 1.0): overall brightness.
4. Add a Custom Code node. Paste the code below (tabs for indentation, as the node expects). Apply with Cmd+Enter. It creates the input ports Wave0 to Wave7, Shape, Misc, Colour, Gain and the output Result.
5. Connect: `wave0`..`wave7` to Wave0..Wave7; `waveShape` to Shape; `waveMisc` to Misc; `waveColor` to Colour; `waveGain` to Gain. Connect Result to Final Color RGB. Alpha = 1 (additive ignores it).
6. Material settings: Blend Mode Add, Depth Write OFF, Depth Test ON, Cull as in Home_Mat. Set Render Order one above the home rings so waves draw over them.
7. Scene (see the hook-up list): assign `Wave_Mat` to the new quad's RenderMeshVisual.
8. Hand checks BEFORE turning the script on: in the material Inspector set `wave0` to (0.5, 0.5, 1.0, 1.0), `waveShape` to (8, 3, 2.5, 1.8), `waveMisc` to (60, 0.5, 10, 0), `waveGain` 1. You should see one soft ring about 8 cm from the centre with a few trailing rings. Change the age (z) of `wave0` to 0.5 / 2 / 4: the ring grows and fades. Put a second wave at (0.6, 0.5, 1.0, 1.0): where the two rings cross they add, and dark gaps appear where a crest meets a trough.

```glsl
input_vec4 Wave0;
input_vec4 Wave1;
input_vec4 Wave2;
input_vec4 Wave3;
input_vec4 Wave4;
input_vec4 Wave5;
input_vec4 Wave6;
input_vec4 Wave7;
input_vec4 Shape;   // x speed cm/s, y length cm, z width cm, w trail
input_vec4 Misc;    // x quad side cm, y falloff, z edge fade cm
input_color3 Colour;
input_float Gain;
output_vec3 Result;

// height of ONE wave at point p (uv, 0..1). w.xy = start, w.z = age (s), w.w = strength (0 = empty slot)
float waveHeight(vec4 w, vec2 p) {
	if (w.w <= 0.0) {
		return 0.0;
	}
	float d = length(p - w.xy) * Misc.x;               // cm from the wave's start
	float r = Shape.x * w.z;                           // how far the front has travelled (cm)
	float x = d - r;                                   // negative = behind the front
	float sigma = max(Shape.z * (x > 0.0 ? 1.0 : max(Shape.w, 0.01)), 0.01);
	float e = x / sigma;
	float env = exp(-e * e);
	float lam = max(Shape.y, 0.05);
	return w.w * env * cos(6.2831853 * x / lam) / sqrt(1.0 + max(Misc.y, 0.0) * r / lam);
}

void main() {
	vec2 p = system.getSurfaceUVCoord0();
	float h = waveHeight(Wave0, p) + waveHeight(Wave1, p) + waveHeight(Wave2, p) + waveHeight(Wave3, p)
	        + waveHeight(Wave4, p) + waveHeight(Wave5, p) + waveHeight(Wave6, p) + waveHeight(Wave7, p);
	// fade to nothing before the quad edge (Misc.z cm), so the edge is never seen
	float from = clamp(1.0 - Misc.z / max(0.5 * Misc.x, 0.01), 0.0, 0.99);
	float edge = 1.0 - smoothstep(from, 1.0, length(p - vec2(0.5)) * 2.0);
	float b = clamp(h, 0.0, 1.0) * edge * Gain;       // crests only: a crest + a trough cancel
	Result = Colour * b;
}
```
**Not verified:** the GLSL has NOT been compiled in Lens Studio (you paste it; any compile error shows in the node); whether `Pad_Plane.mesh` UV runs the same way as the stage axes (that is what Flip U / Flip V are for: key 8 in the Preview starts a wave at Field Center; check it appears there, and that a real socket's wave starts at its ring); the look and the draw cost of a 60 cm transparent quad on a device. The script compiles and the Lens starts with no errors; no wave has been drawn yet because there is no quad or material.
**Next steps (not done):** per-wave colour (needs 8 more vec4 or a packed hue in the wave), slope-lit water look (`ddx`/`ddy` or a finite difference), the Chladni layer on its own quad and material (each toy owns a mode (n, m), pattern = sum of modes weighted by volume state and level, slow morph between modes), movable sockets with a drag handle, then the gentle push on toys from `heightAt`.

## 37. Arc dial tab: the pad becomes a curved 3-segment tab on the socket ring (2026-11-06) - code and scene built, `Arc_Mat` NOT authored yet
Replaces the strip (`Visual`) for each pad. Wave field (section 36) is untouched and parked.

**What it is.** A curved tab on the socket's outer ring, on the side facing the viewer, split into 3 segments: Low, Medium, High. Off = none lit, Low = 1, Medium = 1+2, High = 1+2+3 (unlit segments stay at `Arc Unlit` brightness). It is the button and the state display. The arc re-aims at the head every frame (`ToyPad.aimAtViewer`, rate-limited by `Arc Turn Speed`). The ring stays as is (`BaseVisual`, `Home_Mat`); the arc quad sits 0.03 cm above it.
**Mesh: option A, no new mesh.** `ArcVisual` uses the existing flat 1 x 1 cm `Pad_Plane.mesh` (verified: +U = stage +X, +V = stage +Z toward you at yaw 0). The arc is drawn by the artist's `Arc_Mat` shader. Nothing generated in code. `PadShape.ts` is no longer used when the arc is on.
**Touch.** `ArcHit` is a child box collider (SIK finds descendant colliders), sized to the arc's chord and turned with it every frame. A touch only counts if it lands within `Arc Hit Margin` of the curved band (`ToyPad.arcDistance`). The strip's own box is shrunk to a speck. Overlapping pads: nearest arc wins, as before.
**Tap.** Counts on release, through `ToyVolume.requestCycle` (cooldowns, `onPadTap` unchanged). Slide-to-set-volume is NOT available on the arc (the strip code stays for pads without an arc; other slide ideas later).
**Drag = move the socket.** A touch that travels `Arc Drag Threshold` (0.8 cm) becomes a drag: `ToyInteraction.moveSocketTo` (clamped like a landing when Enforce Bounds is ON). Ring, arc and toy follow (the toy slides to its socket as before). Mouse and pointing rays are read where the ray meets the stage floor; fingertips and close pinches by hand movement x `Arc Drag Hand Scale`. Needs `Toys Return To Sockets` ON. A drag counts as a change for the cooldown (no tap straight after it). `Home Position` is never overwritten.
**Reset.** `StageConfig > Resets > Reset Sockets` (all) and `ToyPad > Pad position > Reset Socket` (one): both call `ToyInteraction.resetSocket()`.
**Press.** While touched, ring and arc sink `Arc Press Depth` (0.25 cm) and shrink `Arc Press Shrink` (4%) on a spring (`Arc Spring Hz` 5, `Arc Press Damping` 0.8 down, `Arc Bounce Damping` 0.3 back up = a bounce). A tap always shows at least `Pad Press Seconds` of press. The shader also gets `press` (0 rest, 1 pressed, slightly negative on the bounce).
**Spacing.** In arc mode the toy's unit gets ONE fixed disc of diameter 2 x (Arc Radius + Thickness / 2) = 5.5 cm at the ring (the old strip added a 7 cm row). Does not turn with the arc.
**Shader contract (`Arc_Mat`, Script Names, all Inspector names in `StageConfig > Arc dial tab > Parameter names`).** `arcColor` (colour), `arcRadius`, `arcThickness` (fractions of the quad half-width), `arcSpan`, `arcGap` (degrees), `seg1`, `seg2`, `seg3` (0..1), `press`. Written through `mainPassOverrides` (shared material, never cloned). The arc is centred on +V of the quad.
**Scripts changed:** `ToyPad.ts`, `StageConfig.ts`, `ToyInteraction.ts`; new `PadArc.ts`. Backup: `Specs_Oct25_PT_A_backups/Scripts_2026-11-06_preArcTab`.
**Scene (done through the Editor API):** `ArcVisual` (RenderMeshVisual, mesh = `Pad_Plane.mesh`, NO material yet) and `ArcHit` (ColliderComponent) under each of Pad_01 to Pad_07, wired into `ToyPad > Arc Visual / Arc Hit`.
**Not verified:** compiles and starts with no errors, but touch, drag, press and facing were NOT run (no material to see yet, and no device). A fingertip's reported point near a table is unverified. Hit box at the arc ends may overlap a toy's own touch area.
**Open:** socket positions are not saved between sessions; hold-to-reset on the arc itself was not built (ticks only).

## 38. Dial button: the arc becomes a flat 3-part disc on the ring's rim (2026-11-07) - code built, `Arc_Mat` must be re-authored
Replaces the curved 3-segment arc of section 37. Same scene objects (`ArcVisual`, `ArcHit`), same quad (`Pad_Plane.mesh`), no new mesh, no new asset (project size unchanged). Backup: `Specs_Oct25_PT_A_backups/Scripts_2026-11-07_preDiscButton`.

**Look.** A flat 2D disc (no thickness, a coin with no edge) of `Button Diameter` 2 cm, on the ring's outer rim, on the side facing the viewer; it swings around the ring to face the head (existing `aimAtViewer`, `Arc Turn Speed`). Snowman lying down: the button's circle reaches `Button Overlap` (0.5 cm) into the ring's circle, so its centre is at ringRadius + buttonRadius - overlap = 1.8 + 1 - 0.5 = 2.3 cm from the ring centre. Ring radius = `Button Rim Radius`, or (0) Home Quad Size x Home Ring Radius / 2 = 1.8 cm. This is the RESTING ring; the Home shader may move the ring with squash and height.
**Three concentric parts.** seg1 = centre circle (low), seg2 = middle ring (medium), seg3 = outer ring (high). Off = none lit (all at `Arc Unlit`). Boundaries are `Button Core End` (0.34) and `Button Mid End` (0.67), fractions of the disc radius, sent as `coreEnd` and `midEnd`.
**Colour.** `arcColor` = the toy's own edge colour for the current state, read from the toy material (`edgeColorOff / Low / Med / High`, prefix `Button Toy Edge Colour Prefix`), re-read about once a second. Off therefore matches the toy's Off edge colour. If a name cannot be read it warns once and uses the pad's own state colour for that state.
**Press.** The button sinks `Button Press Depth` 0.1 cm and shrinks `Button Press Shrink` 3% on the same spring (`Arc Spring Hz`, damping). The ring stays put unless `Button Ring Follows Press` is ticked.
**Touch.** Round test (`arcDistance` = distance to the disc edge) inside a square `ArcHit` box of diameter + 2 x `Arc Hit Margin` (0.8) = 3.6 cm. Tap on release and drag-to-move-socket are unchanged.
**Spacing.** In dial mode the unit gets ONE fixed disc covering ring and button at any angle: 2 x (2.3 + 1) = 6.6 cm (was 5.5). Only matters when Enforce Bounds is ON (it is OFF).
**Shader contract (`Arc_Mat`, Script Names, changeable in `StageConfig > Dial button > Parameter names`).** `arcColor` (colour), `discRadius` (float, fraction of the quad's half-width; the quad is diameter + 2 x `Button Glow Margin` = 3 cm), `coreEnd`, `midEnd` (floats, fractions of the disc radius), `seg1`, `seg2`, `seg3` (0..1), `press`. REMOVED: `arcRadius`, `arcThickness`, `arcSpan`, `arcGap`. Each value is written on its own, so a name the material lacks only warns (once) and never blocks the others.
**Scripts changed:** `ToyPad.ts`, `PadArc.ts`, `StageConfig.ts` (group renamed "Dial button"; removed Arc Radius / Thickness / Span / Gap / Quad Size / Hit Angle Margin / Press Depth / Press Shrink and four param names; added the `button*` values). Setting names `arc*` that stayed keep their saved scene values.
**Verified:** compiles; Lens starts with no errors and no [Dial] warnings. **Not verified:** the picture (needs the new shader), touch, drag, press, and the edge colours actually reaching the shader (check the Preview once the material is ready).
