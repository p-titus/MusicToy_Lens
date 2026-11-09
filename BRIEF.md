# BRIEF

Rewritten 2026-11-07 to describe the CURRENT design only. The full dated log is in `BRIEF_history.md` (and the tray era in `BRIEF_tray_version.md`). Technical detail is in `PLAN.md`.

## The experience
The user sits at a real table. A compact STAGE is anchored on the table, in the middle of their view. On it are 7 TOYS: soft, cute, balloon-like blobs. Each toy controls one stem of an 8-track piece. The foundation track (01 MixBase) belongs to the stage and plays quietly throughout. Toys: PianoMel, PianoVar, Cello, Violin, Chimes, SFX, MixPerc. Tone: fun and playful.

## Stage
- A minimalist outline (an authored piece-based frame; style is an Inspector choice, default corner brackets), shaped like a half ellipse with a wide back: the user is the conductor at the middle of the flat edge. Default 23 cm wide, 29 cm deep, all Inspector values. The outline is only a picture; the logical bounds are the same shape but separate, with their own debug toggle.
- Anchored to the real world, not following the head. (2026-11-09: a re-place centres the middle of your toys, or their sockets, under your gaze, tick `Replace Centre On Toys`; depth sensing runs only while searching, tick `Stop Depth When Idle`; both default ON in `StageConfig > World Query`, PLAN.md section 17, not run on a device.) Placed by gaze with World Query (table), with a floating fallback if no surface is found (always the case in the Editor). Re-place: hold a palm tap about 1 s (R key in the Editor). Move: pinch-drag the handle in front of the flat edge.
- `Enforce Bounds` (clamping, nudging, rescue) is a layout switch, default OFF. With it off, home positions are used exactly as given.

## Sockets, dial button and volume
- Each toy has a fixed SOCKET on the stage: a glowing home ring (picture only) with a small flat DIAL BUTTON on its rim, facing the user.
- Toys return to their socket on release. Carrying a toy elsewhere never rearranges the stage. The switch `Toys Return To Sockets` (default ON) turns this off (toy lands where let go).
- Dial button: a flat 2 cm disc of three concentric parts. Centre = low, middle ring = medium, outer ring = high; off = none lit, in the toy's own Off edge colour, which can be dimmed with `Button Off Brightness` (percentage, 100 = the toy's colour, 0 = black). Lit parts are the toy's own Low / Med / High edge colours, each with its own brightness slider (`Button Low / Med / High Brightness`, 0 to 200 %, 100 = the toy's colour), so each step reads clearly. It rests on the outer edge of the ring (touching, never inside it), swings around the ring to face the user and sinks slightly when pressed.
- Each socket belongs to its own toy only: a toy never lands in another toy's socket (it returns to its own), and a dragged socket stops at the edge of any other socket (`Socket Gap`, default 0.5 cm). With `Toys Return To Sockets` off there are no fixed sockets (rings follow the toys).
- Tap the button: off, low, medium, high, off (counted when the finger lifts). Drag it: moves the socket (the toy follows). Reset Sockets (all, or one) returns to `Home Position`. Slide-to-set-volume no longer exists.
- Ring look: rest glow when off, brighter per state (all multiplied by `On Opacity`, default 0.75, when the toy is on); dims and pulses slowly while its toy is away; flashes when the toy lands.
- Air-poke on a toy stays as a fallback toggle (`airPokeCyclesVolume`, default on). All volume changes go through one door, `ToyVolume.requestCycle`.
- One finger action never changes a volume twice: a short cooldown per toy (0.3 s) and a longer same-hand lock (1.0 s), both Inspector values; a different hand is never blocked.
- Events for your own animation: `ToyVolume.onStateChange` (with source), `ToyPad.onPadTap`, `ToyPad.onSocketLanded`, `StageAnchor.onPlaced`, `onMoved`, plus grab, release, drift, settle and landing-corrected events from `ToyInteraction`.

## Toys and each other
Toys never overlap. A carried toy gently pushes others aside and they ease back when it leaves (`Toy collisions` in `StageConfig`, can be switched off).

