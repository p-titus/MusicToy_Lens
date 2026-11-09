// StageGeometry - the stage-area maths. Plain numbers only (no Lens Studio calls),
// so it can be read, tested and tweaked on its own. All values are in stage-local cm.
// "x" is left/right, "z" is front/back on the stage floor. The stage origin (0, 0) is the CONDUCTOR'S SPOT:
// the middle of the stage's flat edge. +z is toward the user (the front); the stage reaches away from the user (-z).
// The stage area is a HALF ELLIPSE-LIKE shape: a straight flat edge (z = 0) on the user's side, closed by a curved
// back made of two cubic beziers that meet at the far point. Two "handles" shape the curve (see Shape), so the
// back can be a true half ellipse or flatter and wider, like a rounded rectangle.

export interface P {
  x: number
  z: number
}

// ---- the shape ----------------------------------------------------------------------------------------
// The curved back, right half (the left half is its mirror image), as one cubic bezier:
//   P0 = (halfWidth, 0)                      the corner where the flat edge ends (the curve leaves it straight back)
//   P1 = (halfWidth, -sideHandle * depth)    handle at the corner: how far the side runs straight before curving
//   P2 = (backHandle * halfWidth, -depth)    handle at the far point: how far it is pulled out sideways
//   P3 = (0, -depth)                         the far point (the curve passes it level, left to right)
// sideHandle = backHandle = 0.5523 draws a true half ellipse. A bigger backHandle pulls the far handle out, so the
// back becomes flatter and wider. Both handles stay between 0.05 and 1 (that keeps the shape convex).
export interface Shape {
  halfWidth: number // half of the stage's width at the flat edge (cm)
  depth: number // from the flat edge to the far point (cm)
  backHandle: number // 0.05..1, fraction of the half width
  sideHandle: number // 0.05..1, fraction of the depth
}

export const ELLIPSE_HANDLE = 0.5523 // both handles at this value give an exact half ellipse

export function stageShape(width: number, depth: number, backHandle: number, sideHandle: number): Shape {
  const clamp = (v: number) => Math.max(0.05, Math.min(1, v))
  return { halfWidth: Math.max(0.01, width * 0.5), depth: Math.max(0.01, depth), backHandle: clamp(backHandle), sideHandle: clamp(sideHandle) }
}

// The curved back as points from the right corner (halfWidth, 0), through the far point (0, -depth), to the left
// corner (-halfWidth, 0). `stepsPerQuarter` straight pieces on each side of the far point.
export function backCurve(s: Shape, stepsPerQuarter: number): P[] {
  const n = Math.max(1, Math.round(stepsPerQuarter))
  const a = s.halfWidth
  const b = s.depth
  const p0 = { x: a, z: 0 }
  const p1 = { x: a, z: -s.sideHandle * b }
  const p2 = { x: s.backHandle * a, z: -b }
  const p3 = { x: 0, z: -b }
  const right: P[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    right.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      z: u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z
    })
  }
  const out = right.map((p) => ({ x: p.x, z: p.z }))
  for (let i = right.length - 2; i >= 0; i--) out.push({ x: -right[i].x, z: right[i].z })
  return out
}

// ---- the area ------------------------------------------------------------------------------------------
// A convex polygon, counter-clockwise (the interior is on the left of every edge). The stage is the shape's
// outline cut into many short straight pieces; every inset (edge padding) is another convex polygon made from it.
// `edges` is the same polygon as half-planes: a point p is inside an edge when nx * p.x + nz * p.z >= c.
interface Edge {
  nx: number
  nz: number
  c: number
}

export interface Area {
  pts: P[]
  edges: Edge[]
  key: string
}

function makeArea(pts: P[], key: string): Area {
  const edges: Edge[] = []
  if (pts.length >= 3) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[(i + 1) % pts.length]
      const len = Math.hypot(q.x - p.x, q.z - p.z)
      if (len < 1e-9) continue
      const nx = -(q.z - p.z) / len // the left-hand normal points into a counter-clockwise polygon
      const nz = (q.x - p.x) / len
      edges.push({ nx: nx, nz: nz, c: nx * p.x + nz * p.z })
    }
  }
  return { pts: pts, edges: edges, key: key }
}

function signedArea(pts: P[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    s += p.x * q.z - q.x * p.z
  }
  return s * 0.5
}

