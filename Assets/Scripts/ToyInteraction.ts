// ToyInteraction - everything a toy does with the user's hands. No visuals here.
//
//   AIR-POKE -> cycle the volume state (ToyVolume), only while StageConfig > Air-poke is ON.
//   PINCH -> grab and carry the toy anywhere. Carrying never changes the volume.
//   (The main volume control is the flat pad under each toy: ToyPad.)
//   Let go -> the toy drifts slowly down, then settles. With StageConfig > Sockets > Toys Return To Sockets (ON) it
//             goes back to its own SOCKET (socketLocal()); otherwise onto the nearest valid spot inside the stage
//             to where it was let go. Far-away toys are rescued and fly back quickly.
//
// States: Idle -> Held -> Drifting -> Settling -> Idle   (Rescue replaces Drifting for far releases)
// Add your own reactions by subscribing to the events below. All numbers are in StageConfig/ToyConfig.
//
// Mouse in the editor preview: a quick CLICK is a poke; CLICK AND HOLD (or click and drag) is a pinch/grab.
//
// Note: SIK's InteractableManipulation is NOT used: it switches off poking. We move the toy ourselves.
//
// How SIK sees a touch (important): as soon as a fingertip touches a toy that accepts Poke, SIK starts a
// "poke". If the user then pinches while still touching, SIK continues the SAME touch as a pinch (an update,
// not a new start). So a poke is only counted when the touch ENDS without having turned into a pinch.
// That way grabbing a toy never changes its volume.

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {
  Interactor,
  InteractorInputType,
  InteractorTriggerType
} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import { StageConfig } from "./StageConfig"
import { ToyConfig } from "./ToyConfig"
import { ToyVolume } from "./ToyVolume"
import { StageBounds, BoundsToy } from "./StageBounds"
import * as G from "./StageGeometry"

enum State {
  Idle,
  Held,
  Drifting,
  Settling,
  Rescue
}

export type LandingReasonEx = "outside" | "overlap" | "rescue"

function ease(kind: number, t: number): number {
  switch (kind) {
    case 1:
      return 1 - (1 - t) * (1 - t) // ease out quad
    case 2:
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 // ease in-out quad
    case 3:
      return 1 - Math.pow(1 - t, 3) // ease out cubic
    case 4: {
      const c1 = 1.70158 // ease out back (small overshoot)
      const c3 = c1 + 1
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
    }
    default:
      return t // linear
  }
}

@component
export class ToyInteraction extends BaseScriptComponent implements BoundsToy {
  // ---- events: subscribe from your own scripts --------------------------------
  public onPoke: Event<{ toy: ToyInteraction }> = new Event()
  public onGrab: Event<{ toy: ToyInteraction; worldPosition: vec3 }> = new Event()
  public onRelease: Event<{ toy: ToyInteraction; worldPosition: vec3; distanceFromStage: number }> = new Event()
  public onDriftStart: Event<{ toy: ToyInteraction }> = new Event()
  public onSettle: Event<{ toy: ToyInteraction; localPosition: vec3 }> = new Event()
  public onLandingCorrected: Event<{ toy: ToyInteraction; from: vec3; to: vec3; reason: LandingReasonEx }> = new Event()

  private cfg: StageConfig
  private toyCfg: ToyConfig
  private vol: ToyVolume
  private bounds: StageBounds
  private interactable: Interactable
  private tr: Transform

