// ToyShape - the per-toy SHAPE settings (form, ruffles, lumps, dimples, ridges) and Feel.
// It keeps this toy's own copy of the base blob mesh, shaped once at startup (BlobBake) from the values below.
// With every count at 0 and Form at 0 the blob is the plain base blob. Every value is clamped to its safe range
// (a warning is logged). Scale is NOT set here:
// Base Blob Scale, Size Multiplier and Shape Proportions in StageConfig / ToyConfig stay the source of truth.
// The Feel section below is how THIS toy moves (squash, bounce, wobble, damping). It is limited by StageConfig >
// Comfort limiter and handed to this toy's ToyConfig; nothing about feel is stored in the Toy prefab or shared.
// While the Preview runs, changing a value re-shapes the blob a moment after you stop dragging, and Feel edits show
// at once (turn both off with StageConfig > Blob shape > Live Edit for the final build: shape and Feel are then
// worked out once at startup).

import { StageConfig } from "./StageConfig"
import { ToyConfig } from "./ToyConfig"
import { BlobBaker } from "./BlobBake"
import * as P from "./BlobProfile"
import * as F from "./ToyFeel"

@component
export class ToyShape extends BaseScriptComponent {
  @ui.group_start("Form (silhouette)")
  @input
  @hint("Narrows the top (positive: teardrop, pear) or the bottom (negative: mushroom). Unitless, -1 to 1. 0 = none. Range -1 to 1.")
  @widget(new SliderWidget(-1, 1, 0.01))
  taper: number = 0

  @input
  @hint("Curls the blob along the Bend Axis. Positive: both ends curl up like a smile, negative: down. Unitless, -1 to 1. 0 = none. Range -1 to 1.")
  @widget(new SliderWidget(-1, 1, 0.01))
  bendAmount: number = 0

  @input
  @hint("Which way the bend runs: left-right (x) or front-back (z).")
  @widget(new ComboBoxWidget([new ComboBoxItem("Left-right (x)", 0), new ComboBoxItem("Front-back (z)", 1)]))
  bendAxis: number = 0

  @input
  @hint("Flattens the underside so the blob sits on its pad. Unitless, 0 to 1. 0 = round. Range 0 to 1.")
  @widget(new SliderWidget(0, 1, 0.01))
  flattenBottom: number = 0

  @input
  @hint("Pulls the round blob toward a soft cube / pillow. Unitless, 0 to 1. 0 = round. Range 0 to 1.")
  @widget(new SliderWidget(0, 1, 0.01))
  squareness: number = 0
  @ui.group_end

  @ui.separator
  @ui.group_start("Surface: ruffles")
  @input
  @hint("Number of soft folds around the blob. 0 = no ruffles. Whole number. Range 0 to 10 (creased folds look cleanest up to about 8).")
  @widget(new SliderWidget(0, 10, 1))
  ruffleCount: number = 0

  @input
  @hint("How high the folds are, as a fraction of the blob's longest side (0.02 = 2%, about 0.8 mm on a 4 cm blob; 0.15 = 6 mm). Capped at 0.15. Range 0 to 0.15.")
  @widget(new SliderWidget(0, 0.15, 0.001))
  ruffleAmp: number = 0.02

  @input
  @hint("0 = creased folds, 1 = smooth rounded waves. Unitless. Range 0 to 1.")
  @widget(new SliderWidget(0, 1, 0.01))
  ruffleSoftness: number = 0.8

  @input
  @hint("Where the ruffles sit: -1 = bottom, 0 = middle, 1 = top. Unitless. Range -1 to 1.")
  @widget(new SliderWidget(-1, 1, 0.01))
  ruffleBand: number = 0

  @input
  @hint("How tall the ruffle band is (0.1 = a thin ring, 2 = the whole blob). Unitless. Range 0.1 to 2.")
  @widget(new SliderWidget(0.1, 2, 0.01))
  ruffleBandWidth: number = 0.6