const areaCache: { [key: string]: Area } = {}
let areaCacheCount = 0
function remember(a: Area): Area {
  if (!areaCache[a.key]) {
    if (areaCacheCount > 200) {
      for (const k of Object.keys(areaCache)) delete areaCache[k]
      areaCacheCount = 0
    }
    areaCache[a.key] = a
    areaCacheCount++
  }
  return areaCache[a.key]
}

const AREA_STEPS = 24 // pieces per quarter of the outline when the stage becomes a polygon (error well under 0.1 cm)

// The whole stage from its shape: the flat edge plus the curved back.
export function stageArea(s: Shape): Area {
  const key = ["S", s.halfWidth, s.depth, s.backHandle, s.sideHandle].map((v) => (typeof v === "number" ? v.toFixed(4) : v)).join("|")
  if (areaCache[key]) return areaCache[key]
  let pts = backCurve(s, AREA_STEPS) // right corner -> far point -> left corner; the flat edge closes it
  if (signedArea(pts) < 0) pts = pts.reverse()
  return remember(makeArea(pts, key))
}

// Clip a convex polygon to the half-plane nx*x + nz*z >= c (Sutherland-Hodgman).
function clip(poly: P[], e: Edge): P[] {
  const out: P[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const dp = e.nx * p.x + e.nz * p.z - e.c
    const dq = e.nx * q.x + e.nz * q.z - e.c
    if (dp >= 0) out.push(p)
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq)
      out.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t })
    }
  }
  return out
}

// Shrink an area on every side by `inset` (every edge moves inward by that much). Edges that run out of room
// disappear properly. If nothing is left, the area becomes a single point (the middle of what was there).
export function insetArea(a: Area, inset: number): Area {
  if (inset <= 1e-9) return a
  const key = a.key + ">" + inset.toFixed(3)
  if (areaCache[key]) return areaCache[key]
  let poly = a.pts
  for (const e of a.edges) {
    poly = clip(poly, { nx: e.nx, nz: e.nz, c: e.c + inset })
    if (poly.length < 3) break
  }
  if (poly.length < 3 || Math.abs(signedArea(poly)) < 1e-6) {
    let cx = 0
    let cz = 0
    for (const p of a.pts) {
      cx += p.x
      cz += p.z
    }
    poly = [{ x: cx / a.pts.length, z: cz / a.pts.length }]
  }
  return remember(makeArea(poly, key))
}

// Where a toy CENTRE may be: the stage shrunk by half the toy (its body must be inside) plus edge padding.
export function centreArea(stage: Area, toySize: number, edgePaddingRatio: number): Area {
  return insetArea(stage, toySize * 0.5 + toySize * edgePaddingRatio)
}

export function isInside(p: P, a: Area): boolean {
  if (a.edges.length === 0) return a.pts.length > 0 && Math.hypot(p.x - a.pts[0].x, p.z - a.pts[0].z) <= 1e-3
  for (const e of a.edges) if (e.nx * p.x + e.nz * p.z < e.c - 1e-4) return false
  return true
}

// Nearest valid point inside the area: unchanged if already inside, else the closest point on its edge.
export function clampToArea(p: P, a: Area): P {
  if (a.edges.length === 0) return a.pts.length > 0 ? { x: a.pts[0].x, z: a.pts[0].z } : { x: p.x, z: p.z }
  if (isInside(p, a)) return { x: p.x, z: p.z }
  let best = a.pts[0]
  let bestD = Infinity
  for (let i = 0; i < a.pts.length; i++) {
    const s = a.pts[i]
    const t = a.pts[(i + 1) % a.pts.length]
    const dx = t.x - s.x
    const dz = t.z - s.z
    const len2 = dx * dx + dz * dz
    const u = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.z - s.z) * dz) / len2))
    const c = { x: s.x + dx * u, z: s.z + dz * u }
    const d = Math.hypot(c.x - p.x, c.z - p.z)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return { x: best.x, z: best.z }
}

// How far the area reaches: half its widest width and its depth behind the flat edge (cm).
export function areaExtent(a: Area): { halfWidth: number; depth: number } {
  let hw = 0
  let dz = 0
  for (const p of a.pts) {
    hw = Math.max(hw, Math.abs(p.x))
    dz = Math.max(dz, -p.z)
  }
  return { halfWidth: hw, depth: dz }
}

