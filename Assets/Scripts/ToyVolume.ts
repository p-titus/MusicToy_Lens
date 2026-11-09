// ToyVolume - one toy's volume state: off -> low -> medium -> high -> off. A finger can also SLIDE along the pad's
// strip to set the volume continuously (setLevel): the four state volumes are then joined into one smooth scale,
// and the state (for colours) follows the nearest of the four.
// Every way of changing it (pad poke, pad click, air-poke) goes through requestCycle(), which keeps a short
// COOLDOWN (StageConfig > Pads > Volume Cooldown): after any change on this toy, further requests are ignored.
// That is what stops one finger action from changing the volume twice. The stem is never stopped or paused here:
// "off" is just volume 0, so every stem stays in sync. Volume glides to avoid clicks.
// Settings: the four volume levels and smoothing live in StageConfig (override per toy in ToyConfig).

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import { StageConfig } from "./StageConfig"
import { ToyConfig } from "./ToyConfig"

// Where a volume change came from: the pad (fingertip poke or click), the toy itself (air-poke), or code.
export type VolumeSource = "padPoke" | "padClick" | "padSlide" | "airPoke" | "code"
export type VolumeChange = {
  toy: ToyVolume
  previousState: number
  newState: number
  volume: number
  source: VolumeSource
}

@component
export class ToyVolume extends BaseScriptComponent {
  // Subscribe to this for your own reactions (particles, shader flashes, ...).
  public onStateChange: Event<VolumeChange> = new Event<VolumeChange>()

  public state: number = 0 // 0 off, 1 low, 2 medium, 3 high
  public currentVolume: number = 0 // what is actually playing right now
  public silenced: boolean = false // MusicSync sets this during its silent calibration
  public lastChangeTime: number = -10 // getTime() of the last accepted change (for the cooldown)
  private lastHand: number = -1 // which hand (input type) made the last change, -1 = none/code
  private levelMode: boolean = false // true while the volume comes from a slide (level) instead of the state
  private level: number = 0 // 0..1 along the strip (0 = off end, 1 = loudest end), used in level mode

  private cfg: StageConfig
  private toyCfg: ToyConfig
  private audio: AudioComponent

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    this.toyCfg = this.sceneObject.getComponent(ToyConfig.getTypeName()) as ToyConfig
    this.audio = this.sceneObject.getComponent("Component.AudioComponent") as AudioComponent
    if (!this.toyCfg || !this.audio) {
      console.error("[ToyVolume] " + this.sceneObject.name + " needs ToyConfig and an AudioComponent")
      return
    }
    if (!this.toyCfg.stem) console.warn("[ToyVolume] " + this.sceneObject.name + " has no stem assigned in ToyConfig")
    if (this.audio.audioTrack && this.audio.audioTrack !== this.toyCfg.stem) {
      console.warn("[ToyVolume] " + this.sceneObject.name + ": the AudioComponent's own Audio Track is filled; it is replaced by ToyConfig > Stem. Leave that slot empty.")
    }
    this.audio.audioTrack = this.toyCfg.stem
    this.audio.volume = 0
    this.currentVolume = 0
    // the toy's colour follows its state
    this.toyCfg.setColourState(this.state)
    this.onStateChange.add((e) => this.toyCfg.setColourState(e.newState))
  }

  getAudio(): AudioComponent {
    return this.audio
  }

  getState(): number {
    return this.state
  }

  // The one door for finger-driven changes. Returns true if the volume changed, false if it was ignored
  // because this toy changed less than Volume Cooldown seconds ago.
  // `hand` says which hand/input made the touch (the interactor's input type), so one hand's second touch of
  // the same toy (a finger that brushes the toy on its way to or from the pad) can be told from a new hand.
  requestCycle(source: VolumeSource, hand: number = -1): boolean {
    if (!this.cfg || !this.toyCfg) return false
    const since = getTime() - this.lastChangeTime
    if (since < this.cfg.volumeCooldown) {
      this.cfg.log(this.sceneObject.name + ": " + source + " ignored (cooldown, " + since.toFixed(2) + " s since the last change)")
      return false
    }
    if (hand >= 0 && hand === this.lastHand && since < this.cfg.sameHandCooldown) {
      this.cfg.log(this.sceneObject.name + ": " + source + " ignored (same hand changed it " + since.toFixed(2) + " s ago)")
      return false
    }
    this.lastHand = hand
    this.setState((this.state + 1) % 4, source)
    return true
  }

  // ---- sliding: a continuous level 0..1 (0 = off, 1 = loudest). The four state volumes sit at 0, 1/3, 2/3 and 1
  // and are joined by straight lines, so a slide passes smoothly through low and medium.
  volumeAtLevel(t: number): number {
    const v = this.toyCfg.volumeList()
    const x = Math.max(0, Math.min(1, t)) * 3
    const i = Math.min(2, Math.floor(x))
    return v[i] + (v[i + 1] - v[i]) * (x - i)
  }

  isSliding(): boolean {
    return this.levelMode
  }

  // 0..3 for shaders and colours: the state, or the slide position scaled to 0..3 while sliding.
  stateValue(): number {
    return this.levelMode ? this.level * 3 : this.state
  }

  // A slide step. Goes around the cooldown (many steps per second are the point) but still counts as a change,
  // so a finger that leaves the strip and brushes the toy afterwards is held off by the cooldown and hand lock.
  setLevel(t: number, hand: number = -1): void {
    if (!this.cfg || !this.toyCfg) return
    this.levelMode = true
    this.level = Math.max(0, Math.min(1, t))
    this.lastHand = hand
    this.lastChangeTime = getTime()
    const next = Math.round(this.level * 3)
    if (next !== this.state) {
      const previous = this.state
      this.state = next
      this.onStateChange.invoke({ toy: this, previousState: previous, newState: next, volume: this.volumeAtLevel(this.level), source: "padSlide" })
      this.cfg.log(this.sceneObject.name + " slide state " + previous + " -> " + next + " (level " + this.level.toFixed(2) + ")")
    }
  }

  // The slide ended. With `snap` the volume settles on the nearest of the four states; without it, it stays where
  // the finger left it (until the next tap, which goes to the next state from the nearest one).
  endSlide(snap: boolean): void {
    this.lastChangeTime = getTime()
    if (snap && this.levelMode) this.setState(Math.round(this.level * 3), "padSlide")
  }

  setState(next: number, source: VolumeSource = "code"): void {
    const previous = this.state
    this.levelMode = false
    this.state = next
    this.lastChangeTime = getTime()
    const volume = this.toyCfg.volumeList()[next]
    this.onStateChange.invoke({ toy: this, previousState: previous, newState: next, volume: volume, source: source })
    this.cfg.log(this.sceneObject.name + " state " + previous + " -> " + next + " (volume " + volume.toFixed(2) + ", " + source + ")")
  }

  // 0..1: how loud this toy is compared with its loudest state (used to scale audio-reactive motion)
  motionFactor(): number {
    const levels = this.toyCfg.volumeList()
    const top = Math.max(0.0001, levels[3], levels[2], levels[1])
    return Math.max(0, Math.min(1, this.currentVolume / top))
  }

  private onUpdate(): void {
    if (!this.audio || !this.toyCfg || !this.cfg) return
    const wanted = this.levelMode ? this.volumeAtLevel(this.level) : this.toyCfg.volumeList()[this.state]
    const target = this.silenced ? 0 : wanted
    const s = this.cfg.volumeSmoothing
    const k = s <= 0 ? 1 : 1 - Math.exp(-getDeltaTime() / s)
    this.currentVolume += (target - this.currentVolume) * k
    this.audio.volume = this.currentVolume
  }
}