## Call home
One call sends every toy back to its socket, even one in your hand: a tick in `StageConfig`, the H key in the Preview, or a scene button (`CallHomeButton` + `CallHomeButtonLook`, built 2026-11-08: rounded rectangle with rim, "RESET?" text, hover glow, pulsing "?"; all settings in `CallHomeButtonLook`'s Inspector, shader `CallHome_Shader`; PLAN.md section 14). Updated 2026-11-08: pressing the button resets every socket to its starting Home Position and sends every toy there (`Also Reset Sockets` on `CallHomeButton`, default ON; the H key and the StageConfig tick still only send toys to their current sockets), and the button clicks: it sinks and shrinks a little and glows more while pressed, like the dial button (Inspector group "Press (the click)" in `CallHomeButtonLook`; PLAN.md section 15). Not yet tried in the Preview.

## Carrying
Pinch to pick a toy up and move it. On release it floats down (sway and tilt) to its socket and settles. Moving never changes volume.

## Waves (updated 2026-11-08)
- IN USE: ONE shared wave field on a big quad on the table, where waves from all sockets add and cancel like water, fading out at the quad edge (additive, one pulse per hit). The quad and `Wave_Mat` are made and the artist has set the wave levels and look. (The code default for `Shared Wave Field` is still OFF; the artist's scene switches it on.)
- Tap waves (phase 1 built 2026-11-08, `TapWaves`, PLAN.md section 16): a finger tap (in the Preview, a mouse click) starts a wave in the shared field with its own colour and brightness; taps fade out near sockets and toys (margin is an Inspector value). Finger detection and the on-beat bonus are still to come.
- Also in code: a small per-socket ripple ring on every stem hit and a softer one on landing (`SocketRipple`, `Ripple_Mat`). The artist has said they use the shared field; whether the per-socket ripples are also on has not been stated.

## Toy shape and look
- Blob meshes: one authored base blob (`Blob_03`); each toy gets its own copy shaped once at startup by `ToyShape` (form, ruffles, lumps, dimples, ridges). This is the approved runtime bake; any NEW runtime mesh must be warned about and approved first.
- Shape, Feel and Music Class live per toy in `ToyShape`. Music Class (Strings, Piano, Chimes / FX, Percussion, Custom) replaces the 12 music-motion values.
- Look: every toy has its own material (a copy of `BlobShader_01`) and its own glitter VFX asset. Scripts only write per-toy values (`lookState`, `audioLevel`, `coreHeat`, deform values). Colours, opacity and glow are the artist's, in the shader graph.
- Footprint, spacing and edge padding come from the toy's real size (`Base Blob Scale` 4 cm x `Size Multiplier`, with `Fit To Mesh Bounds`). `ToySquish` squashes on poke and landing.

## Alive and hover
See the section "Alive and hover" at the end of this file (toys, dial buttons and the Move Handle react to a nearby hand; off toys breathe a very low glow).

## Audio-reactive motion
Real-time stem level read in the Editor Preview. Hits (onsets) kick springs (pop, rocking), auto-levelled per stem, scaled by volume state. A per-toy band split exists but is basic. Off toys do not move to the music by default. Chimes needs a lower per-toy `Level Floor`.

## Music (fixed: changed by the artist only)
- Eight stems in `Assets/RS_Mp3_ABR/` (13.26 MB). Foundation `01_MixBase_B` (volume 0.2). Toys: `02_PianoMel_B`, `03_PianoVar_B`, `04_Cello_B`, `05_Violin_B`, `06_Chimes_B`, `07_SFX_B`, `08_MixPerc_B`.
- Volume states: off 0, low 0.25, medium 0.55, high 1.0 (Inspector), short glide. A stem is never stopped by a toy; "off" is volume 0. Looping on; all stems restart together.
- Sync: the foundation is the clock. Each second every toy stem is compared with it; a stem more than 0.02 s off is faded out, restarted alone with a learned lead, and faded back in.

## Parked ideas (do not build)
Table taps (hand-joint detection), tap strength, sticky walls, sockets as grooves, class zones, a separate class-preset layer (`ToyClassPreset`).

---

## Most important requirement: I am an artist and want to control everything
You build the plumbing; I make every design decision. I want to customize shaders, volume, position, animation, meshes, and interactions.
1. No runtime-generated materials or shaders. No generated meshes except the approved ones: the blob bake (`ToyShape` / `BlobBake`) and the pad shapes (`PadShape`, now only used by the legacy strip) and the Move Handle crescent (`MoveHandleShape`). Ring, dial button, ripples and wave field are flat authored quads (`Pad_Plane.mesh`) drawn by my materials.
2. Each toy is a prefab or scene object I can open and edit directly. Swapping its mesh or material must not require touching code.
3. Every tunable value is an Inspector value with a sensible default and a short tooltip with units.
4. Settings live in three places: one global config (`StageConfig`), per-toy `ToyConfig` / `ToyShape`, and the Music Class table (a class replaces the music-motion values; the old plan for separate class preset assets is parked).
5. Interaction is separated from presentation: events are emitted so I can add my own animation, particles or shader reactions without editing core scripts.
6. Keep scripts small, single-purpose, and commented in plain language. No frameworks I don't need.

## Working agreements
TypeScript only, CLAD skills, SIK, no invented APIs. Display numbers come from the docs and are interpolated. Nothing has been verified on a real device, and none is available (the artist has no device yet: this is a new Specs version). All testing is in the Editor Preview and with LEAF.

## Next work (from 2026-11-08)
Navigation by UI buttons, and tuning the existing Specs interactions (touch, pinch, tap, etc.), plus possibly adding more. Details to be agreed in session.
- **Move Handle is now a curved crescent handle (built 2026-11-08), with the Call Home button still to come.** It stays the "Move Handle" (pinch-drag moves the stage). `MoveHandleShape` draws a flat crescent: flat baseline toward the stage, pull point toward the user, about 8 cm wide and 3 cm deep, tapering toward the ends, with a curve on the inside (toy-facing) edge too, like a shallow sliding-drawer pull. All shape numbers are Inspector values (outside curve, inside curve, grip thickness, touch box). It is an approved runtime mesh. It uses the default material; the artist will author a gradient (bright centre) and texture material next, and the mesh has UVs ready for it. `StageConfig > Moving the stage > Move Handle Authored` is ON in the scene (the handle's size and picture scale belong to the artist and `MoveHandleShape`). The existing `CallHomeButton` script is reused for the button (not yet placed in the scene).
- **Next (in order):** (1) the Call Home button on the handle (a placeholder button from existing assets only, no size increase, so the artist can test before swapping in their own; check pinch-on-button versus pinch-on-handle in the Preview); (2) the artist's handle material graph; (3) more UI options. Do not start the button until the artist asks.

## Alive and hover (added 2026-11-08; details in PLAN.md section 13)
Not yet looked at in the Preview or on a device. Toys, dial buttons and the Move Handle notice a hand coming close (fingertip distance in cm, or hover) once it has stayed close for a set number of frames. Toys glow a little more (existing `coreHeat`) and lean gently toward the fingertip; dial buttons get brighter (existing button colours). A toy that is OFF breathes a very low glow (toy core and dial button). The handle only reacts if the artist names a material parameter for it. In the Editor Preview the mouse acts as the fingertip. All values: `StageConfig > Alive and hover`; per toy `Alive Scale` / `Lean Scale` on `ToyAudioReact`.
