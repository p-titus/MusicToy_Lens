// ToyConfig - the per-toy settings component (its stem, its overrides).
// Volumes can be overridden per toy here. How the toy MOVES (squash, bounce, wobble, damping) is NOT stored here: it
// lives in this toy's own ToyShape > Feel, which hands the limited result to `feel` below. Without a ToyShape the
// global defaults in StageConfig are used.

import { StageConfig } from "./StageConfig"
import * as G from "./StageGeometry"
import { BlobLookDriver } from "./StateColours"
import { FeelOut, FEEL_RANGES } from "./ToyFeel"

// Everything the toy's audio reaction measures, published once a frame by ToyAudioReact and read by anything that
// wants to react to the music (the home marker now; ripples later). Add a field here to offer a new source.
// All unitless unless noted. Hits are counted (hitSeq), so a reader never misses one whatever the script order.
export interface ToySignals {
  hitSeq: number // counts kick hits (and fake Preview hits)
  hitStrength: number // 0.3..1: strength of the latest hit
  swaySeq: number // counts sway hits
  swayStrength: number // 0.3..1: strength of the latest sway hit
  level: number // 0..1 smoothed stem loudness (kick band mix)
  levelSway: number // 0..1 (sway band mix)
  levelVfx: number // 0..1 (glitter band mix)
  bandLow: number // 0..1 lows of the stem (only while Band Split Hz > 0)
  bandHigh: number // 0..1 highs of the stem (only while Band Split Hz > 0)
  pop: number // kick spring, about -1..1
  rockX: number // sway spring (roll)
  rockZ: number // sway spring (pitch)
  coreHeat: number // 0..1 slow loudness follower
  squash: number // + = flatter and wider, - = taller (the pop after the comfort limiter, plus the poke squish)
  heightCm: number // cm: toy height above the stage floor (set by ToyPad)
}

export function newToySignals(): ToySignals {
  return { hitSeq: 0, hitStrength: 0, swaySeq: 0, swayStrength: 0, level: 0, levelSway: 0, levelVfx: 0, bandLow: 0, bandHigh: 0, pop: 0, rockX: 0, rockZ: 0, coreHeat: 0, squash: 0, heightCm: 0 }
}

// Safe range for Size Multiplier (unitless).
const SIZE_MULTIPLIER_MIN = 0.75
const SIZE_MULTIPLIER_MAX = 1.3