  @input
  @hint("Spirals the folds up the blob. Unitless, -1 to 1 (about half a turn over the full height at 1). 0 = straight. Range -1 to 1.")
  @widget(new SliderWidget(-1, 1, 0.01))
  ruffleTwist: number = 0
  @ui.group_end

  @ui.separator
  @ui.group_start("Surface: lumps")
  @input
  @hint("Number of soft bumps, like keys or a pile of beans. 0 = none. Range 0 to 20.")
  @widget(new SliderWidget(0, 20, 1))
  lumpCount: number = 0

  @input
  @hint("How far the bumps stand out, as a fraction of the blob's longest side. Capped at 0.15 (0.15 = 6 mm on a 4 cm blob). Range 0 to 0.15.")
  @widget(new SliderWidget(0, 0.15, 0.001))
  lumpAmp: number = 0.03

  @input
  @hint("How wide each bump is, as a fraction of the gap between neighbouring bumps, so it looks the same at any Count. Unitless. 0.3 = clearly separate bumps, 0.5 = starting to merge. Range 0.1 to 0.5.")
  @widget(new SliderWidget(0.1, 0.5, 0.01))
  lumpSize: number = 0.3

  @input
  @hint("Pattern seed for the lumps and dimples: the same seed always gives the same pattern. Whole number. Range 0 to 9999.")
  @widget(new SliderWidget(0, 9999, 1))
  seed: number = 0
  @ui.group_end

  @ui.separator
  @ui.group_start("Surface: dimples")
  @input
  @hint("Number of little pressed-in spots. 0 = none. Range 0 to 12.")
  @widget(new SliderWidget(0, 12, 1))
  dimpleCount: number = 0

  @input
  @hint("How deep the spots are, as a fraction of the blob's longest side. Capped at 0.10 (0.10 = 4 mm on a 4 cm blob). Range 0 to 0.10.")
  @widget(new SliderWidget(0, 0.1, 0.001))
  dimpleDepth: number = 0.025

  @input
  @hint("How wide each spot is, as a fraction of the gap between neighbouring spots. Unitless. 0.3 = clearly separate spots, 0.5 = starting to merge. Range 0.1 to 0.5.")
  @widget(new SliderWidget(0.1, 0.5, 0.01))
  dimpleSize: number = 0.3
  @ui.group_end

  @ui.separator
  @ui.group_start("Surface: ridges")
  @input
  @hint("Number of soft stripes. 0 = none. Whole number. Range 0 to 10 (rings around the blob look cleanest up to about 5).")
  @widget(new SliderWidget(0, 10, 1))
  ridgeCount: number = 0

  @input
  @hint("How high the stripes are, as a fraction of the blob's longest side. Capped at 0.08 (0.08 = 3 mm on a 4 cm blob). Range 0 to 0.08.")
  @widget(new SliderWidget(0, 0.08, 0.001))
  ridgeAmp: number = 0.015

  @input
  @hint("Stripes run top to bottom, or as rings around the blob.")
  @widget(new ComboBoxWidget([new ComboBoxItem("Top to bottom", 0), new ComboBoxItem("Rings around", 1)]))
  ridgeDirection: number = 0
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Feel (how this toy moves)</span>')
  @ui.group_start("Feel (this toy)")
  @input
  @hint("Music Class: a ready-made set of the MUSIC motion values (Scale Pulse, Bounce, Wobble, Wobble Hz, Onset Sensitivity, Sustain, Level Floor, Hit Spacing, Kick Hz, Kick Damping, Sway, Noise, Noise Scale, Noise Speed). While a class is chosen it REPLACES those sliders. Custom uses the sliders as typed. Poke, landing and grab values are never changed.")
  @widget(new ComboBoxWidget([new ComboBoxItem("Custom (my sliders)", 0), new ComboBoxItem("Strings (slow, flowing)", 1), new ComboBoxItem("Piano (even, gentle)", 2), new ComboBoxItem("Chimes / FX (shimmery)", 3), new ComboBoxItem("Percussion (snappy)", 4)]))
  motionClass: number = 0

