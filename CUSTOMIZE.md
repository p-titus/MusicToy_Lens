# CUSTOMIZE

Short how-tos for changing the toys without touching code.

## How to stretch a toy

1. In the Scene hierarchy select the toy (`Stage > Toys > Toy_03_Cello`, for example). Select the toy itself, not its `Visual` child.
2. In the Inspector open the `ToyConfig` component, group **Shape (stretch this toy)**.
3. Change the values. Each toy has its own.

| Value | What it does |
|---|---|
| Mesh Scale (x, y, z) | Width, height and depth of the blob in cm. Different numbers stretch it: (4, 8, 4) is tall, (7, 3, 4) is wide. |
| Size Multiplier | One number that scales all three together. 2 = twice as big every way. |
| Visual Offset | Shifts the mesh child (cm) on top of the automatic resting height. |
| Visual Rotation | Extra rotation in degrees. The footprint follows the rotation. |
| Auto Rest On Floor | On: the mesh is lifted by half its height so it sits on the stage. Turn off if your own mesh has its pivot at its base. |
| Footprint Override | 0 = automatic (the widest side of the stretched shape). A number replaces it for spacing and edge padding. |
| Collider Size Override | 0,0,0 = the collider follows the shape exactly. Enter cm sizes only for a bigger or smaller poke/pinch target (useful for very thin shapes). |

Good to know:
- Edit these values, not the `Visual` object's own Transform. The script sets the Transform from `ToyConfig`, so your Transform edits are overwritten when the Lens runs.
- Changes show live in the Preview panel while it runs. The Scene panel does not run scripts, so it only shows the sizes set once in the scene.
- The music moves the toy on top of your shape (it multiplies the scale), so a stretched toy pulses in its own proportions. Change the amounts in `StageConfig > Audio-reactive motion`, or per toy in `ToyConfig > Override audio-reactive motion`.
- Toys keep clear of each other and of the stage rim using their own footprint. A toy stretched to twice as wide takes more room. If the stage gets too crowded the console prints a "TOO TIGHT" warning (raise Stage Width / Depth or make toys smaller). A single toy that is too big for the stage gets its own warning.
- Keep home positions apart (`ToyConfig > Home Position`: X left/right, Y height, Z back/front, in stage cm). With `Stage Placement > Enforce Bounds` ON, a home that is outside the stage or overlaps another toy is moved to the nearest free spot at start and the console says so. With it OFF (the layout mode) nothing is moved.

## How to replace a blob with your own mesh

1. Drop your model (FBX, OBJ or GLB) into `Assets/Meshes/` and let Lens Studio import it.
2. Select the toy's `Visual` child, and in its `RenderMeshVisual` set **Mesh** to your mesh (the material stays; change it there too if you like).
3. Select the toy and open `ToyConfig > Shape`:
   - Set **Mesh Scale** to the size you want in cm. The blobs are exactly 1 x 1 x 1 units, so scale equals size. If your model is a different size (say 30 cm at scale 1), either lower Mesh Scale to match, or scale the model in your 3D tool. Check the real size of your mesh first.
   - If your pivot is at the bottom of the model, turn **Auto Rest On Floor** off. If the pivot is in the centre, leave it on.
4. The collider is a 1 x 1 x 1 box on the `Visual`, so it only matches a mesh that is 1 unit across. For any other mesh either set **Collider Size Override** (cm) or resize the collider on the `Visual`.
5. Run the Preview and check that the toy sits on the stage, the console shows no "TOO TIGHT" warning, and it is easy to poke and pinch.

Also: the eight blob meshes were made once by `Tools/make_blob_meshes.py`. They are ordinary assets; you can re-run the script to regenerate them (it overwrites `Assets/Meshes/Blobs/*.obj`) or just replace them.

## How to change the squishy poke and soft landing

Poke a toy and it squashes, springs past its normal shape and wobbles to rest. It squashes a little when it touches down on the stage, and stretches a little while you hold it. The script is `ToySquish` (one per toy); the numbers are yours.

1. Everything at once: select `StageConfig`, group **Squish and soft landing**.
2. One toy only: select the toy, group `ToyConfig > Override squish`, switch **Override Squish** on, then edit the values there.

