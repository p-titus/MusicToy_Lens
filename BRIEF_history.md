# BRIEF

(Redesign of 2026-10-26: the tray is replaced by a stage on the real table. The tray-era brief is saved as `BRIEF_tray_version.md`. Build status: stage, pads, audio and carry are built; table taps, ripples and class presets are NOT built yet.)

## The experience
The user sits at a real table. A compact STAGE is anchored on the table surface, in the middle of their view. On it are 7 TOYS (the old eighth toy, Toy_08, was deleted) (soft, cute, blob shapes, balloon-like). Each toy controls one stem of an 8-track piece. The foundation track (01 MixBase) belongs to the stage and plays quietly throughout. Stems: PianoMel, PianoVar, Cello, Violin, Chimes, SFX, MixPerc. Tone: fun and playful.

## Stage
- 2026-10-26: pads are LOLLIPOP shaped: a small circle under the toy like a shadow and a rounded strip in front of it (tap to step the volume, slide along it to set the volume). PLAN.md section 16 (section 15, the snowman, is superseded).
- REVISED 2026-10-26: the stage is a FRAME, not a platform. The filled surface (StageMarker) is gone. The stage is a landscape rounded rectangle (default 28 x 19 cm, corner radius 4 cm, all Inspector values), drawn as an outline only. The outline is a picture; the logical bounds (toy landing, clamping, rescue, nudging) are the same rounded rectangle but separate, with their own debug toggle. Style is an Inspector choice (thin line, corner brackets, dashed; default brackets). Details are in PLAN.md section 11.
- REVISED again 2026-10-26: the stage is now a HALF-ELLIPSE-LIKE shape with a wide back, like an orchestra with the user as conductor at the middle of the flat edge (default 26 cm wide, 29 cm deep, back handle 0.85; PLAN.md section 14). Same minimalist outline. The user can move it: hold gesture (re-place by gaze) or a pinch-drag handle in front of the flat edge. PLAN.md section 13. (Older text below says "circular", "rounded rectangle" or "half circle"; read it as this shape. Later this day the shape became a half ellipse with a wide back, 23 cm wide and 29 deep at the time of writing, and `Enforce Bounds` was added as a temporary layout switch, default OFF: PLAN.md sections 13, 14.) A small area on the real table, sized to be comfortably visible within the Specs field of view, at a comfortable reach distance. Use World Query to find the table. Choose distance, size, and height from the Specs docs (as in the old tray: about 19 cm across, about 52 cm away, were the last values), and list each with a reason in PLAN.md.
- The stage is anchored to the real world (use DeviceTracking if it helps) and does not follow the head. A hold gesture re-places it where I'm looking.
- If no surface is found, use a floating fallback stage so the app still works.
- Toys can be rearranged anywhere inside the stage. They can never be lost: if released outside it, or far away, they float back to the nearest valid point inside it. Overlapping toys are nudged apart (Inspector spacing, with an off toggle).

