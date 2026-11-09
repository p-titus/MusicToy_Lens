// ToySquish - the "squishy poke" and the soft landing.
//
// A poke squashes the toy, touching down on the stage squashes it a little, and holding it stretches it a little.
// Each time the toy springs back past its normal shape and wobbles to rest (the Overshoot idea: a damped sine).
// It only writes ToyConfig.squish; ToyAudioReact (or ToyConfig when there is no stem) multiplies that into the
// Visual's scale on top of the shape and the music. The footprint and the landing rules are never touched.
//
// How it works: a spring is pulled toward a target amount. A poke or landing sets the target to the squash
// amount for a few hundredths of a second, then back to 0, and the spring's own overshoot makes the rebound.
// While held the target is a small negative amount (stretch).
// All numbers: this toy's own ToyShape > Feel (limited by StageConfig > Comfort limiter); StageConfig > "Squish and
// soft landing" holds only the defaults and the press times.

import { StageConfig } from "./StageConfig"
import { ToyConfig } from "./ToyConfig"
import { ToyInteraction } from "./ToyInteraction"

@component
export class ToySquish extends BaseScriptComponent {
  private cfg: StageConfig
  private toyCfg: ToyConfig
  private held: boolean = false
  private pulseAmount: number = 0 // squash amount currently being pressed in
  private pulseLeft: number = 0 // seconds the press has left
  private x: number = 0 // current squish (spring position)
  private v: number = 0 // spring velocity

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    this.toyCfg = this.sceneObject.getComponent(ToyConfig.getTypeName()) as ToyConfig
    const inter = this.sceneObject.getComponent(ToyInteraction.getTypeName()) as ToyInteraction
    if (!this.toyCfg || !inter) {
      console.error("[ToySquish] " + this.sceneObject.name + " is missing ToyConfig or ToyInteraction")
      return
    }
    inter.onPoke.add(() => this.press(this.toyCfg.rPokeSquash, this.cfg.pokePressSeconds))
    inter.onSettle.add(() => this.press(this.toyCfg.rLandSquash, this.cfg.landPressSeconds))
    inter.onGrab.add(() => {
      this.held = true
      this.pulseLeft = 0
    })
    inter.onRelease.add(() => {
      this.held = false
    })
  }

  private press(amount: number, seconds: number): void {
    if (!this.cfg || !this.cfg.squishEnabled) return
    this.pulseAmount = amount
    this.pulseLeft = Math.max(0.01, seconds)
  }

  private onUpdate(): void {
    if (!this.cfg || !this.toyCfg) return
    if (!this.cfg.squishEnabled) {
      this.x = 0
      this.v = 0
      this.toyCfg.squish = 0
      return
    }
    const dt = Math.min(getDeltaTime(), 0.05)

    let target = 0
    if (this.held) target = -this.toyCfg.rGrabStretch
    else if (this.pulseLeft > 0) target = this.pulseAmount
    this.pulseLeft = Math.max(0, this.pulseLeft - dt)

    // damped spring pulled toward the target; small steps keep it stable at any frame rate
    const w = 2 * Math.PI * Math.max(0.1, this.toyCfg.rSquishFrequency)
    const zeta = Math.max(0, this.toyCfg.rSquishDamping)
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      this.v += (w * w * (target - this.x) - 2 * zeta * w * this.v) * h
      this.x += this.v * h
    }
    // keep the shape sane: the comfort limiter's squash / stretch (the spring may not push past them)
    const L = this.cfg.comfortLimits()
    const hiSquash = L.enabled ? L.maxSquash : 0.7
    const hiStretch = L.enabled ? L.maxStretch : 0.6
    this.x = Math.max(-hiStretch, Math.min(hiSquash, this.x))
    this.toyCfg.squish = Math.abs(this.x) < 0.0005 && target === 0 ? 0 : this.x
  }
}
