# PLAN: Toy Tray (Specs, TypeScript, SIK)

Status: **foundation built and verified in the Editor Preview** (SPECS 27 device preview, no real Specs device yet). This document is the current truth; it replaces all earlier drafts. The original brief and every decision are also in `BRIEF.md`.

**Updated 2026-10-26** after re-reading the project: the tray is now **flat** (tilt removed), toys have the **squish / float / wobble** pass (section 4b, `ToySquish`), the lip is **one ring object**, and the scene sets per-toy overrides. Where this document still says "tilt" below, it is history: sections 10 and 11 are marked. Section 14 assesses replacing the tray with table slots and sticky walls (**nothing built**).

Legend: **[verified]** = read in `Support/StudioLib.d.ts`, the SIK source, the CLAD skills, the Lens Studio docs, or measured in a Preview test. **[unverified]** = needs a Specs device. **[open]** = needs your decision or is not done yet.

---

## 1. Decisions (everything approved so far)

**Tray shape, size, placement**
- ROUND tray, 19.1 cm across. Landing bounds = a circle (`trayRadius` 9.55 cm) in the tray's local space; they follow the tray if it is moved, rotated or scaled. Toy centres stay within 6.55 cm of the centre (radius - half toy - edge padding).
- A tray, not a platform: thin floor (0.5 cm) and a low lip (**1 cm** high since the update, was 2; 0.6 cm wall). Floor, lip and wall are **visual only** and never affect landing. Toys are 2 to 3.5 times the lip height.
- **Flat.** The tilt (was 20 degrees toward the viewer: `trayTiltDegrees`, `toysStayUpright`) has been removed from `TrayConfig`, `TrayPlacer` and the scene. `TrayPlacer` sets only the yaw, so the tray faces the user.
- Placed once at lens start (after `placementDelay`), centre **52 cm** ahead of the head and **10 cm** below eye level (scene values; the `TrayConfig` script defaults are 53 and -8, and the scene wins), then locked in world space. Re-place: hold a palm tap about 1 s (`replaceHoldSeconds`, can be disabled; the R key in the Editor).
- **Reach rule:** every toy centre inside the documented 35 to 60 cm near-field. Flat tray at 52 / -10: about 46.5 to 59.4 cm (calculated from the geometry, **not re-measured** in the Preview).
- Toy footprint: 4 cm is the reference size (`toySize`); each toy has its own footprint from its stretched shape (section 4a). Spacing and edge padding are 25% of the toy's footprint. Scene toys are about 4 cm wide and 2 to 3.5 cm tall (soft and squat, like balloons; the first build had taller toys).
- **Free space = one spare toy slot in total** (slot = toy size + spacing = 5 cm; 9 slots for 8 toys). Console warning if below `requiredFreeSlots` (1).
- 8 toys start in a **ring** around one free centre slot; start positions editable per toy.

**Toys and artist control**
- One base prefab `Prefabs/Toy.prefab`, eight instances, eight different soft blob meshes (OBJ, `Meshes/Blobs/`: Pebble (lumpy), Pebble, Donut, Donut (ruffled), Bean (curled), Bean, Flower, Flower (star); written once by `Tools/make_blob_meshes.py`) with eight pastel materials (graph shader `Toy_pbr.graphShader`). The toys, materials and shaders are not generated in code. **One exception [open]:** while `autoSizeTrayModel` is on, `TrayBounds.buildRimMesh` builds the tray lip's ring mesh at runtime with `MeshBuilder`, which breaks the brief's "no runtime-generated meshes" rule (see section 12). **Per-toy stretch** (`ToyConfig` Shape group): mesh scale xyz, size multiplier, visual offset, visual rotation, footprint and collider overrides (section 4a).
- Mesh and material live on each toy's `Visual` child. Only audio-reactive motion moves it. The collider is a 1x1x1 **box on the Visual child**, so it scales with the Visual.
- Settings live in two components only: `TrayConfig` (global) and `ToyConfig` (per toy, with override groups).

**Music**
- Stems in `Assets/RS_Mp3_Oct25/` (nine 64 kbps files, 246.89 s each, 17.8 MB in total). Foundation = `01_MixBase` (volume 0.2). Toys: Toy_01 `02_PianoMel`, Toy_02 `03_PianoHi`, Toy_03 `04_PianoLo`, Toy_04 `05_Cello`, Toy_05 `06_Violin`, Toy_06 `07_Chimes`, Toy_07 `08_FX`, Toy_08 `09_MixPerc`.
- Volume states off 0, low 0.25, medium 0.55, high 1.0, with a 0.15 s glide. A stem is never stopped or paused by a toy.
- Loop on by default (`loopPiece`); at the loop point all stems restart together in one call.
- Sync: silent calibration, then pre-seeked start (section 9). Real-time audio-reactive motion with per-stem auto-level (section 8). Off toys stay still by default (`reactWhenOff`, `idleMotionAmount`).