| Value | What it does |
|---|---|
| Squish Enabled | Master switch. |
| Poke Squash | How much a poke flattens the toy (0.3 = 30%). The spring overshoots, so the deepest point is a little more than this. 0 = none. |
| Poke Press Seconds | How long the squash is held before it springs back. |
| Land Squash / Land Press Seconds | The same, for touching down on the stage. |
| Grab Stretch | How much taller and thinner the toy gets while held. |
| Squish Bulge | Sideways bulge when squashed. 0.5 keeps the volume about the same. |
| Squish Frequency | Wobbles per second. Higher = tighter jiggle. |
| Squish Damping | 0.05 = long jiggle, 0.3 = a couple of bounces, 1 = no overshoot (a soft cushion). |

Good to know:
- It only scales the mesh child, on top of the shape and the music. Footprint and landing rules use the rest shape, so squishing never moves other toys.
- The poke/pinch collider follows the mesh scale, so it shrinks briefly during a squash.
- The speed of the fall and the settle are separate: `StageConfig > Release, drift and settle` (Settle Duration, Settle Easing).
- As the scene is set now, every toy has **Override Squish** on with poke / land / grab squish 0.1, bulge 2 to 4 and damping 1.0. Damping 1.0 means no overshoot (a soft cushion), so there is no springy jiggle from the squish itself. Lower Squish Damping (try 0.3) for the bounce. Edit these on each toy; the global values in `StageConfig` are ignored for a toy that overrides them.
- A large bulge widens a toy visually but not its footprint, so squashed neighbours can overlap a little.

## How to change the floaty fall and the wobble

Release a toy and it floats down like a balloon or feather: it sways side to side and tilts a little, then levels out as it lands. While the music plays, a toy also pulses, bounces and wobbles to its own stem.

| Where | Value | What it does |
|---|---|---|
| `StageConfig > Release, drift and settle` | Float Sway | How far (cm) a falling toy sways. 0 = straight down. |
| | Float Sway Speed | How fast it sways. Lower = lazier. |
| | Float Tilt | Degrees a falling toy tilts. 0 = no tilt. |
| | Drift Speed, Settle Duration, Settle Easing | How slowly it falls and how it lands. Per toy: `ToyConfig > Override motion`. |
| `StageConfig > Audio-reactive motion` | Scale / Position / Rotation toggles and amounts | How much the music scales, bounces and wobbles a toy. Per toy: `ToyConfig > Override audio-reactive motion`. |
| | React When Off, Idle Motion Amount | Let toys that are off (volume 0) still move a little. |

The stage is flat, so there are no tilt settings.

## How to make a toy's pad your own (Pads)

Each toy has a LOLLIPOP pad on the table (`Stage > Pads > Pad_01 ...`): a small circle under the toy like a shadow, and a narrow rounded strip in front of it (toward you), like a piano key or a fader.
- **Tap the strip:** the volume steps off, low, medium, high, off. A tap counts when the finger lifts.
- **Slide a finger along the strip:** the volume follows the finger. The end nearest the toy is loudest, the end nearest you is off. A slide never also counts as a tap.

All sizes are in `StageConfig > Pads` (cm). Neither the strip nor the circle ever changes size with the volume or the toy's size.