  private state: State = State.Idle
  private heldBy: Interactor | null = null
  private grabHandStart: vec3 = vec3.zero()
  private grabToyStart: vec3 = vec3.zero()
  private grabTime: number = 0
  private grabMoved: number = 0
  private lastPoke: number = -10
  private lastRelease: number = -10
  private pendingPoke: boolean = false // a fingertip is touching; it becomes a poke only if it ends unpinched
  private pokeInteractor: Interactor | null = null
  private pokeDepth: number = 0 // deepest push (0..1) during the current touch
  private pokeHand: number = -1 // input type (hand or mouse) of the current touch
  private pokeBeganAt: number = 0 // when the current touch began (a pad change after this cancels the poke)
  private pendingClick: boolean = false // mouse button is down, not yet decided: click (poke) or hold (grab)
  private clickInteractor: Interactor | null = null
  private clickStartTime: number = 0
  private clickStartPoint: vec3 | null = null
  private target: G.P = { x: 0, z: 0 } // where the toy is heading (stage-local)
  private slide: G.P | null = null // gentle slide request for an idle toy
  private settleFrom: vec3 = vec3.zero()
  private settleT: number = 0
  private grabPlaneNormal: vec3 = vec3.back()
  private grabOffset: vec3 = vec3.zero()
  private driftFloorY: number = 0 // where the drift ends: the hover height, or lower if released below it
  private settleRotFrom: quat = quat.quatIdentity()
  private baseRot: quat = quat.quatIdentity() // the toy's resting rotation, restored after a float
  private driftBase: vec3 = vec3.zero() // un-swayed position while drifting (stage-local)
  private driftTime: number = 0
  private safetyTimer: number = 0
  private placed: boolean = false // false until the toy has been put at its start position (first frame, or a reset)
  // The SOCKET: this toy's own spot on the stage (stage-local cm). The ring, the tab and the ripples are fixed to it
  // and the toy flies back to it when let go. null until the toy has been put at its start position. It is one
  // value, read fresh every frame (never cached by the drift), so a later feature can move it with setSocket().
  private socket: G.P | null = null
  // The small sideways offset (stage-local cm) StageBounds has added on top of the toy's own position so toys never
  // overlap. It is taken off again at the start of every Update (so the motion code always works on the real
  // position) and put back in LateUpdate.
  private appliedPush: G.P = { x: 0, z: 0 }
  private hoverCount: number = 0 // how many interactors hover the toy right now

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.tr = this.sceneObject.getTransform()
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  // ---- BoundsToy: what the stage needs to know ----------------------------------
  isHeld(): boolean {
    return this.state === State.Held
  }

  isPlaced(): boolean {
    return this.placed
  }

  // ---- push apart (called by StageBounds) ----------------------------------------
  pushRadius(): number {
    return this.footprint() * 0.5 // cm
  }

  pushHeight(): number {
    return this.toyCfg ? this.toyCfg.realSize().y : this.footprint() // cm
  }

  // The toy's own position (stage-local), without any push.
  baseLocal(): vec3 {
    const p = this.tr.getLocalPosition()
    return new vec3(p.x - this.appliedPush.x, p.y, p.z - this.appliedPush.z)
  }

  // Put the toy `x, z` cm (stage-local) away from its own position. 0, 0 = no push.
  applyPush(x: number, z: number): void {
    const b = this.baseLocal()
    this.tr.setLocalPosition(new vec3(b.x + x, b.y, b.z + z))
    this.appliedPush = { x: x, z: z }
  }

  private removePush(): void {
    if (this.appliedPush.x === 0 && this.appliedPush.z === 0) return
    this.applyPush(0, 0)
  }

  // Away from its socket: carried, drifting, settling or being rescued.
  isAway(): boolean {
    return this.state !== State.Idle
  }

  // The socket, stage-local cm (x right, y 0 = the stage floor, z toward you). Before the toy has been placed this is
  // the raw Home Position.
  socketLocal(): vec3 {
    if (this.socket) return new vec3(this.socket.x, 0, this.socket.z)
    const h = this.toyCfg ? this.toyCfg.homePosition : vec3.zero()
    return new vec3(h.x, 0, h.z)
  }

  // Move the socket (stage-local cm). Nothing calls this yet: it is here so sockets can be made movable later.
  // The toy, ring and tab follow on their own.
  setSocket(x: number, z: number): void {
    this.socket = { x: x, z: z }
  }

