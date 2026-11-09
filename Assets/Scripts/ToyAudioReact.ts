// ToyAudioReact - makes a toy move to the music of its OWN stem.
// It reads the loudness (RMS) of the stem (StemLevel.ts), scaled to that stem's own range (auto-level, because
// some stems are much quieter than others). Hits (onsets) in that loudness kick two springs (ToyMotionMath.ts): a
// "pop" spring (taller and thinner, volume kept, then a slight rebound) and a pair of rock springs (tilting around
// the toy's BASE, each hit in a new direction). The result is multiplied by the toy's volume state, because the
// reading is taken BEFORE volume. Only the toy's `Visual` child moves.
// With StageConfig > Shader Deform ON, the squash, sway and ripples go to the material instead (ToyShaderDeform.ts)
// and only the bounce stays on the Visual.
// "Off" toys stay still unless "React When Off" is on in StageConfig.
// Settings: StageConfig (Audio-reactive motion switches, Comfort limiter) and this toy's ToyShape > Feel.

import { StageConfig } from "./StageConfig"
import { ToyConfig } from "./ToyConfig"
import { ToyVolume } from "./ToyVolume"
import { BandLevels, StemLevelReader, StemLevelSettings } from "./StemLevel"
import { OnsetDetector, Spring } from "./ToyMotionMath"
import { FEEL_RANGES, FeelParams, rand01 } from "./ToyFeel"
import { DeformState, ShaderDeformWriter, newDeformState } from "./ToyShaderDeform"
import { ToyInteraction } from "./ToyInteraction"
import { NearTracker, breath01, phaseFor } from "./Alive"

const GOLDEN_ANGLE = 2.4 // radians: each hit rocks the toy in a new direction

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// the toy's volume-state factor (0 when Off unless "React When Off")
function factor0(vol: ToyVolume, cfg: StageConfig): number {
  return vol.getState() === 0 ? (cfg.reactWhenOff ? cfg.idleMotionAmount : 0) : vol.motionFactor()
}

@component
export class ToyAudioReact extends BaseScriptComponent {
  private cfg: StageConfig
  private toyCfg: ToyConfig
  private vol: ToyVolume
  private audio: AudioComponent

  private visual: SceneObject | null = null
  private ready: boolean = false

  @input
  @hint("Glow warm-up: seconds (s) for the core glow (coreHeat) to rise toward the loudness. Larger = slower rise.")
  glowWarmUpSeconds: number = 1.5
  @input
  @hint("Glow cool-down: seconds (s) for the core glow (coreHeat) to fall when the music gets quieter. Larger = slower fade.")
  glowCoolDownSeconds: number = 3

  @input
  @hint("Alive glow scale for THIS toy (unitless multiplier, 1 = the StageConfig > Alive and hover values; 0 = this toy has no resting or near glow). Scales both the breathing glow while off and the rise when a hand is near.")
  aliveScale: number = 1
  @input
  @hint("Lean scale for THIS toy (unitless multiplier, 1 = the StageConfig > Alive and hover lean; 0 = this toy never leans; 2 = leans twice as far).")
  leanScale: number = 1

  private inter: ToyInteraction | null = null
  private near: NearTracker = new NearTracker() // is a hand close to this toy (Alive.ts)
  private aliveHeat: number = 0 // 0..1: the resting + near glow, added to the music's coreHeat
  private leanX: Spring = new Spring() // lean toward the hand, left-right (-1..1 of the full lean), in the toy's own space
  private leanZ: Spring = new Spring() // lean toward the hand, front-back
  private leanDegX: number = 0 // degrees: the lean this frame, left-right (after caps)
  private leanDegZ: number = 0 // degrees: the lean this frame, front-back (after caps)
  private coreHeat: number = 0 // 0..1: slow follower of this stem's loudness, sent to the material as coreHeat
  private level: number = 0 // smoothed 0..1: what the KICK follows (the whole stem unless the band split is on)
  private levelSway: number = 0 // smoothed 0..1: what the SWAY follows
  private levelVfx: number = 0 // smoothed 0..1: what the glitter follows
  private bands: BandLevels = new BandLevels()
  private swayOnsets: OnsetDetector = new OnsetDetector() // hits for the sway (the kick has its own below)
  private reader: StemLevelReader | null = null // reads this toy's stem loudness (StemLevel.ts)
  // the reader's settings: StageConfig's, with this toy's own Level Floor on top (reused every frame)
  private readSettings: StemLevelSettings = { autoLevel: true, levelDecaySeconds: 8, levelFloor: 0.005, levelReference: 0.1, analysisSamples: 512 }

