// WaveField - ONE big quad on the table where the waves of ALL sockets live together, so they can interfere like
// ripples on water (crest + crest = a higher crest, crest + trough = flat).
//
// What this script does (and does not do)
//   - It keeps a small POOL of waves (max 8). A wave is plain data: where it started (stage-local cm), its age (s),
//     its strength (0..1). Waves are started by ToyPad (on hits and on landing) through WaveField.instance.spawn().
//   - Every frame it sends NUMBERS to your Wave_Mat material (nothing is made in code: the quad, its mesh and its
//     material are yours; the look is your shader graph). It places and sizes the quad, and DISABLES it while no
//     wave is alive, so it costs nothing when quiet.
//   - A wave stays where it started. If a socket is moved later, waves already travelling do not follow it.
//
// The wave shape (the shader and heightAt() below use the same formula, so a later push on the toys can read it):
//     d  = distance (cm) from the wave's start        r = Wave Speed x age        x = d - r  (negative = behind the front)
//     envelope = exp(-(x / sigma)^2), sigma = Wave Width ahead of the front and Wave Width x Wave Trail behind it
//     height = strength x envelope x cos(2 pi x / Wave Length) / sqrt(1 + Wave Falloff x r / Wave Length)
//   All waves are ADDED as signed heights. The picture shows crests only (max(height, 0)), so where a crest meets a
//   trough they cancel and leave a gap: that is the interference.
//
// Material parameters written to the Visual of the "Field Visual" object (mainPassOverrides):
//   wave0 .. wave7   Float Parameter, Channels xyzw:  x = u, y = v (0..1 across the quad), z = age (s), w = visible strength 0..1
//                    (w = 0 means "slot empty"). The prefix "wave" is changeable in StageConfig > Wave field.
//   waveShape        Float Parameter, Channels xyzw: x = Wave Speed (cm/s), y = Wave Length (cm), z = Wave Width (cm), w = Wave Trail (x)
//   waveMisc         Float Parameter, Channels xyzw: x = quad side (cm), y = Wave Falloff, z = Edge Fade (cm), w = Wave Start Radius (cm)
// All settings are in StageConfig > Wave field (shared). This script has no settings of its own except the quad slot.

import { StageConfig } from "./StageConfig"
import { StageBounds } from "./StageBounds"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"

const MAX_WAVES = 8

// 0 = a toy's wave (hits and landings), 1 = a finger tap. The kind picks the colour in Wave_Mat and which slots a wave may replace.
export const WAVE_KIND_TOY = 0
export const WAVE_KIND_TAP = 1

type Wave = {
  kind: number // WAVE_KIND_TOY or WAVE_KIND_TAP
  owner: string // who started it (a pad name): used so one socket's quick hits merge instead of piling up
  x: number // stage-local cm where it started
  z: number
  age: number // s
  strength: number // 0..1 (before the end-of-life fade)
}

export interface WaveSpawnInfo {
  kind: number
  owner: string
  x: number
  z: number
  strength: number
}

@component
export class WaveField extends BaseScriptComponent {
  @input
  @hint("The big quad the waves are drawn on: an object with a RenderMeshVisual using your Wave_Mat (a flat 1 x 1 cm quad such as Pad_Plane.mesh). Keep it DISABLED in the scene; this script enables it only while a wave is alive, sizes it (cm) and lays it flat on the stage. Empty = no shared waves.")
  fieldVisual: SceneObject

  @input
  @allowUndefined
  @hint("Preview testing only: the Camera used to turn a mouse click into a spot on the table. Assign your main Camera. With it set, clicking in the Preview window starts a wave where the click lands on the stage plane (needs Shared Wave Field ON). Empty = mouse test off (key 8 and the test loop still work). Ignored on a device.")
  testCamera: Camera

  // Fires when a wave starts (not for a hit that merges into an existing wave): for your own reactions.
  public onWaveStart: Event<WaveSpawnInfo> = new Event()

  // TapWaves sets this so a Preview mouse click becomes a TAP wave (with the falloff and the tap colour) instead of a
  // plain test wave. It gets the spot (stage-local cm) and returns true if it handled the click.
  public mouseTapHandler: ((x: number, z: number) => boolean) | null = null

  static instance: WaveField | null = null
  private static waiting: Array<(w: WaveField) => void> = []
  static whenAvailable(cb: (w: WaveField) => void): void {
    if (WaveField.instance) cb(WaveField.instance)
    else WaveField.waiting.push(cb)
  }