  // Move the socket to a spot (stage-local cm) while the user drags a pad's arc. With Enforce Bounds ON the spot is
  // pulled inside the stage first (same rule as a landing); with it OFF it goes exactly where it is put. The toy,
  // ring and arc follow on their own. Home Position is never touched, so resetSocket() still goes back to it.
  moveSocketTo(x: number, z: number): void {
    if (!this.bounds || !this.socket) return
    // never onto another toy's socket: slide off it first, then apply the stage rules; if that pushes it back onto a
    // socket (Enforce Bounds ON, crowded stage) the socket simply stays where it was
    const apart = this.bounds.separateFromSockets(this, { x: x, z: z })
    if (!apart) return
    const r = this.bounds.resolveLanding(this, apart)
    const final = this.bounds.separateFromSockets(this, r.pos)
    if (!final || Math.hypot(final.x - r.pos.x, final.z - r.pos.z) > 0.01) return
    this.socket = { x: r.pos.x, z: r.pos.z }
  }

  // This toy's own socket (stage-local cm), for StageBounds.
  socketXZ(): G.P {
    const s = this.socketLocal()
    return { x: s.x, z: s.z }
  }

  // The disc (cm) that the socket's ring and dial button cover; falls back to the toy's footprint.
  socketDiameter(): number {
    const d = this.toyCfg && this.toyCfg.padEquivalentProvider ? this.toyCfg.padEquivalentProvider() : 0
    return d > 0 ? d : this.footprint()
  }

  // True while sockets are in use (StageConfig > Sockets > Toys Return To Sockets ON and the toy has been placed).
  socketsOn(): boolean {
    return this.socketMode()
  }

  // Put the socket back at the toy's Home Position (resolved the same way as at start-up). Does not move the toy.
  resetSocket(): void {
    if (!this.toyCfg) return
    const s = this.toyCfg.homePosition
    this.socket = this.bounds.resolveLanding(this, { x: s.x, z: s.z }).pos
  }

  // Sockets are in use: the toy returns to its own socket and nothing nudges it away.
  private socketMode(): boolean {
    return !!this.cfg && this.cfg.toysReturnToSockets && !!this.socket
  }

  footprint(): number {
    return this.toyCfg ? this.toyCfg.footprint() : this.cfg.toySize
  }

  // The toy plus its pad count as ONE unit for edge padding, clamping and overlap nudging.
  unit(): G.Unit {
    return this.toyCfg ? this.toyCfg.unitDiscs() : [{ dx: 0, dz: 0, d: this.cfg.toySize }]
  }

  // Reset, step 1: let go of whatever the toy was doing and stop counting as placed.
  beginReset(): void {
    this.removePush()
    this.heldBy = null
    this.pendingPoke = false
    this.pendingClick = false
    this.pokeInteractor = null
    this.clickInteractor = null
    this.slide = null
    this.state = State.Idle
    this.placed = false
  }

  // Reset, step 2: stand at the start position (pulled inside / off neighbours if it must be).
  finishReset(): void {
    this.tr.setLocalRotation(this.baseRot)
    this.placeAtStart(true)
  }

  restXZ(): G.P {
    if (this.state === State.Drifting || this.state === State.Settling || this.state === State.Rescue) return this.target
    if (this.slide) return this.slide
    const p = this.tr.getLocalPosition()
    return { x: p.x, z: p.z }
  }

  nudgeTo(x: number, z: number): void {
    if (this.state === State.Held || this.socketMode()) return // a toy never gets nudged off its socket
    if (this.state === State.Idle) this.slide = { x: x, z: z }
    else this.target = { x: x, z: z }
  }