  @input
  @hint("How strongly this toy reacts to its own stem. Unitless, 1 = normal. Range 0 to 2 (the Comfort Limiter caps the result).")
  @widget(new SliderWidget(0, 2, 0.01))
  reactAmount: number = 1

  @input
  @hint("How far a full-strength hit pops the shape, as a fraction (0.15 = 15% taller and thinner, volume kept). Range 0 to 0.3.")
  @widget(new SliderWidget(0, 0.3, 0.005))
  scalePulse: number = 0.15

  @input
  @hint("Bounce height at full music level (cm). Range 0 to 1.")
  @widget(new SliderWidget(0, 1, 0.01))
  bounceCm: number = 0.5

  @input
  @hint("How far a hit rocks the toy (degrees), tilting around its base. Range 0 to 10.")
  @widget(new SliderWidget(0, 10, 0.1))
  wobbleDegrees: number = 6

  @input
  @hint("Base rocking speed (Hz = rocks per second). Feel Seed nudges it by up to 15% so toys never sway together. Range 0.3 to 1.6.")
  @widget(new SliderWidget(0.3, 1.6, 0.01))
  wobbleHz: number = 1.1

  @input
  @hint("How quiet a hit can be and still kick this toy. Unitless, 0 to 1 (higher = reacts to more, softer hits).")
  @widget(new SliderWidget(0, 1, 0.01))
  onsetSensitivity: number = 0.6

  @input
  @hint("How much steady loudness (not hits) leans the toy. Fraction, 0 to 1. 0 = only hits move it.")
  @widget(new SliderWidget(0, 1, 0.01))
  sustain: number = 0.2

  @input
  @hint("This toy's own quiet cut-off for the music reading (RMS loudness, unitless, 0 to 0.02). Stem loudness below it counts as silence. 0 = use StageConfig > Level Floor (0.005). Very quiet stems such as chimes need about 0.0005.")
  @widget(new SliderWidget(0, 0.02, 0.0001))
  levelFloor: number = 0

  @input
  @hint("The shortest time between two hits (seconds). Range 0.05 to 1. Raise it for sustained, always-loud stems (strings) so the toy flows instead of jittering.")
  @widget(new SliderWidget(0.05, 1, 0.01))
  hitSpacing: number = 0.1

  @input
  @hint("Split this toy's stem into LOWS and HIGHS at this frequency (Hz). 0 = off: everything follows one loudness, as before. Try 250 to 400. Below about 150 the reading is too short to separate bass. The three sliders below choose what follows which band.")
  @widget(new SliderWidget(0, 8000, 10))
  bandSplitHz: number = 0

  @input
  @hint("What the KICK (the pop, bounce and scale hits, plus the material's audioLevel and glow) follows. Unitless, 0 to 1: 0 = lows only, 0.5 = both equally, 1 = highs only. Only works while Band Split Hz is above 0.")
  @widget(new SliderWidget(0, 1, 0.01))
  bandMixKick: number = 0

  @input
  @hint("What the SWAY (the rocking and tilting hits, and the shader sway) follows. Unitless, 0 to 1: 0 = lows only, 0.5 = both equally, 1 = highs only. Only works while Band Split Hz is above 0.")
  @widget(new SliderWidget(0, 1, 0.01))
  bandMixSway: number = 0.5

  @input
  @hint("What the glitter VFX follows. Unitless, 0 to 1: 0 = lows only, 0.5 = both equally, 1 = highs only. Only works while Band Split Hz is above 0.")
  @widget(new SliderWidget(0, 1, 0.01))
  bandMixVfx: number = 1

  @input
  @hint("Speed of the beat spring (Hz = pops per second). Higher = snappier. Range 1 to 8 (the Comfort Limiter caps it at its Fastest Spring).")
  @widget(new SliderWidget(1, 8, 0.05))
  kickHz: number = 3.5

  @input
  @hint("How quickly the beat spring settles, unitless. Always below 1. About 0.7 = a slight overshoot, lower = jelly, higher = cushion. Range 0.4 to 0.95 (the Comfort Limiter sets the lowest allowed).")
  @widget(new SliderWidget(0.4, 0.95, 0.01))
  kickDamping: number = 0.7

