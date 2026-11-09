// PadShape - draws the flat shapes of a pad (the strip and the circle under the toy) as one MeshBuilder mesh each.
// Plain helpers, not a component. No material is made here: every pad keeps the material you gave it.
//
// A pad shape is a flat piece lying on the stage floor (the XZ plane, facing up) with
//   width  = its size along X (left to right), length = its size along Z (toward you),
//   shape  = ROUNDED (a rectangle with rounded corners) or ELLIPSE,
//   roundness (rounded only) = 0 square corners ... 1 fully rounded (a circle if width = length, a pill/stadium
//   if one side is longer),
//   steps  = how many straight pieces make up each rounded corner (more = smoother).
// Meshes are shared: the same numbers give the same mesh, so seven pads cost one mesh per distinct shape.

export const SHAPE_ROUNDED = 0
export const SHAPE_ELLIPSE = 1

// The outline as [x, z] points (all in cm, centred on the origin). Convex.
export function outlinePoints(shape: number, width: number, length: number, roundness: number, steps: number): number[][] {
  const hw = Math.max(0.01, width * 0.5)
  const hl = Math.max(0.01, length * 0.5)
  const n = Math.max(1, Math.round(steps))
  const pts: number[][] = []
  if (Math.round(shape) === SHAPE_ELLIPSE) {
    const count = Math.max(8, n * 4)
    for (let i = 0; i < count; i++) {
      const a = (2 * Math.PI * i) / count
      pts.push([hw * Math.cos(a), hl * Math.sin(a)])
    }
    return pts
  }
  const r = Math.max(0, Math.min(1, roundness)) * Math.min(hw, hl) // the corner radius, at most half the shorter side
  if (r < 1e-4) return [[hw, hl], [-hw, hl], [-hw, -hl], [hw, -hl]]
  const corners = [
    [hw - r, hl - r, 0],
    [-(hw - r), hl - r, Math.PI * 0.5],
    [-(hw - r), -(hl - r), Math.PI],
    [hw - r, -(hl - r), Math.PI * 1.5]
  ]
  for (const c of corners) {
    for (let i = 0; i <= n; i++) {
      const a = c[2] + (Math.PI * 0.5 * i) / n
      pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)])
    }
  }
  return pts
}

// Surface of the shape (cm squared).
export function shapeArea(shape: number, width: number, length: number, roundness: number): number {
  if (Math.round(shape) === SHAPE_ELLIPSE) return (Math.PI * width * length) / 4
  const r = Math.max(0, Math.min(1, roundness)) * Math.min(width, length) * 0.5
  return width * length - (4 - Math.PI) * r * r
}

interface Cached {
  mesh: RenderMesh
  builder: MeshBuilder // kept so the mesh stays linked and alive
}
const cache: { [key: string]: Cached } = {}
let cacheCount = 0

// The mesh for these numbers (built once, then shared).
export function padMesh(shape: number, width: number, length: number, roundness: number, steps: number): RenderMesh {
  const key = [Math.round(shape), width.toFixed(3), length.toFixed(3), roundness.toFixed(3), Math.round(steps)].join("|")
  if (cache[key]) return cache[key].mesh
  if (cacheCount > 40) {
    for (const k of Object.keys(cache)) delete cache[k] // an Inspector slider being dragged makes many sizes: forget the old ones
    cacheCount = 0
  }
  const rim = outlinePoints(shape, width, length, roundness, steps)
  const W = Math.max(0.02, width)
  const L = Math.max(0.02, length)
  const builder = new MeshBuilder([
    { name: "position", components: 3 },
    { name: "normal", components: 3, normalized: true },
    { name: "texture0", components: 2 }
  ])
  builder.topology = MeshTopology.Triangles
  builder.indexType = MeshIndexType.UInt16
  const vert = (x: number, z: number): number[] => [x, 0, z, 0, 1, 0, x / W + 0.5, z / L + 0.5] // facing up, UVs across the shape
  const verts: number[] = vert(0, 0) // vertex 0: the middle of the fan
  for (const q of rim) verts.push(...vert(q[0], q[1]))
  builder.appendVerticesInterleaved(verts)
  const idx: number[] = []
  for (let i = 0; i < rim.length; i++) {
    const j = (i + 1) % rim.length
    // counter-clockwise seen from above (+y): the cross product of (a - middle) x (b - middle) must point up
    const cross = rim[i][1] * rim[j][0] - rim[i][0] * rim[j][1]
    if (cross >= 0) idx.push(0, 1 + i, 1 + j)
    else idx.push(0, 1 + j, 1 + i)
  }
  builder.appendIndices(idx)
  builder.updateMesh()
  const entry = { mesh: builder.getMesh(), builder: builder }
  cache[key] = entry
  cacheCount++
  return entry.mesh
}