  // ---- start-up ----------------------------------------------------------------
  private onStart(): void {
    this.toyCfg = this.sceneObject.getComponent(ToyConfig.getTypeName()) as ToyConfig
    this.vol = this.sceneObject.getComponent(ToyVolume.getTypeName()) as ToyVolume
    const stageObj = this.cfg.getSceneObject()
    this.bounds = stageObj.getComponent(StageBounds.getTypeName()) as StageBounds
    if (!this.toyCfg || !this.vol || !this.bounds) {
      console.error("[ToyInteraction] " + this.sceneObject.name + " is missing ToyConfig, ToyVolume or the stage's StageBounds")
      return
    }

    this.interactable = this.sceneObject.getComponent(Interactable.getTypeName()) as Interactable
    if (!this.interactable) {
      console.warn("[ToyInteraction] " + this.sceneObject.name + " has no Interactable; creating one (add it in the editor to see its options)")
      this.interactable = this.sceneObject.createComponent(Interactable.getTypeName()) as Interactable
      this.interactable.targetingMode = 7
    }
    const mode = this.interactable.targetingMode
    if ((mode & 4) === 0 || (mode & 3) === 0) {
      console.warn("[ToyInteraction] " + this.sceneObject.name + ": Interactable Targeting Mode should include Poke and Direct/Indirect (use All)")
    }

    // The start spot is resolved in the first Update (after every pad has told its toy how big the unit is,
    // whatever the scene order). Until then the toy simply stands at its raw start position.
    const s = this.toyCfg.homePosition
    this.tr.setLocalPosition(new vec3(s.x, this.restY() + s.y, s.z))
    this.baseRot = this.tr.getLocalRotation()
    this.target = { x: s.x, z: s.z }
    this.bounds.register(this)
    this.toyCfg.onResetPosition = () => {
      this.beginReset()
      this.finishReset()
    }

    this.cfg.onReset("callHome", () => this.callHome())
    this.interactable.onTriggerStart.add((e) => this.onTriggerStart(e))
    this.interactable.onTriggerUpdate.add((e) => this.checkTouchTurnedToPinch(e.interactor))
    this.interactable.onTriggerEnd.add(() => this.onTouchEnded())
    this.interactable.onTriggerEndOutside.add(() => this.onTouchEnded())
    this.interactable.onTriggerCanceled.add(() => this.onTouchEnded())
    // hover (a hand or the mouse pointing at the toy): only counted, for the "alive" reaction (see Alive.ts)
    this.interactable.onHoverEnter.add(() => {
      this.hoverCount++
    })
    this.interactable.onHoverExit.add(() => {
      this.hoverCount = Math.max(0, this.hoverCount - 1)
    })
  }

  // True while a hand or the mouse hovers the toy.
  isHovered(): boolean {
    return this.hoverCount > 0
  }

  // Put the toy at its editable start position, moved inside the stage / off other units if needed.
  private placeAtStart(isReset: boolean): void {
    const s = this.toyCfg.homePosition
    const start = this.bounds.resolveLanding(this, { x: s.x, z: s.z }).pos
    if (Math.hypot(start.x - s.x, start.z - s.z) > 0.05) {
      const msg = this.sceneObject.name + " home position was outside the stage or overlapped another toy or pad; moved to the nearest free spot"
      if (isReset) console.log("[ToyInteraction] " + msg)
      else console.warn("[ToyInteraction] " + msg)
    }
    this.tr.setLocalPosition(new vec3(start.x, this.restY() + s.y, start.z))
    this.target = start
    this.socket = { x: start.x, z: start.z } // the spot the toy stands at today is its socket
    this.slide = null
    this.placed = true
  }

  private restY(): number {
    return this.toyCfg.restHeight // stage floor is local y = 0
  }

  // ---- input -------------------------------------------------------------------
  private onTriggerStart(e: InteractorEvent): void {
    if (!this.cfg || this.state === State.Held) return
    if (e.interactor.inputType === InteractorInputType.Mouse) {
      // the mouse reports pinch + poke together, so decide by how long the button is held (see onUpdate)
      if (this.state !== State.Idle || getTime() - this.lastRelease < this.cfg.pokeLockoutAfterRelease) {
        this.beginGrab(e.interactor) // a toy in motion can still be caught with the mouse
        return
      }
      this.pendingClick = true
      this.pokeHand = e.interactor.inputType === InteractorInputType.Mouse ? -1 : e.interactor.inputType
      this.pokeBeganAt = getTime()
      this.clickInteractor = e.interactor
      this.clickStartTime = getTime()
      this.clickStartPoint = e.interactor.startPoint
      return
    }
    const trig = e.interactor.currentTrigger
    const pinch = (trig & InteractorTriggerType.Pinch) !== 0 // the mouse reports pinch + poke: counts as pinch
    const poke = !pinch && (trig & InteractorTriggerType.Poke) !== 0
    if (pinch) {
      this.pendingPoke = false
      this.beginGrab(e.interactor)
    } else if (poke) {
      // a poke only counts on a toy that is resting, and not just after it was let go
      if (this.state !== State.Idle || getTime() - this.lastRelease < this.cfg.pokeLockoutAfterRelease) return
      // a fingertip touch: wait and see whether it turns into a pinch (grab) or just ends (poke)
      this.pendingPoke = true
      this.pokeHand = e.interactor.inputType
      this.pokeBeganAt = getTime()
      this.pokeInteractor = e.interactor
      this.pokeDepth = e.interactor.interactionStrength ?? 0
    }
  }

