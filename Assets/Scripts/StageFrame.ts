// StageFrame - the stage's outline: a quiet schematic half-ellipse shape lying flat on the surface. VISUAL ONLY.
// It never decides where toys can go (StageBounds does that), so the two may differ; turn on
// StageConfig > Debug > Show Bounds Outline to compare.
//
// How it is built (no meshes are made in code)
//   The frame is the stage shape (a curved back plus, optionally, the flat edge) cut into short straight pieces. Every piece is a copy of ONE authored
//   prefab (StageConfig > Frame Segment Prefab): a flat quad along X. A piece's LENGTH is stretched and its
//   WIDTH is set separately, so the line is exactly as thick on a long side as on a corner, at any stage size.
//   Style (thin line / corner brackets / dashed), color, opacity, thickness and corner smoothness are Inspector
//   values. Swap the mesh or material inside the prefab to change the look; nothing else needs editing.
//
// Surface: the frame lies on the table by tilting to the World Query surface normal (StageAnchor), and sits
//   Frame Height Offset above it. In the floating fallback there is no table, so it lies level.
// Optional: its opacity can follow the foundation track's loudness a little (off by default).
// All settings: StageConfig > Stage frame. This script has no settings of its own.

import { StageConfig } from "./StageConfig"
import { StageAnchor } from "./StageAnchor"
import * as G from "./StageGeometry"
import { framePieces } from "./FramePath"
import { StemLevelReader } from "./StemLevel"

@component
export class StageFrame extends BaseScriptComponent {
  private cfg: StageConfig
  private anchor: StageAnchor | null = null

  private pool: SceneObject[] = [] // authored piece copies, created once and reused
  private material: Material | null = null // our copy of the authored material (so tinting never edits your asset)
  private layoutKey: string = ""
  private shownColor: string = ""
  private warnedNoPrefab: boolean = false
  private warnedTint: boolean = false
  private warnedMax: string = ""

  private orientKey: string = ""

