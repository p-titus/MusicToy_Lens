# BRIEF

## The experience
A shallow tray sits in front of the user at an easily reachable distance, with
8 toys on it. Each toy has a different shape and controls one stem of a
4-minute piece of music (9 stems total, optimized mp3s). The 9th stem is the
foundation track, owned by the tray, which plays quietly throughout. The
tone is fun and playful. The toys are soft and cute, like balloons.

## Interaction
- POKE a toy to cycle its stem volume through 4 states:
  off -> low -> medium -> high -> off. The volume value of each state is
  configurable.
- PINCH to grab and move a toy anywhere in 3D space.
- Toys have no fixed home position. The user can rearrange them freely.
- On release, the toy drifts slowly down toward the tray, then settles onto
  the tray surface at the closest valid point to where it was released.
- A toy can never end up outside the tray. If released over, beside, or far
  from the tray, it moves to the nearest point inside the tray's bounds.
  Toys can never be lost: even if released very far away (beyond a
  configurable distance), they return to the tray.
- Moving a toy never changes its volume state. Only a poke does.
- Each toy moves to the music of its own stem (audio-reactive motion).
- All 9 stems start together and stay in sync.

## Most important requirement: I am an artist and want to control everything
You build the plumbing; I make every design decision. I want to customize
shaders, volume, position, animation, meshes, and interactions.
1. NO runtime-generated meshes, materials, or shaders in code. Use plain
   placeholder assets I can replace: eight different primitive shapes with a
   simple default material.
2. Each toy is a prefab or scene object I can open and edit directly. Swapping
   its mesh or material must not require touching code.
3. Every tunable value is an @input in the Inspector with a sensible default
   and a short tooltip: volume levels per state, poke sensitivity, grab
   behavior, drift speed, settle speed and easing, max rescue distance,
   audio-reactive amount, smoothing, which properties react (scale, position,
   rotation), which audio file belongs to which toy, and the tray values below.
4. Settings live in two places only: one global config component (tray,
   foundation track, shared defaults) and one component per toy (its stem,
   its overrides). Per-toy values override global defaults.
5. Interaction is separated from presentation. Poke, grab, release, settle,
   state-change, and landing-corrected events are emitted so I can add my own
   animation, particles, or shader reactions later without editing core
   scripts.
6. Keep scripts small, single-purpose, and commented in plain language. No
   frameworks or abstraction layers I don't need.

## Tray and toy layout
Intent (you decide the exact numbers):
- A shallow ROUND tray, like a serving plate: a thin floor with a LOW LIP
  around it (default 2 cm, an Inspector value), not a platform. Toys are
  2-4 times taller than the lip and rest on the tray floor. (Original intent:
  tilted toward the viewer 20 degrees. UPDATE 2026-10-26: the tray is now FLAT;
  see "Update 2026-10-26" at the end.)
- The tray sits close enough to be comfortably within arm's reach, centered
  in the user's forward view, and slightly below eye level, like a table
  surface. The whole tray should be visible at once within the Specs field of
  view, with no need to turn the head to see its edges.
- Make it on the compact side. It only needs room for 8 toys to be rearranged
  comfortably, with space to spare. Don't oversize it.
- Toys are about the size of a child's toy or a small balloon: large enough to
  fill a hand, small enough to sit easily on the tray with room to move.

How to choose the numbers:
- Look up the Specs field of view and recommended comfortable interaction
  distances in the Specs docs and CLAD skills. Do not guess. If you can't find
  this information, say so in PLAN.md and fall back to conservative values.
- Pick tray distance, width, length, height offset, and toy size from that
  information. In PLAN.md, list each chosen value with a one-line reason.
- Make each an Inspector value: distance from user, height offset from eye
  level, tray radius, rim height, toy size, edge padding.

Behavior:
- The logical landing bounds are a circle (radius) on the tray floor, in the
  tray's local space, and they follow the tray if I move, rotate, or scale
  it. Toys settle at the nearest valid point inside the circle, minus edge
  padding. The visual tray is a placeholder shallow cylinder I will replace
  with my own model, so model and bounds are independent. Rim height is
  visual only and must not affect landing rules.
- Toy size is the single source of truth for spacing and edge padding.
- When toys would overlap on landing, gently nudge them apart by default, with
  minimum spacing as an Inspector value and a setting to turn it off.
- On lens start, place the tray in front of the user using their head position
  and forward direction, then LOCK it in world space. It must not follow the
  head afterward.
- Provide a simple way to re-place the tray in front of me (an Inspector
  action or a gesture).
- Start the 8 toys in a ring on the tray (one free slot in the middle), with
  editable positions.
- Include a toggle for a debug outline of the bounds.
- Check that all 8 toys fit with a total of at least one spare toy slot of
  free space (not one per toy), and warn me in the console if they don't.

## Audio-reactive motion
First check what Lens Studio and Spectacles actually support for reading a
playing audio track's level in real time. If real-time analysis is not
available, do not fake it. Propose alternatives (for example, a pre-baked
amplitude envelope per stem, or beat-based pulsing) in PLAN.md and wait for
my choice.

