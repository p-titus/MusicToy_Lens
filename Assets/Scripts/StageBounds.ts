// StageBounds - the stage's landing area (a half-ellipse-like shape: the conductor's orchestra), seen from the Lens.
// It converts between world and stage-local space (so the bounds follow the stage if you move,
// rotate or scale it), keeps the list of toys, decides where a released toy should land,
// checks the layout has enough free space, and draws the optional debug outline of the real bounds.
// The pure maths is in StageGeometry.ts. This script has no settings of its own.
// The visible frame is a separate thing (StageFrame.ts): it is only a picture and never decides where toys go.

import { StageConfig } from "./StageConfig"
import { ToyConfig } from "./ToyConfig"
import * as G from "./StageGeometry"
import { framePieces, STYLE_LINE } from "./FramePath"

// What a toy must offer so the stage can plan around it.
export interface BoundsToy {
  readonly sceneObject: SceneObject
  isHeld(): boolean // a held toy is in the user's hand, so it does not block anything
  isPlaced(): boolean // false while the toy is being put back at its start (it does not block anything yet)
  footprint(): number // the TOY's own footprint diameter on the stage floor (cm), from its stretched shape
  unit(): G.Unit // the toy plus its pad, as discs: this is what edge padding, clamping and nudging use
  beginReset(): void // reset step 1: forget the current spot
  finishReset(): void // reset step 2: go to the start position (after every toy did step 1)
  restXZ(): G.P // where the toy rests (or is about to rest), stage-local
  nudgeTo(x: number, z: number): void // ask the toy to glide to a new resting spot
  pushRadius(): number // cm: half the footprint, used to keep toys from overlapping
  pushHeight(): number // cm: the toy's height, so a toy carried high above another does not push it
  baseLocal(): vec3 // the toy's own position (stage-local), without the push
  applyPush(x: number, z: number): void // put the toy this far (stage-local cm) away from its own position
  socketXZ(): G.P // this toy's own socket, stage-local cm
  socketDiameter(): number // cm: the disc that the socket's ring and dial button cover
}

