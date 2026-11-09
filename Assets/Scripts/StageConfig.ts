// StageConfig - the ONE global settings component (stage, World Query, pads, foundation track, shared defaults).
// Every tunable value for the whole experience lives here, except per-toy settings (ToyConfig).
// Other scripts read these values every time they need them, so you can edit them live.
//
// Units: centimetres, seconds, degrees. Lengths are in the stage's own local space
// (if you scale the stage object, everything scales with it).
//
// Startup order: this script publishes itself in onAwake. Other scripts ask for it with
// StageConfig.whenAvailable(...), so nothing depends on the order of the Scene panel.

import { ComfortLimits } from "./ToyFeel"

export type ResetKind = "toyPositions" | "padPositions" | "padColours" | "sockets" | "callHome"

@component
export class StageConfig extends BaseScriptComponent {
  // ---------------------------------------------------------------- references
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The scene object with the Camera (head). Used to aim the World Query ray and for the floating fallback.")
  cameraObject: SceneObject

  @input
  @hint("The toy objects (each needs ToyConfig, ToyInteraction, ToyVolume, ToyAudioReact).")
  toys: SceneObject[]

  @input
  @hint("AudioComponent that plays the foundation track (stem owned by the stage).")
  foundationAudio: AudioComponent

  @input
  @hint("The foundation stem audio file (01_MixBase_B). This is the ONLY place the track is chosen: leave the AudioComponent's own Audio Track and Autoplay Loop empty/off.")
  foundationTrack: AudioTrackAsset

  @input
  @allowUndefined
  @hint("The ONE piece of the stage frame: a prefab with a flat quad lying along X (length) and Z (thickness). The frame is built from copies of it, stretched in length only, so the line is always the same thickness. Swap the mesh or material inside the prefab, or assign your own prefab here. Empty = no frame.")
  frameSegmentPrefab: ObjectPrefab

  @input
  @allowUndefined
  @hint("Thin placeholder pieces used to draw the debug outline of the real landing bounds. They are only moved/scaled, never created.")
  outlineSegments: SceneObject[]
  @ui.group_end

  // ---------------------------------------------------------------- stage on the table
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Stage placement</span>')
  @ui.group_start("Stage placement")
  @input
  @hint("TEMPORARY layout switch. ON: toys are kept inside the stage shape, pushed apart when they overlap, and rescued if released far away (the normal rules). OFF: none of that happens. Home Position and where you let go are used exactly as given, so you can place toys anywhere (in front, behind, outside the stage, overlapping). Turn it back ON when the layout is done.")
  enforceBounds: boolean = false

  @input
  @hint("Stage width at the flat edge, left to right (cm). The stage is a half ellipse-like shape with you, the conductor, at the middle of its flat edge. Toys settle inside it, minus edge padding. Shapes both the toy bounds and the frame. Snap's guide gives about 23 cm of comfortable width at 55 cm from the eyes (13 cm at 35 cm): check on a device.")
  stageWidth: number = 23

  @input
  @hint("Stage depth (cm): from the flat edge (your side) to the far point at the back. The table runs away from you, so depth costs less of the display than width.")
  stageDepth: number = 29

  @input
  @hint("How far the handle at the FAR POINT of the back is pulled out sideways, as a fraction of the half width (0.05 to 1). 0.55 is a true half ellipse. Bigger = a flatter, wider back (like a rounded rectangle). Imagine the bezier handle at the farthest point being pulled out.")
  stageBackHandle: number = 1

  @input
  @hint("How far the handles at the two CORNERS (the ends of the flat edge) run straight back before the curve starts, as a fraction of the depth (0.05 to 1). 0.55 is a true half ellipse. Bigger = straighter sides.")
  stageSideHandle: number = 0.8

  @input
  @hint("Where your gaze lands on the stage when it is placed, as a fraction of the stage depth measured from the flat edge toward the far point (0 = on the flat edge, 1 = at the far point). 0.42 is about the middle of the stage's surface, so the stage is centred on what you look at. The flat edge then sits nearer to you.")
  gazeDepthRatio: number = 0.42

  @input
  @hint("Distance from your head (cm) used by the FLOATING FALLBACK stage, and the distance a real table hit is expected near (see World Query min/max distance below).")
  distanceFromUser: number = 52

  @input
  @hint("How far above the real table surface the stage floor sits (cm). Small positive values stop flicker against the table.")
  heightOffset: number = 0.2

  @input
  @hint("Floating fallback only: height of the stage floor relative to eye level (cm). Negative = below the eyes.")
  fallbackHeightOffset: number = -10

  @input
  @hint("Seconds to wait at start before the first search, so head tracking has settled.")
  placementDelay: number = 0.6

  @input
  @hint("Turn the hold-to-re-place gesture on or off.")
  enableReplaceGesture: boolean = true

  @input
  @hint("Seconds the palm tap must be held before the stage re-places where you are looking. (Editor test: hold the R key.)")
  replaceHoldSeconds: number = 1.0
  @ui.group_end

  // ---------------------------------------------------------------- moving the stage by hand
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Moving the stage (pinch-drag handle)</span>')
  @ui.group_start("Moving the stage")
  @input
  @hint("Turn the pinch-drag handle on or off. The handle sits just in front of the stage's flat edge. Pinch it and drag to slide the stage across the table. The hold gesture above still works.")
  moveEnabled: boolean = true

  @input
  @hint("How far in front of the flat edge the handle sits, toward you (cm). Keep it clear of the pads.")
  moveHandleOffset: number = 4

  @input
  @hint("Touchable size of the handle (cm, a square box; also the size of its placeholder picture). Make it generous: it is pinched.")
  moveHandleSize: number = 5

  @input
  @hint("ON = you author the handle: the script no longer sets the handle's collider shape or scales its picture, so a curved handle keeps the shape, size and collider you give it in Lens Studio. It still places the handle (Move Handle Offset, cm) and turns it on or off. OFF = old behaviour (square box and picture sized by Move Handle Size).")
  moveHandleAuthored: boolean = false

  @input
  @hint("Turn the stage to face you while you drag, so the flat edge always stays on your side. OFF = keep the stage's current angle.")
  moveFaceUser: boolean = true

  @input
  @hint("Hand drag only: how far the stage moves for each cm your hand moves (1 = follows the hand exactly).")
  moveHandScale: number = 1.0

  @input
  @hint("Seconds the stage takes to catch up with the hand (0 = instant, bigger = softer).")
  moveSmoothSeconds: number = 0.08

  @input
  @hint("The stage cannot be dragged closer than this to your head (cm, measured flat along the table).")
  moveMinDistance: number = 20

  @input
  @hint("The stage cannot be dragged farther than this from your head (cm, measured flat along the table).")
  moveMaxDistance: number = 100
  @ui.group_end

  // ---------------------------------------------------------------- stage frame (outline only)
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Stage frame (outline only)</span>')
  @ui.group_start("Stage frame")
  @input
  @hint("Show the stage frame. It is only a picture: it never affects where toys can go (that is the stage width, depth and handles).")
  frameVisible: boolean = true

