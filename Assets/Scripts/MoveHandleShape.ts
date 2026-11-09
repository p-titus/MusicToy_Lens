// MoveHandleShape - draws the Move Handle's picture: a flat HALF ROUNDED RECTANGLE, as one MeshBuilder mesh.
// (Approved runtime mesh, 2026-11-08. It replaces the flat Pad_Plane on MoveHandle > Visual.)
//
// Put this on the handle's picture object (MoveHandle > Visual, the one with the RenderMeshVisual). It only
// swaps the mesh; the material stays whatever you gave the RenderMeshVisual. No material is made here.
//
// The shape lies flat on the stage floor (XZ plane, facing up, like the pads):
//   - the FLAT edge is the long straight side (width, along X, left to right); it faces the stage,
//   - the CURVED side bulges toward the user (+Z) to the pull point at the centre,
//   - it is deepest in the middle and gets shallower toward the two ends (the taper).
// The curved outline is a "superellipse" sitting on the end walls: Corner Roundness 1 = a smooth half ellipse,
// 0 = nearly square corners (a rounded rectangle).
// The INSIDE (toy-facing) edge is curved too, bowing toward the user, so the shape is a crescent, like the
// pull of a shallow sliding drawer: thick at the ends, a finger-width grip in the middle. Inner Curve Depth
// sets how far the inside edge bows (0 = a flat inside edge, the plain half shape).
//
// Origin: the middle of the shape's bounding box (half its width, half its depth), so the Interactable's box
// collider on the parent lines up with it. Move Handle Offset (StageConfig) places this middle in front of
// the stage; the flat edge is Depth / 2 behind it.
//
// UVs for your shader graph (Texture 0):  U = 0 at the left end ... 1 at the right end (0.5 = centre),
//   V = 0 at the flat baseline (the ends of the inside edge) ... 1 at the deepest point (centre pull point); V is
//   distance in the same units everywhere, so a centre-bright gradient is |U - 0.5| and a texture tiles evenly along the depth.
//
// Transform: use the Transform of this object in the Inspector (position, rotation, scale) as usual.
// IMPORTANT: switch ON StageConfig > Moving the stage > Move Handle Authored, or StageMoveHandle will rescale
// this object to Move Handle Size every run. Keep this object's scale at 1 so the sizes below are real cm.

