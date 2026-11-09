// GlitterDriver - hands one toy's live signals to its glitter VFX. The LOOK (size, colour, amount, movement) lives in
// the VFX graph's own parameters, not here. Put this on the glitter VFX object (a child of the toy, above its blob visual).
//
// It writes these Properties on the VFX asset (Script Names to create as Parameter nodes in the VFX graph):
//   glitterState   float 0..3, unitless: 0 off, 1 low, 2 medium, 3 high. Smoothed, so 1.5 = halfway between low and medium.
//   glitterEnergy  float 0..1, unitless: the smoothed stem loudness (same signal as the material's audioLevel).
//   toyVelocity    vec3, cm/s, world axes: how fast the toy is moving (pickup, carry, float-down, settle). Smoothed.
//   toyAccel       vec3, cm/s^2, world axes: how fast that velocity is changing. Smoothed. Use it to push the pieces the
//                  OPPOSITE way so they lag when the toy is lifted or swung, then catch up.
// A property the graph does not have is skipped (a warning lists them once), so a graph can start with just glitterState.
//
// Off by default. While Glitter is off, or the state has settled at off (Hide When Off), the VFX component is disabled
// so it costs nothing. Setup does not depend on hierarchy order: the ToyConfig is found on the first frame.

import { ToyConfig } from "./ToyConfig"

export const GLITTER_PARAMS = {
  state: "glitterState",
  energy: "glitterEnergy",
  velocity: "toyVelocity",
  accel: "toyAccel",
  // Written only while "Keep inside the toy" is ON (they size the cluster to the toy's body):
  bandBottom: "bandBottom",
  bandTop: "bandTop",
  radius: "radius",
  drift: "drift",
  lagMax: "lagMax",
  outwardBias: "outwardBias",
  risePhase: "risePhase",
  puffPhase: "puffPhase",
  driftClock: "driftClock"
}