**Interaction**
- Poke cycles volume, pinch grabs, moving never changes volume. `InteractableManipulation` is not used (it removes poking).
- A touch is a poke only if it ends without becoming a pinch, only on a resting toy, with push depth >= `pokeMinDepth` (0.3), and not within `pokeLockoutAfterRelease` (0.6 s) of a release.
- Release: slow drift along the tray surface, then settle at the nearest valid point inside the circle. Overlap: nearest free spot, and only if none, neighbours are gently pushed (nudging toggle). Farther than `maxRescueDistance` (150 cm): rescued, flies back fast. Per-frame safety net returns any toy found outside.
- Off-by-default `editorQuickClickCycle` for mouse testing.

**Not adopted**
- Half-round (D-shaped) tray: one spare slot needs R = 13.6 cm (27 cm flat edge); it does not fit the display (section 11). Reshape only the visual model if wanted; the bounds stay a circle.
- Rectangle, ellipse and square trays: replaced by the circle (docs-overlap margin and reach).
- Re-aligning a playing stem by setting its position (made sync worse); baked envelope and beat pulse for audio-reactive motion (real-time reading works).

---

## 2. Research findings

### 2.1 Display and distances [verified: CLAD spatial-design reference + Lens Studio docs]
- Portrait ~3:4. Binocular-overlap table (width x height): 35 cm 13x24, 55 cm 23x38, 110 cm 53x77; overlap is **narrower the closer content is**.
- Near-field 35 to 60 cm = direct hand interaction (poke, direct pinch); far-field 60 to 160 cm = indirect.
- Targets: 2 deg minimum, ~3 cm "best" at 55 cm. Boresight tilts down, so lower content is easier. Avoid high Render Order on far content.
- Not in the docs: exact FOV in degrees and the boresight tilt. The preview camera reports vertical FOV 36.6 deg, aspect 0.875 (symmetric frustum, wider than the documented overlap).

### 2.2 SIK [verified in the SIK 0.18 source]
- `Interactable.targetingMode` 7 = Direct + Indirect + Poke. Events `onTriggerStart/Update/End/EndOutside/Canceled`; `interactor.currentTrigger` is Pinch or Poke (the mouse reports both bits = pinch); `interactor.startPoint` is the hand point; `interactor.interactionStrength` is the push depth (0..1, 1 = 2.5 cm) during a poke.
- **A fingertip touching a toy that accepts Poke starts a poke immediately; a following pinch continues the same touch as an update.** This drives the poke rules above.
- SIK finds colliders on an Interactable's children. `fitVisual` does not auto-fit in this Lens Studio build.

### 2.3 Audio platform [verified]
- `AudioComponent`: `play`, `stop`, `volume`, `position` (settable), `duration`, `setOnFinish`. No sample-accurate group start. Up to 16 simultaneous audio assets (Specs FAQ).
- Levels: `FileAudioTrackProvider.getAudioBuffer / getAudioFrame` (no level getter on `AudioComponent`).

---

## 3. Scene and prefab structure
```
Camera Object                 (Camera + DeviceTracking, existing)
SpectaclesInteractionKit      (SIK prefab at scene root, existing)
ToyTray                       TrayConfig, TrayPlacer, TrayBounds, MusicSync    (flat, world-locked; local +Z faces the user, local floor y = 0)
 ├─ TrayModel                 placeholder tray. YOU replace it (turn off Auto Size Tray Model).
 │   ├─ Floor                 flat disc, top surface at the toys' floor
 │   └─ Lip                   ONE object with a ring mesh that TrayBounds builds in code (Lip height = rimHeight; breaks the no-runtime-mesh rule, see section 12)
 ├─ BoundsOutline             Seg_00..Seg_31, debug outline of the bounds (off by default)
 ├─ FoundationTrack           AudioComponent for 01_MixBase
 └─ Toys
     └─ Toy_01 .. Toy_08      instances of Prefabs/Toy.prefab
         Toy (root)           Interactable (All), AudioComponent, ToyConfig, ToyVolume, ToyInteraction, ToyAudioReact
         └─ Visual            RenderMeshVisual (blob mesh + material) + 1x1x1 box collider. Its Transform is set by ToyConfig (Shape group). YOU swap mesh and material here.
```
Assets are in `Scripts/`, `Meshes/`, `Materials/`, `Prefabs/`. Toys are children of the tray, so re-placing and moving the tray carry them along. The collider on the prefab itself is the box (fixed after the instances were set up; a stale 6 cm sphere in the prefab was found and corrected).

---

## 4. Scripts and events
Only `TrayConfig` and `ToyConfig` hold settings.

