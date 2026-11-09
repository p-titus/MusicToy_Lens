// StageAnchor - puts the stage on the real table, then LOCKS it in the world.
//
// How it works:
//   1. A "search" starts (at the start, and again on every re-place). It sends a World Query ray from the
//      head along the gaze, a few times a second (StageConfig > World Query > Refresh Rate).
//   2. Each answer is judged (a hit? close enough? flat enough? below the eyes?) and logged. After enough
//      good hits in a row, the stage is placed on the table, facing you, and left there. The stage is a half-ellipse-like
//      shape whose origin is the middle of its flat edge (the conductor's spot); the gaze point becomes the
//      middle of the stage's surface (StageConfig > Stage Placement > Gaze Depth Ratio).
//   3. If the search runs out of time (no surface found, a null hit, or no World Query in this preview),
//      the stage is placed as a FLOATING FALLBACK in front of you instead, so the Lens still works.
//   4. Re-place: hold a palm tap for the configured time (Editor: hold the R key). The search runs again
//      from where you are looking.
//   5. Move by hand: StageMoveHandle (a pinch-drag handle on the stage) calls beginUserMove / userMoveTo /
//      endUserMove. While a hand move is on, searching and the hold gesture are paused.
// The stage never follows the head after it is placed. All numbers are in StageConfig.
//
// Preview note: every World Query class is wearable-only, so a Preview room may give no hits at all.
// Every result (hit or miss, surface type) is logged so you can see what the room does.

import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import { StageConfig } from "./StageConfig"
import { ToyInteraction } from "./ToyInteraction"

export type StagePlacement = {
  mode: "table" | "fallback"
  worldPosition: vec3
  surfaceNormal: vec3 | null
  reason: string
}

@component
export class StageAnchor extends BaseScriptComponent {
  // Subscribe from your own scripts (a sparkle when the stage lands, a "no table found" hint, ...).
  public onPlaced: Event<StagePlacement> = new Event()
  public onSearchStart: Event<{ reason: string }> = new Event()
  public onMoved: Event<{ worldPosition: vec3 }> = new Event() // the user dragged the stage (fires every move)

  private cfg: StageConfig
  private worldQuery: WorldQueryModule | null = null
  private session: HitTestSession | null = null
  private searching: boolean = false
  private searchStart: number = 0
  private lastQuery: number = -10
  private queryPending: boolean = false
  private goodHits: number = 0
  private lastGood: { position: vec3; normal: vec3 } | null = null
  private queryCount: number = 0
  private hitCount: number = 0
  private missCount: number = 0