  private cfg: StageConfig
  private bounds: StageBounds | null = null
  private waves: Wave[] = []
  private shown: boolean = false
  private warned: boolean = false
  private warnedFull: boolean = false
  private warnedBounds: boolean = false
  private loggedDraw: boolean = false
  private testTimer: number = 0

  onAwake(): void {
    WaveField.instance = this
    for (const cb of WaveField.waiting) cb(this)
    WaveField.waiting = []
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => {
      if (this.cfg) this.bounds = this.cfg.getSceneObject().getComponent(StageBounds.getTypeName()) as StageBounds
      if (this.fieldVisual) this.fieldVisual.enabled = false
    })
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
    // Preview only: a mouse click starts a wave where the click ray meets the stage plane
    this.createEvent("TouchStartEvent").bind((e) => this.onMouse(e.getTouchPosition()))
    // Preview only: key 8 starts a test wave in the middle of the field (so the shader can be tested without a toy playing)
    this.createEvent("KeyPressEvent").bind((e) => {
      if (this.cfg && this.cfg.waveDebugLog) console.log("[WaveField] key event " + e.key + " (Eight is " + Keys.Eight + ")")
      if (!this.cfg || !global.deviceInfoSystem.isEditor() || e.key !== Keys.Eight) return
      const c = this.cfg.waveFieldCenter
      this.spawn("test", c.x, c.y, 1)
    })
  }

  // Preview only: where a screen point lands on the stage plane (stage-local cm), or null. Used for mouse clicks.
  screenToStage(screen: vec2): { x: number; z: number } | null {
    const c = this.cfg
    const log = !!c && c.waveDebugLog
    if (!c || !this.testCamera || !this.bounds || !global.deviceInfoSystem.isEditor()) {
      if (log) console.log("[WaveField] mouse test skipped: cfg=" + !!c + " testCamera=" + !!this.testCamera + " bounds=" + !!this.bounds + " editor=" + global.deviceInfoSystem.isEditor())
      return null
    }
    const a = this.testCamera.screenSpaceToWorldSpace(screen, 10)
    const b = this.testCamera.screenSpaceToWorldSpace(screen, 110)
    const dir = b.sub(a).normalize()
    const so = this.bounds.sceneObject.getTransform()
    const up = so.getWorldRotation().multiplyVec3(vec3.up())
    const planeY = c.padLift - c.padBaseDrop + c.rippleLift
    const planePt = this.bounds.localToWorld(new vec3(0, planeY, 0))
    const denom = dir.dot(up)
    if (Math.abs(denom) < 1e-4) {
      if (log) console.log("[WaveField] mouse ray is parallel to the stage plane: no wave")
      return null
    }
    const t = planePt.sub(a).dot(up) / denom
    if (t < 0) {
      if (log) console.log("[WaveField] stage plane is behind the camera for this click: no wave")
      return null
    }
    const local = this.bounds.worldToLocal(a.add(dir.uniformScale(t)))
    return { x: local.x, z: local.z }
  }

  // Mouse click (Preview only) -> a tap wave (when Tap Waves is ON and TapWaves exists) or else a plain test wave.
  private onMouse(screen: vec2): void {
    const c = this.cfg
    const log = !!c && c.waveDebugLog
    if (log) console.log("[WaveField] touch at screen (" + screen.x.toFixed(2) + ", " + screen.y.toFixed(2) + ")")
    const local = this.screenToStage(screen)
    if (!local) return
    if (log) console.log("[WaveField] mouse click at stage-local (" + local.x.toFixed(1) + ", " + local.z.toFixed(1) + ") cm")
    if (c.tapWavesEnabled && this.mouseTapHandler && this.mouseTapHandler(local.x, local.z)) return
    this.spawn("mouse", local.x, local.z, 1)
  }

  // Is the shared field in use? (ToyPad asks before sending a wave here instead of to its own ripple quad.)
  isActive(): boolean {
    return !!this.cfg && this.cfg.sharedWaveField && !!this.fieldVisual
  }

  // Start a wave at a stage-local spot (cm: x right, z toward you). strength 0..1 (a tap wave may go up to 2 when
  // Tap Wave Brightness is above 100 %). kind = WAVE_KIND_TOY (default) or WAVE_KIND_TAP.
  //  - if this owner's newest wave is younger than the minimum gap (Wave Min Gap, or Tap Min Gap for taps), the hit
  //    MERGES into it (strength += hit x Merge Gain, capped);
  //  - if all 8 slots are busy, the WEAKEST wave (the one nearest to fading out) gives up its slot, so rings rarely pop.
  //    A tap wave only ever replaces another tap wave once Tap Wave Max are alive, so taps cannot crowd out the toys.
  spawn(owner: string, x: number, z: number, strength: number, kind: number = WAVE_KIND_TOY): void {
    const c = this.cfg
    if (!c || !c.sharedWaveField || strength <= 0) return
    const isTap = kind === WAVE_KIND_TAP
    const cap = isTap ? 2 : 1
    const add = Math.min(cap, strength)
    if (c.waveDebugLog) console.log("[WaveField] spawn (" + (isTap ? "tap" : "toy") + ") from " + owner + " at (" + x.toFixed(1) + ", " + z.toFixed(1) + ") cm, strength " + add.toFixed(3) + ", waves alive " + this.waves.length)
    let newest: Wave | null = null
    for (const w of this.waves) if (w.owner === owner && (!newest || w.age < newest.age)) newest = w
    const gap = isTap ? Math.max(0, c.tapWaveMinGap) : c.waveMinGap
    if (newest && newest.age < gap) {
      newest.strength = Math.min(cap, newest.strength + add * Math.max(0, Math.min(1, c.waveMergeGain)))
      return
    }
    const w: Wave = { kind: kind, owner: owner, x: x, z: z, age: 0, strength: add }
    const weakestOf = (onlyTaps: boolean): number => {
      let best = -1
      for (let i = 0; i < this.waves.length; i++) {
        if (onlyTaps && this.waves[i].kind !== WAVE_KIND_TAP) continue
        if (best < 0 || this.visible(this.waves[i]) < this.visible(this.waves[best])) best = i
      }
      return best
    }
    const tapCount = this.waves.filter((q) => q.kind === WAVE_KIND_TAP).length
    const tapsFull = isTap && tapCount >= Math.max(1, Math.round(c.tapWaveMax))
    if (tapsFull) {
      this.waves.splice(weakestOf(true), 1)
    } else if (this.waves.length >= MAX_WAVES) {
      this.waves.splice(weakestOf(false), 1)
      if (!this.warnedFull) {
        this.warnedFull = true
        console.log("[WaveField] all 8 wave slots busy: the weakest wave was replaced (shown once). Raise Wave Min Gap or lower Wave Seconds for fewer waves.")
      }
    }
    this.waves.push(w)
    this.onWaveStart.invoke({ kind: kind, owner: owner, x: x, z: z, strength: add })
  }

  // Strength after the slow fade at the end of the wave's life (0..1).
  private visible(w: Wave): number {
    const c = this.cfg
    const life = Math.max(0.05, c.waveSeconds)
    const fs = Math.max(0, Math.min(life, c.waveFadeSeconds))
    if (fs <= 0) return w.strength
    const t = Math.max(0, Math.min(1, (w.age - (life - fs)) / fs))
    return w.strength * (1 - t * t * (3 - 2 * t))
  }

  // The summed wave height at a stage-local spot (cm), same formula as the shader, WITHOUT the quad-edge fade.
  // Nothing calls this yet: it is here so a later gentle push on the toys can read the waves.
  heightAt(x: number, z: number): number {
    const c = this.cfg
    if (!c) return 0
    let h = 0
    for (const w of this.waves) {
      const s = this.visible(w)
      if (s <= 0) continue
      const d = Math.sqrt((x - w.x) * (x - w.x) + (z - w.z) * (z - w.z))
      const r = c.waveStartRadiusCm() + c.waveSpeed * w.age
      if (d < c.waveStartRadiusCm()) continue // nothing inside the start circle (same as the shader)
      const xr = d - r
      const lam = Math.max(0.05, c.waveLength)
      // the packet grows out of the start circle: its size can never exceed the distance it has travelled (same as the shader)
      const grow = Math.max(r - c.waveStartRadiusCm(), 0.5 * lam)
      const sigma = Math.max(0.01, xr > 0 ? Math.min(c.waveWidth, grow) : Math.min(c.waveWidth * Math.max(0.01, c.waveTrail), grow))
      const env = Math.exp(-(xr / sigma) * (xr / sigma))
      h += (s * env * Math.cos((2 * Math.PI * xr) / lam)) / Math.sqrt(1 + (Math.max(0, c.waveFalloff) * r) / lam)
    }
    return h
  }

  private onUpdate(): void {
    const c = this.cfg
    if (!c || !this.fieldVisual || !this.bounds) {
      if (c && c.waveDebugLog && this.waves.length > 0 && !this.warnedBounds) {
        this.warnedBounds = true
        console.warn("[WaveField] waves exist but nothing is drawn: fieldVisual=" + !!this.fieldVisual + " StageBounds found=" + !!this.bounds)
      }
      return
    }
    const dt = getDeltaTime()
    if (c.waveTestLoop && c.sharedWaveField) {
      this.testTimer -= dt
      if (this.testTimer <= 0) {
        this.testTimer = 3
        this.spawn("test", c.waveFieldCenter.x, c.waveFieldCenter.y, 1)
      }
    }
    const life = Math.max(0.05, c.waveSeconds)
    for (const w of this.waves) w.age += dt
    this.waves = this.waves.filter((w) => w.age < life)
    if (!c.sharedWaveField || !c.rippleEnabled) this.waves = []

    if (this.waves.length === 0) {
      if (this.shown) {
        this.write(0) // every slot empty, then hide
        this.fieldVisual.enabled = false
        this.shown = false
      }
      return
    }
    if (!this.shown) {
      this.fieldVisual.enabled = true
      this.shown = true
    }
    this.place()
    this.write(this.waves.length)
    if (c.waveDebugLog && !this.loggedDraw) {
      this.loggedDraw = true
      const t = this.fieldVisual.getTransform()
      const p = t.getWorldPosition()
      const s = t.getWorldScale()
      const rmv = this.fieldVisual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      console.log("[WaveField] drawing: quad enabled=" + this.fieldVisual.enabled + " world pos (" + p.x.toFixed(1) + ", " + p.y.toFixed(1) + ", " + p.z.toFixed(1) + ") scale (" + s.x.toFixed(1) + ", " + s.y.toFixed(1) + ", " + s.z.toFixed(1) + ") material=" + (rmv && rmv.mainMaterial ? rmv.mainMaterial.name : "NONE") + " waves=" + this.waves.length)
    }
  }

  // Lay the quad flat on the stage, centred at Field Center, Field Size cm wide (picture only; never used for spacing).
  private place(): void {
    const c = this.cfg
    const unit = c.primitiveMeshSize > 0 ? c.primitiveMeshSize : 1
    const t = this.fieldVisual.getTransform()
    const y = c.padLift - c.padBaseDrop + c.rippleLift
    t.setWorldPosition(this.bounds.localToWorld(new vec3(c.waveFieldCenter.x, y, c.waveFieldCenter.y)))
    t.setWorldRotation(this.bounds.sceneObject.getTransform().getWorldRotation())
    const s = Math.max(1, c.waveFieldSize) / unit
    t.setWorldScale(new vec3(s, 1, s))
  }

  private write(count: number): void {
    const c = this.cfg
    const rmv = this.fieldVisual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!rmv || !rmv.mainMaterial) return
    const o = rmv.mainPassOverrides as any
    const size = Math.max(1, c.waveFieldSize)
    const cen = c.waveFieldCenter
    try {
      o["waveShape"] = new vec4(c.waveSpeed, c.waveLength, c.waveWidth, c.waveTrail)
      o["waveMisc"] = new vec4(size, c.waveFalloff, c.waveEdgeFade, c.waveStartRadiusCm())
      // which waves are finger taps (1) and which are toys (0), four per pack: waves 0..3 and 4..7; plus the tap colour.
      // Wave_Mat reads these once it has been updated (PLAN.md section 16); until then they are ignored.
      const kinds: number[] = []
      for (let i = 0; i < MAX_WAVES; i++) kinds.push(i < count && this.waves[i].kind === WAVE_KIND_TAP ? 1 : 0)
      o["waveKind0"] = new vec4(kinds[0], kinds[1], kinds[2], kinds[3])
      o["waveKind1"] = new vec4(kinds[4], kinds[5], kinds[6], kinds[7])
      o["tapWaveColor"] = c.tapWaveColor
      for (let i = 0; i < MAX_WAVES; i++) {
        const w = i < count ? this.waves[i] : null
        let v = new vec4(0.5, 0.5, 0, 0)
        if (w) {
          // stage-local cm -> 0..1 across the quad (Flip U / Flip V are for a quad whose UVs run the other way)
          let u = 0.5 + (w.x - cen.x) / size
          let vv = 0.5 + (w.z - cen.y) / size
          if (c.waveFlipU) u = 1 - u
          if (c.waveFlipV) vv = 1 - vv
          v = new vec4(u, vv, w.age, this.visible(w))
        }
        o[c.waveParamPrefix + i] = v
      }
    } catch (err) {
      if (!this.warned) {
        this.warned = true
        console.warn("[WaveField] could not write to the Wave material (" + err + "). Check Wave_Mat's parameter names (PLAN.md section 36) and StageConfig > Wave field.")
      }
    }
  }
}