  @input
  @hint("Shader deform only: how far the tips sway on a hit, as a fraction of the blob's longest side (0.07 = 2.8 mm on a 4 cm blob). Range 0 to 0.25.")
  @widget(new SliderWidget(0, 0.25, 0.005))
  swayAmount: number = 0.07

  @input
  @hint("Shader deform only: surface ripple size, as a fraction of the blob's longest side (0.01 = 0.4 mm on a 4 cm blob). Range 0 to 0.06.")
  @widget(new SliderWidget(0, 0.06, 0.001))
  noiseAmount: number = 0.01

  @input
  @hint("Shader deform only: ripple fineness, in noise cycles across the blob (unitless). Higher = finer. Range 0.5 to 6.")
  @widget(new SliderWidget(0.5, 6, 0.1))
  noiseScale: number = 2

  @input
  @hint("Shader deform only: how fast the ripples drift (x, 1 = normal speed). Range 0 to 3.")
  @widget(new SliderWidget(0, 3, 0.05))
  noiseSpeed: number = 0.4

  @input
  @hint("How much a poke squashes this toy, as a fraction (0.2 = 20% flatter). Range 0 to 0.35.")
  @widget(new SliderWidget(0, 0.35, 0.005))
  pokeSquash: number = 0.22

  @input
  @hint("How much touching down on the stage squashes it, as a fraction. Range 0 to 0.35.")
  @widget(new SliderWidget(0, 0.35, 0.005))
  landSquash: number = 0.16

  @input
  @hint("How much holding it stretches it taller, as a fraction (0.07 = 7%). Range 0 to 0.25.")
  @widget(new SliderWidget(0, 0.25, 0.005))
  grabStretch: number = 0.07

  @input
  @hint("Sideways bulge when squashed, unitless. 0.5 keeps the volume about the same. Range 0 to 1.")
  @widget(new SliderWidget(0, 1, 0.01))
  squishBulge: number = 0.5

  @input
  @hint("Springiness speed (Hz = wobbles per second). Higher = tighter, quicker jiggle. Range 1 to 7.")
  @widget(new SliderWidget(1, 7, 0.05))
  squishHz: number = 4.5

  @input
  @hint("How quickly the springy wobble fades, unitless. Always below 1 so the blob springs past rest and wobbles back. Low = jelly, high = soft cushion. Range 0.3 to 0.9 (the Comfort Limiter sets the lowest allowed).")
  @widget(new SliderWidget(0.3, 0.9, 0.01))
  damping: number = 0.6

  @input
  @hint("How fast it falls back to the stage after you let go (cm per second). Range 1 to 8.")
  @widget(new SliderWidget(1, 8, 0.1))
  driftSpeed: number = 4

  @input
  @hint("How long the landing settle takes (seconds). Range 0.2 to 1.2.")
  @widget(new SliderWidget(0.2, 1.2, 0.01))
  settleSeconds: number = 0.45

  @input
  @hint("Gives this toy its own wobble rate and starting phase. Whole number, 0 to 9999. Use a different number on every toy.")
  @widget(new SliderWidget(0, 9999, 1))
  feelSeed: number = 0
  @ui.group_end