// Footprints: every toy has its own footprint DIAMETER (cm). Two toys must keep their centres at least
// (footprintA + footprintB) / 2 * (1 + spacing) apart. With equal footprints this is the old toySize * (1 + spacing).
export function pairDistance(footprintA: number, footprintB: number, spacingRatio: number): number {
  return ((footprintA + footprintB) / 2) * (1 + spacingRatio)
}

// Surface of the area (cm squared).
export function areaSize(a: Area): number {
  return a.pts.length < 3 ? 0 : Math.abs(signedArea(a.pts))
}

// How many spare toy slots the stage has, counted in slots of the reference toy size (toySize + spacing, squared).
// Usable area = the stage shrunk by the edge padding. Each toy takes up its own slot (its footprint + spacing,
// squared), so one stretched toy uses more of the stage than a small one. Edge padding uses the reference toy size.
export function freeSlots(
  stage: Area,
  toySize: number,
  spacingRatio: number,
  edgePaddingRatio: number,
  footprints: number[]
): number {
  const usable = areaSize(insetArea(stage, toySize * edgePaddingRatio))
  const cell = toySize * (1 + spacingRatio)
  let used = 0
  for (const f of footprints) used += (f * (1 + spacingRatio)) ** 2
  return (usable - used) / (cell * cell)
}

// Start layout: toys evenly on a ring, just far enough apart to keep the spacing, centre left free.
export function ringPositions(count: number, toySize: number, spacingRatio: number, startAngleDeg: number = 0): P[] {
  const cell = toySize * (1 + spacingRatio)
  const ringR = cell / (2 * Math.sin(Math.PI / count))
  const out: P[] = []
  for (let i = 0; i < count; i++) {
    const a = ((startAngleDeg + (360 / count) * i) * Math.PI) / 180
    out.push({ x: ringR * Math.cos(a), z: ringR * Math.sin(a) })
  }
  return out
}

// ---- units: a toy and its pad count as ONE thing -------------------------------------------------------
// A unit is a list of discs. Each disc sits at a fixed offset (stage-local cm) from the unit's anchor (the toy's
// position) and has a diameter (cm). Disc 0 is the toy itself (offset 0, 0); disc 1, if present, is the pad.
// The offsets are fixed in stage space (they do not turn with the toy), because the pad stays on the stage's
// front side. Edge padding, clamping and overlap nudging all treat the whole unit: every disc must be inside
// the stage, and no disc of one unit may come closer to a disc of another unit than the spacing rule allows.
export interface Disc {
  dx: number
  dz: number
  d: number
}
export type Unit = Disc[]

// What the maths needs from the stage: keep a unit inside (nearest valid anchor) and test whether it is.
export interface Limits {
  clamp(p: P, u: Unit): P
  inside(p: P, u: Unit): boolean
}

// Limits for a stage: each disc's CENTRE must be in the stage shrunk by half that disc plus edge padding.
// The padding is a fraction of the disc's own size, as for single toys before.
export function stageLimits(stage: Area, edgePaddingRatio: number): Limits {
  return {
    inside(p: P, u: Unit): boolean {
      for (const c of u) if (!isInside({ x: p.x + c.dx, z: p.z + c.dz }, centreArea(stage, c.d, edgePaddingRatio))) return false
      return true
    },
    // Each disc's allowed anchors are a shifted rounded rectangle. Their overlap is convex, so projecting onto
    // them in turn settles on a point in it (not always the very nearest, but always valid when one exists).
    clamp(p: P, u: Unit): P {
      let q = { x: p.x, z: p.z }
      for (let it = 0; it < 40; it++) {
        let moved = false
        for (const c of u) {
          const a = centreArea(stage, c.d, edgePaddingRatio)
          const r = clampToArea({ x: q.x + c.dx, z: q.z + c.dz }, a)
          const nx = r.x - c.dx
          const nz = r.z - c.dz
          if (Math.hypot(nx - q.x, nz - q.z) > 1e-5) moved = true
          q = { x: nx, z: nz }
        }
        if (!moved) break
      }
      return q
    }
  }
}