  @input
  @hint("Line style: a full thin line, short brackets only (a quiet viewfinder look, fewest pieces), or dashes.")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Thin line", 0),
      new ComboBoxItem("Corner brackets", 1),
      new ComboBoxItem("Dashed", 2)
    ])
  )
  frameStyle: number = 1

  @input
  @hint("Frame color (RGBA). The alpha here multiplies the Opacity below. Needs a material with a Base Color; turn off 'Tint Material' to keep your own material's look.")
  @widget(new ColorWidget())
  frameColor: vec4 = new vec4(0.92, 0.94, 1, 1)

  @input
  @hint("Frame opacity (0 = invisible, 1 = solid). Low by default so the frame stays in the background.")
  frameOpacity: number = 0.35

  @input
  @hint("Line thickness (cm). The same on every side and corner, whatever the stage size.")
  frameThickness: number = 0.15

  @input
  @hint("Draw the straight flat edge on your side of the stage (the conductor's side). OFF = only the curved back.")
  frameFlatEdge: boolean = true

  @input
  @hint("Brackets only: how many marks along the curved back, between the two corners, evenly spaced along its length (1 = just the far point, 3 = far point plus one halfway to each corner). Whole numbers, 0 or more.")
  frameArcMarks: number = 3

  @input
  @hint("Brackets only: length of each mark's arm on either side of its spot (cm). Shortened automatically if neighbouring marks would meet. The corners and the middle of the flat edge also get a mark.")
  frameBracketLength: number = 3

  @input
  @hint("Dashed only: length of one dash (cm).")
  frameDashLength: number = 1

  @input
  @hint("Dashed only: gap between dashes (cm).")
  frameDashGap: number = 0.8

  @input
  @hint("How many straight pieces make up each half of the curved back (so twice this in total) (more = smoother, more pieces). Whole numbers, 1 or more.")
  frameArcSteps: number = 8

  @input
  @hint("Height of the frame above the surface (cm). Keep it small (0.05 to 0.2): enough to stop flicker against the table, below the pads.")
  frameHeightOffset: number = 0.05

  @input
  @hint("The most pieces the frame may use. A warning is printed if the style and size need more.")
  frameMaxPieces: number = 120

  @input
  @hint("ON: the script sets the frame material's Base Color (color and opacity above) on a copy of your material. OFF: your material is used exactly as authored.")
  frameTintMaterial: boolean = true

  @input
  @hint("Let the frame's opacity follow the foundation track's loudness a little. Off by default.")
  frameFollowFoundation: boolean = false

  @input
  @hint("How much opacity is added when the foundation track is at its loudest (0 to 1, added to Opacity).")
  frameFoundationAmount: number = 0.15

  @input
  @hint("Seconds the frame takes to follow the foundation level (bigger = calmer).")
  frameFoundationSmoothing: number = 0.4
  @ui.group_end

  // ---------------------------------------------------------------- World Query
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">World Query (finding the table)</span>')
  @ui.group_start("World Query")
  @input
  @hint("Use World Query to find the real table. OFF = always use the floating fallback stage. (World Query only works on a device or a depth-capable preview; without a hit the fallback is used.)")
  useWorldQuery: boolean = true

  @input
  @hint("Smooth the hit over several results (a double exponential filter inside World Query). Needs a few results to settle.")
  queryFilter: boolean = true

  @input
  @hint("How many hit tests per second while searching (hits per second). Depth updates only about 5 times a second, so more than 5 does not help.")
  queryRefreshRate: number = 5

  @input
  @hint("How long a search runs before giving up and using the fallback (seconds).")
  searchSeconds: number = 3

  @input
  @hint("How many accepted hits in a row are needed before the stage is placed (more = steadier, slower).")
  hitsRequired: number = 3

  @input
  @hint("Length of the search ray from your head along your gaze (cm).")
  searchRayLength: number = 200

  @input
  @hint("Reject hits closer than this to your head (cm).")
  minHitDistance: number = 25

  @input
  @hint("Reject hits farther than this from your head (cm).")
  maxHitDistance: number = 120

  @input
  @hint("A hit only counts as a table if its surface normal points up at least this much (0 = any, 1 = perfectly flat). 0.85 is about 32 degrees of slope.")
  minSurfaceUp: number = 0.85

  @input
  @hint("Reject hits less than this far below your eyes (cm), so a raised hand or a screen is not taken for a table.")
  minDropBelowEye: number = 10

  @input
  @hint("Reject hits more than this far below your eyes (cm), so the floor is not taken for a table.")
  maxDropBelowEye: number = 110

  @input
  @hint("Ask World Query for the surface type too (Ground / None). Needs Experimental APIs on in Project Settings; the type is only logged and used to reject Ground.")
  useClassification: boolean = false

  @input
  @hint("Log every World Query result (hit or miss, position, normal, surface type, and why it was accepted or rejected).")
  logQueries: boolean = true

  @input
  @hint("When you re-place the stage (palm-tap hold, or R in the Editor), put the middle of your toys (the average of their sockets, or of the toys themselves when they do not return to sockets) where you are looking, instead of the stage's default middle. Keeps a layout you have moved toys or sockets around in under your gaze. OFF = the stage's default middle is used (Gaze Depth Ratio). The first placement always uses the default middle.")
  replaceCentreOnToys: boolean = true

  @input
  @hint("Stop the depth sensing (World Query session) whenever the stage is not being searched for, and start it again when a search begins. Saves battery and processing on the glasses. The first hits after a restart may take a moment (the search runs up to Search Seconds). OFF = depth keeps running the whole time (the old behaviour).")
  stopDepthWhenIdle: boolean = true
  @ui.group_end

  // ---------------------------------------------------------------- layout on the stage
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Stage and toy size</span>')
  @ui.group_start("Toy spacing and edge")
  @input
  @hint("BASE_BLOB_SCALE (cm): the size of the base blob mesh's longest side. Every toy's rest size is this x its Size Multiplier x its Shape Proportions (ToyConfig). It is also the reference size for spacing, edge padding and the toy slot count, so change it here and the toys, colliders and layout follow.")
  baseBlobScale: number = 4

  @input
  @hint("Smallest gap between toys, as a fraction of toy size (0.25 = 25% of the footprint, so 1 cm for a 4 cm toy).")
  spacingRatio: number = 0.25

  @input
  @hint("Smallest gap between a toy and the stage edge, as a fraction of toy size (0.25 = 25% of the footprint).")
  edgePaddingRatio: number = 0.25

  @input
  @hint("Gently push toys apart (or find the nearest free spot) when a landing would overlap. OFF = toys may overlap.")
  nudgeEnabled: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Toys pushing each other</span>')
  @ui.group_start("Toy collisions (push apart)")
  @input
  @hint("Toys can never overlap. A toy that touches another (carried, floating home, or resting) gently pushes it aside, and the pushed toy eases back when the way is clear. Works whether Enforce Bounds is on or off. OFF = toys may pass through each other.")
  pushApartEnabled: boolean = true

  @input
  @hint("Extra clear space (cm) kept between two toys' footprints. 0 = they just touch. The footprint is the toy's widest side (ToyConfig).")
  pushGap: number = 0.5

  @input
  @hint("Softness (seconds) of the push: how long a pushed toy takes to give way. 0 = instant and hard, 0.08 = gentle, 0.3 = very soft (toys may overlap briefly when pushed fast).")
  pushSoftness: number = 0.08

  @input
  @hint("Speed (cm per second) at which a pushed toy eases back to where it was once nothing presses on it.")
  pushReturnSpeed: number = 6
  @ui.group_end

  @input
  @hint("Free space the stage must have, counted in spare toy slots. A warning is printed if there is less.")
  requiredFreeSlots: number = 1
  @ui.group_end

  // ---------------------------------------------------------------- volume
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Volume states</span>')
  @ui.group_start("Volume states")
  @input
  @hint("Volume when a toy is OFF (0-1).")
  volumeOff: number = 0

  @input
  @hint("Volume in the LOW state (0-1).")
  volumeLow: number = 0.25

  @input
  @hint("Volume in the MEDIUM state (0-1).")
  volumeMedium: number = 0.55

  @input
  @hint("Volume in the HIGH state (0-1).")
  volumeHigh: number = 1.0

  @input
  @hint("Seconds to glide between volumes (avoids clicks).")
  volumeSmoothing: number = 0.15

  @input
  @hint("Foundation track volume (0-1). It plays quietly all the time.")
  foundationVolume: number = 0.2
  @ui.group_end

  // ---------------------------------------------------------------- pads, air-poke and grab
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Pads</span>')
  @ui.group_start("Pads (flat volume buttons)")
  // ---- the strip (in front of the toy, toward you) ----
  @input
  @hint("STRIP shape. Rounded = a rectangle with rounded corners (see Strip Roundness); Ellipse = an oval. For any other shape, put your own mesh in Strip Mesh below.")
  @widget(new ComboBoxWidget([new ComboBoxItem("Rounded", 0), new ComboBoxItem("Ellipse", 1)]))
  padStripShape: number = 0

  @input
  @hint("STRIP width (cm, left to right): the narrow side. It does NOT change with the toy's size or the volume.")
  padStripWidth: number = 2.2

  @input
  @hint("STRIP length (cm, toward you): how far a finger can slide. It does NOT change with the toy's size or the volume. Tap it to step the volume; slide along it to set the volume.")
  padStripLength: number = 7

  @input
  @hint("STRIP roundness, Rounded shape only: 0 = square corners, 1 = fully rounded ends (a pill). Between is a rounded rectangle.")
  padStripRoundness: number = 1

  @input
  @allowUndefined
  @hint("Optional: your own mesh for the strip. It is stretched to the strip's width (X) and length (Z), so use a flat shape 1 cm wide and 1 cm long (see Debug > Primitive Mesh Size). Empty = the script draws the shape above.")
  padStripMesh: RenderMesh

  // ---- the circle under the toy ----
  @input
  @hint("CIRCLE (under the toy) shape. Rounded = a rectangle with rounded corners (see Circle Roundness; at 1 with equal width and length it is a circle); Ellipse = an oval.")
  @widget(new ComboBoxWidget([new ComboBoxItem("Rounded", 0), new ComboBoxItem("Ellipse", 1)]))
  padBaseShape: number = 0

  @input
  @hint("CIRCLE width (cm, left to right). Keep it SMALLER than the toy's footprint (its collider) so it peeks out like a shadow: a warning is printed if it is not. It does NOT change with the toy's size or the volume. 0 = no circle.")
  padBaseWidth: number = 3.4

  @input
  @hint("CIRCLE length (cm, front to back). Same advice as the width. 0 = no circle.")
  padBaseLength: number = 3.4

  @input
  @hint("CIRCLE roundness, Rounded shape only: 0 = square corners, 1 = fully rounded (a circle when width and length are equal).")
  padBaseRoundness: number = 1

  @input
  @hint("Shifts the circle from the toy's centre (cm): x = right, y = toward you. A picture-only shift: for spacing and edge padding the circle still counts at the toy's centre.")
  padBaseOffset: vec2 = new vec2(0, 0)

  @input
  @allowUndefined
  @hint("Optional: your own mesh for the circle, 1 cm wide and 1 cm long, stretched to the circle's width and length. Empty = the script draws the shape above.")
  padBaseMesh: RenderMesh

  @input
  @hint("How dark the circle under the toy is compared with the pad's state colour (0 = black, 1 = the same colour). Lower = more like a shadow.")
  padBaseShade: number = 0.55

  @input
  @hint("ON: the circle under the toy can be touched too (as part of the pad). OFF (default): it is only a picture, so touching near the toy never changes the volume.")
  padBaseTouchable: boolean = false

  @input
  @hint("How many straight pieces make up each rounded corner of the strip and the circle (more = smoother, 1 or more). Whole numbers.")
  padCurveSteps: number = 6

  @input
  @hint("Extra touch margin around the strip (cm), so the touchable box is a little bigger than the picture. Neighbouring pads may overlap: the nearest pad wins.")
  padHitMargin: number = 0.75

  @input
  @hint("How far the circle under the toy sits BELOW the strip (cm), so they do not flicker where they meet. Keep it tiny (0.01 to 0.05).")
  padBaseDrop: number = 0.03

  @input
  @hint("Slide a finger along the strip to set the volume: the end nearest the toy is loudest, the end nearest you is off (like pushing a fader away from you). A plain tap still steps off, low, medium, high.")
  padSlideEnabled: boolean = true

  @input
  @hint("How far (cm) a finger must travel along the strip before the touch counts as a slide instead of a tap.")
  padSlideThreshold: number = 0.8

  @input
  @hint("Hand slides (not the mouse): how far the volume marker moves along the strip for each cm the hand moves along it (1 = the finger and the marker move together; higher = a short hand movement covers the whole strip, useful for a pinch aimed at the strip from a distance).")
  padSlideHandScale: number = 1

  @input
  @hint("ON: when the finger lifts after a slide, the volume settles on the nearest of the four states (off, low, medium, high). OFF: it stays exactly where the finger left it.")
  padSlideSnap: boolean = false

  @input
  @hint("Height of the pad's touch discs (cm). Their top sits half this above Pad Lift, so a fingertip meets the pad before the real table.")
  padColliderHeight: number = 1.5

  @input
  @hint("Height of the pad artwork above the stage floor (cm). Keep small (0.1 to 0.3) so it lies on the table without flicker.")
  padLift: number = 0.15

  @input
  @hint("How deep the pad artwork sinks when pressed (cm). Keep it tiny.")
  padPressDepth: number = 0.2

  @input
  @hint("Seconds the press-down and release take (the whole dip is about this long).")
  padPressSeconds: number = 0.14

  @input
  @hint("How quickly a pad follows its toy (higher = snappier, 0 = instant).")
  padFollowSpeed: number = 14

  @input
  @hint("Pads respond to a fingertip poke (hand tracking).")
  padAcceptsPoke: boolean = true

  @input
  @hint("Pads respond to a click: mouse click in the Editor, phone tap, or a pinch aimed at the pad.")
  padAcceptsClick: boolean = true

  @input
  @hint("After ANY volume change on a toy (pad poke, pad click or air-poke), further changes on that toy are ignored for this many seconds. One finger action can then never change a volume twice. Seconds.")
  volumeCooldown: number = 0.3

  @input
  @hint("A second guard: after a change, further changes on that toy from the SAME HAND are ignored for this many seconds. A finger that taps a pad often brushes the toy on its way in or out; this stops that second touch from changing the volume again. A different hand is not blocked. Seconds.")
  sameHandCooldown: number = 1.0

  @input
  @hint("Name of the number property the pad writes to its material: 0 = off, 1 = low, 2 = medium, 3 = high. Use it in your shader (a graph parameter with this exact name).")
  padStateParam: string = "padState"
  @input
  @hint("Distance from a toy's centre to the CENTRE of its pad's strip (cm), straight toward the front of the stage (toward you). This is the default for every pad; one pad can use its own offset (ToyPad > Offset). The strip's near-the-toy end sits at this minus half the strip length: keep that about equal to half the circle under the toy, so the strip grows out of the circle like a lollipop stick (5 cm for a 7 cm strip and a 3.4 cm circle: the strip starts 1.5 cm from the toy's centre, just inside the circle's edge).")
  padFrontOffset: number = 5

  @ui.label("Pad and toy colours are set per pad (ToyPad > Pad colours) and per toy (ToyConfig > Toy colours), not here.")
  @ui.group_end

  // ---------------------------------------------------------------- dial button
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Dial button</span>')
  @ui.group_start("Dial button (replaces the strip)")
  @ui.label("The dial button is a small flat disc (a coin with no thickness) on the socket ring's outer rim, on the side facing you, resting against the ring's edge (never inside it). It is the volume button AND the state display: tap = next state; drag = move the socket. Three concentric parts light up: centre = low, centre + middle ring = medium, all three = high, none = off. It is drawn by YOUR Arc_Mat on a flat quad (ToyPad > Arc Visual); nothing is generated. A pad uses it only when BOTH its Arc Visual and Arc Hit slots are filled; otherwise it keeps the old strip.")
  @input
  @hint("Master switch. ON: pads that have an Arc Visual and an Arc Hit use the dial button and the old strip is hidden. OFF: every pad uses the old strip.")
  arcEnabled: boolean = true

  @input
  @hint("Diameter (cm) of the button disc. The ring is about 3.6 cm across by default (Home Quad Size x Home Ring Radius), so 2 cm is a big button.")
  buttonDiameter: number = 2

  @input
  @hint("Empty space (cm) between the ring's outer edge and the button's edge. 0 = the button rests exactly on the ring's edge (the two circles just touch) and never goes inside it. Never below 0. The button's centre sits at (ring radius + button radius + this) from the ring centre. (Replaces the old Button Overlap.)")
  buttonGap: number = 0

  @input
  @hint("Radius (cm) of the ring's outer rim that the button attaches to. 0 = work it out from Home Quad Size x Home Ring Radius / 2 (1.8 cm by default). Set a number if your Home_Mat draws the ring bigger or smaller. The shader may move the ring with squash and height; this number is the resting ring.")
  buttonRimRadius: number = 0

  @input
  @hint("Extra empty space (cm) around the disc inside its quad, for glow and soft edges. The quad is the button diameter + 2 x this. Picture only: it never changes stage spacing.")
  buttonGlowMargin: number = 0.5

  @input
  @hint("Where the central circle ends, as a fraction of the DISC radius (0 to 1, unitless). 0.34 = the centre is a third of the radius. Sent to the material as 'coreEnd'.")
  buttonCoreEnd: number = 0.34

  @input
  @hint("Where the middle ring ends, as a fraction of the DISC radius (0 to 1, unitless). The outer ring runs from here to the edge (1). Sent to the material as 'midEnd'. Keep it bigger than Core End.")
  buttonMidEnd: number = 0.67

  @input
  @hint("ON: the button colours come from the toy's own material: edgeColorOff / Low / Med / High for the parts, and bodyColorOff for the outline. Unlit parts = Off edge colour, centre = Low, middle ring = Med, outer ring = High. OFF, or if the material cannot be read: the pad's own state colours (ToyPad > Pad colours).")
  buttonUseToyEdgeColour: boolean = true

  @input
  @widget(new SliderWidget(0, 100, 1))
  @hint("Brightness of the button's OFF (unlit) parts as a percentage of the toy's own edgeColorOff (0 to 100, unitless %). 100 = exactly the toy's colour (as before), 50 = half as bright, 0 = black (nothing visible on an additive material). Only used when Use Toy Edge Colour is ON. Low / Med / High are not affected.")
  buttonOffBrightness: number = 100

  @input
  @widget(new SliderWidget(0, 200, 1))
  @hint("Brightness of the button's LOW part (the centre circle) as a percentage of the toy's own edgeColorLow (0 to 200, unitless %). 100 = exactly the toy's colour, 200 = twice as bright, 0 = black (nothing visible on an additive material). Only used when Use Toy Edge Colour is ON.")
  buttonLowBrightness: number = 100

  @input
  @widget(new SliderWidget(0, 200, 1))
  @hint("Brightness of the button's MEDIUM part (the middle ring) as a percentage of the toy's own edgeColorMed (0 to 200, unitless %). 100 = exactly the toy's colour, 200 = twice as bright, 0 = black. Only used when Use Toy Edge Colour is ON.")
  buttonMedBrightness: number = 100

  @input
  @widget(new SliderWidget(0, 200, 1))
  @hint("Brightness of the button's HIGH part (the outer ring) as a percentage of the toy's own edgeColorHigh (0 to 200, unitless %). 100 = exactly the toy's colour, 200 = twice as bright, 0 = black. Only used when Use Toy Edge Colour is ON.")
  buttonHighBrightness: number = 100

  @input
  @hint("Start of the toy material's edge colour parameter names:this text plus Off, Low, Med or High (default edgeColorOff, edgeColorLow, edgeColorMed, edgeColorHigh).")
  buttonToyEdgeColourPrefix: string = "edgeColor"

  @input
  @hint("Start of the toy material's body colour parameter name: this text plus Off (default bodyColorOff). The button outline uses this colour.")
  buttonToyBodyColourPrefix: string = "bodyColor"

  @input
  @hint("Width (cm) of the outline around the button, drawn OUTSIDE the disc edge (so the lit disc keeps its size). 0.2 = 2 mm. The button quad grows automatically to fit it.")
  buttonOutlineWidth: number = 0.2

  @input
  @hint("Feather (cm) on the OUTER edge of the outline only, just enough to take the sharpness off. 0.03 = about 0.3 mm, roughly one to two pixels at arm's length (estimate, check on device). 0 = hard edge.")
  buttonOutlineSoftness: number = 0.03

  @input
  @hint("Height (cm) of the button quad above the ring quad, so they do not flicker where they overlap. Keep it tiny (0.02 to 0.05).")
  arcLift: number = 0.03

  @input
  @hint("How far an UNLIT part moves from the Off colour toward its own lit colour (0 to 1, unitless). 0 = unlit parts are exactly the toy's Off edge colour; 0.12 = a faint hint of the lit colour.")
  arcUnlit: number = 0

  @input
  @hint("Seconds (s) the parts and colour take to follow a state change. 0 = instant.")
  arcBlendSeconds: number = 0.15

  @input
  @hint("Fastest the button may swing around the ring to follow you (degrees per second). 0 = it snaps to face you every frame. Lower = a lazier, smoother swing.")
  arcTurnSpeed: number = 360

  @input
  @hint("Extra rotation (degrees) added to the button quad ONLY if your Arc_Mat draws something that must point a certain way. A plain round disc does not need it. Touch always uses the true direction toward you.")
  arcYawOffset: number = 0

  @input
  @hint("Extra touch reach (cm) around the button's edge, so the touchable area is bigger than the picture. A fingertip is wider than a 2 cm button, so keep a margin.")
  arcHitMargin: number = 0.8

  @input
  @hint("ON: dragging the button moves the socket (the ring, the button and the toy follow). Needs Sockets > Toys Return To Sockets ON. OFF: the button only taps.")
  arcDragEnabled: boolean = true

  @input
  @hint("ON: the user can turn the dial button around its ring by holding it still for Arc Orbit Hold Seconds, then dragging around the ring. The new place stays until Reset Sockets or Call Home. OFF: the button only faces you (plus each pad's Button Angle).")
  arcOrbitEnabled: boolean = true

  @input
  @hint("Seconds (s) the user must hold the button still before dragging turns it around the ring instead of moving the socket. A quick tap still steps the volume; a drag that starts before this time still moves the socket.")
  arcOrbitHoldSeconds: number = 0.5

  @input
  @hint("How far (cm) a finger must travel across the table before a touch counts as a socket drag (or a button turn) instead of a tap.")
  arcDragThreshold: number = 0.8

  @input
  @hint("Hand drags that touch or pinch directly (not a mouse, not a pointing ray): how far the socket moves for each cm the hand moves (1 = they move together). A mouse or a pointing ray is read where it meets the table, so this is not used for them.")
  arcDragHandScale: number = 1

  @input
  @hint("How deep (cm) the button sinks into the table while pressed. Keep it small (0.1 = 1 mm) so it matches the feel of a real surface.")
  buttonPressDepth: number = 0.1

  @input
  @hint("How much the button shrinks while fully pressed (fraction, unitless: 0.03 = 3% smaller). A flat quad that only moves down barely shows from above, so this helps. 0 = no shrink.")
  buttonPressShrink: number = 0.03

  @input
  @hint("ON: the ring sinks and shrinks with the button when it is pressed (the old behaviour). OFF: only the button moves; the ring stays put.")
  buttonRingFollowsPress: boolean = false

  @input
  @hint("Spring speed of the press and the bounce back (cycles per second, Hz). Higher = snappier.")
  arcSpringHz: number = 5

  @input
  @hint("Damping while PRESSING DOWN (0 to 1, unitless). 1 = sinks with no overshoot; lower overshoots a little.")
  arcPressDamping: number = 0.8

  @input
  @hint("Damping while BOUNCING BACK (0 to 1, unitless). 1 = returns with no bounce; 0.3 = a clear bounce past the top; 0 = it never stops.")
  arcBounceDamping: number = 0.3

  @ui.label("Parameter names: Script Names of the Arc_Mat graph parameters. Change them to match your own material.")
  @input
  @hint("Start of the four colour parameter names (colour/vec4): this text plus Off, Low, Med and High (default arcColorOff, arcColorLow, arcColorMed, arcColorHigh). They receive the toy's edge colours.")
  arcColorParam: string = "arcColor"

  @input
  @hint("Colour parameter (colour/vec4) that receives the outline colour (the toy's Off body colour).")
  buttonOutlineColorParam: string = "outlineColor"

  @input
  @hint("Float parameter: how far the outline reaches outside the disc edge, as a fraction of the quad's half-width (unitless).")
  buttonOutlineWidthParam: string = "outlineWidth"

  @input
  @hint("Float parameter: feather on the outline's outer edge, as a fraction of the quad's half-width (unitless).")
  buttonOutlineSoftParam: string = "outlineSoftness"

  @input
  @hint("Float parameter: the disc's outer edge as a fraction of the quad's half-width (0 to 1, unitless).")
  buttonDiscRadiusParam: string = "discRadius"

  @input
  @hint("Float parameter: where the central circle ends, as a fraction of the disc radius (0 to 1, unitless).")
  buttonCoreEndParam: string = "coreEnd"

  @input
  @hint("Float parameter: where the middle ring ends, as a fraction of the disc radius (0 to 1, unitless).")
  buttonMidEndParam: string = "midEnd"

  @input
  @hint("Start of the three part parameter names: this text plus 1, 2 and 3 (default seg1, seg2, seg3). Each is a float 0 to 1, unitless: how lit that part is. 1 = centre circle, 2 = middle ring, 3 = outer ring.")
  arcSegmentParamPrefix: string = "seg"

  @input
  @hint("Float parameter: press amount (unitless): 0 at rest, 1 fully pressed, slightly negative while it springs back.")
  arcPressParam: string = "press"
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Air-poke and grab</span>')
  @ui.group_start("Air-poke and grab")
  @input
  @hint("Poking a toy in mid-air cycles its volume (the same change as a pad). Stays ON for now; turn OFF to use pads only.")
  airPokeCyclesVolume: boolean = true

  @input
  @hint("Air-poke only: minimum seconds between two pokes on the same toy (stops double-triggers).")
  pokeDebounce: number = 0.25

  @input
  @hint("Air-poke only: how deep a fingertip must push into a toy to count as a poke (0 = any touch, 1 = a full 2.5 cm push).")
  pokeMinDepth: number = 0.3

  @input
  @hint("After a toy is let go, touches are ignored for this many seconds (a finger still resting on the toy must not count as a poke). Seconds.")
  pokeLockoutAfterRelease: number = 0.6

  @input
  @hint("Editor preview with the mouse: a click shorter than this many seconds is a poke; holding the button longer (or dragging) is a pinch/grab. Seconds.")
  mouseHoldSeconds: number = 0.25

  @input
  @hint("How quickly a held toy follows the hand (higher = snappier, 0 = instant).")
  grabFollowSpeed: number = 18

  @input
  @hint("Toy movement per unit of hand movement (1 = 1:1).")
  grabMoveScale: number = 1
  @ui.group_end

  // ---------------------------------------------------------------- release
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Release, drift and settle</span>')
  @ui.group_start("Release, drift and settle")
  @input
  @hint("Longest a drift may take (seconds). The drift speeds up if needed so tall releases do not take forever; a bigger value lets a toy that was let go high up fall at its own slow Drift Speed. If a drift has not arrived after 3 x this value it settles anyway.")
  maxDriftSeconds: number = 10

  @input
  @hint("Sideways speed while drifting toward the landing spot, if it had to be corrected (cm per second).")
  driftLateralSpeed: number = 8

  @input
  @hint("Height above the stage floor where the drift ends and the settle begins (cm).")
  hoverHeight: number = 1.5

  @input
  @hint("Feather/balloon float: how far (cm) a falling toy sways side to side. Fades to 0 as it lands. 0 = straight down.")
  floatSway: number = 1.4

  @input
  @hint("How fast the float sways (1 = normal, lower = lazier).")
  floatSwaySpeed: number = 1

  @input
  @hint("How much (degrees) a falling toy tilts as it sways. Levels out as it lands. 0 = no tilt.")
  floatTilt: number = 12

  @input
  @hint("Shape of the settle motion. Ease Out Back overshoots a little (bouncy).")
  @widget(
    new ComboBoxWidget([
      new ComboBoxItem("Linear", 0),
      new ComboBoxItem("Ease Out Quad", 1),
      new ComboBoxItem("Ease In Out Quad", 2),
      new ComboBoxItem("Ease Out Cubic", 3),
      new ComboBoxItem("Ease Out Back", 4)
    ])
  )
  settleEasing: number = 1

  @input
  @hint("A toy released farther than this from the stage (cm) is rescued: it flies back quickly.")
  maxRescueDistance: number = 150

  @input
  @hint("Speed of a rescue flight (cm per second).")
  rescueSpeed: number = 120
  @ui.group_end

  // ---------------------------------------------------------------- audio sync
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Music and sync</span>')
  @ui.group_start("Music and sync")
  @input
  @hint("Loop the piece. The end is detected every frame and ALL stems are restarted together in one call (this replaces the AudioComponent's Autoplay Loop, which stays off).")
  loopPiece: boolean = true

  @input
  @hint("Seconds between sync checks (0 = never check). The foundation track is the clock: each toy stem is compared with it, and any stem that is out is restarted on its own.")
  driftCheckInterval: number = 1

  @input
  @hint("Largest allowed offset (seconds) of a toy stem from the foundation track before that stem is restarted. 0.02 = 20 ms. Sharp sounds such as Chimes show an offset sooner than soft ones.")
  driftTolerance: number = 0.02

  @input
  @hint("Seconds a stem takes to fade out before it is restarted, and back in afterwards (max, seconds). A stem that is already off is restarted at once.")
  syncFadeSeconds: number = 0.3

  @input
  @hint("If this fraction (0 to 1) of the toy stems are off in the SAME direction, the foundation is judged to be the one that slipped and ALL stems are restarted together instead (fraction of stems, 0 to 1).")
  syncOddOneOutFraction: number = 0.5

  @input
  @hint("How many single-stem restarts in a row may fail to bring a stem back in tolerance before everything is restarted together (count).")
  syncMaxFixTries: number = 3

  @input
  @hint("Print every sync check to the log: each stem's offset from the foundation (milliseconds) and its volume. Turn on while testing, off afterwards.")
  syncLog: boolean = false

  @input
  @hint("TEST: tick to knock the Chimes stem out of sync by the amount below, once, while playing, to watch the sync check fix it. Un-ticks itself at runtime; the Inspector keeps showing the tick.")
  syncTestKnock: boolean = false

  @input
  @hint("TEST: how far (milliseconds) the knock moves the stem. Positive = ahead of the foundation.")
  syncTestKnockMs: number = 80

  @input
  @hint("TEST: tick to jump all stems to 5 seconds before the end, once, to hear and log the loop without waiting 4 minutes. Un-ticks itself at runtime; the Inspector keeps showing the tick.")
  loopTestJump: boolean = false
  @ui.group_end

  // ---------------------------------------------------------------- audio reactive
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Audio-reactive motion</span>')
  @ui.group_start("Audio-reactive motion")
  @input
  @hint("Master switch for audio-reactive motion.")
  audioReactiveEnabled: boolean = true

  @input
  @hint("Seconds of smoothing on the level (higher = calmer).")
  reactSmoothing: number = 0.08

  @input
  @hint("Auto-level: each toy measures the loudest level its own stem reaches and scales its motion to that, so quiet stems still move.")
  autoLevel: boolean = true

  @input
  @hint("Auto-level only: seconds over which a toy slowly 'forgets' an old loud peak (higher = steadier scaling).")
  levelDecaySeconds: number = 8

  @input
  @hint("Auto-level only: stems quieter than this (RMS, 0-1) are treated as silent, so noise does not wobble the toy.")
  levelFloor: number = 0.005

  @input
  @hint("Auto-level OFF only: track loudness (RMS, 0-1) that counts as full motion. Lower = more sensitive.")
  levelReference: number = 0.1

  @input
  @hint("Samples read per frame for the level (more = steadier, costs more).")
  analysisSamples: number = 512

  @input
  @hint("Pulse the toy's scale with the music.")
  reactScale: boolean = true

  @input
  @hint("Bounce the toy up and down with the music.")
  reactPosition: boolean = true

  @input
  @hint("Wobble the toy's rotation with the music.")
  reactRotation: boolean = true

  @input
  @hint("Hand the music squash, sway and ripples to the vertex-deform shader (PLAN.md section 25) instead of squashing and rocking the whole Visual. Turn ON only after every toy material has the deform shader, otherwise the toys lose their music squash and rock. Bounce stays on the Visual.")
  shaderDeform: boolean = false

  @input
  @hint("Toys that are OFF still move (scaled by Idle Motion Amount). Default: OFF toys stay still.")
  reactWhenOff: boolean = false

  @input
  @hint("Strength of motion for an OFF toy when 'React When Off' is on (0-1).")
  idleMotionAmount: number = 0.15
  @ui.group_end

  // ---------------------------------------------------------------- squish
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Squishy poke and soft landing</span>')
  @ui.group_start("Squish and soft landing")
  @input
  @hint("Master switch for the squish: toys squash when poked and when they land, and stretch a little while held. It is a springy overshoot: the toy squashes, springs past its normal shape, and wobbles back.")
  squishEnabled: boolean = true

  @input
  @hint("Seconds the poke squash is held before the toy springs back. Shorter = a quick jab, longer = a slow press.")
  pokePressSeconds: number = 0.07

  @input
  @hint("Seconds the landing squash is held before the toy springs back.")
  landPressSeconds: number = 0.06

  @ui.group_end

  // ---------------------------------------------------------------- comfort limiter
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Comfort limiter</span>')
  @ui.group_start("Comfort limiter (all toys)")
  @input
  @hint("Master switch. ON: no toy's Feel can go past the limits below, whatever is typed on that toy. Keeps the motion gentle on the eyes and in the hands. Damping always stays below 1 (the organic overshoot) even when this is OFF.")
  comfortLimiterEnabled: boolean = true

  @input
  @hint("Deepest squash allowed, as a fraction (0.3 = 30% flatter). Applies to poke, landing and the live squish.")
  limitSquash: number = 0.3

  @input
  @hint("Tallest stretch allowed while held, as a fraction (0.2 = 20% taller).")
  limitStretch: number = 0.2

  @input
  @hint("Biggest sideways bulge allowed, unitless (1 = the bulge is as big as the squash).")
  limitBulge: number = 0.8

  @input
  @hint("Furthest a toy may spring past its resting shape, as a fraction (0.25 = 25% past, then it settles). This sets the LOWEST damping any toy can have.")
  limitOvershoot: number = 0.25

  @input
  @hint("Highest damping allowed (unitless, always below 1 so every toy keeps a little bounce).")
  limitDamping: number = 0.9

  @input
  @hint("Fastest spring allowed (wobbles per second, Hz).")
  limitSquishHz: number = 6

  @input
  @hint("Fastest music wobble allowed (Hz). 1.5 Hz is a gentle sway; higher starts to look jittery.")
  limitWobbleHz: number = 1.5

  @input
  @hint("Largest music wobble angle allowed (degrees).")
  limitWobbleDegrees: number = 9

  @input
  @hint("Largest music pulse allowed, as a fraction (0.25 = 25% bigger at full level).")
  limitScalePulse: number = 0.25

  @input
  @hint("Highest music bounce allowed (cm).")
  limitBounceCm: number = 0.9
  @ui.group_end

  // ---------------------------------------------------------------- resets
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Resets (all toys)</span>')
  @ui.group_start("Resets (all toys)")
  @input
  @hint("Tick to put EVERY toy back at its start position (ToyConfig > Home Position). It un-ticks itself in the Lens. Changes nothing else. One toy only: tick the same box on that toy's ToyConfig.")
  resetToyPositions: boolean = false

  @input
  @hint("Tick to put EVERY pad back at the default offset from its toy (Pad Front Offset above). It un-ticks itself in the Lens. Changes nothing else. One pad only: tick the same box on that ToyPad.")
  resetPadPositions: boolean = false

  @input
  @hint("Tick to put EVERY pad's four colours back to the default set made from its Base Color. It un-ticks itself in the Lens. Changes nothing else. One pad only: tick the same box on that ToyPad.")
  resetPadColours: boolean = false

  @input
  @hint("Tick to put EVERY socket (ring, arc and toy) back at its Home Position (ToyConfig > Home Position), undoing any dragging. It un-ticks itself in the Lens. Changes nothing else. One socket only: tick the same box on that ToyPad.")
  resetSockets: boolean = false

  @input
  @hint("Tick to CALL HOME: every toy, even one in your hand, floats back to its own socket. A toy already on its socket does not move. It un-ticks itself in the Lens. The same call runs from a scene button (CallHomeButton) and, in the Editor Preview, the H key. Sockets you dragged stay where they are (use Reset Sockets for that).")
  callHomeNow: boolean = false

  @input
  @hint("Editor Preview only: pressing H calls every toy home (click the Preview first so it has keyboard focus).")
  callHomeKey: boolean = true
  @ui.group_end

  // ---------------------------------------------------------------- blob shape
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Blob shape</span>')
  @ui.group_start("Blob shape (ToyShape)")
  @input
  @hint("Master switch for the shape toolkit. ON: each toy's ToyShape gives it its own shaped copy of the base blob mesh at startup. OFF: every toy uses the shared mesh as it is.")
  blobShapingEnabled: boolean = true

  @input
  @hint("ON: while the Preview runs, changing a ToyShape value re-shapes the blob about 0.3 seconds after you stop changing it, and ToyShape > Feel edits and Comfort limiter edits apply at once. Turn OFF for the final build (shape and Feel are then worked out once at startup and never checked again).")
  blobLiveEdit: boolean = true
  @ui.group_end

  // ---------------------------------------------------------------- home markers
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Home markers</span>')
  @ui.group_start("Home")
  @input
  @hint("ON: the circle under each toy (BaseVisual) becomes a glow-ring home marker driven by the Home material (Home_Mat). OFF: the circle keeps its old pad colour look. The marker's size here never changes stage spacing.")
  homeEnabled: boolean = false

  @input
  @hint("Where each ring's colour comes from, read from the TOY's own material. Edge Low is the first choice. 'Pad colour' = the old per-pad state colour (ToyPad > Pad colours).")
  @widget(new ComboBoxWidget([
    new ComboBoxItem("Edge Low", 0), new ComboBoxItem("Edge Med", 1), new ComboBoxItem("Edge High", 2),
    new ComboBoxItem("Body Low", 3), new ComboBoxItem("Body Med", 4), new ComboBoxItem("Body High", 5),
    new ComboBoxItem("Pad colour", 6)
  ]))
  homeColourSource: number = 0

  @input
  @hint("Drawn size of the home quad (cm, square). Picture only: it is NOT used for stage spacing, edge padding or nudging (those still use Pad Base Width/Length). A pad can use its own size (ToyPad > Home Size Override). Needs Pad Base Mesh set to a flat 1 x 1 cm quad.")
  homeQuadSize: number = 6

  @input
  @hint("Rest Brightness (0 to 1, unitless): the ring's brightness when the toy's volume is OFF. The ring is never hidden and is not audio reactive while off. Low, Medium and High below are the other three states.")
  homeRestBrightness: number = 0.25

  @input
  @hint("Brightness (0 to 1, unitless) in the LOW volume state.")
  homeBrightnessLow: number = 0.35

  @input
  @hint("Brightness (0 to 1, unitless) in the MEDIUM volume state.")
  homeBrightnessMed: number = 0.6

  @input
  @hint("Brightness (0 to 1, unitless) in the HIGH volume state.")
  homeBrightnessHigh: number = 0.9

  @input
  @hint("On Opacity (0 to 1, unitless): multiplies the ring brightness while the toy is ON (low, medium, high), like the dial button's 75% opacity. 1 = no change, 0.75 = a quarter dimmer. Off keeps the Rest Brightness exactly; the multiplier fades in as the toy leaves Off.")
  homeOnOpacity: number = 0.75

  @input
  @hint("Seconds (s) the brightness takes to move between the rest and the active brightness, and to fade the away dim in and out. 0 = instant.")
  homeBrightnessSeconds: number = 0.4

  @input
  @hint("Ring radius at rest (0 to 1, unitless; 1 = the quad's edge).")
  homeRingRadius: number = 0.6

  @input
  @hint("Ring softness (0 to 1, unitless): how wide and soft the glow around the ring is. Sent to the material as is.")
  homeRingSoftness: number = 0.3

  @input
  @hint("How much the ring TIGHTENS (radius, 0 to 1 unitless) when the blob is squashed (squash 1 = fully flattened). Squash widens it the other way when negative (stretched).")
  homeTightenBySquash: number = 0.25

  @input
  @hint("How much the ring WIDENS (radius change per cm, unitless) as the blob rises above the floor. Rising also fades the brightness by the same factor.")
  homeWidenPerCm: number = 0.05

  @input
  @hint("Extra brightness (0 to 1, unitless) added while the blob is squashed (squash 1). The ring also fades as the blob rises: brightness is divided by (1 + Widen Per Cm x height in cm).")
  homeBrightenBySquash: number = 0.3

  @input
  @hint("How strongly a beat pulses the ring (0 to 1, unitless): beatPulse jumps to this x the hit strength.")
  homeBeatStrength: number = 1

  @input
  @hint("Seconds (s) for beatPulse to ease back to 0 after a beat.")
  homeBeatFallSeconds: number = 0.35

  @input
  @hint("Editor only: keys 1 to 7 fire a fake beat for toy 1 to 7 (matched by the number in the toy's name, Toy_01 ...). Click the Preview first so it has keyboard focus.")
  homeMockBeats: boolean = true

  @input
  @hint("Material parameter names (Script Names) written to the Home material: colour, brightness, ring radius, ring softness, beat pulse, pad state. Change only if your Home_Mat uses other names.")
  homeColorParam: string = "homeColor"
  @input
  homeBrightnessParam: string = "brightness"
  @input
  homeRingRadiusParam: string = "ringRadius"
  @input
  homeRingSoftnessParam: string = "ringSoftness"
  @input
  homeBeatParam: string = "beatPulse"
  @input
  homePadStateParam: string = "padState"
  @ui.group_end

  // ---------------------------------------------------------------- sockets
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Sockets</span>')
  @ui.group_start("Sockets")
  @input
  @hint("ON: each toy has a SOCKET (its Home Position, stage-local). The ring, the tab and the ripples stay fixed to it, and a toy that is let go floats back to its own socket (same drift and settle as before) instead of landing where it was let go. OFF: the old behaviour (the toy lands where let go and its pad follows it).")
  toysReturnToSockets: boolean = true

  @input
  @hint("Extra clear space (cm) kept between two sockets when you drag a socket. A socket never sits on another toy's socket; 0 = the rings may just touch.")
  socketGap: number = 0.5

  @input
  @hint("How much dimmer the ring is while its toy is away from the socket (0 to 1, unitless; 1 = no dimming, 0.7 = 70% of its brightness).")
  awayDim: number = 0.7

  @input
  @hint("Seconds (s) for one slow pulse of the ring while its toy is away.")
  awayPulseSeconds: number = 2.5

  @input
  @hint("How deep the away pulse is (0 to 1, unitless; 0 = no pulse, 0.2 = the ring dips by up to 20% of its brightness).")
  awayPulseAmount: number = 0.2

  @input
  @hint("How bright the ring flashes when the toy lands on its socket (0 to 1, unitless). Sent through the Home beat parameter. 0 = no flash.")
  landingFlashStrength: number = 1

  @input
  @hint("Seconds (s) for the landing flash to ease back to nothing.")
  landingFlashSeconds: number = 0.35
  @ui.group_end

  // ---------------------------------------------------------------- ripples (sound waves)
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Ripples (waves)</span>')
  @ui.group_start("Ripples")
  @input
  @hint("ON: waves spread from each socket (the Ripple object under each pad, drawn with Ripple_Mat). A wave plays on every hit of the toy's stem while the toy is NOT off, and a softer one when the toy lands. OFF: no waves.")
  rippleEnabled: boolean = true

  @input
  @hint("ON: every hit the audio analysis finds in the toy's stem starts a wave (not while the toy is off). OFF: waves only on landing.")
  rippleOnHits: boolean = true

  @input
  @hint("Strength of the wave made by a landing (0 to 1, unitless; 1 = same as a hit). Soft landing in a puddle: keep it below 1.")
  rippleLandingStrength: number = 0.5

  @input
  @hint("Drawn size of the ripple quad (cm, square): how far a wave can travel (half of this from the centre). Picture only; never used for spacing. Bigger than Home Quad Size, and it can overlap the neighbours.")
  rippleSize: number = 20

  @input
  @hint("Seconds (s) one wave takes to travel from the ring to the edge of the quad.")
  rippleSeconds: number = 2.5

  @input
  @hint("Thickness of a wave when it leaves the ring (cm).")
  rippleStartWidth: number = 1.6

  @input
  @hint("Thickness of a wave at the end of its travel (cm). Wider than the start width = it spreads and softens like a pond ring; smaller = it thins out.")
  rippleEndWidth: number = 2.4

  @input
  @hint("Brightness of a wave when it leaves the ring, as a multiple of the ring's own brightness at that moment (unitless; 1 = as bright as the ring).")
  rippleStartBrightness: number = 0.7

  @input
  @hint("Brightness of a wave at the end of its travel, as a fraction of its start brightness (0 to 1, unitless).")
  rippleEndBrightness: number = 0.4

  @input
  @hint("How far the colour moves toward white as the wave travels (0 to 1, unitless; 0 = same colour as the ring, 1 = white at the end).")
  rippleLighten: number = 0.5

  @input
  @hint("Fade-out distance (cm): the wave fades to nothing over its last this-many cm before the edge of the quad. 0 = it only disappears at the edge.")
  rippleFadeDistance: number = 6

  @input
  @hint("Softness of the wave's edges (0 to 1, unitless). Sent to the material as is.")
  rippleSoftness: number = 0.7

  @input
  @hint("Most waves alive at once on one socket (1 to 3). Needs that many wave copies in Ripple_Mat (see PLAN.md section 35b).")
  rippleMaxWaves: number = 3

  @input
  @hint("Least time between two separate rings on one socket (seconds, s). A hit closer than this to the newest ring does not start a new ring; it merges into it (see Merge Gain). Also applies when all Max Waves are busy. Wider spacing between rings = larger value. 0 = every hit starts a ring.")
  rippleMinGap: number = 0.8

  @input
  @hint("How much a merged hit adds to the ring it merges into (0 to 1, unitless; 0 = merged hits are ignored, 1 = full strength added, capped at 1 total). A busy passage makes one stronger ring instead of many.")
  rippleMergeGain: number = 0.5

  @input
  @hint("A ring fades out slowly over this many seconds (s) at the end of its life. The fade starts at whichever is earlier: this, or Fade Distance before the quad edge. 0 = use Fade Distance only.")
  rippleFadeSeconds: number = 1.5

  @input
  @hint("Height of the ripple quad above the ring (cm), so the wave draws over the ring without flicker. Keep it tiny.")
  rippleLift: number = 0.02

  @input
  @hint("Material parameter names (Script Names) written to Ripple_Mat. Wave 2 and 3 add the suffix 1 and 2. Change only if your Ripple_Mat uses other names.")
  rippleProgressParam: string = "rippleProgress"
  @input
  rippleStrengthParam: string = "rippleStrength"
  @input
  rippleColourParam: string = "rippleColor"
  @ui.group_end

  // ---------------------------------------------------------------- shared wave field (waves that interfere)
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Wave field (shared)</span>')
  @ui.group_start("Wave field")
  @input
  @hint("ON: all sockets send their waves to ONE big quad (the WaveField object, drawn with your Wave_Mat) so waves from different toys add up and cancel like ripples on water. The per-socket Ripple quads then stay off. OFF: each socket draws its own ripple (Ripples group above). Also needs Ripple Enabled and Home Enabled. Turn ON only after Wave_Mat exists and is on the Field Visual.")
  sharedWaveField: boolean = false

  @input
  @hint("Side of the big quad (cm, square). Waves fade out before its edge, so it must reach well past the stage. Picture only; never used for spacing. Bigger = more pixels to draw (cost on a device is unmeasured).")
  waveFieldSize: number = 60

  @input
  @hint("Centre of the big quad on the stage (cm, stage-local: x = right, y = toward you, so a NEGATIVE y is toward the back of the stage). The stage reaches about 29 cm back from the flat edge, so the middle is around y = -14.")
  waveFieldCenter: vec2 = new vec2(0, -14)

  @input
  @hint("How fast a wave front travels (cm per second, cm/s). Pond-slow is about 8; faster looks like sound.")
  waveSpeed: number = 8

  @input
  @hint("How long one wave lives (seconds, s). Speed x Seconds is how far it can travel (8 cm/s x 4 s = 32 cm).")
  waveSeconds: number = 4

  @input
  @hint("Distance between two crests of a wave (cm). Smaller = more, finer rings behind the front.")
  waveLength: number = 3

  @input
  @hint("Thickness of the wave's leading edge (cm): the soft window the crests live in. Bigger = a broader, calmer wave packet.")
  waveWidth: number = 2.5

  @input
  @hint("How much longer the tail behind the front is than the front itself (multiple, unitless; 1 = symmetric). Above 1 gives a pond-like trail of rings behind the leading one.")
  waveTrail: number = 1.8

  @input
  @hint("How fast a wave loses strength as it spreads (0 to 2, unitless; 0 = it stays as strong as it started, 1 = a ring gets weaker as its circle grows, as in real water).")
  waveFalloff: number = 0.5

  @input
  @hint("Waves fade to nothing over this distance before the quad's edge (cm), so the quad edge is never seen. The table is the stage: waves just fade out; nothing reflects.")
  waveEdgeFade: number = 10

  @input
  @hint("Radius (cm) where every wave starts: the front begins on a circle this big instead of at the centre point, and nothing is drawn inside it, so waves come out from under the home ring and dial button. 0 = automatic: the home ring's resting radius (Home Quad Size x Home Ring Radius / 2, 1.8 cm by default). Use about 3.8 to start outside the dial button as well.")
  waveStartRadius: number = 0

  // the start radius actually used (cm): the Inspector value, or the home ring's resting radius when it is 0
  waveStartRadiusCm(): number {
    return this.waveStartRadius > 0 ? this.waveStartRadius : (this.homeQuadSize * this.homeRingRadius) / 2
  }

  @input
  @hint("A wave fades out slowly over the last this-many seconds (s) of its life. 0 = it stops at once.")
  waveFadeSeconds: number = 1.5

  @input
  @hint("Least time between two separate waves from ONE socket (seconds, s). A hit closer than this merges into that socket's newest wave instead of starting a new one. 0 = every hit starts a wave. There are 8 wave slots for all 7 sockets together.")
  waveMinGap: number = 0.6

  @input
  @hint("How much a merged hit adds to the wave it merges into (0 to 1, unitless; max total 1).")
  waveMergeGain: number = 0.5

  @input
  @hint("Mirror the wave positions left-right on the quad (use only if waves start on the wrong side; depends on the quad mesh's UV direction).")
  waveFlipU: boolean = false

  @input
  @hint("Mirror the wave positions front-back on the quad (use only if waves start on the wrong side; depends on the quad mesh's UV direction).")
  waveFlipV: boolean = false

  @input
  @hint("Start of the material parameter names for the 8 waves (Script Names): wave0 to wave7 with the default 'wave'. Each is a Float Parameter with Channels xyzw. Change only if your Wave_Mat uses other names. The two shared packs, waveShape and waveMisc (also Float Parameters, Channels xyzw), have fixed names.")
  waveParamPrefix: string = "wave"

  @input
  @hint("Print a line to the log for every key press seen by the wave field and every wave a socket sends (for finding why no wave shows). Turn off when it works.")
  waveDebugLog: boolean = true

  @input
  @hint("TEST ONLY: start a test wave in the middle of the field every 3 seconds (s), without any toy or key, so you can look at the picture. Needs Shared Wave Field ON. Turn off when done.")
  waveTestLoop: boolean = false
  @ui.group_end

  // ---------------------------------------------------------------- tap waves (finger taps send waves into the shared field)
  @ui.separator
  @ui.label('<span style="color: #34D399;">Tap waves</span>')
  @ui.group_start("Tap waves")
  @input
  @hint("Master switch for tap waves: a finger tap (in the Preview, a mouse click) starts a wave in the shared wave field, with its own colour and brightness. Needs Shared Wave Field ON. In the Preview a click only counts while this is ON.")
  tapWavesEnabled: boolean = true

  @input
  @hint("Colour of tap waves (RGBA). Sent to Wave_Mat as the parameter 'tapWaveColor' (a Color Parameter); toy waves keep the material's own waveColor. Does nothing until Wave_Mat is updated to read it (PLAN.md section 16).")
  @widget(new ColorWidget())
  tapWaveColor: vec4 = new vec4(0.55, 0.9, 1, 1)

  @input
  @hint("Brightness of tap waves (percent, %). 100 = a full-strength wave like a loud toy hit, 0 = invisible, 200 = twice as strong. It scales the wave's height, so a dimmer tap wave also weighs less where it meets toy waves.")
  @widget(new SliderWidget(0, 200, 1))
  tapWaveBrightness: number = 100

  @input
  @hint("Most tap waves alive at once (count). They only ever replace other tap waves, so a busy hand cannot push the toys' waves out of the 8 slots. Toy waves and tap waves share the same 8 slots.")
  @widget(new SliderWidget(1, 6, 1))
  tapWaveMax: number = 3

  @input
  @hint("Two taps closer together than this (seconds, s) merge into one wave instead of starting two. 0 = every tap starts its own wave.")
  tapWaveMinGap: number = 0.12

  @input
  @hint("Taps near a socket (its home ring and dial button) get weaker the closer they are. Inside this radius (cm, measured from the socket's centre) a tap makes no wave at all. The ring and dial button reach about 3.8 cm.")
  tapAvoidSocketRadius: number = 3.8

  @input
  @hint("Taps near a toy get weaker the closer they are. Inside this radius (cm, measured from the toy's centre) a tap makes no wave at all. A toy is about 4 cm wide, so about 2 is the toy's own body.")
  tapAvoidToyRadius: number = 2.5

  @input
  @hint("How far (cm) the falloff reaches past the radius above: a tap this far outside the radius makes a full wave, and it fades smoothly down to nothing at the radius. Bigger = a wider soft zone around buttons and toys. 0 = a hard edge. Tune this by feel.")
  @widget(new SliderWidget(0, 10, 0.1))
  tapAvoidMarginCm: number = 3

  @input
  @hint("Turn the falloff around sockets and toys off completely (every tap makes a full wave wherever it lands, even on a dial button).")
  tapAvoidEnabled: boolean = true

  @input
  @hint("Print a line for every tap (where it landed, which falloff applied, what was sent). Turn off when it works.")
  tapDebugLog: boolean = true
  @ui.group_end

  // ---------------------------------------------------------------- alive and hover
  @ui.separator
  @ui.label('<span style="color: #F472B6;">Alive and hover</span>')
  @ui.group_start("Alive and hover")
  @input
  @hint("Master switch for everything in this group: the toy glow and lean, the dial button glow and the Move Handle reaction when a hand comes close or hovers.")
  aliveEnabled: boolean = true

  @input
  @hint("The toys react to a nearby hand: the core glow (coreHeat) rises, the resting glow breathes while the toy is off, and the toy leans toward the hand.")
  aliveToyEnabled: boolean = true

  @input
  @hint("The dial buttons react: the Button brightness rises when a hand is near, and the Off colour breathes very gently while the toy is off.")
  aliveDialEnabled: boolean = true

  @input
  @hint("The Move Handle reacts to a nearby hand. It only writes the material parameter named in 'Handle Alive Parameter' below (empty = nothing is written).")
  aliveHandleEnabled: boolean = true

  @input
  @hint("ON: hovering a toy, dial button or handle (the SIK hover, which also works with the mouse in the Preview and with the far ray on Specs) counts as 'close' even when no fingertip is near. Hover alone gives the glow but no lean (a hover has no side to lean toward).")
  aliveHoverCounts: boolean = true

  @input
  @hint("How many frames in a row a hand must be close (or hovering) before the reaction starts (frames, whole number; 1 = at once). At 60 frames per second, 6 frames = 0.1 seconds. Raise it if a hand passing by sets things off too easily.")
  aliveNearFrames: number = 6

  @input
  @hint("How many frames in a row a hand must be gone before the reaction stops (frames, whole number; 1 = at once). Stops a flicker of hand tracking from flashing the glow on and off.")
  aliveLeaveFrames: number = 12

  @input
  @hint("Seconds (s) the reaction takes to fade in and out (about 63 percent of the way). 0 = instant.")
  aliveEaseSeconds: number = 0.35

  @input
  @hint("TOY: distance from the toy's surface (cm) where the reaction starts. Further than this, nothing happens.")
  aliveToyOuterCm: number = 8

  @input
  @hint("TOY: distance from the toy's surface (cm) where the reaction is at full strength (hand nearly touching).")
  aliveToyInnerCm: number = 1.5

  @input
  @hint("DIAL BUTTON: distance from the button's edge (cm) where the reaction starts.")
  aliveDialOuterCm: number = 5

  @input
  @hint("DIAL BUTTON: distance from the button's edge (cm) where the reaction is at full strength.")
  aliveDialInnerCm: number = 0.5

  @input
  @hint("MOVE HANDLE: distance from the handle's centre (cm) where the reaction starts.")
  aliveHandleOuterCm: number = 10

  @input
  @hint("MOVE HANDLE: distance from the handle's centre (cm) where the reaction is at full strength.")
  aliveHandleInnerCm: number = 3

  @input
  @widget(new SliderWidget(0, 0.3, 0.005))
  @hint("TOY resting glow while the toy is OFF: how high the core glow (coreHeat, 0 to 1, unitless) breathes up to. Very low on purpose (0.04). 0 = no resting glow. Added to the music's own coreHeat; your BlobShader_01 decides how coreHeat looks.")
  aliveIdleHeat: number = 0.04

  @input
  @widget(new SliderWidget(0, 1, 0.01))
  @hint("TOY: how much the core glow (coreHeat, 0 to 1, unitless) is raised when a hand is fully close. Added on top of the resting glow and the music, for off and on toys alike.")
  aliveNearHeat: number = 0.35

  @input
  @hint("Seconds (s) for one slow breath of the resting glow (toy core and dial button). Longer = calmer.")
  aliveBreathSeconds: number = 4

  @input
  @hint("ON: each toy breathes at its own moment (seven toys are not in step). OFF: they all breathe together.")
  aliveStagger: boolean = true

  @input
  @widget(new SliderWidget(0, 100, 1))
  @hint("DIAL BUTTON resting glow while the toy is OFF: how much the Off colour breathes up (percent of the Off colour, %; 12 = up to 12 percent brighter at the top of a breath). It multiplies the Off part of 'Button Off Brightness', so with that at 0 there is nothing to breathe.")
  aliveDialIdlePercent: number = 12

  @input
  @widget(new SliderWidget(0, 300, 1))
  @hint("DIAL BUTTON: how much brighter the button colours get when a hand is fully close (percent brighter, %; 60 = 60 percent brighter than 'Button ... Brightness'). Applies to all four button colours.")
  aliveDialNearPercent: number = 60

  @input
  @hint("MOVE HANDLE: name of a float material parameter (Script Name) that receives the reaction, 0 to 1 (unitless). Empty = nothing is written. The handle's default material has no such parameter: add one in your handle graph, then type its name here.")
  aliveHandleParam: string = ""

  @input
  @widget(new SliderWidget(0, 1, 0.01))
  @hint("MOVE HANDLE: the value written to 'Handle Alive Parameter' when a hand is fully close or hovering (0 to 1, unitless). While the handle is being pinch-dragged the value goes to 1. Use about 0.5 with the MoveHandle_Shader graph (0 = rest, 0.5 = hover, 1 = active).")
  aliveHandleHoverLevel: number = 0.5

  @input
  @hint("TOYS lean toward an approaching fingertip. Needs a fingertip (or the mouse stand-in); hover alone does not lean.")
  aliveLeanEnabled: boolean = true

  @input
  @hint("ON: a toy that is OFF also leans toward the hand. OFF: only toys that are on lean.")
  aliveLeanWhenOff: boolean = true

  @input
  @widget(new SliderWidget(0, 30, 0.5))
  @hint("How far a toy leans when the hand is fully close (degrees). With Shader Deform ON it becomes a sideways shift of the top (tan of this angle x the blob height), also scaled by the material's swayGain. Each toy can scale it with 'Lean Scale' on its ToyAudioReact.")
  aliveLeanDegrees: number = 6

  @input
  @widget(new SliderWidget(0, 30, 0.5))
  @hint("Hard cap on the lean (degrees), whatever the other numbers say. The Comfort limiter's Max Wobble Degrees applies as well when it is on.")
  aliveLeanMaxDegrees: number = 10

  @input
  @hint("Speed of the lean spring (cycles per second, Hz). Lower = a lazier, softer lean.")
  aliveLeanHz: number = 2.5

  @input
  @hint("Damping of the lean spring (unitless; below 1 = a little overshoot and settle, 1 or more = no overshoot).")
  aliveLeanDamping: number = 0.6

  @input
  @hint("PREVIEW ONLY: in the Editor Preview the mouse acts as a fingertip (there are no hand joints there). It is placed where the mouse ray meets a flat plane at 'Mouse Hand Height' above the stage. Has no effect on Specs.")
  aliveMouseHand: boolean = true

  @input
  @hint("PREVIEW ONLY: height (cm) above the stage floor of the plane the mouse fingertip moves on. About 3 is toy-top height; make it larger to reach over the toys.")
  aliveMouseHeightCm: number = 3
  @ui.group_end

  // ---------------------------------------------------------------- debug
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Debug</span>')
  @ui.group_start("Debug")
  @input
  @hint("Show the real logical stage bounds (the stage shape toys are kept inside) as a thick outline, using the Outline Segments. Use it to compare with the frame.")
  showBoundsOutline: boolean = false

  @input
  @hint("Size (cm) of your placeholder primitives at scale 1 (frame piece quad and debug outline segment edge). Used to size them.")
  primitiveMeshSize: number = 1

  @input
  @hint("Print extra logs.")
  verbose: boolean = false
  @ui.group_end

  // ------------------------------------------------------------ sharing (no need to edit below)
  static instance: StageConfig | null = null
  private static waiting: Array<(c: StageConfig) => void> = []

  // Reference toy size (cm) for spacing, edge padding and slot counts: the base blob scale.
  get toySize(): number {
    return this.baseBlobScale
  }

  // The comfort limits as one object (read every frame by ToyShape, ToySquish and ToyAudioReact).
  private limits: ComfortLimits | null = null
  comfortLimits(): ComfortLimits {
    if (!this.limits) {
      this.limits = {
        enabled: true, maxSquash: 0, maxStretch: 0, maxBulge: 0, maxOvershoot: 0, maxDamping: 0,
        maxSquishHz: 0, maxWobbleHz: 0, maxWobbleDegrees: 0, maxScalePulse: 0, maxBounceCm: 0
      }
    }
    const l = this.limits
    l.enabled = this.comfortLimiterEnabled
    l.maxSquash = this.limitSquash
    l.maxStretch = this.limitStretch
    l.maxBulge = this.limitBulge
    l.maxOvershoot = this.limitOvershoot
    l.maxDamping = this.limitDamping
    l.maxSquishHz = this.limitSquishHz
    l.maxWobbleHz = this.limitWobbleHz
    l.maxWobbleDegrees = this.limitWobbleDegrees
    l.maxScalePulse = this.limitScalePulse
    l.maxBounceCm = this.limitBounceCm
    return l
  }

  // Run `cb` as soon as the config exists (immediately if it already does). Order-independent.
  static whenAvailable(cb: (c: StageConfig) => void): void {
    if (StageConfig.instance) cb(StageConfig.instance)
    else StageConfig.waiting.push(cb)
  }

  // ---- resets: the tick-boxes above. Each one runs only its own handlers, then un-ticks itself. ----
  private resetHandlers: { [kind: string]: Array<() => void> } = {}

  // Subscribe to one reset ("toyPositions", "padPositions", "padColours" or "sockets").
  onReset(kind: ResetKind, cb: () => void): void {
    if (!this.resetHandlers[kind]) this.resetHandlers[kind] = []
    this.resetHandlers[kind].push(cb)
  }

  // Run a reset from code (same as ticking the box).
  triggerReset(kind: ResetKind): void {
    for (const cb of this.resetHandlers[kind] ?? []) cb()
  }

  // A tick-box on `owner` (this config, a ToyConfig or a ToyPad): if it is ticked, un-tick it and return true.
  static consumeTick(owner: any, field: string): boolean {
    if (!owner[field]) return false
    owner[field] = false
    return true
  }

  private pollResets(): void {
    if (StageConfig.consumeTick(this, "resetToyPositions")) this.triggerReset("toyPositions")
    if (StageConfig.consumeTick(this, "resetPadPositions")) this.triggerReset("padPositions")
    if (StageConfig.consumeTick(this, "resetPadColours")) this.triggerReset("padColours")
    if (StageConfig.consumeTick(this, "resetSockets")) this.triggerReset("sockets")
    if (StageConfig.consumeTick(this, "callHomeNow")) this.triggerReset("callHome")
  }

  onAwake(): void {
    StageConfig.instance = this
    this.createEvent("UpdateEvent").bind(() => this.pollResets())
    this.createEvent("KeyPressEvent").bind((e) => {
      if (this.callHomeKey && e.key === Keys.H && global.deviceInfoSystem.isEditor()) this.triggerReset("callHome")
    })
    const queued = StageConfig.waiting
    StageConfig.waiting = []
    for (const cb of queued) cb(this)
  }

  // The four volume values as an array, index = state (0 off, 1 low, 2 medium, 3 high).
  volumes(): number[] {
    return [this.volumeOff, this.volumeLow, this.volumeMedium, this.volumeHigh]
  }

  log(msg: string): void {
    if (this.verbose) console.log("[Stage] " + msg)
  }
}
