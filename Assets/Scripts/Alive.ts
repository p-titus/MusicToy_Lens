// Alive - shared helpers for the "alive" feel: a toy, its dial button and the Move Handle notice a hand coming close
// (fingertip distance, or hover) and react. Plain classes, not components: nothing to hook up in Lens Studio.
//
//   HandNear     where the fingertips are this frame (SIK index tips of both hands; in the Editor Preview also the mouse).
//   NearTracker  one per thing that can be approached. Turns "a fingertip is N cm away / it is hovered" into a smooth
//                0..1 amount. A hand must stay close for `Frames To Trigger` frames before it counts, and stay away for
//                `Frames To Release` frames before it stops (so a flicker of tracking never flashes the glow).
//   breath01     the slow 0..1 breathing used for the resting glow.
//
// All numbers live in StageConfig > Alive and hover. This file only does the maths; each user (ToyAudioReact for the toy,
// ToyPad for the dial button, StageMoveHandle for the handle) decides what the amount does.

import { HandInputData } from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData"
import { InteractionManager } from "SpectaclesInteractionKit.lspkg/Core/InteractionManager/InteractionManager"
import { InteractorInputType } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import { StageConfig } from "./StageConfig"

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

export class HandNear {
  private static frameTime: number = -1
  private static cache: vec3[] = []
  private static warnedHands: boolean = false
  private static warnedMouse: boolean = false

  // World positions (cm) of every tracked index fingertip, plus the mouse stand-in in the Editor. Read once per frame.
  static tips(cfg: StageConfig): vec3[] {
    const now = getTime()
    if (now === HandNear.frameTime) return HandNear.cache
    HandNear.frameTime = now
    const out: vec3[] = []
    try {
      const data = HandInputData.getInstance()
      const sides: Array<"left" | "right"> = ["left", "right"]
      for (const side of sides) {
        const hand = data.getHand(side)
        if (hand.isTracked()) out.push(hand.indexTip.position)
      }
    } catch (err) {
      if (!HandNear.warnedHands) {
        HandNear.warnedHands = true
        console.warn("[Alive] could not read the hand fingertips (" + err + "). Hand distance is off; hover still works.")
      }
    }
    if (cfg.aliveMouseHand && global.deviceInfoSystem.isEditor()) {
      const m = HandNear.mouseTip(cfg)
      if (m) out.push(m)
    }
    HandNear.cache = out
    return out
  }

  // The Editor Preview has no fingertips, so the mouse stands in for one: the point where the mouse ray meets a
  // horizontal plane `Mouse Hand Height` (cm) above the stage floor.
  private static mouseTip(cfg: StageConfig): vec3 | null {
    try {
      const its = InteractionManager.getInstance().getInteractorsByType(InteractorInputType.Mouse)
      const it = its.length > 0 ? its[0] : null
      if (!it) return null
      const o = it.startPoint
      const d = it.direction
      if (!o || !d || d.y > -0.01) return null
      const planeY = cfg.getSceneObject().getTransform().getWorldPosition().y + cfg.aliveMouseHeightCm
      const t = (planeY - o.y) / d.y
      return t > 0 ? o.add(d.uniformScale(t)) : null
    } catch (err) {
      if (!HandNear.warnedMouse) {
        HandNear.warnedMouse = true
        console.warn("[Alive] could not read the mouse ray (" + err + "). The mouse stand-in hand is off.")
      }
      return null
    }
  }
}

export class NearTracker {
  amount: number = 0 // 0..1, eased: a fingertip is close OR the thing is hovered
  distAmount: number = 0 // 0..1, eased: fingertip distance only (hover does not count). Used for the lean.
  dirWorld: vec3 = new vec3(0, 0, 1) // unit, horizontal: from the thing toward the nearest fingertip
  dirStrength: number = 0 // 0..1: 0 while the fingertip is straight above the centre (no side to lean to), 1 when clearly beside it
  active: boolean = false // true once the hand has been close for enough frames
  private nearFrames: number = 0
  private awayFrames: number = 0

  // centre: world position (cm). radiusCm: the thing's own radius, so distance counts from its SURFACE.
  // innerCm / outerCm: surface distance where the amount is full (1) / starts (0).
  update(dt: number, cfg: StageConfig, centre: vec3, radiusCm: number, innerCm: number, outerCm: number, hovered: boolean): void {
    let best: vec3 | null = null
    let bestD = Infinity
    for (const tip of HandNear.tips(cfg)) {
      const d = Math.hypot(tip.x - centre.x, tip.y - centre.y, tip.z - centre.z)
      if (d < bestD) {
        bestD = d
        best = tip
      }
    }
    const surface = Math.max(0, bestD - Math.max(0, radiusCm))
    const span = Math.max(0.01, outerCm - innerCm)
    const rawDist = best ? clamp01((outerCm - surface) / span) : 0
    const rawHover = cfg.aliveHoverCounts && hovered ? 1 : 0
    const raw = Math.max(rawDist, rawHover)

    if (raw > 0) {
      this.nearFrames++
      this.awayFrames = 0
    } else {
      this.awayFrames++
      this.nearFrames = 0
    }
    if (!this.active && this.nearFrames >= Math.max(1, Math.round(cfg.aliveNearFrames))) this.active = true
    else if (this.active && this.awayFrames >= Math.max(1, Math.round(cfg.aliveLeaveFrames))) this.active = false

    const k = cfg.aliveEaseSeconds <= 0 ? 1 : 1 - Math.exp(-dt / cfg.aliveEaseSeconds)
    this.amount += ((this.active ? raw : 0) - this.amount) * k
    this.distAmount += ((this.active ? rawDist : 0) - this.distAmount) * k

    if (best) {
      const dx = best.x - centre.x
      const dz = best.z - centre.z
      const h = Math.hypot(dx, dz)
      if (h > 0.01) this.dirWorld = new vec3(dx / h, 0, dz / h)
      this.dirStrength = clamp01(h / Math.max(0.5, radiusCm * 0.6))
    } else {
      this.dirStrength = 0
    }
  }

  reset(): void {
    this.amount = 0
    this.distAmount = 0
    this.dirStrength = 0
    this.active = false
    this.nearFrames = 0
    this.awayFrames = 0
  }
}

// Slow breathing, 0..1 (0 at the start of a breath, 1 half way). period in seconds, phase 0..1 shifts it.
export function breath01(periodSeconds: number, phase: number): number {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * (getTime() / Math.max(0.5, periodSeconds) + phase))
}

// A steady 0..1 number from a name, so seven toys breathe out of step with each other (0 when staggering is off).
export function phaseFor(name: string, stagger: boolean): number {
  if (!stagger) return 0
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return h / 997
}