  // a touch that became a pinch is a grab, not a poke
  private checkTouchTurnedToPinch(interactor: Interactor): void {
    if (!this.pendingPoke || this.state === State.Held) return
    if ((interactor.currentTrigger & InteractorTriggerType.Pinch) !== 0) {
      this.pendingPoke = false
      this.pokeInteractor = null
      this.beginGrab(interactor)
    }
  }

  // the touch or pinch is over
  private onTouchEnded(): void {
    if (this.state === State.Held) {
      this.endGrab()
    } else if (this.pendingClick) {
      // button released before the hold time: a click is a poke
      this.pendingClick = false
      this.clickInteractor = null
      this.cfg.log(this.sceneObject.name + ": mouse click -> poke")
      this.doPoke()
    } else if (this.pendingPoke) {
      this.pendingPoke = false
      this.pokeInteractor = null
      if (this.state !== State.Idle) return
      if (this.pokeDepth < this.cfg.pokeMinDepth) {
        this.cfg.log(this.sceneObject.name + ": touch too light for a poke (depth " + this.pokeDepth.toFixed(2) + ")")
        return
      }
      this.cfg.log(this.sceneObject.name + ": poke depth " + this.pokeDepth.toFixed(2))
      this.doPoke()
    }
  }

  private doPoke(): void {
    if (!this.cfg.airPokeCyclesVolume) return // air-poke is switched off: pads only
    const now = getTime()
    if (now - this.lastPoke < this.cfg.pokeDebounce) return
    // A finger that touches this toy AND its pad: the pad changes the volume the moment it is touched, but
    // the air-poke is only decided when the touch ENDS. If the volume changed since this touch began, the
    // same finger action was already counted by the pad, so the air-poke is dropped.
    if (this.vol.lastChangeTime >= this.pokeBeganAt) {
      this.cfg.log(this.sceneObject.name + ": air-poke dropped (the pad already handled this touch)")
      return
    }
    if (!this.vol.requestCycle("airPoke", this.pokeHand)) return // the cooldown covers anything else that slipped through
    this.lastPoke = now
    this.onPoke.invoke({ toy: this })
  }

  private beginGrab(interactor: Interactor): void {
    this.appliedPush = { x: 0, z: 0 } // keep the toy exactly where it is on screen: the push becomes part of its position
    this.heldBy = interactor
    this.grabToyStart = this.tr.getWorldPosition()
    this.grabHandStart = interactor.startPoint ? interactor.startPoint : this.grabToyStart
    this.grabTime = getTime()
    this.grabMoved = 0
    this.grabPlaneNormal = interactor.direction ?? vec3.back()
    // the cursor may not be exactly over the toy's pivot: remember the offset so the toy doesn't jump
    this.grabOffset = vec3.zero()
    const hit = this.cursorOnGrabPlane(interactor)
    if (hit) this.grabOffset = this.grabToyStart.sub(hit)
    this.slide = null
    this.tr.setLocalRotation(this.baseRot) // caught mid-float: stand upright in the hand
    this.state = State.Held
    this.cfg.log(this.sceneObject.name + " grabbed")
    this.onGrab.invoke({ toy: this, worldPosition: this.grabToyStart })
  }

