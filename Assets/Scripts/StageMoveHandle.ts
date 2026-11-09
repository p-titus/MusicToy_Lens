// StageMoveHandle - a small pinch-drag handle that lets the user slide the stage across the table.
//
// It sits on a child of the stage (StageConfig > Moving the stage): just in front of the flat edge, toward the
// user. Pinch it (or hold the mouse button on it in the Editor) and drag: the stage follows the hand over the
// surface it is already on (the height never changes), and, if Face User is on, turns so its flat edge keeps
// facing you. Let go and the stage stays where it is. The palm-tap hold gesture (StageAnchor) still re-places
// the stage by gaze; the two never fight (a search is stopped while a drag is on).
//
// Setup (in Lens Studio): this object needs an Interactable (SIK) and a ColliderComponent, plus this script.
// The picture is an optional child object you can swap freely; it is scaled to Move Handle Size.
// All numbers are in StageConfig. This script has only the Visual input below.

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {
  Interactor,
  InteractorInputType,
  InteractorTriggerType
} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import { StageConfig } from "./StageConfig"
import { StageAnchor } from "./StageAnchor"
import { NearTracker } from "./Alive"

@component
export class StageMoveHandle extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("The handle's picture: a child object (for example a flat disc). It is scaled to Move Handle Size (cm) and hidden when moving is switched off. Swap its mesh or material freely. Empty = an invisible handle.")
  visual: SceneObject

  private cfg: StageConfig
  private anchor: StageAnchor | null = null
  private interactable: Interactable | null = null
  private collider: ColliderComponent | null = null
  private tr: Transform
  private stageTr: Transform | null = null

  private heldBy: Interactor | null = null
  private handStart: vec3 = vec3.zero() // hand position when the pinch began
  private stageStart: vec3 = vec3.zero() // stage origin when the pinch began
  private mouseOffset: vec3 = vec3.zero() // stage origin minus where the mouse ray met the table, at the start
  private layoutKey: string = ""
  private near: NearTracker = new NearTracker() // is a hand close to the handle (Alive.ts)
  private hoverCount: number = 0
  private aliveWritten: number = -1
  private activeAmount: number = 0 // 0..1, eases to 1 while the handle is being dragged
  private warnedAlive: boolean = false

  // 0..1: how close a hand is (or hover); not the dragged state. Read it from your own scripts. The material
  // parameter (StageConfig > Alive and hover > Handle Alive Parameter) gets hover x Hover Level, or 1 while dragged.
  aliveAmount(): number {
    return this.near.amount
  }

  onAwake(): void {
    this.tr = this.sceneObject.getTransform()
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    if (!this.cfg) return
    const stageObj = this.cfg.getSceneObject()
    this.stageTr = stageObj.getTransform()
    this.anchor = stageObj.getComponent(StageAnchor.getTypeName()) as StageAnchor
    this.interactable = this.sceneObject.getComponent(Interactable.getTypeName()) as Interactable
    this.collider = this.sceneObject.getComponent("Component.ColliderComponent") as ColliderComponent
    if (!this.anchor) {
      console.error("[StageMoveHandle] the stage object has no StageAnchor: the handle cannot move it")
      return
    }
    if (!this.interactable) {
      console.error("[StageMoveHandle] " + this.sceneObject.name + " needs an Interactable component (add it in Lens Studio)")
      return
    }
    if (!this.collider) console.warn("[StageMoveHandle] " + this.sceneObject.name + " has no ColliderComponent: it cannot be touched")
    this.interactable.onTriggerStart.add((e) => this.onTriggerStart(e))
    this.interactable.onTriggerEnd.add(() => this.endDrag())
    this.interactable.onTriggerEndOutside.add(() => this.endDrag())
    this.interactable.onTriggerCanceled.add(() => this.endDrag())
    this.interactable.onHoverEnter.add(() => {
      this.hoverCount++
    })
    this.interactable.onHoverExit.add(() => {
      this.hoverCount = Math.max(0, this.hoverCount - 1)
    })
  }

  // The "alive" reaction: a hand close to the handle (or hovering it) gives 0..1, written to the material parameter named
  // in StageConfig > Alive and hover > Handle Alive Parameter. Empty name = nothing is written.
  private updateAlive(): void {
    const c = this.cfg
    if (!c.aliveEnabled || !c.aliveHandleEnabled) {
      this.near.reset()
    } else {
      const centre = (this.visual ? this.visual.getTransform() : this.tr).getWorldPosition()
      this.near.update(getDeltaTime(), c, centre, 0, c.aliveHandleInnerCm, c.aliveHandleOuterCm, this.hoverCount > 0)
    }
    // active (being dragged) eases to 1 over the same ease time as the hover; hover reaches only 'Hover Level'
    const ease = c.aliveEaseSeconds
    const kA = ease <= 0 ? 1 : 1 - Math.exp(-getDeltaTime() / ease)
    this.activeAmount += ((this.heldBy && c.aliveEnabled ? 1 : 0) - this.activeAmount) * kA
    const name = c.aliveHandleParam
    if (!name || !this.visual) return
    const amount = Math.max(this.near.amount * c.aliveHandleHoverLevel, this.activeAmount)
    if (Math.abs(amount - this.aliveWritten) < 0.002) return
    const rmv = this.visual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!rmv) return
    try {
      rmv.mainPassOverrides[name] = amount
      this.aliveWritten = amount
    } catch (err) {
      if (!this.warnedAlive) {
        this.warnedAlive = true
        console.warn("[StageMoveHandle] could not write '" + name + "' to the handle material (" + err + "). Check Handle Alive Parameter in StageConfig > Alive and hover.")
      }
    }
  }

  // ---- placement and look: from the Inspector values (rebuilt only when a number changes) ----
  private applySettings(): void {
    const c = this.cfg
    const key = [c.moveEnabled, c.moveHandleOffset, c.moveHandleSize, c.moveHandleAuthored, c.frameHeightOffset, c.primitiveMeshSize].join("|")
    if (key === this.layoutKey) return
    this.layoutKey = key
    // just in front of the flat edge (+z, toward the user), on the stage floor
    this.tr.setLocalPosition(new vec3(0, c.frameHeightOffset, c.moveHandleOffset))
    // Move Handle Authored ON: the artist owns the collider shape and the picture's scale; only on/off is ours
    if (this.collider) {
      if (!c.moveHandleAuthored) {
        const box = Shape.createBoxShape()
        box.size = new vec3(c.moveHandleSize, c.moveHandleSize, c.moveHandleSize)
        this.collider.shape = box
      }
      this.collider.enabled = c.moveEnabled
    }
    if (this.visual) {
      if (!c.moveHandleAuthored) {
        const unit = c.primitiveMeshSize > 0 ? c.primitiveMeshSize : 1
        const s = c.moveHandleSize / unit
        this.visual.getTransform().setLocalScale(new vec3(s, s, s))
      }
      this.visual.enabled = c.moveEnabled
    }
    if (!c.moveEnabled) this.endDrag()
  }

  // ---- input ----
  private onTriggerStart(e: InteractorEvent): void {
    if (!this.cfg || !this.cfg.moveEnabled || !this.anchor || !this.stageTr || this.heldBy) return
    const it = e.interactor
    const mouse = it.inputType === InteractorInputType.Mouse
    const pinch = (it.currentTrigger & InteractorTriggerType.Pinch) !== 0
    if (!mouse && !pinch) return // a fingertip poke or a brush does not move the stage
    this.heldBy = it
    this.stageStart = this.stageTr.getWorldPosition()
    this.handStart = it.startPoint ? it.startPoint : this.stageStart
    if (mouse) {
      const hit = this.mouseOnTable(it)
      this.mouseOffset = hit ? this.stageStart.sub(hit) : vec3.zero()
    }
    this.anchor.beginUserMove()
    this.cfg.log("stage drag started")
  }

  private endDrag(): void {
    if (!this.heldBy) return
    this.heldBy = null
    if (this.anchor) this.anchor.endUserMove()
  }

  // Where the mouse ray crosses the horizontal plane through the stage (null if it points level or upward).
  private mouseOnTable(it: Interactor): vec3 | null {
    const o = it.startPoint
    const d = it.direction
    if (!o || !d || !this.stageTr) return null
    if (d.y > -0.01) return null
    const t = (this.stageTr.getWorldPosition().y - o.y) / d.y
    return t > 0 ? o.add(d.uniformScale(t)) : null
  }

  private onUpdate(): void {
    if (!this.cfg) return
    this.applySettings()
    this.updateAlive()
    const it = this.heldBy
    if (!it || !this.anchor || !this.stageTr) return
    if (it.currentTrigger === InteractorTriggerType.None) {
      this.endDrag() // the hand let go but no end event arrived
      return
    }
    let goal: vec3 | null = null
    if (it.inputType === InteractorInputType.Mouse) {
      const hit = this.mouseOnTable(it)
      if (hit) goal = hit.add(this.mouseOffset)
    } else if (it.startPoint) {
      // the stage slides over the table: only the sideways and forward/back parts of the hand's travel count
      const move = it.startPoint.sub(this.handStart).uniformScale(this.cfg.moveHandScale)
      goal = this.stageStart.add(new vec3(move.x, 0, move.z))
    }
    if (!goal) return
    const smooth = this.cfg.moveSmoothSeconds
    const k = smooth <= 0 ? 1 : 1 - Math.exp(-getDeltaTime() / smooth)
    const now = this.stageTr.getWorldPosition()
    this.anchor.userMoveTo(vec3.lerp(now, goal, k), this.cfg.moveFaceUser)
  }
}