| Script | Job |
|---|---|
| `TrayConfig.ts` | Global settings; `TrayConfig.whenAvailable(cb)` so scene order never matters. |
| `ToyConfig.ts` | Per-toy stem, visual, rest height, start position, **Shape group (stretch, offset, rotation, footprint, collider)**, override groups (volumes, audio-reactive, motion). Applies the shape to the Visual every frame unless ToyAudioReact is doing it. |
| `TrayGeometry.ts` | Circle maths, plain numbers only (Node-testable): clamp, inside test, nearest free spot, push-apart fallback, free-slot count, ring layout. Spacing and edge limit are per toy (footprint diameters). |
| `TrayBounds.ts` | World/local conversion, toy registry, landing resolve (per-toy footprints), free-space check (per-toy slots, too-big-toy warning), floor and lip sizing, debug outline, upright rotation. |
| `TrayPlacer.ts` | Place in front of the head (yaw only, the tray stays flat), lock, re-place on palm-tap hold. |
| `ToySquish.ts` | Squishy poke, soft landing and grab stretch: a damped spring written to `ToyConfig.squish` (section 4b). |
| `ToyInteraction.ts` | Per-toy state machine Idle / Held / Drifting / Settling / Rescue; poke vs pinch; events. |
| `ToyVolume.ts` | Four volume states, smoothed volume on the toy's AudioComponent. |
| `MusicSync.ts` | Calibrated start of all stems, loop restart, spread monitor. |
| `ToyAudioReact.ts` | Audio-reactive motion on the Visual, auto-levelled, multiplied on top of the ToyConfig shape. |

**Events (SIK `Event<T>` public fields):** `ToyInteraction`: `onPoke`, `onGrab`, `onRelease`, `onDriftStart`, `onSettle`, `onLandingCorrected {reason: outside | overlap | rescue}`. `ToyVolume`: `onStateChange {previousState, newState, volume}`.