  // CALL HOME: send this toy back to its socket, whatever it is doing. Held: let go. In the air or settling: head for
  // the socket. Standing elsewhere: float home. Already on its socket: nothing happens.
  callHome(): void {
    if (!this.placed || !this.socket) return
    this.pendingPoke = false
    this.pokeInteractor = null
    this.pendingClick = false
    this.clickInteractor = null
    const home: G.P = { x: this.socket.x, z: this.socket.z }
    if (this.state === State.Held) {
      this.endGrab(true)
      return
    }
    if (this.state !== State.Idle) {
      this.target = home // already floating, settling or rescued: just make sure it is the socket
      return
    }
    const p = this.baseLocal()
    if (Math.hypot(p.x - home.x, p.z - home.z) <= 0.02) return
    this.slide = null
    this.target = home
    this.driftTime = 0
    this.driftBase = p
    this.driftFloorY = Math.min(this.restY() + this.cfg.hoverHeight, p.y)
    this.state = State.Drifting
    this.cfg.log(this.sceneObject.name + " called home")
    this.onDriftStart.invoke({ toy: this })
  }

  private endGrab(forceSocket: boolean = false): void {
    if (this.state !== State.Held) return
    const interactor = this.heldBy
    this.heldBy = null
    this.lastRelease = getTime()

    const worldPos = this.tr.getWorldPosition()
    const local = this.bounds.worldToLocal(worldPos)
    const dist = worldPos.distance(this.bounds.stageWorldPosition())
    this.onRelease.invoke({ toy: this, worldPosition: worldPos, distanceFromStage: dist })

    // where to land: its own socket (Toys Return To Sockets), or the nearest valid point inside the stage to where it was let go
    const sock = this.socketMode() || (forceSocket && !!this.socket)
    const desired: G.P = { x: local.x, z: local.z }
    const result = sock ? { pos: { x: this.socket!.x, z: this.socket!.z }, reason: "none" as string } : this.bounds.resolveLanding(this, desired)
    this.target = result.pos
    const rescue = this.cfg.enforceBounds && dist > this.cfg.maxRescueDistance
    if (result.reason !== "none" || rescue) {
      const reason: LandingReasonEx = rescue ? "rescue" : (result.reason as LandingReasonEx)
      this.onLandingCorrected.invoke({
        toy: this,
        from: worldPos,
        to: this.bounds.localToWorld(new vec3(result.pos.x, this.restY(), result.pos.z)),
        reason: reason
      })
    }
    this.cfg.log(
      this.sceneObject.name + " released " + dist.toFixed(1) + " cm from stage, " + (sock ? "returning to its socket (" : "landing (") +
        result.pos.x.toFixed(2) + ", " + result.pos.z.toFixed(2) + ") reason=" + (rescue ? "rescue" : result.reason)
    )
    this.driftTime = 0
    this.driftBase = this.tr.getLocalPosition()
    this.driftFloorY = Math.min(this.restY() + this.cfg.hoverHeight, this.driftBase.y) // never pop upward
    this.state = rescue ? State.Rescue : State.Drifting
    this.onDriftStart.invoke({ toy: this })
  }

  // ---- per-frame motion ----------------------------------------------------------
  private onUpdate(): void {
    this.removePush() // work on the toy's real position; StageBounds adds the push again in LateUpdate
    if (!this.cfg || !this.bounds || !this.toyCfg) return
    const dt = getDeltaTime()
    if (!this.placed) {
      this.placeAtStart(false)
      return
    }
    if (this.pendingClick && this.clickInteractor) this.updatePendingClick()
    if (this.pendingPoke && this.pokeInteractor) {
      this.pokeDepth = Math.max(this.pokeDepth, this.pokeInteractor.interactionStrength ?? 0)
      this.checkTouchTurnedToPinch(this.pokeInteractor)
      if (this.pendingPoke && this.pokeInteractor.currentTrigger === InteractorTriggerType.None) this.onTouchEnded()
    }
    // read the socket fresh every frame, so a socket that moves is followed at once
    if (this.socketMode() && (this.state === State.Drifting || this.state === State.Settling || this.state === State.Rescue)) {
      this.target = { x: this.socket!.x, z: this.socket!.z }
    }
    switch (this.state) {
      case State.Held:
        this.updateHeld(dt)
        break
      case State.Drifting:
        this.updateDrift(dt)
        break
      case State.Settling:
        this.updateSettle(dt)
        break
      case State.Rescue:
        this.updateRescue(dt)
        break
      default:
        this.updateIdle(dt)
    }
  }