## Decisions since the original brief (all approved in conversation)

### Shape, size and placement
- The tray is ROUND: 19.1 cm across (landing-bounds radius 9.55 cm). The landing bounds are a circle in the tray's local space, so they follow the tray if it is moved, rotated or scaled. A half-round (D-shaped) tray was considered and NOT adopted: for one spare toy slot it needs a 27 cm wide flat edge, which does not fit the display. Reshaping only the visual model is fine, because model and bounds are independent.
- The tray is a tray, not a platform: floor 0.5 cm thick, lip 1 cm high (was 2 cm) and 0.6 cm thick, all visual only and all Inspector values. The lip never affects landing.
- The tray is FLAT. (It was tilted 20 degrees toward the viewer; the tilt and the "toys stay upright" toggle were removed. The tray is only turned to face the user.)
- Placement: centre of the tray 52 cm ahead of the head and 10 cm below eye level as set in the scene (the script defaults are 53 and -8; both are Inspector values and the scene values win), placed once at lens start (after a short delay for head tracking) and then locked in world space.
- Every toy centre must stay inside the documented 35-60 cm near-field, so every toy can be reached by hand (flat tray at 52 / -10: toy centres sit about 46.5-59.4 cm from the head, calculated, not re-measured in the Preview).
- Toy footprint is 4 cm by default (the reference size; spacing and edge padding are 25% of a toy's footprint). Since the blob update each toy has its OWN footprint, taken from its stretched shape (see "Blob toys and stretching"). Toys are taller than wide (about 3-6.5 cm tall) so they still fill a hand.
- Free space means ONE spare toy slot for the whole tray (9 slots for 8 toys), not one per toy. The slot is toy size plus spacing; the console warns if the tray has less (required amount is an Inspector value).
- The 8 toys start in a ring around one free centre slot; start positions are editable per toy.

### Toys and artist control
- One base prefab `Toy` (eight instances), each with its own placeholder mesh and its own simple pastel material. The first version used eight primitives (Sphere, Cone, Cylinder, Capsule, Torus, Platonic, Pyramid, Box); they were replaced by eight soft blob meshes (see "Blob toys and stretching"). Nothing is generated in code.
- Mesh and material live on each toy's `Visual` child; audio-reactive motion moves only that child. The toy's collider is a box on the Visual child (so it scales with the Visual). If you swap in a mesh that is not about 1 cm at scale 1, resize that collider.
- Tray visuals are placeholders (a floor disc and a ring of lip pieces that the script only moves and scales). Turn off "Auto Size Tray Model" to use your own model.
- Settings stay in two components only: `TrayConfig` (global) and `ToyConfig` (per toy, with override groups). Scene order never matters (scripts find the config through `TrayConfig.whenAvailable`).

### Music
- Stems are the nine files in `Assets/RS_Mp3_Oct25/`. Foundation = `01_MixBase` (owned by the tray, quiet, volume 0.2). Toys = `02_PianoMel`, `03_PianoHi`, `04_PianoLo`, `05_Cello`, `06_Violin`, `07_Chimes`, `08_FX`, `09_MixPerc`. Every assignment is an Inspector slot.
- Volume states: off 0, low 0.25, medium 0.55, high 1.0 (all Inspector values), with a short glide to avoid clicks. A stem is never stopped or paused by a toy; "off" is volume 0.
- Looping is on by default (Inspector toggle). At the loop point all stems are restarted together in one call.
- Sync method (chosen after testing): a silent calibration pass measures each stem's start lag; every start and loop restart pre-seeks each stem by its lag and plays all stems in one call. A monitor checks the gap between stems every 4 s and only restarts everything together if it grows past 0.04 s. Nudging a playing stem's position was rejected because it made sync worse.
- Audio-reactive motion uses real-time level reading (not a baked envelope and not a beat pulse): each frame the stem's read position is set to the playing position, then its loudness is read. Motion is auto-levelled per stem (some stems are very quiet), then multiplied by the toy's volume state, because the reading is taken before volume. Scale, bounce and wobble can each be turned on or off, with amounts.
- Off toys do not move to the music by default. Two Inspector values change that: "React When Off" and "Idle Motion Amount".

### Interaction
- Poke cycles volume; pinch grabs. Moving a toy never changes its volume. SIK's `InteractableManipulation` is not used because it removes poking.
- A touch counts as a poke only if it ends without turning into a pinch, only on a resting toy, only if the fingertip pushed deep enough (default 0.3), and not within 0.6 s of letting go of that toy.
- Release: the toy drifts slowly down along the tray surface, then settles at the nearest valid point inside the circle. If it would overlap another toy it takes the nearest free spot, and only if there is none are neighbours gently pushed aside (nudging can be turned off). A toy released more than 150 cm away is rescued and flies back quickly. A per-frame safety net returns any toy found outside the circle.
- Re-placing the tray: hold a palm tap for about 1 second (hold time configurable, can be disabled; the R key does it in the Editor).
- An off-by-default "quick click cycles volume" option exists for mouse testing in the Editor.
- Events emitted: poke, grab, release, drift start, settle, landing corrected (reason: outside, overlap, rescue), and volume state change.

### Working agreements
- TypeScript only, CLAD skills, SIK, no invented APIs. Spectacles display numbers come from the docs and are interpolated; nothing has been verified on a real device yet.
- Test files for the audio spikes were deleted; the real scripts log sync spread and levels when "Verbose" is on, so a device run uses the real code.

### Blob toys and stretching (added after the first build)
- The eight placeholder primitives were replaced by eight soft, rounded blob meshes, plain OBJ assets in `Assets/Meshes/Blobs/`: Pebble (lumpy), Pebble, Donut, Donut (ruffled), Bean (curled), Bean, Flower, Flower (star). They were written once by `Tools/make_blob_meshes.py` (not part of the Lens, nothing is generated at runtime) and can be replaced by your own models. Each fits a 1 x 1 x 1 box centred on its pivot, so a scale in cm is the real size.
- Why not primitives with different scales: only sphere, capsule and torus are soft, and stretched they give look-alike ellipsoids.
- Each toy's mesh and collider live on its own `Visual` child; the toy root, interaction, and audio logic are untouched.
- Per toy, in `ToyConfig` > "Shape (stretch this toy)": Mesh Scale (x, y, z in cm), Size Multiplier (one number for all three), Visual Offset, Visual Rotation, Auto Rest On Floor, Footprint Override, Collider Size Override. All have tooltips and defaults. Stretch from here, not from the Visual's own Transform (the script sets it).
- The shape is applied every frame, so edits show at once in the Preview. The Scene panel does not run scripts and shows only the sizes set once in the scene.
- Audio-reactive motion MULTIPLIES on top of the shape: scale = shape x (1 + amount x level), bounce and wobble are added to the shape's offset and rotation. Nothing overwrites anything.
- Collider: a 1x1x1 box on the Visual, so it follows the stretched shape exactly. `Collider Size Override` (cm) replaces it only if you type a size.
- Footprint (spacing, edge padding, landing limit) is per toy: the widest side of the stretched, rotated box, or `Footprint Override`. Two toys keep their centres (footprintA + footprintB) / 2 x (1 + spacing) apart; a toy's centre stays within tray radius - footprint/2 - footprint x padding. With equal footprints this is the old rule.
- The fit check counts each toy's own slot and warns if the free space falls below the required amount, or if one toy alone is too big for the tray (footprint above tray radius / (0.5 + edge padding), 12.7 cm at the defaults).
- Start positions: each toy starts at its editable position, clamped into the tray, and moved to the nearest free spot if it would overlap a toy that started before it (console warning). The eight default positions are the eight ring slots (Toy_01 had been left on Toy_02's spot and was moved to the free slot).

## Update 2026-10-26 (project re-read; scripts and scene are the source of truth)

### Flat tray
- The tilt is gone: `trayTiltDegrees` and `toysStayUpright` no longer exist in `TrayConfig`, and `TrayPlacer` sets only the yaw (the tray faces the user and stays flat). Scene placement is 52 cm ahead and 10 cm below eye level. Margins were last measured for the tilted tray; the flat tray has not been re-measured in the Preview.
- The lip is now ONE object (`TrayModel > Lip`) holding a ring mesh, 1 cm high by default. `TrayBounds` builds that ring mesh in code while "Auto Size Tray Model" is on. **This departs from rule 1 ("no runtime-generated meshes").** It is a placeholder, but if the rule is strict the ring should become an authored mesh (see PLAN.md section 12).

### Cute blob toys: squish, float and wobble (new since the first build)
- New script `ToySquish` (one per toy): a poke squashes the toy, touching down squashes it a little, holding it stretches it a little, and a damped spring returns it to shape. It only writes `ToyConfig.squish`; the footprint and landing rules never change. Settings: `TrayConfig > Squish and soft landing`, per toy in `ToyConfig > Override squish`.
- Release is now a feather/balloon float: the toy sways side to side and tilts while it falls, easing to nothing by the landing (`floatSway` 1.4 cm, `floatSwaySpeed`, `floatTilt` 12 degrees; all Inspector values).
- Audio-reactive wobble (scale, bounce, rotation) is unchanged in code. The scene gives every toy its own override values: scale amount 0.2 (Toy_04 0.5), drift speed 1 cm/s, settle 0.55 s, and soft squish (poke 0.1, land 0.1, grab 0.1, bulge 2 to 4, damping 1.0, which means no overshoot, a soft cushion). Toy meshes are about 4 cm wide and 2 to 3.5 cm tall.
- Toys use a custom graph shader (`Assets/Toy_pbr.graphShader`, a copy of `simple_pbr.graphShader` with a different base colour) with eight pastel materials.

### Other
- Ten of the imported packages remain in `Assets/` (the earlier report listed 28; the rest were deleted). Nothing in the scene references them.
- New doc: `CUSTOMIZE.md` (how-tos). The asset report (`ASSET_REPORT.md`) is being deleted: it was only an info sheet about the downloaded packages.
- Under consideration, nothing decided or built: replace the tray with slots on a table, with walls blobs can stick to (PLAN.md section 14).