1. **Shape the strip:** `Pad Strip Shape` (Rounded or Ellipse), `Pad Strip Width`, `Pad Strip Length`, `Pad Strip Roundness` (0 = square corners, 1 = pill). `Pad Front Offset` is the distance from the toy's centre to the strip's centre: keep (offset minus half the length) about equal to half the circle so the strip grows out of the circle.
2. **Shape the circle:** `Pad Base Shape`, `Pad Base Width`, `Pad Base Length`, `Pad Base Roundness`, `Pad Base Offset` (picture only). Keep it SMALLER than the toy's footprint (a warning is printed if not). Width or Length 0 removes it. `Pad Base Shade` makes it a darker copy of the pad colour. `Pad Curve Steps` sets how smooth the rounded corners are.
3. **Use your own shapes:** put a flat mesh 1 cm wide and 1 cm long in `Pad Strip Mesh` and/or `Pad Base Mesh`. It is stretched to the width and length above. Empty = the script draws the shape from the numbers.
4. **Swap the look:** select `Pad_xx > Visual` (the strip) or `BaseVisual` (the circle) and change the **Material** on its `RenderMeshVisual` (leave the mesh to the script). Each pad makes its own copy of the material before it tints it, so pads can show different states and your asset is never edited.
5. **Colours per state:** on each pad (`ToyPad > Pad colours`): a base colour and four colours (off, low, medium, high), the blend time, and the name of the material parameter that receives the colour (`Colour Param`, default `baseColor`). Tick `Reset Pad Colours` to rebuild the four from the base colour (or tick the same box in `StageConfig > Resets` for all pads).
6. **Show the state in your own shader:** add a number (float) parameter named exactly `padState` to your material graph. The pad writes 0 = off, 1 = low, 2 = medium, 3 = high to it, and a smooth 0 to 3 value while sliding. Change the name in `Pad State Param`.
7. **Slide settings:** `Pad Slide Enabled`, `Pad Slide Threshold` (cm of travel before a touch counts as a slide), `Pad Slide Snap` (ON: settle on the nearest of the four states when the finger lifts), `Pad Slide Hand Scale` (how far the volume moves per cm of hand movement; raise it for pinches aimed from a distance).
8. **Touch and feel:** `Pad Hit Margin` (extra touch margin around the strip, cm), `Pad Collider Height` (cm), `Pad Base Touchable` (the circle can be touched too; off by default), `Pad Lift` (cm above the stage floor), `Pad Base Drop`, `Pad Press Depth` (cm) and `Pad Press Seconds` for the small press-down on a tap, `Pad Follow Speed` (how fast a pad slides under its toy).
9. **Stop double changes:** `Volume Cooldown` (seconds, any change on a toy blocks further changes on it) and `Same Hand Cooldown` (seconds, the same hand cannot change that toy again). A slide counts as a change, so the finger leaving the strip cannot tap the toy straight afterwards. Raise them if one touch ever counts twice; lower them if quick double taps feel ignored.
10. **Pads only, no air-poke:** switch off `Air-poke and grab > Air Poke Cycles Volume`. Poking the toy in mid-air then does nothing; pads and carrying still work.
11. **Which touches count:** `Pad Accepts Poke` (fingertip) and `Pad Accepts Click` (mouse in the Editor, phone tap, or a pinch aimed at the pad).

Good to know:
- A touch on the toy's own body goes to the toy, not the pad. The strip is meant to be touched in front of the toy.
- The pad follows its toy while you carry it (it stays flat on the table).
- Sliding has been tried only with the Preview's simulated hand. Check the feel on a device and adjust `Pad Slide Threshold` and `Pad Slide Hand Scale`.
- Subscribe to `ToyPad.onPadTap` (taps only) or `ToyVolume.onStateChange` (it tells you the source: padPoke, padClick, padSlide or airPoke) to add your own animation, particles or shader reactions without editing the core scripts.

## How the stage finds the table (StageConfig > Stage placement and World Query)

1. At start (after `Placement Delay`) the stage searches for the table with World Query: a ray from your head along your gaze, `Query Refresh Rate` times a second, for up to `Search Seconds`. A result counts only if it is between `Min/Max Hit Distance` (cm) from your head, flat enough (`Min Surface Up`, 1 = flat) and between `Min/Max Drop Below Eye` (cm) below your eyes. After `Hits Required` accepted results in a row the stage is placed there, `Height Offset` (cm) above the surface, facing you, and stays put.
2. If nothing is found (or World Query is off, or you are in the Editor Preview, which currently returns no hits) the stage floats in front of you: `Distance From User` cm away, `Fallback Height Offset` cm from eye level.
3. **Place it again:** hold a palm tap (one hand taps the other palm) for `Replace Hold Seconds`; in the Editor hold the R key. Look at the table first.
4. Every result is printed in the Logger when `Log Queries` is on: `HIT ... accepted/rejected: reason` or `MISS`.
5. **Stage shape:** the stage is a half-ellipse-like shape with you, the conductor, at the middle of its flat edge. `Stage Width` (cm at the flat edge), `Stage Depth` (cm to the far point), `Stage Back Handle` (pull the far point's handle out for a wider, flatter back; 0.55 is a true half ellipse) and `Stage Side Handle` (how straight the sides run before curving). The same numbers shape the visible frame and the toy landing area. Show the real landing area with `Debug > Show Bounds Outline`. `Gaze Depth Ratio` sets where on the stage your gaze point lands when it is placed.
6. **Stage frame look:** `Stage frame` group: style (thin line, brackets, dashed), `Frame Flat Edge`, `Frame Arc Marks`, colour, opacity, thickness. The frame is a picture only.
7. **Moving the stage:** hold a palm tap (R key in the Editor) to re-place it where you look, or pinch the small handle in front of the flat edge (`Stage > MoveHandle`) and drag. Settings are in `Moving the stage`. The drag has only been tried with the Preview's simulated input.
8. **Layout mode:** `Stage Placement > Enforce Bounds` OFF lets you place toys anywhere (home positions and release spots are used exactly as given, no clamping, nudging or rescue). Turn it ON to keep toys inside the stage and apart.