  // mouse button is down: held long enough, or dragged -> pinch (grab); released earlier -> poke (onTouchEnded)
  private updatePendingClick(): void {
    const it = this.clickInteractor
    if (!it || it.currentTrigger === InteractorTriggerType.None) return // release is handled by onTouchEnded
    const sp = it.startPoint
    const dragged = sp && this.clickStartPoint ? sp.distance(this.clickStartPoint) > 1 : false
    if (getTime() - this.clickStartTime >= this.cfg.mouseHoldSeconds || dragged) {
      this.pendingClick = false
      this.clickInteractor = null
      this.beginGrab(it)
    }
  }

  // where the mouse ray crosses the plane through the toy that faces the camera (null if parallel)
  private cursorOnGrabPlane(it: Interactor): vec3 | null {
    const o = it.startPoint
    const d = it.direction
    if (!o || !d) return null
    const n = this.grabPlaneNormal
    const denom = d.dot(n)
    if (Math.abs(denom) < 0.0001) return null
    return o.add(d.uniformScale(this.grabToyStart.sub(o).dot(n) / denom))
  }

  private updateHeld(dt: number): void {
    const h = this.heldBy
    if (!h || h.currentTrigger === InteractorTriggerType.None) {
      this.endGrab() // the hand let go but no end event arrived
      return
    }
    const sp = h.startPoint
    if (!sp) return
    let goal: vec3
    if (h.inputType === InteractorInputType.Mouse) {
      // the mouse ray starts at the camera, so its origin barely moves: follow the cursor instead, on the
      // plane (facing the camera) the toy was grabbed on. Moving the cursor up lifts the toy up.
      const hit = this.cursorOnGrabPlane(h)
      if (!hit) return
      goal = hit.add(this.grabOffset)
    } else {
      const move = sp.sub(this.grabHandStart).uniformScale(this.cfg.grabMoveScale)
      goal = this.grabToyStart.add(move)
    }
    const speed = this.cfg.grabFollowSpeed
    const k = speed <= 0 ? 1 : 1 - Math.exp(-speed * dt)
    const now = this.tr.getWorldPosition()
    const next = vec3.lerp(now, goal, k)
    this.grabMoved = Math.max(this.grabMoved, next.distance(this.grabToyStart))
    this.tr.setWorldPosition(next)
  }

  // slow fall (y) while sliding sideways toward a corrected spot; then settle
  // Like a feather or balloon: the fall slows as it nears the stage, and the toy sways and tilts gently.
  // The sway fades to nothing by the time it arrives, so it still lands exactly on its target.
  private updateDrift(dt: number): void {
    const p = this.driftBase // the smooth path; the sway is added on top when applying
    const floorY = Math.max(this.restY(), this.driftFloorY)
    const above = p.y - floorY
    const nearFloor = Math.min(1, Math.max(0.3, above / 3)) // slow the last few cm
    const fall = Math.max(this.toyCfg.rDriftSpeed * nearFloor, (p.y - this.restY()) / Math.max(0.1, this.cfg.maxDriftSeconds))
    const y = Math.max(floorY, p.y - fall * dt)
    let x = p.x
    let z = p.z
    const dx = this.target.x - x
    const dz = this.target.z - z
    const len = Math.hypot(dx, dz)
    const step = this.cfg.driftLateralSpeed * dt
    if (len <= step || len < 0.001) {
      x = this.target.x
      z = this.target.z
    } else {
      x += (dx / len) * step
      z += (dz / len) * step
    }
    this.driftBase = new vec3(x, y, z)
    this.driftTime += dt

    const fade = Math.min(1, Math.max(0, (y - floorY) / 6)) // 1 high up, 0 at the hover height
    const w = this.driftTime * 2.1 * this.cfg.floatSwaySpeed
    const sx = Math.sin(w)
    const sz = Math.sin(w * 0.8 + 1.3)
    const amp = this.cfg.floatSway * fade
    this.tr.setLocalPosition(new vec3(x + sx * amp, y, z + sz * amp * 0.8))
    const tilt = (this.cfg.floatTilt * Math.PI) / 180 * fade
    const wobble = quat.fromEulerVec(new vec3(Math.cos(w * 0.8 + 1.3) * tilt * 0.8, 0, -Math.cos(w) * tilt))
    this.tr.setLocalRotation(this.baseRot.multiply(wobble))

    const arrived = y <= floorY + 0.001 && Math.hypot(this.target.x - x, this.target.z - z) < 0.001
    if (arrived || this.driftTime > this.cfg.maxDriftSeconds * 3) this.beginSettle()
  }