@component
export class GlitterDriver extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Glitter (this toy)</span>')
  @ui.group_start("Glitter")
  @input
  @hint("ON: this toy shows glitter. OFF (default): the glitter VFX is disabled and costs nothing.")
  glitterOn: boolean = false

  @input
  @hint("The VFX component of the glitter object. Leave empty to use the VFX component on this same object.")
  @allowUndefined
  vfx: VFXComponent

  @input
  @hint("This toy's ToyConfig. Leave empty to search up the parents of this object for it.")
  @allowUndefined
  toy: ToyConfig

  @input
  @hint("ON (default): this toy gets its own copy of the VFX asset at start, so seven toys sharing one VFX file do not share glitterState and the other values. Values you set on the asset in the Inspector are copied.")
  cloneAsset: boolean = true

  @input
  @hint("Seconds (s) glitterState takes to move by one state step, for example off to low. Off to high takes three times this. 0 = instant.")
  stateSeconds: number = 0.25

  @input
  @hint("ON (default): once glitter has faded fully out (state off and no energy) the VFX component is disabled, so an off toy draws nothing. Pieces start again from the beginning when it comes back.")
  hideWhenOff: boolean = true
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Keep inside the toy</span>')
  @ui.group_start("Keep inside the toy")
  @input
  @hint("ON (default): every frame the glitter is sized to this toy's own body, so it can never leave it, whatever the toy's size or squish. It writes the graph's Band Bottom, Band Top, Radius, Drift and Pickup Lag Limit, so those graph values are ignored while this is ON. OFF: the graph's own values are used.")
  keepInside: boolean = true

  @input
  @hint("The toy's body (the object with the Render Mesh Visual). Leave empty to use the Visual of this toy's ToyConfig, or the parent of this object.")
  @allowUndefined
  body: RenderMeshVisual

  @input
  @hint("Unitless 0..1: how much of the body's box the glitter is allowed to use. A blob is rounder than its box, so 0.8 keeps pieces away from the thin corners. Lower = stays further from the surface.")
  bodyFit: number = 0.8

  @input
  @hint("Unitless 0..1: cluster size in the LOW state, compared with the room inside the toy. Lower = more bunched up in the middle. 0.5 = half the width and height of the toy's inside. 0.3 = a tight ball.")
  clusterSize: number = 0.4

  @input
  @hint("Unitless 0..1: cluster size in the MEDIUM state (same scale as Cluster Size, which is the Low state). Bigger than Low = the glitter spreads as the music builds.")
  clusterMed: number = 0.6

  @input
  @hint("Unitless 0..1: cluster size in the HIGH state (same scale as Cluster Size). 1 = the glitter may use all the room inside the toy.")
  clusterHigh: number = 0.9

  @input
  @hint("Unitless 0..1: extra cluster size added at full loudness, on top of the state size, so the glitter pulses outward with the stem loudness. 0 = off.")
  loudnessSpread: number = 0.1

  @input
  @hint("Seconds (s) the cluster takes to grow or shrink by its full range (0 to 1). Larger = slow, soft breathing. 0 = follows instantly.")
  spreadSeconds: number = 0.6

  @input
  @hint("Unitless 0..1: how much the glitter fans UPWARD AND OUTWARD like a fountain. 0 = old look (pieces curve back inward near the top). 1 = pieces fade out while still at their widest, so they only move up and out.")
  outwardSpread: number = 0.7

  @input
  @hint("Centimetres (cm): the most a piece wanders from its home spot (the graph's Drift). Kept small so pieces stay bunched. It is reduced automatically if the toy is too small for it.")
  wanderCm: number = 0.2

  @input
  @hint("Centimetres (cm): the furthest pickup movement can push a piece (the graph's Pickup Lag Limit). Reduced automatically if the toy is too small for it.")
  lagCm: number = 0.3

  @input
  @hint("Centimetres (cm): used for the piece size only if it cannot be read from the graph. Normally the graph's Piece Size is used.")
  fallbackPieceCm: number = 0.1
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Movement per state</span>')
  @ui.group_start("Movement per state")
  @input
  @hint("Seconds (s) for one piece to rise from the bottom to the top of the cluster in the LOW state. Bigger = slower, calmer. The rise no longer depends on the cluster size.")
  riseSecondsLow: number = 10

  @input
  @hint("Seconds (s) for one full rise in the MEDIUM state.")
  riseSecondsMed: number = 6

  @input
  @hint("Seconds (s) for one full rise in the HIGH state.")
  riseSecondsHigh: number = 3.5

  @input
  @hint("Unitless multiplier of the wandering speed (the graph's Drift Speed) in the LOW state. 1 = as set in the graph, 0.5 = half as fast.")
  wanderSpeedLow: number = 0.5

  @input
  @hint("Unitless multiplier of the wandering speed in the MEDIUM state.")
  wanderSpeedMed: number = 1

  @input
  @hint("Unitless multiplier of the wandering speed in the HIGH state.")
  wanderSpeedHigh: number = 1.5
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Music puff (upward only)</span>')
  @ui.group_start("Music puff (upward only)")
  @input
  @hint("Unitless: how strongly a rise in the music loudness puffs the glitter UPWARD. 0 = off. It can only lift pieces, never push them down. Around 1 to 3 is a gentle puff.")
  puffStrength: number = 1.5

  @input
  @hint("Unitless: how easily a small loudness rise triggers a puff. Higher = more puffs from smaller changes. Around 3 to 8.")
  puffSensitivity: number = 5

  @input
  @hint("Seconds (s) for a puff's extra speed to ease back down to the normal rise (time constant, so the full coast is a few times longer). Larger = a longer, softer puff.")
  puffSeconds: number = 0.35
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Pickup movement</span>')
  @ui.group_start("Pickup movement")
  @input
  @hint("Seconds (s) used to smooth the toy's measured velocity and acceleration. Smaller = twitchier, larger = softer. 0 = no smoothing.")
  motionSmoothSeconds: number = 0.12

  @input
  @hint("Largest toyVelocity sent, in cm/s. A fast hand move or a reset cannot send more than this.")
  maxSpeed: number = 80

  @input
  @hint("Largest toyAccel sent, in cm/s^2. Keeps a sudden jump (for example Reset Toy Position) from flinging the pieces.")
  maxAccel: number = 1500
  @ui.group_end

  private tc: ToyConfig | null = null
  private v: VFXComponent | null = null
  private ready: boolean = false
  private cur: number = -1 // smoothed glitterState; -1 = not set yet (the first frame snaps)
  private shown: boolean | null = null
  private prevPos: vec3 | null = null
  private vel: vec3 = vec3.zero()
  private acc: vec3 = vec3.zero()
  private warned: boolean = false
  private bodyRmv: RenderMeshVisual | null = null
  private curCluster: number = -1 // smoothed cluster size; -1 = not set yet
  private risePhase: number = 0 // rise loop position, cycles (wraps at 1)
  private puffPhase: number = 0 // total upward lift from puffs, cycles (only ever grows)
  private driftClock: number = 0 // clock for the wandering, seconds
  private puffEnv: number = 0 // 0..1 current puff
  private fastLevel: number = 0
  private slowLevel: number = 0

  onAwake(): void {
    this.createEvent("UpdateEvent").bind(() => this.update(getDeltaTime()))
  }

  // Set up lazily on the first frame (after every OnStart), so the scene order does not matter.
  private setup(): boolean {
    if (this.ready) return true
    this.v = this.vfx || (this.sceneObject.getComponent("Component.VFXComponent") as VFXComponent)
    if (!this.v) {
      if (!this.warned) {
        this.warned = true
        console.warn("[GlitterDriver] " + this.sceneObject.name + " has no VFX component. Add one, or set VFX in this script.")
      }
      return false
    }
    this.tc = this.toy || this.findToy()
    if (!this.tc) {
      if (!this.warned) {
        this.warned = true
        console.warn("[GlitterDriver] " + this.sceneObject.name + " found no ToyConfig on its parents. Make this a child of the toy, or set Toy in this script.")
      }
      return false
    }
    if (!this.v.asset) {
      if (!this.warned) {
        this.warned = true
        console.warn("[GlitterDriver] " + this.sceneObject.name + ": the VFX component has no VFX asset.")
      }
      return false
    }
    if (this.cloneAsset) this.v.asset = this.v.asset.clone()
    this.ready = true
    return true
  }

  private findToy(): ToyConfig | null {
    let o: SceneObject | null = this.sceneObject
    while (o) {
      const c = o.getComponent(ToyConfig.getTypeName()) as ToyConfig
      if (c) return c
      o = o.hasParent() ? o.getParent() : null
    }
    return null
  }

  private show(on: boolean): void {
    if (!this.v || this.shown === on) return
    this.shown = on
    this.v.enabled = on
  }

  private update(dt: number): void {
    if (!this.setup()) return
    const tc = this.tc as ToyConfig
    const v = this.v as VFXComponent

    this.measureMotion(tc, dt)
    if (!this.glitterOn) {
      this.show(false)
      this.cur = -1
      this.curCluster = -1
      return
    }

    // glitterState: the toy's state (0..3), smoothed like BlobLookDriver
    const target = tc.currentState
    if (this.cur < 0 || this.stateSeconds <= 0) this.cur = target
    else {
      const step = dt / this.stateSeconds
      this.cur += Math.max(-step, Math.min(step, target - this.cur))
    }
    const energy = tc.currentGlitterLevel

    if (this.hideWhenOff && this.cur < 0.001 && target === 0 && energy < 0.001) {
      this.show(false)
      return
    }
    this.show(true)

    const p = v.asset.properties as any
    const missing: string[] = []
    const put = (name: string, value: any): void => {
      if (p[name] === undefined) missing.push(name)
      else p[name] = value
    }
    put(GLITTER_PARAMS.state, this.cur)
    put(GLITTER_PARAMS.energy, energy)
    put(GLITTER_PARAMS.velocity, this.vel)
    put(GLITTER_PARAMS.accel, this.acc)
    put(GLITTER_PARAMS.outwardBias, Math.max(0, Math.min(1, this.outwardSpread)))
    this.advanceMovement(dt, energy, put)
    if (this.keepInside) {
      // Cluster size follows the smoothed state (low -> med -> high) plus a loudness boost.
      const lo = this.clusterSize, me = this.clusterMed, hi = this.clusterHigh
      const c = this.cur
      const base = c <= 1 ? lo : c <= 2 ? lo + (me - lo) * (c - 1) : me + (hi - me) * Math.min(1, c - 2)
      const want = Math.max(0, Math.min(1, base + this.loudnessSpread * Math.max(0, Math.min(1, energy))))
      if (this.curCluster < 0 || this.spreadSeconds <= 0) this.curCluster = want
      else {
        const st = dt / this.spreadSeconds
        this.curCluster += Math.max(-st, Math.min(st, want - this.curCluster))
      }
      this.fitToBody(p, put, this.curCluster)
    }
    if (missing.length > 0 && !this.warned) {
      this.warned = true
      console.warn("[GlitterDriver] " + this.sceneObject.name + ": the VFX graph has no parameter named " + missing.join(", ") + " (skipped). Add Parameter nodes with these Script Names to use them.")
    }
  }

  // Motion clocks. Everything here is continuous (no jumps when the cluster size changes) and the puff only ever adds upward lift.
  private advanceMovement(dt: number, energy: number, put: (name: string, value: any) => void): void {
    const d = Math.min(dt, 0.1)
    const c = this.cur
    const pick = (lo: number, me: number, hi: number): number =>
      c <= 1 ? lo : c <= 2 ? lo + (me - lo) * (c - 1) : me + (hi - me) * Math.min(1, c - 2)
    const riseSec = Math.max(0.2, pick(this.riseSecondsLow, this.riseSecondsMed, this.riseSecondsHigh))
    const wanderMul = Math.max(0, pick(this.wanderSpeedLow, this.wanderSpeedMed, this.wanderSpeedHigh))

    // Puff: a fast loudness average jumping above a slow one = a hit. Only rises count; falls do nothing.
    const e = Math.max(0, Math.min(1, energy))
    this.fastLevel += (e - this.fastLevel) * (1 - Math.exp(-d / 0.05))
    this.slowLevel += (e - this.slowLevel) * (1 - Math.exp(-d / 0.4))
    const hit = Math.min(1, Math.max(0, this.fastLevel - this.slowLevel) * Math.max(0, this.puffSensitivity))
    // A hit gives the glitter a push (extra speed). The push eases in quickly, then fades out smoothly (exponential tail),
    // so the glitter coasts back down to its normal rise speed instead of stopping when the puff ends.
    const tail = Math.max(0.05, this.puffSeconds)
    const decayed = this.puffEnv * Math.exp(-d / tail)
    this.puffEnv = hit > decayed ? decayed + (hit - decayed) * (1 - Math.exp(-d / 0.06)) : decayed

    this.risePhase = (this.risePhase + d / riseSec) % 1
    this.puffPhase += d * this.puffEnv * Math.max(0, this.puffStrength)
    this.driftClock += d * wanderMul
    if (this.driftClock > 3600) this.driftClock -= 3600 // keep the number small; the wander is not cyclic so a rare reshuffle is fine

    put(GLITTER_PARAMS.risePhase, this.risePhase)
    put(GLITTER_PARAMS.puffPhase, this.puffPhase)
    put(GLITTER_PARAMS.driftClock, this.driftClock)
  }

  // Size the glitter cluster from the toy's body. All numbers are in this object's own space (the graph's space),
  // so they stay right if the toy is stretched, squished or the glitter object is scaled.
  // Every piece ends up inside an ellipsoid that fits the body: home spot + wander + pickup lag all fit in it.
  private fitToBody(p: any, put: (name: string, value: any) => void, cluster: number): void {
    const rmv = this.findBody()
    const mesh = rmv ? rmv.mesh : null
    if (!rmv || !mesh) return
    const toLocal = this.sceneObject.getTransform().getInvertedWorldTransform()
    const toWorld = rmv.sceneObject.getTransform().getWorldTransform()
    const lo = mesh.aabbMin
    const hi = mesh.aabbMax
    let min = new vec3(1e9, 1e9, 1e9)
    let max = new vec3(-1e9, -1e9, -1e9)
    for (let i = 0; i < 8; i++) {
      const c = new vec3(i & 1 ? hi.x : lo.x, i & 2 ? hi.y : lo.y, i & 4 ? hi.z : lo.z)
      const q = toLocal.multiplyPoint(toWorld.multiplyPoint(c))
      min = new vec3(Math.min(min.x, q.x), Math.min(min.y, q.y), Math.min(min.z, q.z))
      max = new vec3(Math.max(max.x, q.x), Math.max(max.y, q.y), Math.max(max.z, q.z))
    }
    const fit = Math.max(0.1, Math.min(1, this.bodyFit))
    const cen = min.add(max).uniformScale(0.5)
    const half = max.sub(min).uniformScale(0.5 * fit)

    // Biggest a piece can reach beyond its centre (a tilted square's corner), from the graph's Piece Size.
    const size = typeof p["pieceSize"] === "number" ? p["pieceSize"] : this.fallbackPieceCm
    const vari = typeof p["sizeVariation"] === "number" ? p["sizeVariation"] : 0.4
    const pieceHalf = size * (1 + vari) * 0.71

    // Room left per axis, then the smallest of them.
    const ax = Math.max(0.05, half.x - pieceHalf)
    const ay = Math.max(0.05, half.y - pieceHalf)
    const az = Math.max(0.05, half.z - pieceHalf)
    const aMin = Math.min(ax, ay, az)

    // Worst-case push away from the home spot (wander on three axes + lag). Keep it under 40% of the room.
    let wander = Math.max(0, this.wanderCm)
    let lag = Math.max(0, this.lagCm)
    const reserve = 1.74 * wander + lag
    if (reserve > 0.4 * aMin && reserve > 0) {
      const k = (0.4 * aMin) / reserve
      wander *= k
      lag *= k
    }
    const reserveLen = 1.74 * wander + lag
    // Fraction of the room the home spots may use; never more than what is left after the push.
    const f = Math.max(0.05, Math.min(Math.max(0, Math.min(1, cluster)), 1 - reserveLen / aMin))

    // The graph places pieces on an ellipsoid centred on the glitter object's x and z, so shrink the
    // round part by any sideways offset of the body's centre.
    const off = Math.max(Math.abs(cen.x), Math.abs(cen.z))
    const radius = Math.max(0.02, Math.min(ax, az) * f - off)
    const halfH = Math.max(0.02, ay * f)

    put(GLITTER_PARAMS.bandBottom, cen.y - halfH)
    put(GLITTER_PARAMS.bandTop, cen.y + halfH)
    put(GLITTER_PARAMS.radius, radius)
    put(GLITTER_PARAMS.drift, wander)
    put(GLITTER_PARAMS.lagMax, lag)
  }

  // The toy's body: the Inspector slot, else the ToyConfig's Visual, else the parent of this object.
  private findBody(): RenderMeshVisual | null {
    if (this.bodyRmv) return this.bodyRmv
    let r: RenderMeshVisual | null = this.body || null
    if (!r && this.tc && this.tc.visual) r = this.tc.visual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!r && this.sceneObject.hasParent()) r = this.sceneObject.getParent().getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    this.bodyRmv = r
    return r
  }

  // Toy velocity (cm/s) and acceleration (cm/s^2) from its world position, smoothed and clamped.
  private measureMotion(tc: ToyConfig, dt: number): void {
    const pos = tc.sceneObject.getTransform().getWorldPosition()
    if (!this.prevPos || dt <= 0.0001) {
      this.prevPos = pos
      return
    }
    const raw = pos.sub(this.prevPos).uniformScale(1 / dt)
    this.prevPos = pos
    const k = this.motionSmoothSeconds <= 0 ? 1 : 1 - Math.exp(-dt / this.motionSmoothSeconds)
    const newVel = clampLen(vec3.lerp(this.vel, raw, k), this.maxSpeed)
    const rawAcc = newVel.sub(this.vel).uniformScale(1 / dt)
    this.vel = newVel
    this.acc = clampLen(vec3.lerp(this.acc, rawAcc, k), this.maxAccel)
  }
}

function clampLen(a: vec3, max: number): vec3 {
  const len = a.length
  return len > max && len > 0 ? a.uniformScale(max / len) : a
}
