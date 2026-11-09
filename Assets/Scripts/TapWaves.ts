// TapWaves - a finger tap becomes a wave in the shared wave field (WaveField), with its own colour and brightness.
//
// What this script does
//   - It is the ONE door for taps: registerTap(x, z, ...) takes a spot on the stage (stage-local cm), works out how strong the
//     wave should be, and starts a TAP-kind wave in WaveField. Tap waves add to and cancel against toy waves like any other.
//   - Strength = Tap Wave Brightness (%) x the falloff near buttons and toys (below) x the tap's own strength (always 1 for
//     now: see "Tap strength" below).
//   - Falloff: inside Tap Avoid Socket Radius of a socket's centre, or Tap Avoid Toy Radius of a toy's centre, a tap makes no wave;
//     over the next Tap Avoid Margin (cm) it fades smoothly up to a full wave. All three numbers are in StageConfig > Tap waves.
//   - Phase 1 (this version): the only source of taps is a mouse click in the Editor Preview (WaveField turns the click into a
//     spot on the stage plane and hands it here). The finger-stroke detector and the on-beat bonus come in later steps and
//     will call registerTap() the same way.
//
// Tap strength (parked, but not blocked): every tap carries `speedCmPerSec` (how fast the finger came down; 0 for a mouse click)
// and `strength01` (0..1, always 1 now). When tap strength is wanted later, a detector only has to pass a different
// strength01; the wave, the falloff and the events already use it. Nothing else needs to change.
//
// Events for your own animation: onTap fires for every tap that makes a wave (after the falloff).
//
// Nothing here makes a mesh, material or shader. Units: cm, cm/s, seconds.

import { StageConfig } from "./StageConfig"
import { StageBounds } from "./StageBounds"
import { WaveField, WAVE_KIND_TAP } from "./WaveField"
import { ToyInteraction } from "./ToyInteraction"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"

export interface TapInfo {
  x: number // stage-local cm (x right, z toward you)
  z: number
  hand: string // "left", "right" or "mouse"
  source: string // "mouse" now; "hand" for the finger detector later
  speedCmPerSec: number // how fast the finger came down (0 for a mouse click). Recorded for later use, not used yet.
  strength01: number // 0..1 tap strength given by the source (always 1 for now)
  falloff: number // 0..1 weakening from buttons and toys (1 = none)
  waveStrength: number // what was sent to the wave field (0..2)
}

@component
export class TapWaves extends BaseScriptComponent {
  public onTap: Event<TapInfo> = new Event()

  static instance: TapWaves | null = null
  private static waiting: Array<(t: TapWaves) => void> = []
  static whenAvailable(cb: (t: TapWaves) => void): void {
    if (TapWaves.instance) cb(TapWaves.instance)
    else TapWaves.waiting.push(cb)
  }

  private cfg: StageConfig
  private bounds: StageBounds | null = null
  private field: WaveField | null = null

  onAwake(): void {
    TapWaves.instance = this
    for (const cb of TapWaves.waiting) cb(this)
    TapWaves.waiting = []
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => {
      if (this.cfg) this.bounds = this.cfg.getSceneObject().getComponent(StageBounds.getTypeName()) as StageBounds
      // the wave field may start after this script, so wait for it (no dependence on scene order)
      WaveField.whenAvailable((w) => {
        this.field = w
        w.mouseTapHandler = (x, z) => this.registerTap(x, z, "mouse", "mouse", 0, 1)
      })
    })
  }

  // The one door for taps. Returns true if a wave was started.
  registerTap(x: number, z: number, hand: string, source: string, speedCmPerSec: number, strength01: number): boolean {
    const c = this.cfg
    if (!c || !c.tapWavesEnabled || !this.field) return false
    if (!c.sharedWaveField) {
      if (c.tapDebugLog) console.log("[TapWaves] tap ignored: Shared Wave Field is OFF (tap waves live in the shared field)")
      return false
    }
    const fall = c.tapAvoidEnabled ? this.falloffAt(x, z) : 1
    const s01 = Math.max(0, Math.min(1, strength01))
    const wave = Math.max(0, Math.min(2, (c.tapWaveBrightness / 100) * fall * s01))
    if (c.tapDebugLog) console.log("[TapWaves] tap (" + source + ", " + hand + ") at (" + x.toFixed(1) + ", " + z.toFixed(1) + ") cm: falloff " + fall.toFixed(2) + ", wave strength " + wave.toFixed(2))
    if (fall < 0.02 || wave <= 0.001) return false
    this.field.spawn("tap_" + hand, x, z, wave, WAVE_KIND_TAP)
    this.onTap.invoke({ x: x, z: z, hand: hand, source: source, speedCmPerSec: speedCmPerSec, strength01: s01, falloff: fall, waveStrength: wave })
    return true
  }

  // 0..1: 0 inside a socket or toy (by its radius), 1 beyond the soft margin, smooth in between. The weakest zone wins.
  private falloffAt(x: number, z: number): number {
    const c = this.cfg
    let f = 1
    const margin = Math.max(0, c.tapAvoidMarginCm)
    const zone = (cx: number, cz: number, radius: number): number => {
      const d = Math.hypot(x - cx, z - cz)
      const r = Math.max(0, radius)
      if (d <= r) return 0
      if (margin <= 0.0001) return 1
      const t = Math.min(1, (d - r) / margin)
      return t * t * (3 - 2 * t) // smoothstep
    }
    for (const toy of c.toys) {
      if (!toy || !toy.enabled) continue
      const inter = toy.getComponent(ToyInteraction.getTypeName()) as ToyInteraction
      if (inter) {
        const s = inter.socketLocal()
        f = Math.min(f, zone(s.x, s.z, c.tapAvoidSocketRadius))
      }
      if (this.bounds) {
        const p = this.bounds.worldToLocal(toy.getTransform().getWorldPosition())
        f = Math.min(f, zone(p.x, p.z, c.tapAvoidToyRadius))
      }
    }
    return f
  }
}