  private onsets: OnsetDetector = new OnsetDetector()
  private pop: Spring = new Spring() // the beat spring: + = taller and thinner, - = the rebound
  private rockRoll: Spring = new Spring() // rocking around the front-to-back axis
  private rockPitch: Spring = new Spring() // rocking around the left-to-right axis
  private rockAngle: number = 0 // radians: direction of the next rock
  private noiseTime: number = 0 // seconds: this toy's own ripple clock
  private writer: ShaderDeformWriter | null = null
  private deformState: DeformState = newDeformState()
  private deformWasOn: boolean = false

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => {
      this.toyCfg = this.sceneObject.getComponent(ToyConfig.getTypeName()) as ToyConfig
      this.vol = this.sceneObject.getComponent(ToyVolume.getTypeName()) as ToyVolume
      this.inter = this.sceneObject.getComponent(ToyInteraction.getTypeName()) as ToyInteraction
    })
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  // Set up lazily on the first frame, after every OnStart (the stem is assigned in ToyVolume's OnStart).
  private setup(): boolean {
    if (this.ready) return true
    if (!this.toyCfg || !this.vol) return false
    this.audio = this.vol.getAudio()
    this.visual = this.toyCfg.visual
    if (!this.audio || !this.audio.audioTrack || !this.visual) return false
    this.reader = new StemLevelReader(this.sceneObject.name)
    const rmv = this.visual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    this.writer = rmv ? new ShaderDeformWriter(rmv) : null
    this.rockAngle = 2 * Math.PI * rand01(this.toyCfg.rWobblePhase, 5)
    this.ready = true
    return true
  }

  private restore(): void {
    if (!this.ready || !this.visual) return
    const t = this.visual.getTransform()
    t.setLocalScale(this.toyCfg.restScale())
    t.setLocalPosition(this.toyCfg.shapePosition())
    t.setLocalRotation(this.toyCfg.shapeRotation())
    this.toyCfg.markDriven()
    this.toyCfg.setAudioLevel(0)
    this.toyCfg.setGlitterLevel(0)
    this.setDeformOff()
    this.coreHeat = 0
    if (this.writer) this.writer.writeCore(0)
  }

  // The deform shader shows nothing (amount 0). Written once when it is switched off.
  private setDeformOff(): void {
    if (!this.deformWasOn || !this.writer) return
    this.deformWasOn = false
    const d = this.deformState
    d.amount = 0
    d.kick = 0
    d.squash = 0
    d.swayX = 0
    d.swayZ = 0
    d.noiseStrength = 0
    this.writer.write(d)
  }

  // The "alive" reaction (StageConfig > Alive and hover): a resting glow that breathes while the toy is off, a rise in
  // the core glow when a hand is close, and a lean toward the hand. Sets this.aliveHeat and this.leanDegX / leanDegZ.
  private updateAlive(dt: number): void {
    const c = this.cfg
    const on = c.aliveEnabled && c.aliveToyEnabled && !!this.visual
    let heatGoal = 0
    let tx = 0
    let tz = 0
    if (on) {
      const centre = this.visual!.getTransform().getWorldPosition()
      const hovered = this.inter ? this.inter.isHovered() : false
      this.near.update(dt, c, centre, this.toyCfg.footprint() * 0.5, c.aliveToyInnerCm, c.aliveToyOuterCm, hovered)
      const off = this.vol.getState() === 0
      const rest = off ? c.aliveIdleHeat * breath01(c.aliveBreathSeconds, phaseFor(this.sceneObject.name, c.aliveStagger)) : 0
      heatGoal = clamp((rest + c.aliveNearHeat * this.near.amount) * Math.max(0, this.aliveScale), 0, 1)

      // lean: only while the toy stands on its socket (not carried or flying home), and only toward a fingertip
      const canLean = c.aliveLeanEnabled && !(this.inter && this.inter.isAway()) && (c.aliveLeanWhenOff || !off)
      if (canLean) {
        const local = this.sceneObject.getTransform().getWorldRotation().invert().multiplyVec3(this.near.dirWorld)
        const len = Math.hypot(local.x, local.z)
        if (len > 0.0001) {
          const a = this.near.distAmount * this.near.dirStrength
          tx = (local.x / len) * a
          tz = (local.z / len) * a
        }
      }
    } else {
      this.near.reset()
    }
    const k = c.aliveEaseSeconds <= 0 ? 1 : 1 - Math.exp(-dt / c.aliveEaseSeconds)
    this.aliveHeat += (heatGoal - this.aliveHeat) * k

    this.leanX.step(dt, c.aliveLeanHz, c.aliveLeanDamping, tx, -1.5, 1.5)
    this.leanZ.step(dt, c.aliveLeanHz, c.aliveLeanDamping, tz, -1.5, 1.5)
    const L = c.comfortLimits()
    const cap = Math.max(0, L.enabled ? Math.min(c.aliveLeanMaxDegrees, L.maxWobbleDegrees) : c.aliveLeanMaxDegrees)
    let dx = this.leanX.x * c.aliveLeanDegrees * Math.max(0, this.leanScale)
    let dz = this.leanZ.x * c.aliveLeanDegrees * Math.max(0, this.leanScale)
    const len = Math.hypot(dx, dz)
    if (len > cap && len > 0) {
      dx *= cap / len
      dz *= cap / len
    }
    this.leanDegX = Math.abs(dx) < 0.001 ? 0 : dx
    this.leanDegZ = Math.abs(dz) < 0.001 ? 0 : dz
  }

  private onUpdate(): void {
    if (!this.cfg) return
    if (!this.cfg.audioReactiveEnabled) {
      this.restore()
      return
    }
    if (!this.setup()) return
    const dt = getDeltaTime()
    const now = getTime()
    const tc = this.toyCfg
    const fe = tc.feel
    const fv = (k: keyof FeelParams): number => (fe ? fe[k] : FEEL_RANGES[k].def)

    const rs = this.readSettings
    rs.autoLevel = this.cfg.autoLevel
    rs.levelDecaySeconds = this.cfg.levelDecaySeconds
    rs.levelReference = this.cfg.levelReference
    rs.analysisSamples = this.cfg.analysisSamples
    const ownFloor = fv("levelFloor")
    rs.levelFloor = ownFloor > 0 ? ownFloor : this.cfg.levelFloor // 0 = use the StageConfig value
    // One loudness for everything, or (Band Split Hz above 0) lows and highs mixed separately for kick, sway and VFX
    const splitHz = fv("bandSplitHz")
    let raw: number
    let rawSway: number
    let rawVfx: number
    if (splitHz > 0) {
      const b = this.bands
      this.reader!.readBands(this.audio, rs, dt, splitHz, b)
      const mix = (k: keyof FeelParams): number => b.low + (b.high - b.low) * clamp(fv(k), 0, 1)
      raw = mix("bandMixKick")
      rawSway = mix("bandMixSway")
      rawVfx = mix("bandMixVfx")
    } else {
      raw = this.reader!.read(this.audio, rs, dt)
      rawSway = raw
      rawVfx = raw
    }
    const s = this.cfg.reactSmoothing
    const follow = s <= 0 ? 1 : 1 - Math.exp(-dt / s)
    this.level += (raw - this.level) * follow
    this.levelSway += (rawSway - this.levelSway) * follow
    this.levelVfx += (rawVfx - this.levelVfx) * follow

    // core glow: follows the loudness slowly (own rise / fall times); 0 for a toy that is Off
    const heatTarget = clamp(this.level, 0, 1) * clamp(factor0(this.vol, this.cfg), 0, 1)
    const tau = heatTarget > this.coreHeat ? this.glowWarmUpSeconds : this.glowCoolDownSeconds
    this.coreHeat += (heatTarget - this.coreHeat) * (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau))
    this.updateAlive(dt)
    if (this.writer) this.writer.writeCore(clamp(this.coreHeat + this.aliveHeat, 0, 1)) // music glow + alive glow

    tc.setAudioLevel(this.level) // sent to the material as audioLevel (0..1)
    tc.setGlitterLevel(this.levelVfx) // followed by the glitter VFX (GlitterDriver)

    // the reading ignores volume, so scale by the toy's state ourselves
    let factor = 0
    if (this.vol.getState() === 0) factor = this.cfg.reactWhenOff ? this.cfg.idleMotionAmount : 0
    else factor = this.vol.motionFactor()
    const m = factor * tc.rReactAmount

    // hits kick the springs; steady loudness only leans the pop a little (Sustain)
    const hit = this.onsets.update(raw, now, dt, fv("onsetSensitivity"), fv("hitSpacing")) * clamp(m, 0, 1)
    const swayHit = this.swayOnsets.update(rawSway, now, dt, fv("onsetSensitivity"), fv("hitSpacing")) * clamp(m, 0, 1)
    const kickHz = fv("kickHz")
    const zeta = fv("kickDamping")
    const rockHz = tc.rWobbleRate / (2 * Math.PI)
    const sig = tc.signals
    if (hit > 0) {
      this.pop.kick(hit, kickHz)
      sig.hitSeq++
      sig.hitStrength = hit
    }
    if (swayHit > 0) {
      sig.swaySeq++
      sig.swayStrength = swayHit
      this.rockAngle += GOLDEN_ANGLE
      this.rockRoll.kick(swayHit * Math.sin(this.rockAngle), rockHz)
      this.rockPitch.kick(swayHit * Math.cos(this.rockAngle), rockHz)
    }
    this.pop.step(dt, kickHz, zeta, fv("sustain") * this.level * m, -1, 1.5)
    this.rockRoll.step(dt, rockHz, zeta, 0, -1.5, 1.5)
    this.rockPitch.step(dt, rockHz, zeta, 0, -1.5, 1.5)

    // The shape from ToyConfig (Inspector stretch, size, offset, rotation) is the BASE; the music is applied on
    // top of it. Scale is multiplied (never overwritten), so a stretched blob moves in its own proportions.
    const baseScale = tc.restScale()
    const basePos = tc.shapePosition()
    const baseRot = tc.shapeRotation()
    tc.markDriven()
    const t = this.visual!.getTransform()
    // comfort limiter: however strong the toy's Feel or React Amount, the pop, bounce and rocking stay under the caps
    const L = this.cfg.comfortLimits()
    const popAmt = tc.rScaleAmount * this.pop.x // fraction: + = taller, - = flatter
    const pop = L.enabled ? clamp(popAmt, -L.maxSquash, L.maxScalePulse) : popAmt
    const bounce = L.enabled ? Math.min(L.maxBounceCm, tc.rPositionAmount * Math.max(0, this.pop.x)) : tc.rPositionAmount * Math.max(0, this.pop.x)
    const maxTilt = L.enabled ? L.maxWobbleDegrees : 10
    const toRad = Math.PI / 180
    // the lean toward the hand (this.leanDegX / leanDegZ) is added on top of the music's rocking:
    // top toward +z = pitch, top toward +x = minus roll (right-handed axes, small angles)
    const roll = (this.cfg.reactRotation ? clamp(tc.rRotationAmount * this.rockRoll.x, -maxTilt, maxTilt) * toRad : 0) - this.leanDegX * toRad
    const pitch = (this.cfg.reactRotation ? clamp(tc.rRotationAmount * this.rockPitch.x, -maxTilt, maxTilt) * toRad : 0) + this.leanDegZ * toRad

    // publish for other scripts (ToyConfig.signals): read only, nothing here changes the motion
    sig.level = this.level
    sig.levelSway = this.levelSway
    sig.levelVfx = this.levelVfx
    sig.bandLow = splitHz > 0 ? this.bands.low : 0
    sig.bandHigh = splitHz > 0 ? this.bands.high : 0
    sig.pop = this.pop.x
    sig.rockX = this.rockRoll.x
    sig.rockZ = this.rockPitch.x
    sig.coreHeat = this.coreHeat
    sig.squash = clamp(-pop + tc.squish, -1, 1)

    const mode = tc.shaderDeformMode // 0 follow the stage switch, 1 on, 2 off (this toy only)
    const deform = (mode === 1 || (mode === 0 && this.cfg.shaderDeform)) && this.writer !== null
    // Volume-preserving pop: height x (1 + pop), width and depth x 1 / sqrt(1 + pop). In deform mode the shader does it.
    let musicScale = baseScale
    if (!deform && this.cfg.reactScale) {
      const h = 1 + pop
      const w = 1 / Math.sqrt(h)
      musicScale = new vec3(baseScale.x * w, baseScale.y * h, baseScale.z * w)
    }
    // the poke / landing / grab squish (ToySquish) is applied on top of the music, keeping the base on the floor
    const finalScale = tc.squishedScale(musicScale)
    t.setLocalScale(finalScale)
    const lift = new vec3(0, tc.squishLift(baseScale, finalScale), 0)
    let pos = (this.cfg.reactPosition ? basePos.add(new vec3(0, bounce, 0)) : basePos).add(lift)
    let rot = baseRot
    if (!deform && (roll !== 0 || pitch !== 0)) {
      // rock around the toy's BASE, not its middle: turn about the point at the bottom of the blob
      const q = quat.angleAxis(pitch, vec3.right()).multiply(quat.angleAxis(roll, vec3.forward()))
      const toBase = baseRot.multiplyVec3(new vec3(0, tc.meshHeightRange().min * finalScale.y, 0))
      pos = pos.add(toBase).sub(q.multiplyVec3(toBase))
      rot = q.multiply(baseRot)
    }
    t.setLocalPosition(pos)
    t.setLocalRotation(rot)

    if (deform) {
      const d = this.deformState
      const range = tc.meshHeightRange()
      this.noiseTime = (this.noiseTime + dt * fv("noiseSpeed")) % 1000
      d.amount = 1
      d.kick = this.pop.x
      d.squash = this.cfg.reactScale ? -pop : 0 // the shader's squash: + = flatter and wider
      d.swayX = this.cfg.reactRotation ? fv("swayAmount") * this.rockRoll.x : 0
      d.swayZ = this.cfg.reactRotation ? fv("swayAmount") * this.rockPitch.x : 0
      if (this.leanDegX !== 0 || this.leanDegZ !== 0) {
        // the lean as a sideways shift of the top: tan(angle) x blob height (mesh units), in the blob's own axes
        const m = baseRot.invert().multiplyVec3(new vec3(this.leanDegX, 0, this.leanDegZ))
        const height = range.max - range.min
        d.swayX += Math.tan(m.x * toRad) * height
        d.swayZ += Math.tan(m.z * toRad) * height
      }
      d.noiseStrength = fv("noiseAmount") * clamp(m, 0, 1) * (0.35 + 0.65 * this.level)
      d.noiseScale = fv("noiseScale")
      d.noiseTime = this.noiseTime
      d.noiseSeed = 100 * rand01(fv("feelSeed"), 3)
      d.reachBaseY = range.min
      d.reachHeight = range.max - range.min
      this.writer!.write(d)
      this.deformWasOn = true
    } else {
      this.setDeformOff()
    }
  }
}