@component
export class StageBounds extends BaseScriptComponent {
  private cfg: StageConfig
  private toys: BoundsToy[] = []
  private outlineKey: string = ""

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
      c.onReset("toyPositions", () => this.resetAllToys())
    })
    this.createEvent("LateUpdateEvent").bind(() => this.updatePush(getDeltaTime()))
    this.createEvent("UpdateEvent").bind(() => {
      this.updateVisuals()
      // the fit check waits one frame so every pad has told its toy how big the unit is
      if (!this.checked && this.cfg) {
        this.checked = true
        this.checkFreeSpace()
      }
    })
  }

  private checked: boolean = false

  // Reset ALL toys to their start positions. Two steps so every toy lands against the others' START spots,
  // not against where the others happened to be.
  resetAllToys(): void {
    for (const t of this.toys) t.beginReset()
    for (const t of this.toys) t.finishReset()
  }

  // ---- space conversion --------------------------------------------------
  worldToLocal(p: vec3): vec3 {
    return this.sceneObject.getTransform().getInvertedWorldTransform().multiplyPoint(p)
  }

  localToWorld(p: vec3): vec3 {
    return this.sceneObject.getTransform().getWorldTransform().multiplyPoint(p)
  }

  stageWorldPosition(): vec3 {
    return this.sceneObject.getTransform().getWorldPosition()
  }

  // ---- numbers derived from the config (always read live) ----------------
  // The stage's shape numbers from the Inspector (width, depth and the two handles).
  stageShape(): G.Shape {
    const c = this.cfg
    return G.stageShape(c.stageWidth, c.stageDepth, c.stageBackHandle, c.stageSideHandle)
  }

  // The whole stage (stage-local cm), origin at the middle of its flat edge.
  stageArea(): G.Area {
    return G.stageArea(this.stageShape())
  }

  // Limits for a toy plus its pad: every disc of the unit stays inside the stage, with edge padding.
  limits(): G.Limits {
    return G.stageLimits(this.stageArea(), this.cfg.edgePaddingRatio)
  }

  isInside(x: number, z: number, unit: G.Unit): boolean {
    if (!this.cfg.enforceBounds) return true // layout mode: nothing is "outside"
    return this.limits().inside({ x: x, z: z }, unit)
  }

  clamp(x: number, z: number, unit: G.Unit): G.P {
    if (!this.cfg.enforceBounds) return { x: x, z: z }
    return this.limits().clamp({ x: x, z: z }, unit)
  }

  // ---- toys never overlap ------------------------------------------------
  // Every toy has a small sideways push (stage-local cm) on top of its own position. Each frame (after all the
  // movement scripts have run): the push eases back toward 0, then touching toys are pushed apart. A toy in the
  // user's hand is never pushed; it pushes the others. Otherwise the two share the push equally. Toys at different
  // heights (one carried over another) do not touch. Only the sideways push is applied; nothing here sets a rest position.
  private push: Map<BoundsToy, G.P> = new Map()

  private updatePush(dt: number): void {
    const c = this.cfg
    if (!c) return
    const list = this.toys.filter((t) => t.isPlaced())
    if (!c.pushApartEnabled) {
      this.push.forEach((_o, t) => t.applyPush(0, 0))
      this.push.clear()
      return
    }
    const n = list.length
    const base: vec3[] = []
    const rad: number[] = []
    const hgt: number[] = []
    const held: boolean[] = []
    for (let i = 0; i < n; i++) {
      held.push(list[i].isHeld())
      base.push(list[i].baseLocal())
      rad.push(list[i].pushRadius())
      hgt.push(list[i].pushHeight())
    }
    // The push each toy NEEDS right now, worked out from the toys' own positions alone (a few passes so a pushed
    // toy can push the next one).
    const want: G.P[] = []
    for (let i = 0; i < n; i++) want.push({ x: 0, z: 0 })
    for (let pass = 0; pass < 6; pass++) {
      let moved = false
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (held[i] && held[j]) continue
          if (Math.abs(base[i].y - base[j].y) >= (hgt[i] + hgt[j]) * 0.5) continue // one is above the other
          let dx = base[i].x + want[i].x - (base[j].x + want[j].x)
          let dz = base[i].z + want[i].z - (base[j].z + want[j].z)
          const d = Math.hypot(dx, dz)
          const need = rad[i] + rad[j] + Math.max(0, c.pushGap)
          if (d >= need - 1e-4) continue
          if (d < 1e-4) {
            dx = i % 2 === 0 ? 1 : -1 // exactly on top of each other: any direction will do
            dz = 0.3
          }
          const l = Math.hypot(dx, dz)
          const pen = need - d
          const wi = held[i] ? 0 : held[j] ? 1 : 0.5
          const wj = 1 - wi
          want[i].x += (dx / l) * pen * wi
          want[i].z += (dz / l) * pen * wi
          want[j].x -= (dx / l) * pen * wj
          want[j].z -= (dz / l) * pen * wj
          moved = true
        }
      }
      if (!moved) break
    }
    // Each toy's push moves toward that need: more push closes in over Push Softness, less push eases back at Push Return Speed.
    const soft = c.pushSoftness <= 0 ? 1 : 1 - Math.exp(-dt / c.pushSoftness)
    const back = Math.max(0, c.pushReturnSpeed) * dt
    for (let i = 0; i < n; i++) {
      const o = held[i] ? { x: 0, z: 0 } : this.push.get(list[i]) ?? { x: 0, z: 0 }
      const dx = want[i].x - o.x
      const dz = want[i].z - o.z
      const dist = Math.hypot(dx, dz)
      let nx = o.x
      let nz = o.z
      if (dist > 1e-6) {
        const pushing = Math.hypot(want[i].x, want[i].z) >= Math.hypot(o.x, o.z)
        const step = pushing ? dist * soft : Math.min(dist, back)
        nx += (dx / dist) * step
        nz += (dz / dist) * step
      }
      this.push.set(list[i], { x: nx, z: nz })
      list[i].applyPush(nx, nz)
    }
  }

  // ---- toy list ----------------------------------------------------------
  register(toy: BoundsToy): void {
    if (this.toys.indexOf(toy) < 0) this.toys.push(toy)
  }

  unregister(toy: BoundsToy): void {
    const i = this.toys.indexOf(toy)
    if (i >= 0) this.toys.splice(i, 1)
    this.push.delete(toy)
  }

  // A socket belongs to one toy only, so a socket being dragged may not sit on another toy's socket. Slides `desired`
  // (stage-local cm) away from any socket it overlaps (ring + button discs plus Socket Gap cm). Returns null if no
  // free spot was found in a few passes (the caller then leaves the socket where it is).
  separateFromSockets(toy: BoundsToy, desired: G.P): G.P | null {
    const others = this.toys.filter((t) => t !== toy && t.isPlaced())
    const mine = toy.socketDiameter() * 0.5
    const gap = Math.max(0, this.cfg.socketGap)
    const p: G.P = { x: desired.x, z: desired.z }
    for (let pass = 0; pass < 6; pass++) {
      let moved = false
      for (const o of others) {
        const s = o.socketXZ()
        const need = mine + o.socketDiameter() * 0.5 + gap
        let dx = p.x - s.x
        let dz = p.z - s.z
        let d = Math.hypot(dx, dz)
        if (d >= need) continue
        if (d < 0.001) { dx = 0; dz = 1; d = 1 } // exactly on top: slide toward the front
        p.x = s.x + (dx / d) * need
        p.z = s.z + (dz / d) * need
        moved = true
      }
      if (!moved) return p
    }
    return null
  }

  // Where should `toy` settle if the user lets go at `desired` (stage-local x, z)?
  // Neighbours that had to be pushed are asked to glide to their new spots.
  resolveLanding(toy: BoundsToy, desired: G.P): { pos: G.P; reason: G.LandingReason } {
    // Layout mode (Enforce Bounds OFF): no clamping, no nudging. The toy lands exactly where it was put.
    if (!this.cfg.enforceBounds) return { pos: { x: desired.x, z: desired.z }, reason: "none" }
    const others = this.toys.filter((t) => t !== toy && !t.isHeld() && t.isPlaced())
    const a = this.stageArea()
    const result = G.resolveLanding(
      desired,
      toy.unit(),
      others.map((t) => t.restXZ()),
      others.map((t) => t.unit()),
      this.cfg.spacingRatio,
      this.limits(),
      this.cfg.nudgeEnabled,
      Math.hypot(G.areaExtent(a).halfWidth, G.areaExtent(a).depth) * 2
    )
    if (result.othersMoved) {
      for (let i = 0; i < others.length; i++) {
        const before = others[i].restXZ()
        const after = result.othersMoved[i]
        if (Math.hypot(after.x - before.x, after.z - before.z) > 0.01) others[i].nudgeTo(after.x, after.z)
      }
    }
    return { pos: result.pos, reason: result.reason }
  }

  // ---- fit check ---------------------------------------------------------
  // Warns in the console if the stage is too tight for the toys (or says it is roomy).
  checkFreeSpace(): void {
    const c = this.cfg
    const count = c.toys ? c.toys.length : 8
    // each toy's own footprint (stretching a toy in ToyConfig makes it use more of the stage)
    const sizes: number[] = []
    for (const o of c.toys ? c.toys : []) {
      const tc = o ? (o.getComponent(ToyConfig.getTypeName()) as ToyConfig) : null
      if (tc) for (const d of tc.unitFootprints()) sizes.push(d) // what is under the toy, and the pad strip
      else sizes.push(c.toySize)
      if (tc && tc.footprint() > this.maxToyFootprint()) {
        console.warn(
          "[Stage] " + o.name + " is too big for the stage: footprint " + tc.footprint().toFixed(1) + " cm, largest that fits " +
            this.maxToyFootprint().toFixed(1) + " cm. Lower its Mesh Scale / Size Multiplier or raise Stage Width / Depth."
        )
      }
    }
    while (sizes.length < count) sizes.push(c.toySize)
    const free = G.freeSlots(this.stageArea(), c.toySize, c.spacingRatio, c.edgePaddingRatio, sizes)
    const msg =
      "[Stage] free space = " + free.toFixed(2) + " spare toy slots for " + count + " toys (required " + c.requiredFreeSlots + ")"
    if (free < c.requiredFreeSlots) {
      console.warn(msg + ". TOO TIGHT: raise Stage Width / Depth or make toys smaller (Mesh Scale / Size Multiplier in ToyConfig).")
    } else if (free > c.requiredFreeSlots + 1) {
      console.log(msg + ". The stage is roomier than needed.")
    } else {
      console.log(msg + ". OK.")
    }
  }

  // Biggest footprint that still fits in the stage with its edge padding (its centre area would shrink to a point).
  private maxToyFootprint(): number {
    const e = G.areaExtent(this.stageArea())
    return Math.min(e.halfWidth, e.depth) / (2 * (0.5 + this.cfg.edgePaddingRatio))
  }

  // ---- visuals: debug outline of the real bounds -------------------------
  // Only moves and scales objects you already placed in the scene; nothing is created.
  private updateVisuals(): void {
    const c = this.cfg
    if (!c) return
    const unit = c.primitiveMeshSize > 0 ? c.primitiveMeshSize : 1
    const outline = c.outlineSegments ? c.outlineSegments : []
    const key = [c.stageWidth, c.stageDepth, c.stageBackHandle, c.stageSideHandle, c.showBoundsOutline, unit, outline.length].join("|")
    if (key === this.outlineKey) return
    this.outlineKey = key
    this.placeOutline(outline, this.stageShape(), 0.15, 0.3, 0.3, unit, c.showBoundsOutline)
  }

  // Lay the pieces along the stage edge (curved back and flat edge). Each piece is a unit box stretched along the
  // edge (length), `thickness` wide and `height` tall. Pieces left over are switched off.
  private placeOutline(
    pieces: SceneObject[], shape: G.Shape, y: number, thickness: number, height: number, unit: number, show: boolean
  ): void {
    // as many arc steps as the pieces allow: 1 flat edge + 2 x steps chords (steps is per quarter turn)
    const steps = Math.max(1, Math.floor((pieces.length - 1) / 2))
    const layout = show ? framePieces(shape, steps, STYLE_LINE, true, 0, 0, 0, 0) : []
    for (let i = 0; i < pieces.length; i++) {
      const s = pieces[i]
      if (!s) continue
      const piece = i < layout.length ? layout[i] : null
      s.enabled = piece !== null
      if (!piece) continue
      const t = s.getTransform()
      t.setLocalPosition(new vec3(piece.x, y, piece.z))
      t.setLocalRotation(quat.angleAxis(piece.angle, vec3.up()))
      t.setLocalScale(new vec3((piece.length + thickness * 0.3) / unit, height / unit, thickness / unit))
    }
  }
}