@component
export class MoveHandleShape extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("The RenderMeshVisual that shows the handle. Empty = the one on this object.")
  visual: RenderMeshVisual

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Handle shape</span>')
  @ui.group_start("Handle shape")
  @input
  @widget(new SliderWidget(2, 20, 0.1))
  @hint("Width of the flat edge, left to right (cm).")
  width: number = 8

  @input
  @widget(new SliderWidget(0.5, 10, 0.1))
  @hint("Depth at the centre, from the flat edge to the pull point toward the user (cm).")
  depth: number = 3

  @input
  @widget(new SliderWidget(0, 100, 1))
  @hint("Taper: depth at the two ends as a percentage of the centre depth. 100 = no taper (a plain half rounded rectangle), 0 = the ends come to nothing (a pure half ellipse when Corner Roundness is 1). Percent.")
  endDepthPercent: number = 35

  @input
  @widget(new SliderWidget(0, 1, 0.01))
  @hint("Corner roundness. 1 = smooth half ellipse, 0 = nearly square corners. 0 to 1, no unit.")
  cornerRoundness: number = 0.6

  @input
  @widget(new SliderWidget(6, 64, 1))
  @hint("How many straight pieces make up the curved outline (more = smoother). Count.")
  curveSteps: number = 24
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Inside curve (crescent)</span>')
  @ui.group_start("Inside curve")
  @input
  @widget(new SliderWidget(0, 8, 0.1))
  @hint("How far the inside (toy-facing) edge bows toward the user at the centre (cm). 0 = flat inside edge (no crescent). It is kept at least Min Grip Thickness below the outside edge.")
  innerCurveDepth: number = 1.2

  @input
  @widget(new SliderWidget(0, 1, 0.01))
  @hint("Roundness of the inside curve. 1 = smooth half ellipse, 0 = squarish scoop with steep sides. 0 to 1, no unit.")
  innerCurveRoundness: number = 0.6

  @input
  @widget(new SliderWidget(0.1, 3, 0.1))
  @hint("Thinnest allowed grip between the inside and outside edges (cm). The inside curve is never allowed closer than this to the outside edge.")
  minGripThickness: number = 0.8
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Touch box</span>')
  @ui.group_start("Touch box")
  @input
  @hint("ON = this script sets the box collider on the parent (MoveHandle) to the handle's width and depth. OFF = you set the collider by hand in Lens Studio.")
  fitCollider: boolean = true

  @input
  @widget(new SliderWidget(0.5, 6, 0.1))
  @hint("Collider height above and below the floor (cm). Only used when Fit Collider is ON.")
  colliderHeight: number = 1.5

  @input
  @widget(new SliderWidget(0, 5, 0.1))
  @hint("Extra collider margin added to the width and depth on every side (cm). A bigger box is easier to pinch. Only used when Fit Collider is ON.")
  colliderMargin: number = 0.5
  @ui.group_end

  private builder: MeshBuilder | null = null
  private key: string = ""
  private rmv: RenderMeshVisual | null = null
  private collider: ColliderComponent | null = null

  onAwake(): void {
    this.rmv = this.visual ? this.visual : (this.sceneObject.getComponent("Component.RenderMeshVisual") as RenderMeshVisual)
    const parent = this.sceneObject.hasParent() ? this.sceneObject.getParent() : null
    this.collider = parent ? (parent.getComponent("Component.ColliderComponent") as ColliderComponent) : null
    if (!this.rmv) console.error("[MoveHandleShape] no RenderMeshVisual found on " + this.sceneObject.name)
    this.rebuildIfChanged()
    // numbers can be changed in the Inspector while the Lens runs (Live Edit): look again every frame, cheap compare
    this.createEvent("UpdateEvent").bind(() => this.rebuildIfChanged())
  }

  private rebuildIfChanged(): void {
    const k = [this.width, this.depth, this.endDepthPercent, this.cornerRoundness, this.curveSteps, this.innerCurveDepth, this.innerCurveRoundness, this.minGripThickness, this.fitCollider, this.colliderHeight, this.colliderMargin].join("|")
    if (k === this.key) return
    this.key = k
    this.build()
    this.fitBox()
  }

  // The crescent as pairs of points down each column: [x, zOutside, zInside] (cm), z measured from the flat
  // baseline (0) toward the user. Columns run from the right end over the top to the left end; they are packed
  // closer together near the ends, where the outline is steep.
  private columns(): number[][] {
    const hw = Math.max(0.01, this.width * 0.5)
    const d = Math.max(0.01, this.depth)
    const s = d * Math.max(0, Math.min(100, this.endDepthPercent)) / 100 // outside depth at the two ends
    const n = 2 + (1 - Math.max(0, Math.min(1, this.cornerRoundness))) * 8 // superellipse power: 2 = ellipse, 10 = squarish
    const e = 2 / n
    const ni = 2 + (1 - Math.max(0, Math.min(1, this.innerCurveRoundness))) * 8
    const ei = 2 / ni
    const grip = Math.max(0.05, this.minGripThickness)
    const inner = Math.max(0, Math.min(this.innerCurveDepth, d - grip)) // the inside bow at the centre
    const steps = Math.max(6, Math.round(this.curveSteps))
    const cols: number[][] = []
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI * i) / steps // 0 = right end, PI = left end, going over the top
      const c = Math.cos(a)
      const sn = Math.sin(a)
      const sx = c < 0 ? -1 : 1
      const x = hw * sx * Math.pow(Math.abs(c), e)
      const zo = s + (d - s) * Math.pow(Math.abs(sn), e)
      const t = Math.min(1, Math.abs(x) / hw)
      let zi = inner * Math.pow(Math.max(0, 1 - Math.pow(t, ni)), ei) // 0 at the ends, full bow at the centre
      zi = Math.max(0, Math.min(zi, zo - Math.min(grip, zo))) // never closer than the grip to the outside edge
      cols.push([x, zo, zi])
    }
    return cols
  }

  private build(): void {
    if (!this.rmv) return
    const W = Math.max(0.02, this.width)
    const D = Math.max(0.02, this.depth)
    const cols = this.columns()
    const shiftZ = D * 0.5 // put the origin in the middle of the box
    if (!this.builder) {
      this.builder = new MeshBuilder([
        { name: "position", components: 3 },
        { name: "normal", components: 3, normalized: true },
        { name: "texture0", components: 2 }
      ])
      this.builder.topology = MeshTopology.Triangles
      this.builder.indexType = MeshIndexType.UInt16
    } else {
      const b = this.builder
      b.eraseIndices(0, b.getIndicesCount())
      b.eraseVertices(0, b.getVerticesCount())
    }
    const b = this.builder
    const verts: number[] = []
    const pos: number[][] = [] // [x, z] of every vertex, for the winding test
    for (const c of cols) {
      for (const z of [c[1], c[2]]) {
        // facing up; UVs: U across, V from the baseline
        verts.push(c[0], 0, z - shiftZ, 0, 1, 0, c[0] / W + 0.5, z / D)
        pos.push([c[0], z])
      }
    }
    b.appendVerticesInterleaved(verts)
    const idx: number[] = []
    // counter-clockwise seen from above (+y), same rule as PadShape; zero-area triangles are skipped
    const tri = (p: number, q: number, r: number): void => {
      const cross = (pos[q][1] - pos[p][1]) * (pos[r][0] - pos[p][0]) - (pos[q][0] - pos[p][0]) * (pos[r][1] - pos[p][1])
      if (Math.abs(cross) < 1e-9) return
      if (cross > 0) idx.push(p, q, r)
      else idx.push(p, r, q)
    }
    for (let i = 0; i < cols.length - 1; i++) {
      const o0 = 2 * i // outside point of this column
      const i0 = 2 * i + 1 // inside point of this column
      const o1 = 2 * (i + 1)
      const i1 = 2 * (i + 1) + 1
      tri(o0, i0, o1)
      tri(i0, i1, o1)
    }
    b.appendIndices(idx)
    b.updateMesh()
    this.rmv.mesh = b.getMesh()
  }

  private fitBox(): void {
    if (!this.fitCollider || !this.collider) return
    const box = Shape.createBoxShape()
    box.size = new vec3(this.width + this.colliderMargin * 2, this.colliderHeight, this.depth + this.colliderMargin * 2)
    this.collider.shape = box
  }
}