  private gesture: GestureModule | null = null
  private palmDown: boolean[] = [false, false] // left, right
  private keyDown: boolean = false
  private holdStart: number = 0
  private fired: boolean = false
  private placedOnce: boolean = false
  private mode: "table" | "fallback" | "none" = "none"
  private lastNormal: vec3 | null = null
  private movingByHand: boolean = false
  private depthOn: boolean = false
  private centreOnToys: boolean = false // set for one search: a re-place by hold gesture

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
    this.createEvent("KeyPressEvent").bind((e) => {
      if (e.key === Keys.R) this.keyDown = true
    })
    this.createEvent("KeyReleaseEvent").bind((e) => {
      if (e.key === Keys.R) this.keyDown = false
    })
  }

  // "table" or "fallback" (or "none" before the first placement)
  currentMode(): string {
    return this.mode
  }

  // World-space normal of the table the stage sits on, or null in the floating fallback (nothing to follow).
  // Read by StageFrame so the outline can lie flat on the real surface.
  surfaceNormal(): vec3 | null {
    return this.lastNormal
  }

  private onStart(): void {
    this.setUpWorldQuery()

    // first search once head tracking has settled; until then the stage is parked in the fallback spot
    this.placeFallback("parked until the first search")
    const later = this.createEvent("DelayedCallbackEvent")
    later.bind(() => this.beginSearch("start"))
    later.reset(Math.max(0.05, this.cfg.placementDelay))

    // palm tap events exist only on Specs hardware; in the Editor the R key stands in for them
    try {
      this.gesture = require("LensStudio:GestureModule") as GestureModule
      const hands = [GestureModule.HandType.Left, GestureModule.HandType.Right]
      for (let i = 0; i < 2; i++) {
        this.gesture.getPalmTapDownEvent(hands[i]).add(() => (this.palmDown[i] = true))
        this.gesture.getPalmTapUpEvent(hands[i]).add(() => (this.palmDown[i] = false))
      }
    } catch (e) {
      this.cfg.log("palm tap gesture not available here: " + e)
    }
  }

  private setUpWorldQuery(): void {
    if (!this.cfg.useWorldQuery) {
      console.log("[Stage] World Query is switched off in StageConfig: the floating fallback stage will be used")
      return
    }
    try {
      this.worldQuery = require("LensStudio:WorldQueryModule") as WorldQueryModule
      const options = HitTestSessionOptions.create()
      options.filter = this.cfg.queryFilter
      if (this.cfg.useClassification) options.classification = true
      this.session = this.worldQuery.createHitTestSessionWithOptions(options)
      // depth only runs after start(); beginSearch() starts it and finishSearch() / beginUserMove() stop it
      // (unless Stop Depth When Idle is OFF, then it is started in beginSearch and never stopped)
    } catch (e) {
      this.session = null
      console.warn("[Stage] World Query is not available here (" + e + "). The floating fallback stage will be used.")
    }
  }

  // ---- searching -----------------------------------------------------------------
  // Depth sensing runs only while a session is started. Cheap no-ops when already in the wanted state.
  private startDepth(): void {
    if (!this.session || this.depthOn) return
    try {
      this.session.start()
      this.depthOn = true
    } catch (e) {
      console.warn("[Stage] World Query start failed: " + e)
    }
  }

  private stopDepthIfIdle(): void {
    if (!this.session || !this.depthOn || !this.cfg.stopDepthWhenIdle) return
    try {
      this.session.stop()
      this.depthOn = false
      this.queryPending = false
      this.cfg.log("World Query depth stopped (idle)")
    } catch (e) {
      console.warn("[Stage] World Query stop failed: " + e)
    }
  }

  private beginSearch(reason: string): void {
    this.centreOnToys = reason === "hold gesture" && this.cfg.replaceCentreOnToys
    this.startDepth()
    this.searching = true
    this.searchStart = getTime()
    this.lastQuery = -10
    this.goodHits = 0
    this.lastGood = null
    this.queryPending = false
    this.onSearchStart.invoke({ reason: reason })
    console.log("[Stage] searching for the table (" + reason + ")")
    if (!this.session) this.finishSearch() // nothing to ask: go straight to the fallback
  }

  private onUpdate(): void {
    if (!this.cfg) return
    this.updateReplaceGesture()
    if (!this.searching) return
    const now = getTime()
    if (now - this.searchStart >= this.cfg.searchSeconds) {
      this.finishSearch()
      return
    }
    const gap = 1 / Math.max(0.5, this.cfg.queryRefreshRate)
    if (!this.queryPending && now - this.lastQuery >= gap) {
      this.lastQuery = now
      this.sendQuery()
    }
  }

  private sendQuery(): void {
    if (!this.session) return
    const cam = this.cfg.cameraObject.getTransform()
    const start = cam.getWorldPosition()
    const end = start.add(cam.back.uniformScale(this.cfg.searchRayLength)) // a camera looks along its back (-Z)
    this.queryPending = true
    this.queryCount++
    try {
      this.session.hitTest(start, end, (hit: WorldQueryHitTestResult | null) => {
        this.queryPending = false
        this.onResult(hit, start)
      })
    } catch (e) {
      this.queryPending = false
      console.warn("[Stage] hitTest failed: " + e)
    }
  }

  // Judge one answer. A null answer (ray outside the camera view, or no surface) is a miss.
  private onResult(hit: WorldQueryHitTestResult | null, head: vec3): void {
    if (!this.searching) return
    if (!hit) {
      this.missCount++
      this.goodHits = 0 // hits must come in a row
      if (this.cfg.logQueries) console.log("[Stage] World Query #" + this.queryCount + ": MISS (null: no surface in the ray, or outside the camera view)")
      return
    }
    this.hitCount++
    const c = this.cfg
    const dist = hit.position.distance(head)
    const drop = head.y - hit.position.y
    const up = hit.normal.normalize().y
    let surface = "n/a"
    if (c.useClassification) surface = hit.classification === SurfaceClassification.Ground ? "Ground" : "None"

    let reject = ""
    if (dist < c.minHitDistance) reject = "too close (" + dist.toFixed(0) + " cm)"
    else if (dist > c.maxHitDistance) reject = "too far (" + dist.toFixed(0) + " cm)"
    else if (up < c.minSurfaceUp) reject = "not flat enough (normal up " + up.toFixed(2) + ")"
    else if (drop < c.minDropBelowEye) reject = "too high (" + drop.toFixed(0) + " cm below the eyes)"
    else if (drop > c.maxDropBelowEye) reject = "too low, probably the floor (" + drop.toFixed(0) + " cm below the eyes)"
    else if (c.useClassification && hit.classification === SurfaceClassification.Ground) reject = "classified as Ground"

    if (c.logQueries) {
      console.log(
        "[Stage] World Query #" + this.queryCount + ": HIT at " + hit.position.toString() + " normal " + hit.normal.toString() +
          " surface " + surface + " distance " + dist.toFixed(0) + " cm, " + drop.toFixed(0) + " cm below eyes -> " +
          (reject === "" ? "accepted" : "rejected: " + reject)
      )
    }
    if (reject !== "") {
      this.goodHits = 0
      return
    }
    this.goodHits++
    this.lastGood = { position: hit.position, normal: hit.normal }
    if (this.goodHits >= Math.max(1, Math.round(c.hitsRequired))) this.finishSearch()
  }

  private finishSearch(): void {
    this.searching = false
    this.stopDepthIfIdle()
    if (this.lastGood && this.goodHits >= Math.max(1, Math.round(this.cfg.hitsRequired))) {
      this.placeOnTable(this.lastGood.position, this.lastGood.normal)
    } else {
      const why = this.session
        ? "no table found in " + this.cfg.searchSeconds + " s (" + this.hitCount + " hits, " + this.missCount + " misses in total)"
        : "World Query unavailable or switched off"
      this.placeFallback(why)
    }
  }

  // ---- placing -----------------------------------------------------------------
  // The stage's flat forward direction: from the head toward where the stage is, level with the ground.
  private yawToward(target: vec3): quat {
    const head = this.cfg.cameraObject.getTransform().getWorldPosition()
    let flat = new vec3(target.x - head.x, 0, target.z - head.z)
    if (flat.length < 0.001) flat = new vec3(0, 0, -1)
    flat = flat.normalize()
    return quat.angleAxis(Math.atan2(-flat.x, -flat.z), vec3.up())
  }

  private placeOnTable(surface: vec3, normal: vec3): void {
    const focus = surface.add(new vec3(0, this.cfg.heightOffset, 0))
    this.apply(focus, "table", normal, "table found")
  }

  // Floating fallback: in front of the head along the flat gaze, at the fallback height.
  private placeFallback(why: string): void {
    const cam = this.cfg.cameraObject.getTransform()
    const head = cam.getWorldPosition()
    let flat = new vec3(cam.back.x, 0, cam.back.z)
    if (flat.length < 0.001) flat = new vec3(0, 0, -1)
    flat = flat.normalize()
    const focus = head.add(flat.uniformScale(this.cfg.distanceFromUser)).add(new vec3(0, this.cfg.fallbackHeightOffset, 0))
    this.apply(focus, "fallback", null, why)
  }

  // `focus` is the point the user is looking at (on the table, or in the air for the fallback). The stage origin
  // (the middle of the flat edge, the conductor's spot) goes back toward the user from it, so that the focus
  // lands at Gaze Depth Ratio of the way from the flat edge to the far point.
  private apply(focus: vec3, mode: "table" | "fallback", normal: vec3 | null, why: string): void {
    const head = this.cfg.cameraObject.getTransform().getWorldPosition()
    let flat = new vec3(focus.x - head.x, 0, focus.z - head.z)
    if (flat.length < 0.001) flat = new vec3(0, 0, -1)
    flat = flat.normalize()
    const rot = this.yawToward(focus) // the stage's +Z side (the flat edge) faces you; it stays flat
    let pos = focus.sub(flat.uniformScale(this.cfg.gazeDepthRatio * this.cfg.stageDepth))
    if (this.centreOnToys && this.cfg.toys) {
      // re-place: the middle of the toys (stage-local) goes under the gaze point instead of the default middle
      const c = this.toysCentreLocal()
      if (c) {
        pos = focus.sub(rot.multiplyVec3(new vec3(c.x, 0, c.z)))
        console.log("[Stage] re-place centred on the toys (stage-local " + c.x.toFixed(1) + ", " + c.z.toFixed(1) + " cm)")
      }
    }
    this.centreOnToys = false
    const t = this.sceneObject.getTransform()
    t.setWorldPosition(pos)
    t.setWorldRotation(rot)
    const first = !this.placedOnce
    this.placedOnce = true
    this.mode = mode
    this.lastNormal = mode === "table" ? normal : null
    console.log("[Stage] placed as " + mode.toUpperCase() + " at " + pos.toString() + " (" + why + ")")
    if (mode === "fallback" && why.indexOf("parked") === 0) return // quiet: the real search follows
    this.onPlaced.invoke({ mode: mode, worldPosition: pos, surfaceNormal: normal, reason: first ? why + " (first placement)" : why })
  }

  // Average stage-local (x, z) cm of the sockets (or of the toys themselves when they do not return to sockets).
  // Read BEFORE the stage moves, so toy positions are turned into stage-local with the stage's current transform.
  // Null when no toy gives a position.
  private toysCentreLocal(): { x: number; z: number } | null {
    const st = this.sceneObject.getTransform()
    const stagePos = st.getWorldPosition()
    const inv = st.getWorldRotation().invert()
    let sx = 0
    let sz = 0
    let n = 0
    for (const toy of this.cfg.toys) {
      if (!toy || !toy.enabled) continue
      let x: number
      let z: number
      const inter = toy.getComponent(ToyInteraction.getTypeName()) as ToyInteraction
      if (this.cfg.toysReturnToSockets && inter) {
        const s = inter.socketLocal()
        x = s.x
        z = s.z
      } else {
        const l = inv.multiplyVec3(toy.getTransform().getWorldPosition().sub(stagePos))
        x = l.x
        z = l.z
      }
      sx += x
      sz += z
      n++
    }
    return n > 0 ? { x: sx / n, z: sz / n } : null
  }

  // ---- moving by hand (called by StageMoveHandle) ---------------------------------
  isMovingByHand(): boolean {
    return this.movingByHand
  }

  // A hand drag starts: stop any search so it cannot snap the stage away from the hand.
  beginUserMove(): void {
    this.movingByHand = true
    this.searching = false
    this.stopDepthIfIdle()
    this.holdStart = 0
    this.fired = false
  }

  // Put the stage origin at `origin` (world cm). The height is kept: the stage slides over the surface it is on.
  // The flat distance from the head is held between Move Min / Max Distance. Optionally turns to face the user.
  userMoveTo(origin: vec3, faceUser: boolean): void {
    const t = this.sceneObject.getTransform()
    const head = this.cfg.cameraObject.getTransform().getWorldPosition()
    let flat = new vec3(origin.x - head.x, 0, origin.z - head.z)
    const d = flat.length
    if (d < 0.001) flat = new vec3(0, 0, -1)
    else flat = flat.uniformScale(1 / d)
    const clamped = Math.max(this.cfg.moveMinDistance, Math.min(this.cfg.moveMaxDistance, d))
    const pos = new vec3(head.x + flat.x * clamped, t.getWorldPosition().y, head.z + flat.z * clamped)
    t.setWorldPosition(pos)
    if (faceUser) t.setWorldRotation(this.yawToward(pos))
    this.onMoved.invoke({ worldPosition: pos })
  }

  endUserMove(): void {
    this.movingByHand = false
    this.cfg.log("stage moved by hand to " + this.sceneObject.getTransform().getWorldPosition().toString())
  }

  // ---- re-place gesture ----------------------------------------------------------
  private updateReplaceGesture(): void {
    if (this.movingByHand) return
    if (!this.cfg.enableReplaceGesture) {
      this.fired = false
      return
    }
    const down = this.palmDown[0] || this.palmDown[1] || this.keyDown
    if (!down) {
      this.fired = false
      this.holdStart = 0
      return
    }
    if (this.holdStart === 0) this.holdStart = getTime()
    if (!this.fired && getTime() - this.holdStart >= this.cfg.replaceHoldSeconds) {
      this.fired = true
      this.beginSearch("hold gesture")
    }
  }
}