## Pads and volume
- Each toy has a flat LOLLIPOP PAD on the table: a small circle under the toy like a shadow (smaller than the toy's footprint) and a narrow rounded strip in front of it, like a piano key or a fader. It lies on the real surface, so my finger meets something real. The pad follows its toy. Strip and circle sizes never change with the volume or the toy's size. Shape, size and roundness of both are Inspector values (or your own meshes). PLAN.md section 16.
- Tapping the strip cycles that toy's volume: off -> low -> medium -> high -> off (counted when the finger lifts). Sliding a finger along the strip sets the volume continuously: toward the toy is louder. The pad shows the state visually and presses down very slightly when tapped.
- Possible next steps for the strips (not built): a stroke, a real push-button look, a groove with a slider knob (PLAN.md section 17).
- The strip has a generous touch margin (Inspector value).
- Pads respond to SIK poke and click (mouse click in the Editor, phone tap, or an aimed pinch). Later, detected table taps will use the same event (not built yet).
- Air-poke on toys STAYS ENABLED for now, as an Inspector toggle (`airPokeCyclesVolume`, default on) alongside the pads. Both make the same volume change (one door: `ToyVolume.requestCycle`).
- One finger action must never change a toy's volume twice: after any change, further changes on that toy are ignored for a cooldown (Inspector, default 0.3 s), and further changes from the same hand for a second, longer lock (default 1.0 s). Also an air-poke is dropped if the pad already counted the same touch. A different hand is never blocked.
- A volume change emits a state-change event (`ToyVolume.onStateChange`, with its source: padPoke, padClick, airPoke).

## Carrying
- Pinch to pick a toy up and move it. On release it floats down and settles on the stage. Moving never changes volume.

## Table taps and ripples (NOT BUILT YET: waiting for a go-ahead)
- Any part of the hand tapping the real table counts as one kind of "tap": a fingertip, fingers like typing, a flat palm pat, or a fist bang. The wrist may be resting on the table or in the air.
- A tap anywhere makes a soft ripple spreading from the tap. It needn't be precise. Nearby toys bounce, with falloff by distance. Tap strength is a "maybe" for later: record it, don't use it yet.
- A tap landing on a pad also cycles that toy's volume.

## Toy classes
Four classes: Strings (Cello, Violin), Piano (PianoMel, PianoVar), Chimes/FX (Chimes, SFX), Percussion (MixPerc). (Not built yet; the three-layer resolve is planned.) Settings resolve in this order: global defaults, then class preset, then per-toy override. Each class preset can hold shape family, material slot, audio-reactive behavior, tap-reaction style, and idle motion.

## Parked ideas (do not build)
Sockets, grooves (volume sliders), sticky walls, tap strength, class zones.

---

## Most important requirement: I am an artist and want to control everything
You build the plumbing; I make every design decision. I want to customize shaders, volume, position, animation, meshes, and interactions.
1. (Relaxed 2026-10-27: each blob now gets its own copy of the base blob mesh, shaped at startup by `ToyShape`, PLAN.md section 21. Rule from 2026-10-28: WARN AND WAIT for approval before any new change that creates runtime meshes.) NO runtime-generated materials or shaders in code, and no other generated meshes except the pads. Use plain placeholder assets I can replace: eight different primitive shapes with a simple default material. (Pads, the stage marker and the ripple are also authored assets: textured quads and a prefab.)
2. Each toy is a prefab or scene object I can open and edit directly. Swapping its mesh or material must not require touching code.
3. Every tunable value is an @input in the Inspector with a sensible default and a short tooltip: volume levels per state, grab behavior, drift speed, settle speed and easing, max rescue distance, audio-reactive amount, smoothing, which properties react (scale, position, rotation), which audio file belongs to which toy, the stage values, and the pad, tap and ripple values.
4. Settings live in three places only: one global config component (stage, foundation track, shared defaults), one preset per toy class, and one component per toy (its stem, its overrides). Order: global, then class, then toy.
5. Interaction is separated from presentation. Pad tap, table tap, grab, release, settle, state-change, and landing-corrected events are emitted so I can add my own animation, particles, or shader reactions later without editing core scripts.
6. Keep scripts small, single-purpose, and commented in plain language. No frameworks or abstraction layers I don't need.

### Where this redesign conflicts with those kept rules
- Rule 4 was "two places only"; the class presets make it three.
- Rule 1: the old tray lip mesh was built in code and is gone with the tray. The ripple and pad visuals must be authored (a ripple prefab and textured quads).
- Rules 3 and 5: tunables and events grow (pad, tap, ripple values; `onPadTap`, `onTableTap`). The old poke tunables apply only to the off-by-default air-poke toggle.
- Air poke: stays ENABLED by default for now, behind the `airPokeCyclesVolume` toggle, alongside the pads. Turn it off for pads only.
- The old 52 cm / 10 cm-below-eye placement assumed a floating tray; see the geometry risk in PLAN.md.

## Audio-reactive motion (kept)
Real-time level reading works in the Editor Preview (not a baked envelope, not a beat pulse): each frame the stem's read position is set to the playing position, then its loudness is read. Motion is auto-levelled per stem (some stems are very quiet), then multiplied by the toy's volume state, because the reading is taken before volume. Scale, bounce and wobble can each be turned on or off, with amounts. Off toys do not move to the music by default ("React When Off", "Idle Motion Amount" change that). The class presets hold the audio-reactive behavior per class.

## Music (kept; stems updated)
- Stems are the eight files in `Assets/RS_Mp3_ABR/` (13.26 MB in total, wired by name). Foundation = `01_MixBase_B` (owned by the stage, quiet, volume 0.2). Toys = `02_PianoMel_B`, `03_PianoVar_B`, `04_Cello_B`, `05_Violin_B`, `06_Chimes_B`, `07_SFX_B`, `08_MixPerc_B`. Toy assignment is an Inspector slot per toy.
- Volume states: off 0, low 0.25, medium 0.55, high 1.0 (all Inspector values), with a short glide to avoid clicks. A stem is never stopped or paused by a toy; "off" is volume 0.
- Looping is on by default. At the loop point all stems restart together in one call.
- Sync: a silent calibration pass measures each stem's start lag; every start and loop restart pre-seeks each stem by its lag and plays all stems in one call. (2026-10-27) The FOUNDATION is the clock: every second each toy stem is compared with it, and a stem more than 0.02 s off is faded out, restarted alone with a learned pre-seek, and faded back in (PLAN.md section 18). Everything restarts together only if most stems are off the same way (the foundation slipped) or a stem keeps failing. Nudging a playing stem's position was rejected because it made sync worse.

## Toy shape, size and squish (kept)
- Toy meshes are soft blob OBJ assets in `Assets/Meshes/Blobs/` (written once by `Tools/make_blob_meshes.py`; nothing is generated at runtime; replace them with your own). Each fits a 1 x 1 x 1 box centred on its pivot, so a scale in cm is the real size. Mesh, material and collider live on each toy's `Visual` child.
- Per toy, in `ToyConfig` > "Shape (stretch this toy)": Mesh Scale, Size Multiplier, Visual Offset, Visual Rotation, Auto Rest On Floor, Footprint Override, Collider Size Override. Audio-reactive motion multiplies on top of the shape.
- Footprint (spacing, edge padding, landing limit) is per toy: the widest side of the stretched box, or the override. Spacing and edge padding are 25% of the footprint; 4 cm is the reference size.
- `ToySquish`: a poke or landing squashes the toy, holding stretches it a little, a damped spring returns it. It only writes `ToyConfig.squish`; landing rules never change. Release is a feather/balloon float with sway and tilt.
- Toys use `BlobShader_01.graphShader` (material `Toy_Piano`, Toy_01 first; the other six toys follow). Older mentions of Toy_pbr mean this shader. Each toy needs its OWN material copy and its own glitter VFX asset copy (the glitter look is stored in the asset); see PLAN.md section 29. Colour/opacity state look and the vertex deform are described in PLAN.md section 26.

## Interaction details carried over
- Pinch grabs; `InteractableManipulation` is not used. Release: slow drift down, then settle at the nearest valid point inside the stage circle; an overlapping toy takes the nearest free spot, and only if none exists are neighbours gently pushed (nudging can be turned off). A toy released more than 150 cm away is rescued and flies back quickly. A per-frame safety net returns any toy found outside.
- Re-placing the stage: hold a palm tap about 1 second (hold time configurable, can be disabled; the R key does it in the Editor).
- Events kept: grab, release, drift start, settle, landing corrected (outside, overlap, rescue), volume state change (with source). New and built: pad tap (`ToyPad.onPadTap`, source padPoke or padClick), stage placed (`StageAnchor.onPlaced`, mode table or fallback). Planned, not built: table tap (position, strength recorded but unused).

## Open items (2026-10-28)
- ToyShape surface caps raised (ruffle 0.15, lump 0.15, dimple 0.10, ridge 0.08, last clamp 0.2) and lump/dimple size is now a fraction of the gap between bumps (default 0.3). PLAN.md section 24. Preset amplitudes are still small (about 1 mm); raise them per toy.
- Music motion is spring-based (hits kick a pop spring and base-pivot rocking; Music Class per toy). Shader Deform (StageConfig, default OFF) hands squash / sway / ripples to a vertex shader the artist builds: PLAN.md section 25.
- Bend Axis and Ridge Direction are now dropdowns (untested in the Inspector).
- 2026-10-31: BlobShader_01 deform graph works for squash, reachBaseY, kick and reachHeight (tested by hand). Sway is wired but not yet visible; noise, script-driven mode (On) and normals still to do. PLAN.md section 26.

- 2026-11-03 (later): Toys 02 to 07 were rebuilt as copies of Toy_01, each with its own material and glitter asset, stem, Feel Seed and home. PLAN.md section 31. Artist still has to: save the scene, assign each toy's own `Toy_0N_*_Glitter` VFX asset by hand (no API), set each toy's Music Class, and delete the unused `Toy_Mat_03` to `Toy_Mat_07`. The `BlobShader_01` graph is still shared by all seven materials.
- 2026-11-03: audit before copying Toy_01's look. Fixed the stale `edgePowe` cache name in `Toy_Piano.mat`. Open (artist to decide): duplicate ToyShape on toys 02 to 07, Music Class overriding Toy_01's hand-set Feel, shape preset use, unused assets. PLAN.md section 29.

- 2026-11-04: review session, nothing changed. The band split (`Band Split Hz`, `Band Mix Kick / Sway / Vfx` in ToyShape > Feel) already exists but is basic; better band isolation is the next audio task. Chimes does not react because its whole stem is below the Level Floor (0.005); artist is trying the per-toy Level Floor first (about 0.0005). Possible later fix: a floor relative to each stem's peak (needs a go-ahead). Material differences between toys are intentional. Glitter assets still have to be assigned per toy by hand. PLAN.md section 32.

## Working agreements
TypeScript only, CLAD skills, SIK, no invented APIs. Spectacles display numbers come from the docs and are interpolated; nothing has been verified on a real device yet.

- 2026-11-06: shared wave field (PLAN.md section 36): waves from all sockets can go to ONE big quad and interfere like water (`WaveField.ts`, `StageConfig > Wave field`, default OFF). The table is the stage: waves fade out at the quad edge. Script built and compiles; waiting for the artist to add the quad, build `Wave_Mat` and switch it on.

- 2026-11-06: ARC DIAL TAB (PLAN.md section 37): the strip is replaced by a curved 3-segment tab on each socket's ring, facing you. Tap = next state (segments show low / medium / high), drag = move the socket, Reset Sockets = back to Home Position, rings sink and bounce on press. Slide-to-set-volume is not on the arc (maybe later). Needs the artist's `Arc_Mat` (recipe given in chat).

- 2026-11-07: DIAL BUTTON (PLAN.md section 38) replaces the arc: a flat 2 cm disc on the ring's rim facing you (snowman-on-its-side overlap), three concentric parts light for low / medium / high, off = unlit in the toy's Off edge colour, sinks 1 mm when pressed. Needs the artist's updated `Arc_Mat`.