  // ---------------------------------------------------------------- the work
  private cfg: StageConfig | null = null
  private toyCfg: ToyConfig | null = null
  private rmv: RenderMeshVisual | null = null
  private baseMesh: RenderMesh | null = null // the shared mesh from the scene, never changed
  private baker: BlobBaker | null = null
  private eff: P.BlobParams = P.defaultParams() // the values in force (your values), reused every frame
  private hash: number = NaN
  private pending: boolean = false
  private changedAt: number = 0
  private lastWarn: string = ""
  private failed: boolean = false
  private feelIn: F.FeelParams = F.defaultFeel() // this toy's own Feel, reused every frame
  private feelOut: F.FeelOut = { ...F.defaultFeel(), wobbleRate: 7, wobblePhase: 0 }
  private lastFeelWarn: string = ""
  private feelDone: boolean = false // Live Edit off: Feel is worked out once, not every frame
  private static lastBakeTime: number = -1 // one bake per frame at most, so starting 7 blobs never hitches

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => {
      this.toyCfg = this.sceneObject.getComponent(ToyConfig.getTypeName()) as ToyConfig
    })
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  // The values in force: this toy's own values, read straight from the inputs above
  // (the input names match BlobParams exactly), reused every frame.
  private fillEffective(): void {
    const e = this.eff
    for (const k of P.PARAM_KEYS) e[k] = (this as any)[k] as number
  }

  // This toy's Feel through the comfort limiter, handed to its ToyConfig (every frame, so edits show live).
  private updateFeel(): void {
    const i = this.feelIn
    for (const k of F.FEEL_KEYS) i[k] = (this as any)[k] as number // input names match FeelParams exactly
    F.applyMotionClass(i, this.motionClass) // a chosen Music Class replaces the music-motion values (0 = Custom: no change)
    const msg = F.limitFeel(i, this.cfg!.comfortLimits(), this.feelOut)
    if (msg !== this.lastFeelWarn) {
      this.lastFeelWarn = msg
      if (msg) console.warn("[ToyShape] " + this.sceneObject.name + " Feel clamped: " + msg)
    }
    this.toyCfg!.feel = this.feelOut
  }

  private onUpdate(): void {
    if (!this.cfg || !this.toyCfg) return
    if (this.cfg.blobLiveEdit || !this.feelDone) {
      this.updateFeel()
      this.feelDone = true
    }
    if (this.failed) return
    if (!this.cfg.blobShapingEnabled) {
      if (this.baker && this.rmv && this.baseMesh) {
        this.rmv.mesh = this.baseMesh // switched off: back to the shared mesh
        this.baker = null
        this.toyCfg.onBlobMeshChanged()
      }
      return
    }
    if (!this.baker) {
      if (ToyShape.lastBakeTime === getTime()) return // another blob already baked this frame
      this.fillEffective()
      this.bake(true)
      return
    }
    if (!this.cfg.blobLiveEdit) return
    this.fillEffective()
    const h = P.paramsHash(this.eff)
    if (h !== this.hash) {
      this.hash = h
      this.pending = true
      this.changedAt = getTime()
    } else if (this.pending && getTime() - this.changedAt > 0.3 && ToyShape.lastBakeTime !== getTime()) {
      this.bake(false) // the value has stopped changing: re-shape once
    }
  }

  private bake(first: boolean): void {
    const tc = this.toyCfg!
    try {
      if (first) {
        this.rmv = tc.visual ? (tc.visual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null
        this.baseMesh = this.rmv ? this.rmv.mesh : null
        if (!this.rmv || !this.baseMesh) {
          console.warn("[ToyShape] " + this.sceneObject.name + ": its Visual has no RenderMeshVisual / mesh, so there is nothing to shape.")
          this.failed = true
          return
        }
        this.baker = new BlobBaker(this.baseMesh)
      }
      this.hash = P.paramsHash(this.eff) // hash of the values AS TYPED (before clamping), the same thing onUpdate compares
      const msgs = P.clampParams(this.eff)
      const key = msgs.join(";")
      if (key !== this.lastWarn) {
        this.lastWarn = key
        if (msgs.length > 0) console.warn("[ToyShape] " + this.sceneObject.name + ": value out of range, clamped: " + key)
      }
      this.baker!.apply(this.eff)
      if (first) this.rmv!.mesh = this.baker!.mesh
      this.pending = false
      ToyShape.lastBakeTime = getTime()
      tc.onBlobMeshChanged()
      console.log("[ToyShape] " + this.sceneObject.name + " baked: " + this.baker!.vertexCount + " vertices, " + this.baker!.lastMs + " ms")
    } catch (e) {
      this.failed = true
      console.warn("[ToyShape] " + this.sceneObject.name + " could not shape its mesh, left as it is: " + e)
    }
  }
}