  private beginSettle(): void {
    this.settleFrom = this.tr.getLocalPosition()
    this.settleRotFrom = this.tr.getLocalRotation()
    this.settleT = 0
    this.state = State.Settling
  }

  private updateSettle(dt: number): void {
    const dur = Math.max(0.01, this.toyCfg.rSettleDuration)
    this.settleT = Math.min(1, this.settleT + dt / dur)
    const k = ease(this.cfg.settleEasing, this.settleT)
    const goal = new vec3(this.target.x, this.restY(), this.target.z) // recomputed so a neighbour's nudge is followed
    const p = vec3.lerp(this.settleFrom, goal, k)
    this.tr.setLocalPosition(new vec3(p.x, Math.max(this.restY(), p.y), p.z))
    this.tr.setLocalRotation(quat.slerp(this.settleRotFrom, this.baseRot, k)) // level out any tilt
    if (this.settleT >= 1) this.finish()
  }

  private updateRescue(dt: number): void {
    const p = this.tr.getLocalPosition()
    const goal = new vec3(this.target.x, this.restY() + this.cfg.hoverHeight, this.target.z)
    goal.y = Math.min(goal.y, Math.max(this.restY(), this.driftFloorY))
    const to = goal.sub(p)
    const len = to.length
    const step = this.cfg.rescueSpeed * dt
    if (len <= step || len < 0.001) {
      this.tr.setLocalPosition(goal)
      this.beginSettle()
    } else {
      this.tr.setLocalPosition(p.add(to.uniformScale(step / len)))
    }
  }

  private finish(): void {
    this.state = State.Idle
    this.slide = null
    this.cfg.log(this.sceneObject.name + " settled")
    this.onSettle.invoke({ toy: this, localPosition: this.tr.getLocalPosition() })
  }

  private updateIdle(dt: number): void {
    const p = this.tr.getLocalPosition()
    // with sockets, an idle toy that is not on its socket (the socket moved, the stage changed) slides to it
    if (this.socketMode() && !this.slide && Math.hypot(p.x - this.socket!.x, p.z - this.socket!.z) > 0.02) {
      this.slide = { x: this.socket!.x, z: this.socket!.z }
    }
    // keep the toy on the floor and follow any gentle slide a neighbour asked for
    if (this.slide) {
      const k = 1 - Math.exp(-8 * dt)
      const x = p.x + (this.slide.x - p.x) * k
      const z = p.z + (this.slide.z - p.z) * k
      this.tr.setLocalPosition(new vec3(x, this.restY(), z))
      if (Math.hypot(this.slide.x - x, this.slide.z - z) < 0.01) {
        this.tr.setLocalPosition(new vec3(this.slide.x, this.restY(), this.slide.z))
        this.slide = null
      }
    }
    // safety net: a toy found outside the stage (stage resized or moved) is sent back inside
    this.safetyTimer += dt
    if (this.safetyTimer > 0.25) {
      this.safetyTimer = 0
      if (!this.socketMode() && !this.slide && !this.bounds.isInside(p.x, p.z, this.unit())) {
        const r = this.bounds.resolveLanding(this, { x: p.x, z: p.z })
        this.nudgeTo(r.pos.x, r.pos.z)
      }
    }
  }
}