### 4a. Blob shapes and per-toy stretch
- Meshes: eight OBJ blobs, each normalised to a 1x1x1 box centred on its pivot (so scale = size in cm). Chosen over primitives + scales because only sphere/capsule/torus are soft and stretched they look alike. Replace any of them with your own model.
- `ToyConfig` Shape group: `meshScale` (cm, default 4,4,4; the eight scene toys are set to blob-specific defaults, all at most 4 cm wide), `sizeMultiplier`, `visualOffset`, `visualRotation` (degrees), `autoRestOnFloor` (lifts by half the scaled height; turn off for a mesh whose pivot is at its base), `footprintOverride` (0 = auto), `colliderSizeOverride` (0 = auto).
- **Scale from Inspector x scale from audio:** `ToyConfig` computes the base (`shapeScale/Position/Rotation`); `ToyAudioReact` reads it live every frame and applies `base x (1 + amount x level)` for scale, `base + (0, bounce x level, 0)` for position, `base x wobble` for rotation. It never caches or overwrites the Inspector value. `ToyConfig` applies the base itself (every frame) when ToyAudioReact is off or has no stem.
- **Footprint** = widest side of the stretched, rotated box (a blob always fits inside its box), or the override. `TrayBounds` uses it for the landing limit (radius - footprint/2 - footprint x padding) and for toy-to-toy spacing ((fA + fB)/2 x (1 + spacing)). **Collider** = the 1x1x1 box on the Visual, so it follows the shape; the override sets a box in cm.
- **Fit check** (`checkFreeSpace`): free slots = (usable area - sum of each toy's (footprint x (1 + spacing))^2) / reference slot; with the default blobs 1.57 (was 1.19 with eight 4 cm toys); warns below `requiredFreeSlots`; also warns for any single toy whose footprint exceeds tray radius / (0.5 + edge padding). Tested: Toy_01 at 2x and Toy_02 at 3x gave "TOO TIGHT" (-8.86) and both were pulled inside the tray.
- **Start positions** are resolved like a landing (clamp + nearest free spot + warning), so a bad start position cannot leave toys overlapping.

**Behavior details**
- Release: world to tray-local, `resolveLanding` (radial clamp, nearest free spot, push neighbours only if needed). Drift down along the tray normal at `driftSpeed` (capped by `maxDriftSeconds`) while sliding toward a corrected spot, then settle with the chosen easing. The fall is a feather/balloon float (section 4b). Everything is tray-local, so moving or rotating the tray needs no special handling.
- Rescue: straight fast flight at `rescueSpeed`, then settle.
- Hand following: toy moves by the hand's movement (`grabMoveScale`, `grabFollowSpeed`).

---

### 4b. Squish, float and wobble (added after the blob update)
- **`ToySquish.ts`** (one per toy): a damped spring (the Overshoot idea) pulled toward a target. A poke or a landing sets the target to a squash amount for a few hundredths of a second and then back to 0; holding a toy sets a small negative target (stretch). It writes only `ToyConfig.squish` (+ squashed, - stretched). `ToyConfig.squishedScale` turns that into a scale (height shrinks by the amount, width and depth grow by amount x `squishBulge`) and `squishLift` keeps the base on the floor. `ToyAudioReact` multiplies it on top of shape and music; `ToyConfig` does it when there is no stem. **Footprint, collider logic and landing rules use the rest shape**, so a squashed toy never moves its neighbours. The poke/pinch collider follows the Visual scale, so it shrinks briefly during a squash.
- **Feather / balloon float on release** (`ToyInteraction.updateDrift`): the fall slows over the last few cm, the toy sways sideways (`floatSway`) and tilts (`floatTilt`) with a lazy sine that fades to 0 by the hover height, so it still lands exactly on its target. Grabbing a toy mid-float stands it upright in the hand.
- **Audio wobble** (`ToyAudioReact`): unchanged: scale, bounce and a z-rotation wobble, each with an amount. Order of application: shape x music scale, then squish.
- **Per-toy values in the scene** (all eight toys override audio, motion and squish): scale amount 0.2 (Toy_04 0.5), drift 1 cm/s, settle 0.55 s, poke / land / grab squish 0.1, bulge 2 to 4, damping 1.0. Damping 1.0 means **no overshoot** (a soft cushion, no springy wobble), so the gentle wobble you see comes from the audio reaction and the float sway; lower the damping to bring the springy jiggle back. A bulge of 4 at squash 0.1 widens a toy by 40%; the footprint does not grow with it, so squashed neighbours can overlap visually by about 0.8 cm each (the 1 cm spacing absorbs most of that).
- `TrayConfig` values in the scene that differ from the script defaults: `distanceFromUser` 52 (script 53), `heightOffset` -10 (script -8), `levelReference` 0.2 (script 0.1; only used with auto-level off).
- **[unverified]** none of this was measured on a device. The squish and float were not re-run through the poke/pinch tests after being added.

## 5. Numbers
All lengths in cm, tray-local. Margins use the documented overlap table and the preview camera frustum.

| Value | Default | Reason |
|---|---|---|
| Tray radius | 9.55 | 19.1 cm across holds 9 slots and fits the documented overlap. |
| Distance / height | 52 / -10 (scene; script defaults 53 / -8) | Flat tray, no tilt. Toy centres 46.5 to 59.4 cm from the head (calculated). The display margins below were measured for the TILTED tray at 53 / -8 (docs-overlap 9.9%, frustum 22.6%; flat at 53 / -8 was 11.1% and 36.7%); **not re-measured** for 52 / -10 flat. |
| Floor / lip height / lip wall | 0.5 / 1 / 0.6 | A tray, not a platform; toys 2 to 3.5 times the lip height. Visual only. |
| Toy footprint | 4 | Above the 3 cm best-target size. Scene toys are 4 wide and 2 to 3.5 tall. |
| Spacing, edge padding | 25% of toy size (1 cm) | Derived from toy size. |
| Max centre radius | 6.55 | 9.55 - 2 (half toy) - 1 (padding). |
| Ring radius (start) | 6.53 | Keeps 5 cm centre spacing for 8 toys, centre slot free. |
| Free slots | 1.19 | `pi x (9.55 - 1)^2 / 5^2 - 8`; warning if below 1. |

---

## 6. Inspector surface (current)
**TrayConfig**
- References: camera object, toys, foundation audio + track, tray floor, rim piece (the single Lip object), outline segments.
- Placement: distance, height offset, placement delay, enable replace gesture, replace hold seconds.
- Tray and toy size: tray radius, rim (lip) height, floor thickness, lip wall thickness, auto-size tray model, toy size, spacing ratio, edge padding ratio, nudge on/off, required free slots.
- Volume states: off, low, medium, high, smoothing, foundation volume.
- Poke and grab: poke debounce, poke minimum depth, lockout after release, mouse hold seconds (editor), grab follow speed, grab move scale.
- Release, drift and settle: drift speed, max drift seconds, lateral speed, hover height, float sway, float sway speed, float tilt, settle duration, settle easing, max rescue distance, rescue speed.
- Music and sync: loop piece, check interval, drift tolerance.
- Audio-reactive: master switch, amount, smoothing, auto-level, level decay seconds, level floor, level reference (auto-level off), analysis samples, scale / position / rotation toggles + amounts, react when off, idle motion amount.
- Squish and soft landing: squish enabled, poke squash, poke press seconds, land squash, land press seconds, grab stretch, squish bulge, squish frequency, squish damping.
- Debug: show bounds outline, primitive mesh size, verbose.

**ToyConfig:** stem, visual, rest height, start position, Shape group (mesh scale, size multiplier, visual offset, visual rotation, auto rest on floor, footprint override, collider size override), and four override groups (volume states; audio-reactive amounts; drift and settle; squish).

Every field has a short tooltip.

---

## 7. Startup order and render order
- **Startup:** all `onAwake` run before all `OnStartEvent`. `TrayConfig` publishes itself in `onAwake`; the others use `TrayConfig.whenAvailable`, so scene order never matters. SIK subscriptions and cross-object lookups happen in `OnStartEvent`. The tray is placed immediately and again after `placementDelay` (head pose can be invalid in the first frames). Audio starts on the first `UpdateEvent` after all `OnStart`s. A disabled toy is skipped by `MusicSync` with a warning.
- **Transparent toys [open]:** Lens Studio does not depth-sort transparent objects; order is hierarchy order or each visual's `renderOrder`. Options with no code: set Render Order by hand per toy; Order-Independent Transparency on the camera (more GPU); or an optional `ToyRenderSort.ts` (not written yet) that sets `renderOrder = base + rank by camera distance` in a narrow range (docs warn against high orders on far content). The current placeholder materials are opaque, so no choice is needed yet.

---

## 8. Audio-reactive motion
**Results (Editor Preview) [verified]**
1. `getAudioBuffer` / `getAudioFrame` return correct levels on a synthetic test signal.
2. The reading is taken **before** `AudioComponent.volume`, so motion is scaled by the volume state in script.
3. The provider's own read cursor drifts from what is playing. **Fix:** set `provider.position = audioComponent.position` before each read (edges within +/-18 ms).
4. Nine real stems read fine together; cost 1.0 ms per frame on the development Mac (max 11 ms). Levels are low and uneven (RMS mean 0.001 to 0.046); PianoHi and Chimes are silent most of the time.

**Design**
- Level = stem RMS / that stem's own slowly decaying peak (`autoLevel`, floor `levelFloor`), smoothed (`reactSmoothing`).
- Motion = level x volume factor x amount. Off toys: 0, unless `reactWhenOff`, then level x `idleMotionAmount`.
- Scale, bounce and wobble each toggle with an amount, globally or per toy. They apply on top of the toy's Inspector shape (multiplied for scale, added for bounce, composed for wobble), so stretch and music never overwrite each other.
- **[unverified]** device behaviour, cost on device, speaker latency, and whether writing `provider.position` every frame has any audible effect (the master switch and `analysisSamples` are the escape hatches).

---

## 9. Audio sync
**Results (Editor Preview) [verified]**
- Starting nine `AudioComponent`s in a loop leaves them ~85 ms apart in call order (~10.6 ms per `play()`, ~100 ms blocking in total); the offsets then stay constant.
- Setting `position` on a stem that is already playing makes it worse (84 to 189 ms).
- Pre-seeking each stem by its start lag before `play()` gives **1 ms** spread, repeatable.

**Approach (in `MusicSync.ts`)**
1. Silent calibration at start (volumes 0): start all, wait 0.4 s, read each stem's lag behind the foundation, stop, store the lags.
2. Real start and every loop restart: `position = storedLag`, then `play(1)` for all stems in one call. The foundation's `setOnFinish` triggers the loop restart when `loopPiece` is on (only a real end of track counts).
3. Monitor, don't nudge: every `driftCheckInterval` seconds check the spread; if it exceeds `driftTolerance`, log a warning and restart everything together with fresh calibration. Interval 0 turns it off.
- In the real scene the start lags measured 0, 11, 21, 32, 43, 53, 64, 75, 85 ms and the sync checks read 0.000 s.
- **[unverified]** on a device: per-call start cost may differ and `position` may not match what is audible; the calibration is closed-loop so it adapts. One short hitch (~100 ms) is expected at start and at each loop restart.

---

## 10. Verification
_Written for the tilted tray. The tilt has since been removed (flat tray, squish and float added); results about tilt are history and the flat tray, squish and float have not been re-run through these tests._

**Verified in the Editor Preview (simulated hands, not a real device)**
- Compiles and runs clean; free space 1.19; tray placed and locked; tray rotation confirmed as a 20 degree pitch; floor and lip render as a shallow tray; the whole tray and all toys are in view, none hiding the others.
- Poke on a resting toy cycles volume once; a grab never changes it.
- Grab, drift, settle on the flat tray: releases 33 and 43 cm away clamp to the circle edge (6.55), settle at floor level. Rescue: a 262 cm release flies back and lands inside in about 2.6 s.
- Overlap on a full tray (driven through the real release path): a drop on a toy goes to the nearest free spot without moving neighbours; further crowded drops pushed neighbours aside; minimum centre spacing stayed 5.00 and no centre went past 6.55.
- Geometry in Node, 20,000 random drops: no toy ever left the circle; worst residual overlap 0.1 cm (bodies never interpenetrate); about 37% of drops needed a neighbour push (expected with only 1.19 slots).
- Nine-stem calibrated start, 0.000 s spread, loop guard, disabled-toy handling.

**Verified for the blob and stretch update (Editor Preview)**
- Compiles and runs clean; eight blobs render soft and sit on the floor, each collider box matches its shape.
- Editing `meshScale`, `sizeMultiplier` and `visualOffset` while the Preview runs changes the Visual at once: (8,3,4) x 1.5 gave scale (12,4.5,6) and height 2.25.
- Fit check 1.57 with the defaults; "TOO TIGHT" and per-toy clamping with stretched toys (reverted).
- Start positions: two toys on one spot (Toy_01/Toy_02) was the cause of the overlap; fixed, and a deliberate duplicate is now moved to a free spot with a warning.

**Not yet verified**
- Poking and pinching the stretched shapes with hands (the collider follows the shape, but a very thin shape such as a stretched donut was not hand-tested); thin shapes may need `colliderSizeOverride`.
- A release landing on the **tilted** floor (the code is tray-local so it should hold, but it was not run after the tilt was added).
- The `toysStayUpright` option and `trayTiltDegrees` other than 20.
- Your own tray model with Auto Size Tray Model off; the prefab's mesh-swap workflow by an artist.
- Anything on a real Specs device: tray visibility and reach, poke feel, audio level reading, sync offsets, cost of nine readers, Lens size of the stems.

---

## 11. Findings that changed the design
_Finding 3 is history (the tilt no longer exists)._

1. A touch starts a poke at once in SIK 0.18, and a pinch continues it as an update, so naive handling cycled volume while grabbing and again after letting go. Fixed with the poke rules in section 1.
2. The prefab's default collider was a 12 cm sphere at the toy's feet (3x the toy, overlapping neighbours). Now a 1x1x1 box on the Visual, in both the instances and the prefab.
3. Tilting a circular tray costs 3 to 6 points of display margin and lowers the near edge, so the default placement moved from 52 cm / -10 cm to 53 cm / -8 cm.
4. A half-round tray holds half the area per radius: one spare slot needs R = 13.6 cm (27 cm flat edge); the overlap margin is -33% with the flat edge toward the viewer and -1% to -9% with the curve toward the viewer (which also pushes the tray to 64 cm, past reach). It would work only with ~3 cm toys.
5. The hollow tube primitive has a wall about a quarter of its diameter, too thick for a lip, so the lip is built from thin box pieces placed by script.
6. Preview-only artifacts: a Lens reset fires the old instance's stem-finished callback (a harmless "playing (loop)" line); the interaction test hand rejects named targets whose collider is on a child ("obstructed by Visual") and brushes neighbouring toys in a dense ring, so tests use coordinates and isolate one toy.

---

## 12. Open items and next steps
1. **Decide the lip ring mesh [open].** `TrayBounds.buildRimMesh` builds it in code (breaks the "no runtime-generated meshes" rule). Options: (a) keep as a placeholder, (b) replace with an authored ring mesh and delete the builder, (c) goes away anyway if the tray is removed (section 14).
2. Re-check the **flat** tray in the Preview: display margins at 52 / -10, a release on the floor, and that poke / pinch still work with the squish and float added (neither was re-run after the update).
3. `ToyReactionExample.ts` (optional script that logs every event, as a starting point for your own reactions) and `ToyRenderSort.ts` (only if you use transparent materials).
4. A device run: tray visibility and reach, poke feel, audio reading, sync. Turn on `verbose` to log sync spread and levels.
5. Check the nine stems against the Lens size limit on device (17.8 MB total).
6. Your art pass: swap the placeholder floor/lip, toy meshes, materials, and stems into the Inspector slots.
7. Shader deformation (section 13): research only; nothing built, waiting for your decision.
8. Table slots and sticky walls (section 14): assessment only; waiting for your answers to the questions there.
9. Clean-up if wanted: ten imported packages remain in `Assets/` (`*.lspkg`) and nothing in the scene uses them. Delete any you don't want.

---

## 13. Shader-based deformation (research only, nothing built)
A custom graph shader now exists (`Assets/Toy_pbr.graphShader`, a copy of `simple_pbr.graphShader` that differs only in its base-colour value; it has no vertex deformation). Sources: Lens Studio docs (Material Editor concepts, Shader node reference, Normal Deform tutorial, Float Parameter node, Spectacles performance guide) and the `shader-graph` skill. No material or shader was created or edited.

1. **Possible, yes.** The Graph Material's Shader node has a **World Position (Vertex)** input (also World Normal and World Tangent). Anything wired into those is compiled into the vertex shader. Build with the Vertex Position and Vertex Normal input nodes, Transform Vector (object to world), Elapsed Time, and math nodes, or a Code Node with GLSL. The docs ship a "Normal Deform" tutorial and a "Vertex Displacement" material in the Material Library. Wobble, squash/stretch and bulge are all ordinary vertex maths. Recompute the normal too, or the lighting looks wrong.
2. **Spectacles.** The docs list no Spectacles-specific block on vertex deformation, and the shader graph is the same system. The Spectacles performance guide says: minimise vertices and shader calculations, avoid PBR, shadows, reflections. The docs give no vertex-count number. The blobs are about 2,500 triangles each (20,000 for eight); that is **unverified on a device**. Render order and depth are per object and unchanged by deformation, but the culling bounds and shadows were not found in the docs: treat as [unverified] and test on device. Prev Frame World Position only matters if you use TAA or motion vectors.
3. **Driving it from script.** A Float Parameter node has a "Script Name"; scripts set it with `material.mainPass.<scriptName> = value`. **`ToyAudioReact` does not do this yet**: it only drives scale, bounce and wobble on the Visual transform. Adding it is small: an optional per-toy parameter name and an amount, writing the same smoothed level it already computes. Use one material per toy (as now): toys sharing a material would share the value, and cloning materials at runtime would break the no-runtime-materials rule.
4. **Collider.** It does not follow shader deformation. Suggestions in order: (a) keep deformation small (within the 25% padding and spacing) and size the collider to the rest shape, or to the largest deformed extent with `colliderSizeOverride`; (b) mirror the deformation on the CPU: the script that writes the shader value also scales the collider by the same formula, and the footprint stays the rest footprint; (c) never use the deformed shape for landing, only the rest footprint, so toys cannot overlap.
5. **Who sets up what.** You in the Material Editor: the deformation graph itself (look and feel): Float Parameter nodes (for example `deformAmount`), the vertex nodes and maths into World Position/World Normal, and any art decisions. Me, if you ask: the script side (drive the parameter from the audio level per toy, per-toy overrides, collider scaling), hooking the material onto each toy, and optionally a first-draft `.graphShader` to start from. I would not claim the result looks right without seeing it in the Preview.

---

## 14. Assessment: slots on a table instead of the tray, and sticky walls (research only, nothing built)

**What I understood.** No tray. A table in front of the user with eight slots (dents) on it. A released blob goes to a free slot. Blobs can also stick to walls; a stuck blob slowly blobs back down to the table, moving to the music.

### 14.1 What the docs allow [verified: `specs-world-query` CLAD skill; the rest is my reading]
- `WorldQueryModule` hit tests return a hit position and a surface normal, so a floor/table (normal about up) and a wall (normal about horizontal) can be told apart by the normal.
- It updates at about **5 Hz** and is "suitable for static/slow surfaces only". A ray outside the camera's field of view returns **null**. A session must be started with `start()`.
- The only semantic class is `Ground` and it needs Experimental APIs. **There is no "table" or "wall" class.**
- Not verified here: how WorldQuery behaves in the Editor Preview, and any of this on a device. [unverified]
- My inference: real walls are usually well beyond the 35 to 60 cm near-field where the hands work, so a blob could rarely be carried to one. Walls the hands can reach are almost certainly **virtual** (or a real surface right next to the user).

### 14.2 Questions that change the work (your decisions)
1. **Table:** a virtual flat table placed in front of you at start (like the tray today), or the real table found with WorldQuery? Suggested: virtual first, real as an optional mode later.
2. **Walls:** virtual wall planes you place in the scene (a backdrop, side panels, the edge of a play area), or real walls? Suggested: virtual. Where should they stand, and how big?
3. **Landing:** only into slots (snap), or also anywhere on the table? I assumed slots only.
4. **Slots:** how many (8 leaves no spare; the tray design asked for one spare, so 9 or 10), what layout, what size? Slots will be scene objects you move by hand.
5. **Slot taken:** a blob released over an occupied slot goes to the nearest free slot (suggested), or swaps with the one there?
6. **"To the music":** how should it move? Suggested: it always creeps back at a minimum speed (so it can never be lost) and speeds up in bursts with its own stem's level, with a squash-stretch pulse on each surge. Alternative: hop once per beat. "Off" toys (volume 0) would only creep.
7. **Stuck blobs:** can they be poked (cycle volume) and grabbed? Suggested: both. Today a poke needs a resting toy. When does the return start: right away, or after a hold time?
8. **Names:** keep `TrayConfig` / `TrayBounds` / `TrayPlacer`, or rename (renaming scripts touches every scene reference)? Suggested: keep until the end.

### 14.3 What stays, what goes, what is new
- **Unchanged:** `MusicSync`, `ToyVolume`, `ToyAudioReact`, `ToySquish`, `ToyConfig` (shape, overrides), the toy prefab, poke and pinch handling, grab following, float, settle, rescue, all existing events.
- **Goes:** the circle maths in `TrayGeometry` (clamp, push-apart, free-space count), the free-space/fit check, edge padding and spacing inputs, tray radius, floor, lip and outline, and `buildRimMesh` (which also removes the runtime-mesh rule break).
- **New:**
  1. **`TableSlots`** (replaces `TrayBounds`, same `BoundsToy` contract so `ToyInteraction` barely changes). Slots are child objects (`Slot_01..`) whose transforms are the positions, so you place them by hand. Landing = nearest free slot (in table-local space, so it follows the table). A slot is reserved by a toy that is held-then-released, drifting, stuck, or returning, so two toys never head for the same slot. Warn if there are fewer slots than toys. The start layout puts toy N in slot N (replacing `startPosition`). About 100 to 150 lines, much simpler than today's geometry.
  2. **`WallSurfaces`**: a list of wall objects (a plane's forward = its normal, its scale = its size). Answers "nearest wall point, normal and distance for this position".
  3. **Two new states in `ToyInteraction`: `Stuck` and `Returning`** (about 100 to 150 lines, math in the wall helper). Release within `stickDistance` of a wall: slide to the wall point, stand off by the toy's half thickness, turn to the wall's normal (plus a cling-rotation Inspector value), hold a squash (reuse `ToySquish`), fire `onStick`. After the hold time: `Returning`, then the existing `Settling` into the reserved slot, `onSettle`.
  4. **Music-driven return:** progress along a path from the wall point to the slot. Each frame it advances by `(creepSpeed + musicBoost x level x volume factor)`; `ToyAudioReact` needs one small addition (a public `getLevel()`; the smoothed level is private today). A squash pulse on each surge via `ToySquish`. Because `creepSpeed` is above 0 and there is a maximum return time, a toy is never lost (the brief's "toys can never be lost" rule still holds).
  5. **Settings and events:** a Walls group and a Slots group in `TrayConfig` (stick distance, hold time, creep speed, music boost, cling rotation, path shape, slot snap speed, swap on/off, show slots/walls debug), per-toy overrides in `ToyConfig` for the same, and events `onStick`, `onPeel`, `onReturnStep`, with new landing-corrected reasons (`slot taken`, `wall`).
  6. **`TrayPlacer`** places the table (and its slots and walls, as children) in front of the user and locks it, as it does the tray today.

### 14.4 Steps (each checked in the Preview before the next)
1. **Slots only.** Add `Slots` with the slot objects and placeholder dents, write `TableSlots`, switch `ToyInteraction` over, delete the tray objects and the circle inputs. A virtual table plane needs something visible to show where the surface is (a placeholder disc you replace). Check: release over each slot, over an occupied slot, between slots, far away (rescue), two hands at once, nothing ends outside a slot.
2. **Virtual walls and sticking.** `WallSurfaces`, the `Stuck` state, orientation and squash, `onStick`. Check: release near and far from a wall, grab and poke a stuck blob, two blobs on one wall (they need spacing on the wall; the existing free-spot search can be reused in the wall plane or they can be allowed to stack with a small offset: your call).
3. **Music-driven return.** `getLevel()`, `Returning`, per-toy overrides, events. Check with the real stems: a loud toy, a quiet stem, an "off" toy, a muted foundation; return time is bounded; every toy ends in a slot.
4. **Optional real surfaces.** A toggle that finds the table height with a downward WorldQuery hit and real walls from hits whose normal is horizontal, with smoothing and a fall-back to the virtual setup. The largest and most uncertain step: 5 Hz, field-of-view limits, noisy normals, and no Preview behaviour verified. Do it only with a device on hand.
5. Update `BRIEF.md`, `PLAN.md`, `CUSTOMIZE.md`; a device run.

Rough size: step 1 medium, step 2 medium, step 3 medium, step 4 large and uncertain.

### 14.5 Risks and trade-offs
- Without the lip, nothing visible marks the play area. The slots (and a table visual you make) have to do that job.
- Several of the brief's rules (spacing, edge padding, "never outside the tray", the fit check) become "slot occupied" rules. A blob can no longer be put just anywhere on the table.
- With exactly 8 slots for 8 toys a toy can only move if another slot is free: holding a toy frees its slot, so it works, but there is no slack. A spare slot or swap-on-collision avoids dead ends.
- Walls near the table that surround it would recreate a tray; keep them sparse if the "no tray" feel matters.
- The poke rules assume a resting toy. Stuck and returning toys need their own rule, and the squash from sticking must not be read as a poke.
- A stuck blob's collider follows its squashed scale (it shrinks); pokes at the edge may miss. A collider override already exists.
- Nothing about audio cost changes: the level read already runs per toy (about 1 ms per frame for all nine stems on the development Mac; not measured on a device).