@component
export class ToyConfig extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">This toy</span>')
  @ui.group_start("This toy")
  @input
  @hint("The audio file (stem) this toy controls. This is the ONLY place it is chosen: leave the AudioComponent's own Audio Track empty and Autoplay Loop off.")
  stem: AudioTrackAsset

  @input
  @hint("The child object that holds your mesh. Audio-reactive motion moves only this object.")
  visual: SceneObject

  @input
  @hint("Distance from the toy's pivot down to its base (cm), so it rests ON the stage floor.")
  restHeight: number = 0

  @input
  @hint("This toy's HOME position on the stage, in cm, relative to the stage centre (stage axes, not world). X = left (-) / right (+). Y = height above the stage floor (0 = resting on it). Z = back (-) / front (+). Give every toy its own spot. The Transform in the Scene panel stays at 0,0,0 because this is applied when the Lens starts and on Reset.")
  homePosition: vec3 = new vec3(0, 0, 0)
  @ui.group_end

  // ---- shape: stretch this toy's blob from here (not on the Visual's Transform: this component sets it) ----
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Shape</span>')
  @ui.group_start("Shape (stretch this toy)")
  @input
  @hint("OFF (default): the old rule. The mesh is assumed to fill a 1 x 1 x 1 box centred on its pivot, so the touch box, footprint and resting height are worked out from that. ON: they are taken from the mesh's OWN bounds instead, so any mesh (any file size, pivot anywhere) can be used as it is. The blob's real size is then its Rest Scale times the mesh's own size.")
  fitToMeshBounds: boolean = false

  @input
  @hint("Optional deliberate squash or stretch, a unitless factor per axis (x, y, z) on top of the base blob size. (1, 1, 1) = the mesh's own proportions. Rest Scale = Base Blob Scale (StageConfig, cm) x Size Multiplier x Shape Proportions.")
  shapeProportions: vec3 = new vec3(1, 1, 1)

  @input
  @hint("One unitless number that scales the whole blob (x, y and z together) relative to the base blob (StageConfig > Base Blob Scale, cm). 1 = same as the base blob, below 1 smaller, above 1 larger. Clamped to 0.75 - 1.3; a warning is logged if the value is outside that.")
  sizeMultiplier: number = 1

  @input
  @hint("Extra shift of the mesh child (cm: x = right, y = up, z = toward you), on top of the automatic resting height.")
  visualOffset: vec3 = new vec3(0, 0, 0)

  @input
  @hint("Extra rotation of the mesh child in degrees (x, y, z). Rotating changes the footprint too.")
  visualRotation: vec3 = new vec3(0, 0, 0)

  @input
  @hint("ON: lifts the mesh so it rests on the stage floor. With Fit To Mesh Bounds OFF this is half its height (right for meshes centred on their pivot, like the placeholder blobs); with it ON it uses the mesh's real lowest point, wherever the pivot is. Turn OFF for your own mesh whose pivot is already at its base.")
  autoRestOnFloor: boolean = true

  @input
  @hint("Footprint diameter on the stage (cm), used for edge padding and spacing between toys. 0 = automatic from the stretched shape (its widest side). This does not resize the collider.")
  footprintOverride: number = 0

  @input
  @hint("Collider box size in cm (x, y, z). 0 in all three = automatic: the collider is a 1x1x1 box on the mesh child, so it follows the stretched shape exactly. Enter sizes only if you want a bigger or smaller poke/pinch target.")
  colliderSizeOverride: vec3 = new vec3(0, 0, 0)
  @ui.group_end

  // ---- blob look: the state look for the BlobShader_01 material ----
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Blob look (BlobShader_01 material)</span>')
  @ui.group_start("Blob look (state look, this toy)")
  @input
  @hint("ON: this toy sends its volume state (lookState, 0 to 3) and the stem loudness (audioLevel, 0 to 1) to its material, if the material has a Float Parameter with the Script Name lookState. All colours and opacities per state are set in the Shader Graph (BlobShader_01), not here. OFF, or a material without lookState: the material is left as it is.")
  blobLook: boolean = true

  @input
  @hint("Seconds (s) the look takes to move by one state step, for example off to low. Off to loud takes three times this. 0 = instant.")
  blobSeconds: number = 0.25
  @ui.group_end

  // ---- shader deform for this toy ----
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Shader deform (this toy)</span>')
  @ui.group_start("Shader deform (this toy)")
  @input
  @hint("Whether THIS toy hands its music squash, sway and ripples to the vertex-deform shader. Follow Stage = use StageConfig > Shader Deform. On = this toy uses the shader even if the stage switch is off (use it for the one toy whose material has the deform graph). Off = this toy never does. Only turn On for a toy whose material has the deform parameters, or it loses its music squash and rocking.")
  @widget(new ComboBoxWidget([new ComboBoxItem("Follow Stage", 0), new ComboBoxItem("On", 1), new ComboBoxItem("Off", 2)]))
  shaderDeformMode: number = 0
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Reset (this toy)</span>')
  @ui.group_start("Reset (this toy)")
  @input
  @hint("Tick to put THIS toy back at its Home Position (above). It un-ticks itself in the Lens. Changes nothing else (not its pad).")
  resetToyPosition: boolean = false
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Overrides</span>')
  @ui.group_start("Override volume states")
  @input
  @hint("Use this toy's own volumes instead of the global ones.")
  overrideVolumes: boolean = false

  @input
  @hint("This toy's volumes: x = off, y = low, z = medium, w = high.")
  volumes: vec4 = new vec4(0, 0.25, 0.55, 1)
  @ui.group_end

  // Set every frame by ToySquish. + = squashed (flatter, wider), - = stretched (taller, thinner). 0 = rest shape.
  public squish: number = 0

  // Set by ToyInteraction: puts this toy back at its start position.
  public onResetPosition: (() => void) | null = null
  // Set by this toy's ToyPad: where the pad is relative to the toy and how big it is (null = no pad).
  public padDiscProvider: (() => G.Disc[]) | null = null // the pad's strip, as discs along it (stage-local cm)
  public padEquivalentProvider: (() => number) | null = null // one disc diameter with the same area as the strip
  public baseDiameterProvider: (() => number) | null = null // the pad's big base circle under the toy (cm), 0 = none

  // Read-only copies of the live signals, for other components (GlitterDriver). Set by the two methods below.
  public currentState: number = 0 // volume state 0 off .. 3 high, unitless
  public currentAudioLevel: number = 0 // smoothed stem level 0..1, unitless
  public currentGlitterLevel: number = 0 // smoothed level 0..1 for the glitter VFX (the same as above unless the band split is on)

  public signals: ToySignals = newToySignals() // see ToySignals above

  // A hit that did not come from the music (Preview keys 1 to 7 use this).
  fireHit(strength: number): void {
    this.signals.hitSeq++
    this.signals.hitStrength = Math.max(0.3, Math.min(1, strength))
  }

  private blob: BlobLookDriver | null = null
  private visualRmv: RenderMeshVisual | null = null

  private drivenAt: number = -10 // last time ToyAudioReact applied the shape (it multiplies the music on top)
  private colliderKey: string = ""
  // Set every frame by THIS toy's ToyShape: its Feel after the comfort limiter (null until the first frame / no ToyShape).
  public feel: FeelOut | null = null
  private warnedMultiplier: number = NaN // the out-of-range Size Multiplier already warned about

  onAwake(): void {
    // The Visual is put in its configured shape at start and kept in sync EVERY frame, so changing a value in
    // the Inspector while the Preview runs shows up at once. While ToyAudioReact is running it does the
    // per-frame job itself (shape x music); this is the fallback when it is off or has no stem.
    this.blob = new BlobLookDriver(
      this.sceneObject.name + " (toy)",
      () => {
        if (!this.visualRmv && this.visual) this.visualRmv = this.visual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
        return this.visualRmv
      },
      () => ({ seconds: this.blobSeconds })
    )
    this.createEvent("OnStartEvent").bind(() => this.applyShape())
    this.createEvent("UpdateEvent").bind(() => {
      if (StageConfig.consumeTick(this, "resetToyPosition") && this.onResetPosition) this.onResetPosition()
      const dtc = getDeltaTime()
      if (this.blobLook) this.blob!.update(dtc)
      if (getTime() - this.drivenAt > 0.2) this.applyShape()
      else this.applyColliderOverride()
    })
  }

  // ---- colour: comes only from the shader (BlobLookDriver) ----
  // Called by ToyVolume whenever the state changes (0 off .. 3 high).
  setColourState(state: number): void {
    this.currentState = Math.max(0, Math.min(3, Math.round(state)))
    if (this.blob) this.blob.setState(state)
  }

  // Called by ToyAudioReact every frame: the smoothed stem level 0..1 (before volume), sent to the material as audioLevel.
  setAudioLevel(level: number): void {
    this.currentAudioLevel = level
    if (this.blob) this.blob.setAudioLevel(level)
  }

  // Called by ToyAudioReact every frame: the level the glitter VFX follows (0..1, before volume).
  setGlitterLevel(level: number): void {
    this.currentGlitterLevel = level
  }

  // ---- unit: this toy plus its pad, as discs for the stage maths (stage-local cm) ----
  unitDiscs(): G.Unit {
    // disc 0 is whatever sits under the toy: the toy itself, or the pad's circle if that is bigger
    const base = this.baseDiameterProvider ? this.baseDiameterProvider() : 0
    const u: G.Unit = [{ dx: 0, dz: 0, d: Math.max(this.footprint(), base) }]
    const strip = this.padDiscProvider ? this.padDiscProvider() : []
    for (const d of strip) u.push(d)
    return u
  }

  // Diameters for the free-space check: what is under the toy, and ONE disc with the same area as the strip
  // (the strip's own discs overlap, so adding them all up would count its area several times).
  unitFootprints(): number[] {
    const base = this.baseDiameterProvider ? this.baseDiameterProvider() : 0
    const out = [Math.max(this.footprint(), base)]
    const eq = this.padEquivalentProvider ? this.padEquivalentProvider() : 0
    if (eq > 0) out.push(eq)
    return out
  }

  // Called by ToyShape after it gave the Visual a new mesh: the bounds changed, so the touch box is rebuilt.
  onBlobMeshChanged(): void {
    this.colliderKey = ""
  }

  // Called by ToyAudioReact each frame it sets the Visual itself.
  markDriven(): void {
    this.drivenAt = getTime()
  }

  // ---- shape: what the Visual child looks like at rest (before the music moves it) ----
  // Size Multiplier kept inside the safe range (blobs stay hand-holdable and clear of neighbours). A value outside
  // the range is clamped and a warning is logged once per value.
  private safeMultiplier(): number {
    const v = this.sizeMultiplier
    const k = Math.min(SIZE_MULTIPLIER_MAX, Math.max(SIZE_MULTIPLIER_MIN, v))
    if (k !== v && v !== this.warnedMultiplier) {
      this.warnedMultiplier = v
      console.warn("[ToyConfig] " + this.sceneObject.name + ": Size Multiplier " + v + " is outside " + SIZE_MULTIPLIER_MIN + " - " + SIZE_MULTIPLIER_MAX + ", using " + k + ".")
    }
    return k
  }

  // THE rest scale of the blob: Base Blob Scale (cm) x Size Multiplier x Shape Proportions. This is the scale of
  // the Visual when settled, and the only source of truth for "settled size". Music, squish and poke multiply on
  // top of it and settling returns to it. The base mesh is 1.0 on its longest side, so this is also its size in cm.
  restScale(): vec3 {
    const k = this.g().baseBlobScale * this.safeMultiplier()
    const p = this.shapeProportions
    return new vec3(k * p.x, k * p.y, k * p.z)
  }

  // The blob's size at rest in cm: the rest scale times the mesh's own size (Fit To Mesh Bounds) or times 1.
  realSize(): vec3 {
    const s = this.restScale()
    const b = this.meshBounds()
    return b ? new vec3(s.x * b.size.x, s.y * b.size.y, s.z * b.size.z) : s
  }

  // The mesh's own bounds (the mesh asset's units), or null when Fit To Mesh Bounds is off or there is no mesh.
  private meshBounds(): { min: vec3; max: vec3; size: vec3 } | null {
    if (!this.fitToMeshBounds || !this.visual) return null
    if (!this.visualRmv) this.visualRmv = this.visual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    const m = this.visualRmv ? this.visualRmv.mesh : null
    if (!m) return null
    const size = m.aabbMax.sub(m.aabbMin)
    if (size.x < 0.00001 || size.y < 0.00001 || size.z < 0.00001) return null
    return { min: m.aabbMin, max: m.aabbMax, size: size }
  }

  // The mesh's lowest and highest point in its own units (the base blob is 1 on its longest side, so about -0.5..0.5).
  // Used to pivot the rocking and to tell the deform shader where the base is. Falls back to -0.5..0.5.
  meshHeightRange(): { min: number; max: number } {
    if (!this.visual) return { min: -0.5, max: 0.5 }
    if (!this.visualRmv) this.visualRmv = this.visual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    const m = this.visualRmv ? this.visualRmv.mesh : null
    if (!m || m.aabbMax.y - m.aabbMin.y < 0.00001) return { min: -0.5, max: 0.5 }
    return { min: m.aabbMin.y, max: m.aabbMax.y }
  }

  shapeRotation(): quat {
    const d = Math.PI / 180
    return quat.fromEulerVec(new vec3(this.visualRotation.x * d, this.visualRotation.y * d, this.visualRotation.z * d))
  }

  shapePosition(): vec3 {
    const lift = this.autoRestOnFloor ? this.restLift() : 0
    return this.visualOffset.add(new vec3(0, lift, 0))
  }

  // How far the Visual is lifted so the blob rests on the stage floor (cm).
  private restLift(): number {
    const b = this.meshBounds()
    if (!b) return this.restScale().y * 0.5 // old rule: the mesh fills a 1x1x1 box centred on its pivot
    // Fit To Mesh Bounds: the lowest corner of the scaled, rotated bounds, so the pivot can be anywhere.
    // (If the Visual is rotated, the box corner is a little lower than the blob itself, so it rests a touch high.)
    const s = this.restScale()
    const q = this.shapeRotation()
    let low = Infinity
    for (const x of [b.min.x, b.max.x]) {
      for (const y of [b.min.y, b.max.y]) {
        for (const z of [b.min.z, b.max.z]) {
          low = Math.min(low, q.multiplyVec3(new vec3(x * s.x, y * s.y, z * s.z)).y)
        }
      }
    }
    return -low
  }

  // The squish on top of a scale: height shrinks by `squish`, width and depth grow by `squish` x bulge.
  // The visual footprint and the landing rules use the rest shape only, so a squashed toy never changes where
  // other toys may land.
  squishedScale(s: vec3): vec3 {
    const q = this.squish
    if (q === 0) return s
    const side = Math.max(0.2, 1 + q * this.rSquishBulge)
    return new vec3(s.x * side, s.y * Math.max(0.2, 1 - q), s.z * side)
  }

  // How far to lift the mesh so a squashed (or stretched) blob keeps its base on the stage floor.
  squishLift(before: vec3, after: vec3): number {
    if (!this.autoRestOnFloor) return 0
    const b = this.meshBounds()
    // old rule: the base is half a height below the pivot. Fit To Mesh Bounds: it is min.y x scale below it.
    return b ? -b.min.y * (after.y - before.y) : (after.y - before.y) * 0.5
  }

  applyShape(): void {
    if (!this.visual) return
    const t = this.visual.getTransform()
    const base = this.restScale()
    const sq = this.squishedScale(base)
    t.setLocalScale(sq)
    t.setLocalPosition(this.shapePosition().add(new vec3(0, this.squishLift(base, sq), 0)))
    t.setLocalRotation(this.shapeRotation())
    this.applyColliderOverride()
  }

  // When you typed a collider size, or Fit To Mesh Bounds is on: set the box. A typed size measures that many cm
  // after the Visual's scale. With Fit To Mesh Bounds, the other axes are the mesh's own size, so the box fits the
  // blob. (Left alone otherwise, so the default 1x1x1 collider keeps following the stretched shape by itself.)
  // The box is centred on the pivot (a box shape has no offset), so a mesh whose bounds are off-centre is
  // fitted in size but not shifted.
  private applyColliderOverride(): void {
    const o = this.colliderSizeOverride
    const b = this.meshBounds()
    if (o.x <= 0 && o.y <= 0 && o.z <= 0 && !b) return
    const col = this.visual.getComponent("Component.ColliderComponent") as ColliderComponent
    if (!col) return
    const s = this.restScale()
    const key = [o.x, o.y, o.z, s.x, s.y, s.z, b ? b.size.x : 0, b ? b.size.y : 0, b ? b.size.z : 0].join("|")
    if (key === this.colliderKey) return // only rebuild the box when a number changed
    this.colliderKey = key
    const auto = b ? b.size : new vec3(1, 1, 1)
    const box = Shape.createBoxShape()
    box.size = new vec3(
      o.x > 0 ? o.x / Math.max(0.001, s.x) : auto.x,
      o.y > 0 ? o.y / Math.max(0.001, s.y) : auto.y,
      o.z > 0 ? o.z / Math.max(0.001, s.z) : auto.z
    )
    col.shape = box
  }

  // Footprint DIAMETER on the stage floor (cm): the override, or the widest side of the stretched, rotated
  // box (a blob always fits inside its box, so this never lets it poke past the rim or a neighbour).
  footprint(): number {
    if (this.footprintOverride > 0) return this.footprintOverride
    const s = this.realSize()
    const q = this.shapeRotation()
    const ex = q.multiplyVec3(new vec3(s.x * 0.5, 0, 0))
    const ey = q.multiplyVec3(new vec3(0, s.y * 0.5, 0))
    const ez = q.multiplyVec3(new vec3(0, 0, s.z * 0.5))
    const hx = Math.abs(ex.x) + Math.abs(ey.x) + Math.abs(ez.x)
    const hz = Math.abs(ex.z) + Math.abs(ey.z) + Math.abs(ez.z)
    return 2 * Math.max(hx, hz)
  }

  // ---- resolved values: override if switched on, otherwise the global value ----
  private g(): StageConfig {
    return StageConfig.instance as StageConfig
  }

  volumeList(): number[] {
    return this.overrideVolumes
      ? [this.volumes.x, this.volumes.y, this.volumes.z, this.volumes.w]
      : this.g().volumes()
  }
  get rReactAmount(): number { return this.feel ? this.feel.reactAmount : FEEL_RANGES.reactAmount.def }
  get rScaleAmount(): number { return this.feel ? this.feel.scalePulse : FEEL_RANGES.scalePulse.def }
  get rPositionAmount(): number { return this.feel ? this.feel.bounceCm : FEEL_RANGES.bounceCm.def }
  get rRotationAmount(): number { return this.feel ? this.feel.wobbleDegrees : FEEL_RANGES.wobbleDegrees.def }
  get rDriftSpeed(): number { return this.feel ? this.feel.driftSpeed : FEEL_RANGES.driftSpeed.def }
  get rSettleDuration(): number { return this.feel ? this.feel.settleSeconds : FEEL_RANGES.settleSeconds.def }
  get rPokeSquash(): number { return this.feel ? this.feel.pokeSquash : FEEL_RANGES.pokeSquash.def }
  get rLandSquash(): number { return this.feel ? this.feel.landSquash : FEEL_RANGES.landSquash.def }
  get rGrabStretch(): number { return this.feel ? this.feel.grabStretch : FEEL_RANGES.grabStretch.def }
  get rSquishBulge(): number { return this.feel ? this.feel.squishBulge : FEEL_RANGES.squishBulge.def }
  get rSquishFrequency(): number { return this.feel ? this.feel.squishHz : FEEL_RANGES.squishHz.def }
  get rSquishDamping(): number { return this.feel ? this.feel.damping : FEEL_RANGES.damping.def }
  // This toy's own wobble speed (radians per second) and starting phase (radians), from its Feel seed.
  get rWobbleRate(): number { return this.feel ? this.feel.wobbleRate : 7 }
  get rWobblePhase(): number { return this.feel ? this.feel.wobblePhase : 0 }
}