  private reader: StemLevelReader = new StemLevelReader("StageFrame foundation")
  private level: number = 0 // smoothed 0..1 foundation loudness
  private lastLog: number = -10

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => {
      this.anchor = this.cfg.getSceneObject().getComponent(StageAnchor.getTypeName()) as StageAnchor
    })
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onUpdate(): void {
    const c = this.cfg
    if (!c) return
    this.updateOrientation()
    this.updateLevel(getDeltaTime())

    const key = [
      c.frameVisible, c.frameStyle, c.stageWidth, c.stageDepth, c.stageBackHandle, c.stageSideHandle, c.frameFlatEdge, c.frameArcMarks, c.frameThickness,
      c.frameBracketLength, c.frameDashLength, c.frameDashGap, c.frameArcSteps, c.frameMaxPieces,
      c.primitiveMeshSize, c.frameSegmentPrefab ? 1 : 0, c.frameTintMaterial,
    ].join("|")
    if (key !== this.layoutKey) {
      this.layoutKey = key
      this.layout()
    }
    this.applyColor()
  }

  // ---- lie on the surface -------------------------------------------------------
  // Tilt to the table's normal (kept in stage-local space, because the stage itself only turns about up) and sit
  // Frame Height Offset above it, along that normal. No normal (fallback) = level.
  private updateOrientation(): void {
    const n = this.anchor ? this.anchor.surfaceNormal() : null
    const key = (n ? n.toString() : "level") + "|" + this.cfg.frameHeightOffset
    if (key === this.orientKey) return
    this.orientKey = key
    const up = vec3.up()
    let local = up
    if (n && n.length > 0.001) {
      const stageRot = this.cfg.getSceneObject().getTransform().getWorldRotation()
      local = stageRot.invert().multiplyVec3(n.normalize())
    }
    const t = this.sceneObject.getTransform()
    t.setLocalRotation(quat.rotationFromTo(up, local))
    t.setLocalPosition(local.uniformScale(this.cfg.frameHeightOffset))
  }

  // ---- the pieces ---------------------------------------------------------------
  private layout(): void {
    const c = this.cfg
    const prefab = c.frameSegmentPrefab
    if (!prefab) {
      if (!this.warnedNoPrefab) {
        this.warnedNoPrefab = true
        console.warn("[StageFrame] no Frame Segment Prefab in StageConfig > References: the stage frame is not drawn")
      }
      this.hideFrom(0)
      return
    }
    if (!c.frameVisible) {
      this.hideFrom(0)
      return
    }
    let pieces = framePieces(
      G.stageShape(c.stageWidth, c.stageDepth, c.stageBackHandle, c.stageSideHandle), c.frameArcSteps, Math.round(c.frameStyle), c.frameFlatEdge, c.frameArcMarks,
      c.frameBracketLength, c.frameDashLength, c.frameDashGap
    )
    const max = Math.max(1, Math.round(c.frameMaxPieces))
    if (pieces.length > max) {
      const msg = pieces.length + "/" + max
      if (this.warnedMax !== msg) {
        this.warnedMax = msg
        console.warn("[StageFrame] this style and size need " + pieces.length + " pieces but Frame Max Pieces is " + max + ": the frame is cut short. Raise Max Pieces, lengthen the dashes, or use fewer Arc Steps.")
      }
      pieces = pieces.slice(0, max)
    }

    while (this.pool.length < pieces.length) this.addPiece(prefab)
    const unit = c.primitiveMeshSize > 0 ? c.primitiveMeshSize : 1
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]
      const o = this.pool[i]
      o.enabled = true
      const t = o.getTransform()
      t.setLocalPosition(new vec3(p.x, 0, p.z))
      t.setLocalRotation(quat.angleAxis(p.angle, vec3.up()))
      t.setLocalScale(new vec3(p.length / unit, 1, c.frameThickness / unit))
    }
    this.hideFrom(pieces.length)
    if (c.frameTintMaterial) this.shareMaterial()
    this.shownColor = "" // new pieces may need the color
  }

  // Every piece uses ONE copy of the authored material, so tinting never edits your asset and one write colors all.
  private shareMaterial(): void {
    for (const o of this.pool) {
      const v = this.findVisual(o)
      if (!v) continue
      if (!this.material && v.mainMaterial) this.material = v.mainMaterial.clone()
      if (this.material && v.mainMaterial !== this.material) v.mainMaterial = this.material
    }
  }

  private hideFrom(count: number): void {
    for (let i = count; i < this.pool.length; i++) this.pool[i].enabled = false
  }

  // One more copy of the authored prefab, as a child of this object.
  private addPiece(prefab: ObjectPrefab): void {
    const o = prefab.instantiate(this.sceneObject)
    o.name = "FramePiece_" + this.pool.length
    this.pool.push(o)
  }

  private findVisual(o: SceneObject): RenderMeshVisual | null {
    const v = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (v) return v
    for (let i = 0; i < o.getChildrenCount(); i++) {
      const found = this.findVisual(o.getChild(i))
      if (found) return found
    }
    return null
  }

  // ---- color and opacity --------------------------------------------------------
  private applyColor(): void {
    const c = this.cfg
    if (!c.frameTintMaterial || !this.material) return
    const opacity = this.currentOpacity()
    const col = c.frameColor
    const key = [col.x, col.y, col.z, col.w, opacity].map((n) => n.toFixed(3)).join(",")
    if (key === this.shownColor) return
    this.shownColor = key
    try {
      ;(this.material.mainPass as any).baseColor = new vec4(col.x, col.y, col.z, col.w * opacity)
    } catch (e) {
      if (!this.warnedTint) {
        this.warnedTint = true
        console.warn("[StageFrame] the frame material has no 'baseColor' (" + e + "). Turn off Tint Material to use it as authored.")
      }
    }
  }

  // ---- optional: follow the foundation track ------------------------------------
  // Same reading as ToyAudioReact (StemLevel.ts: stem loudness, auto-levelled), taken from the foundation stem.
  // (The foundation's track is assigned by MusicSync at start; until then the reader returns 0.)
  private updateLevel(dt: number): void {
    const c = this.cfg
    if (!c.frameFollowFoundation) return
    const raw = this.reader.read(c.foundationAudio, c, dt)
    const s = c.frameFoundationSmoothing
    this.level += (raw - this.level) * (s <= 0 ? 1 : 1 - Math.exp(-dt / s))
    if (c.verbose && getTime() - this.lastLog >= 0.5) {
      this.lastLog = getTime()
      c.log("frame follows foundation: raw " + raw.toFixed(2) + ", smoothed " + this.level.toFixed(2) + ", opacity " + this.currentOpacity().toFixed(2))
    }
  }

  // Opacity now: the Inspector value, plus a little when following the foundation track.
  private currentOpacity(): number {
    const c = this.cfg
    const follow = c.frameFollowFoundation ? c.frameFoundationAmount * this.level : 0
    return Math.max(0, Math.min(1, c.frameOpacity + follow))
  }
}
