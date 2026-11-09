// FramePath - where the pieces of the stage frame go. Plain numbers only (no Lens Studio calls).
// The frame is the stage shape lying flat: a curved back (two cubic beziers, see StageGeometry.Shape) that reaches
// away from the user, closed by a straight flat edge on the user's side (the conductor stands at the middle of the
// flat edge, the stage origin).
// It is cut into short STRAIGHT pieces (small chords round the curve, one long piece for the flat edge). Each piece
// is one authored object whose length is stretched and whose width is set separately, so the line thickness is
// exactly the same at any stage size and style.
// All values are stage-local cm and radians. Same axes as StageGeometry: +z toward the user, the curve at -z.

import * as G from "./StageGeometry"

export const STYLE_LINE = 0 // one continuous thin line
export const STYLE_BRACKETS = 1 // only short marks: the two corners, marks along the arc and the middle of the flat edge
export const STYLE_DASHED = 2 // dashes all the way round

// One straight piece: its centre (x, z), the turn about the up axis that points the piece's local +X along it
// (radians, as quat.angleAxis(angle, up) expects), and its length.
export interface Piece {
  x: number
  z: number
  angle: number
  length: number
}

interface Pt {
  x: number
  z: number
}

// The outline as a list of points. It starts at the right-hand corner (halfWidth, 0), runs round the curved back
// through the far point (0, -depth) to the left-hand corner (-halfWidth, 0), then (if the flat edge is shown)
// straight back to the start. `closed` is true when the flat edge is shown (the path comes back to its start).
// The curve uses `arcSteps` chords on each side of the far point.
function outline(shape: G.Shape, arcSteps: number, flatEdge: boolean): { pts: Pt[]; arcLength: number; closed: boolean } {
  const pts: Pt[] = G.backCurve(shape, arcSteps)
  const cum = cumulative(pts, false)
  const arcLength = cum[pts.length - 1]
  return { pts: pts, arcLength: arcLength, closed: flatEdge }
}

// cum[i] = distance along the path up to point i; for a closed path cum[n] = the full length (back to the start).
function cumulative(pts: Pt[], closed: boolean): number[] {
  const cum = [0]
  const segments = closed ? pts.length : pts.length - 1
  for (let i = 0; i < segments; i++) {
    const b = pts[(i + 1) % pts.length]
    cum.push(cum[i] + Math.hypot(b.x - pts[i].x, b.z - pts[i].z))
  }
  return cum
}

// The stretches of the path that are drawn ("on"), as [from, to] distances along it.
function onStretches(
  style: number, total: number, closed: boolean, arcLength: number, halfWidth: number, arcMarks: number,
  bracketLength: number, dashLength: number, dashGap: number
): number[][] {
  if (style === STYLE_DASHED) {
    const dash = Math.max(0.05, dashLength)
    const period = dash + Math.max(0, dashGap)
    const out: number[][] = []
    for (let s = 0; s < total - 1e-6; s += period) out.push([s, Math.min(s + dash, total)])
    return out
  }
  if (style === STYLE_BRACKETS) {
    // Mark positions along the path: both corners, `arcMarks` evenly spaced marks along the curve (1 = just the far
    // point), and (flat edge shown) the middle of the flat edge, where the conductor stands.
    const keys: number[] = [0, arcLength]
    const n = Math.max(0, Math.round(arcMarks))
    for (let k = 1; k <= n; k++) keys.push((arcLength * k) / (n + 1))
    if (closed) keys.push(arcLength + halfWidth) // the flat edge is 2 x halfWidth long: its middle is halfWidth along
    keys.sort((a, b) => a - b)
    // arms must never meet or overlap (two see-through pieces on top of each other would look brighter)
    let gap = Infinity
    for (let i = 0; i + 1 < keys.length; i++) gap = Math.min(gap, keys[i + 1] - keys[i])
    if (closed) gap = Math.min(gap, keys[0] + total - keys[keys.length - 1])
    const arm = Math.max(0, Math.min(bracketLength, gap * 0.5))
    const out: number[][] = []
    for (const k of keys) {
      const lo = k - arm
      const hi = k + arm
      if (closed && lo < 0) {
        out.push([lo + total, total])
        out.push([0, hi])
      } else if (closed && hi > total) {
        out.push([lo, total])
        out.push([0, hi - total])
      } else {
        out.push([Math.max(0, lo), Math.min(total, hi)])
      }
    }
    return out
  }
  return [[0, total]]
}

// All the pieces for one frame. The flat edge becomes one long piece (per stretch), the arc becomes chords.
export function framePieces(
  shape: G.Shape, arcSteps: number, style: number, flatEdge: boolean, arcMarks: number,
  bracketLength: number, dashLength: number, dashGap: number
): Piece[] {
  const o = outline(shape, arcSteps, flatEdge)
  const cum = cumulative(o.pts, o.closed)
  const total = cum[cum.length - 1]
  const stretches = onStretches(style, total, o.closed, o.arcLength, shape.halfWidth, arcMarks, bracketLength, dashLength, dashGap)
  const segments = cum.length - 1
  const out: Piece[] = []
  for (const st of stretches) {
    for (let i = 0; i < segments; i++) {
      const len = cum[i + 1] - cum[i]
      if (len < 1e-6) continue
      const a = Math.max(st[0], cum[i])
      const b = Math.min(st[1], cum[i + 1])
      if (b - a < 1e-6) continue
      const p = o.pts[i]
      const q = o.pts[(i + 1) % o.pts.length]
      const dx = (q.x - p.x) / len
      const dz = (q.z - p.z) / len
      const mid = (a + b) * 0.5 - cum[i]
      out.push({ x: p.x + dx * mid, z: p.z + dz * mid, angle: Math.atan2(-dz, dx), length: b - a })
    }
  }
  return out
}