// Smallest gap shortfall between two units: how far (cm) the closest disc pair is inside its allowed distance.
// 0 or less = far enough. `a` and `b` are the unit anchors.
function worstOverlap(a: P, ua: Unit, b: P, ub: Unit, spacing: number): { amount: number; dx: number; dz: number } {
  let best = { amount: -Infinity, dx: 0, dz: 0 }
  for (const ca of ua) {
    for (const cb of ub) {
      const dx = b.x + cb.dx - (a.x + ca.dx)
      const dz = b.z + cb.dz - (a.z + ca.dz)
      const amount = pairDistance(ca.d, cb.d, spacing) - Math.hypot(dx, dz)
      if (amount > best.amount) best = { amount: amount, dx: dx, dz: dz }
    }
  }
  return best
}

function farEnough(p: P, self: Unit, others: P[], othersU: Unit[], spacing: number): boolean {
  for (let i = 0; i < others.length; i++) {
    if (worstOverlap(p, self, others[i], othersU[i], spacing).amount > 1e-4) return false
  }
  return true
}

// Closest free spot to `desired`: search outward in small rings. Returns null if there is none.
export function findFreeSpot(
  desired: P, self: Unit, others: P[], othersU: Unit[], spacing: number, limits: Limits, reach: number
): P | null {
  const start = limits.clamp(desired, self)
  if (farEnough(start, self, others, othersU, spacing)) return start
  const step = 0.25
  let best: P | null = null
  let bestD = Infinity
  for (let r = step; r <= reach; r += step) {
    if (best && r > bestD) break // nothing closer can still turn up
    const n = Math.max(12, Math.ceil((2 * Math.PI * r) / step))
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n
      const c = { x: start.x + r * Math.cos(a), z: start.z + r * Math.sin(a) }
      if (!limits.inside(c, self)) continue
      if (!farEnough(c, self, others, othersU, spacing)) continue
      const d = Math.hypot(c.x - start.x, c.z - start.z)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
  }
  return best
}

// Last resort when no free spot exists: push overlapping units apart (equal shares), keep all inside.
// `positions[0]` is the unit being dropped; it is pushed less, so others give way a bit more.
export function relax(positions: P[], units: Unit[], spacing: number, limits: Limits, iterations: number = 300): P[] {
  const p = positions.map((q) => ({ x: q.x, z: q.z }))
  for (let it = 0; it < iterations; it++) {
    let moved = false
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const w = worstOverlap(p[i], units[i], p[j], units[j], spacing)
        if (w.amount <= 0) continue
        let dx = w.dx
        let dz = w.dz
        let d = Math.hypot(dx, dz)
        if (d < 1e-6) {
          dx = Math.cos(i * 2.4 + j)
          dz = Math.sin(i * 2.4 + j)
          d = 1
        }
        const push = w.amount / d
        const wi = i === 0 ? 0.3 : 0.5
        const wj = i === 0 ? 0.7 : 0.5
        p[i].x -= dx * push * wi
        p[i].z -= dz * push * wi
        p[j].x += dx * push * wj
        p[j].z += dz * push * wj
        moved = true
      }
    }
    for (let i = 0; i < p.length; i++) {
      const c = limits.clamp(p[i], units[i])
      p[i].x = c.x
      p[i].z = c.z
    }
    if (!moved) break
  }
  return p
}

export type LandingReason = "none" | "outside" | "overlap"

export interface Landing {
  pos: P
  reason: LandingReason
  // new resting spots for the other units, only when pushing was needed (same order as `others`)
  othersMoved: P[] | null
}

// Where should a released unit settle?
//  1. clamp into the stage ("outside" if that changed anything)
//  2. if nudging is on and it would overlap, take the nearest free spot ("overlap")
//  3. if there is no free spot, push neighbours apart (othersMoved)
export function resolveLanding(
  desired: P, self: Unit, others: P[], othersU: Unit[], spacing: number, limits: Limits, nudge: boolean, reach: number
): Landing {
  const clamped = limits.clamp(desired, self)
  const reason: LandingReason = Math.hypot(clamped.x - desired.x, clamped.z - desired.z) > 0.05 ? "outside" : "none"
  if (!nudge || farEnough(clamped, self, others, othersU, spacing)) return { pos: clamped, reason, othersMoved: null }

  const free = findFreeSpot(clamped, self, others, othersU, spacing, limits, reach)
  if (free) return { pos: free, reason: "overlap", othersMoved: null }

  const result = relax([clamped, ...others], [self, ...othersU], spacing, limits)
  return { pos: result[0], reason: "overlap", othersMoved: result.slice(1) }
}
