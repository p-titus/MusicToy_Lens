// BlobBake - turns the shared base blob mesh plus a BlobParams into this blob's OWN mesh, once (not every frame).
//
// - The shared mesh asset is never touched: MeshBuilder.createFromMesh makes a private copy per blob.
// - The vertex count and triangles stay exactly the same (the base mesh is the density budget).
// - Order: soft cube -> taper -> flat bottom -> bend -> surface detail (ruffles, lumps, dimples, ridges).
//   Every pattern is a function of the vertex POSITION and the seed only, so the duplicated vertices on a UV
//   seam move together (no cracks) and a blob looks the same every run.
// - Afterwards: smooth normals (vertices at the same position share one normal), tangents re-squared to them, and the
//   mesh is re-centred and scaled so its longest side is exactly 1.0 with the bounds centre at the origin. So the
//   scale model (ToyConfig.restScale), the spring pivot, pad, shadow and collider all keep working.
// Layout of the copy (checked in the Preview): position(3), normal(3), texture0(2), tangent(4) when present.

import { BlobParams, MAX_OFFSET } from "./BlobProfile"

const ATTRS: Array<{ name: string; size: number }> = [
  { name: "position", size: 3 },
  { name: "normal", size: 3 },
  { name: "texture0", size: 2 },
  { name: "tangent", size: 4 }
]

// Smallest bump width (radians on the blob) the base mesh can show: about 2 vertices across one sigma (vertices are
// ~0.1 rad apart round the widest ring).
const MIN_SIGMA = 0.2
// Area of the sphere the bumps and dimples are spread over (unit sphere): 2 pi x the height range used by spreadDirs.
const LUMP_AREA = 2 * Math.PI * (0.95 + 0.25)
const DIMPLE_AREA = 2 * Math.PI * (0.8 + 0.1)

// Width (sigma, radians) of a bump: `size` is a fraction of the gap between neighbouring bumps, so the look stays the
// same whatever the count and bumps never fuse into one swell.
function sigmaFor(size: number, count: number, area: number): number {
  return Math.max(MIN_SIGMA, size * Math.sqrt(area / Math.max(1, count)))
}

function smooth01(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// small deterministic random numbers (the same seed always gives the same list)
function rng(seed: number): () => number {
  let s = (seed * 2654435761 + 1013904223) >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// n evenly spread unit directions on the upper part of the blob (jittered golden-angle spiral), deterministic.
function spreadDirs(n: number, seed: number, yTop: number, yBottom: number): Float32Array {
  const r = rng(seed)
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const y = yTop + (yBottom - yTop) * ((i + 0.5 + (r() - 0.5) * 0.5) / n)
    const ring = Math.sqrt(Math.max(0, 1 - y * y))
    const phi = i * 2.39996 + r() * 0.6
    out[i * 3] = Math.cos(phi) * ring
    out[i * 3 + 1] = y
    out[i * 3 + 2] = Math.sin(phi) * ring
  }
  return out
}

export class BlobBaker {
  readonly builder: MeshBuilder
  readonly mesh: RenderMesh
  readonly vertexCount: number
  lastMs: number = 0 // the last bake's time (ms), for the log

  private attrs: Array<{ name: string; size: number; data: Float32Array }> = []
  private stride: number = 0
  private idx: Uint16Array | Uint32Array
  private group: Int32Array // vertices at the same position share a group (for smooth normals)
  private groupCount: number = 0
  // working copies, allocated once
  private px: Float32Array
  private py: Float32Array
  private pz: Float32Array
  private gn: Float32Array
  private row: number[]
  // the base blob, centred and scaled so its longest side is 1: the frame the form and detail work in
  private ex: number = 0.5
  private ey: number = 0.5
  private ez: number = 0.5

  constructor(base: RenderMesh) {
    this.builder = MeshBuilder.createFromMesh(base)
    this.mesh = this.builder.getMesh()
    for (const a of ATTRS) {
      try {
        const d = base.getVertexDataForAttribute(a.name)
        if (d && d.length > 0) {
          this.attrs.push({ name: a.name, size: a.size, data: d })
          this.stride += a.size
        }
      } catch (e) {
        // this mesh has no such attribute: skipped
      }
    }
    if (this.attrs.length === 0 || this.attrs[0].name !== "position") throw new Error("the mesh has no position data")
    this.idx = base.getIndexBuffer()
    this.vertexCount = this.attrs[0].data.length / 3
    const n = this.vertexCount
    this.px = new Float32Array(n)
    this.py = new Float32Array(n)
    this.pz = new Float32Array(n)
    this.row = new Array(this.stride).fill(0)

    // weld groups by quantised position (a seam copy sits at exactly the same place)
    this.group = new Int32Array(n)
    const seen = new Map<string, number>()
    const P = this.attrs[0].data
    for (let i = 0; i < n; i++) {
      const key = Math.round(P[i * 3] * 10000) + "," + Math.round(P[i * 3 + 1] * 10000) + "," + Math.round(P[i * 3 + 2] * 10000)
      let g = seen.get(key)
      if (g === undefined) {
        g = seen.size
        seen.set(key, g)
      }
      this.group[i] = g
    }
    this.groupCount = seen.size
    this.gn = new Float32Array(this.groupCount * 3)

    // the base frame: centred, longest side 1
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, P[i * 3]); maxX = Math.max(maxX, P[i * 3])
      minY = Math.min(minY, P[i * 3 + 1]); maxY = Math.max(maxY, P[i * 3 + 1])
      minZ = Math.min(minZ, P[i * 3 + 2]); maxZ = Math.max(maxZ, P[i * 3 + 2])
    }
    const L = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
    this.ex = (maxX - minX) / (2 * L)
    this.ey = (maxY - minY) / (2 * L)
    this.ez = (maxZ - minZ) / (2 * L)
    this.baseCentre = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
    this.baseSize = L
  }

  private baseCentre: number[]
  private baseSize: number

  // Shapes the copy from the numbers in `p` (already clamped) and uploads it. One-time work: call again only when
  // a value changed.
  apply(p: BlobParams): void {
    const t0 = Date.now()
    const n = this.vertexCount
    const P = this.attrs[0].data
    const { ex, ey, ez } = this
    const x = this.px, y = this.py, z = this.pz
    const c = this.baseCentre, L = this.baseSize

    const lumpDirs = p.lumpCount > 0 ? spreadDirs(p.lumpCount, p.seed * 7 + 1, 0.95, -0.25) : null
    const dimpleDirs = p.dimpleCount > 0 ? spreadDirs(p.dimpleCount, p.seed * 7 + 5, 0.8, -0.1) : null
    const lumpSigma = sigmaFor(p.lumpSize, p.lumpCount, LUMP_AREA)
    const dimpleSigma = sigmaFor(p.dimpleSize, p.dimpleCount, DIMPLE_AREA)
    const lumpTwoSigma2 = 2 * lumpSigma * lumpSigma
    const dimpleTwoSigma2 = 2 * dimpleSigma * dimpleSigma
    const flatPlane = -ey * (1 - 0.3 * p.flattenBottom)

    for (let i = 0; i < n; i++) {
      let vx = (P[i * 3] - c[0]) / L
      let vy = (P[i * 3 + 1] - c[1]) / L
      let vz = (P[i * 3 + 2] - c[2]) / L

      // soft cube: bulge the corners out, leave the middle of each face alone
      if (p.squareness > 0) {
        const a = vx / ex, b = vy / ey, d = vz / ez
        const m = Math.max(Math.abs(a), Math.abs(b), Math.abs(d), 1e-6)
        const ratio = Math.sqrt(a * a + b * b + d * d) / m
        const f = 1 + (ratio - 1) * p.squareness * 0.6
        vx *= f; vy *= f; vz *= f
      }
      // taper: narrow the top (+) or the bottom (-)
      if (p.taper !== 0) {
        const t = Math.max(-1, Math.min(1, vy / ey))
        const s = 1 - p.taper * 0.45 * t
        vx *= s; vz *= s
      }
      // flat bottom: squeeze everything below a plane, easing in so there is no hard edge
      if (p.flattenBottom > 0 && vy < flatPlane) {
        const d = flatPlane - vy
        vy = vy + d * p.flattenBottom * smooth01(0, ey * 0.5, d)
      }
      // bend: the two ends along the axis curl up (+) or down (-)
      if (p.bendAmount !== 0) {
        const a = p.bendAxis === 0 ? vx / ex : vz / ez
        vy += p.bendAmount * 0.35 * a * a
      }

      // surface detail: pushed along the blob's outward direction, by an amount that depends only on position
      const a = vx / ex, b = vy / ey, d = vz / ez
      const len = Math.sqrt(a * a + b * b + d * d) || 1
      const ux = a / len, uy = b / len, uz = d / len // unit direction from the centre
      let nx = vx / (ex * ex), ny = vy / (ey * ey), nz = vz / (ez * ez)
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      nx /= nl; ny /= nl; nz /= nl // outward direction
      let off = 0
      const ring = smooth01(0.1, 0.5, Math.sqrt(a * a + d * d) / len) // fades to 0 at the poles, where the angle is undefined
      const theta = Math.atan2(d, a)

      if (p.ruffleCount > 0 && p.ruffleAmp > 0) {
        const u = (uy - p.ruffleBand) / p.ruffleBandWidth
        if (Math.abs(u) < 1) {
          const w = (1 - u * u) * (1 - u * u) * ring
          const phase = p.ruffleCount * (theta + p.ruffleTwist * Math.PI * uy)
          const rounded = Math.sin(phase)
          const creased = 2 * Math.abs(Math.sin(phase * 0.5)) - 1
          off += p.ruffleAmp * (creased + (rounded - creased) * p.ruffleSoftness) * w
        }
      }
      if (lumpDirs && p.lumpAmp > 0) {
        for (let k = 0; k < p.lumpCount; k++) {
          const dx = ux - lumpDirs[k * 3], dy = uy - lumpDirs[k * 3 + 1], dz = uz - lumpDirs[k * 3 + 2]
          off += p.lumpAmp * Math.exp(-(dx * dx + dy * dy + dz * dz) / lumpTwoSigma2)
        }
      }
      if (dimpleDirs && p.dimpleDepth > 0) {
        for (let k = 0; k < p.dimpleCount; k++) {
          const dx = ux - dimpleDirs[k * 3], dy = uy - dimpleDirs[k * 3 + 1], dz = uz - dimpleDirs[k * 3 + 2]
          off -= p.dimpleDepth * Math.exp(-(dx * dx + dy * dy + dz * dz) / dimpleTwoSigma2)
        }
      }
      if (p.ridgeCount > 0 && p.ridgeAmp > 0) {
        const wave = p.ridgeDirection === 0 ? Math.sin(p.ridgeCount * theta) : Math.sin(p.ridgeCount * Math.PI * uy)
        off += p.ridgeAmp * wave * ring * (1 - uy * uy * uy * uy)
      }
      off = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, off))
      x[i] = vx + nx * off
      y[i] = vy + ny * off
      z[i] = vz + nz * off
    }

    // re-centre and scale so the longest side is exactly 1.0 and the bounds centre is the origin
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i])
      minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i])
      minZ = Math.min(minZ, z[i]); maxZ = Math.max(maxZ, z[i])
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2
    const inv = 1 / Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6)
    for (let i = 0; i < n; i++) {
      x[i] = (x[i] - cx) * inv
      y[i] = (y[i] - cy) * inv
      z[i] = (z[i] - cz) * inv
    }

    // smooth normals: area-weighted face normals, shared by every vertex at the same position
    const gn = this.gn, idx = this.idx, grp = this.group
    gn.fill(0)
    for (let f = 0; f + 2 < idx.length; f += 3) {
      const i0 = idx[f], i1 = idx[f + 1], i2 = idx[f + 2]
      const ax = x[i1] - x[i0], ay = y[i1] - y[i0], az = z[i1] - z[i0]
      const bx = x[i2] - x[i0], by = y[i2] - y[i0], bz = z[i2] - z[i0]
      const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx
      for (const v of [i0, i1, i2]) {
        const g = grp[v] * 3
        gn[g] += fx; gn[g + 1] += fy; gn[g + 2] += fz
      }
    }

    // upload
    const row = this.row
    const hasN = this.attrs.some((a) => a.name === "normal")
    for (let i = 0; i < n; i++) {
      let o = 0
      let nx = 0, ny = 1, nz = 0
      if (hasN) {
        const g = grp[i] * 3
        const l = Math.sqrt(gn[g] * gn[g] + gn[g + 1] * gn[g + 1] + gn[g + 2] * gn[g + 2]) || 1
        nx = gn[g] / l; ny = gn[g + 1] / l; nz = gn[g + 2] / l
      }
      for (const a of this.attrs) {
        const d = a.data
        if (a.name === "position") {
          row[o++] = x[i]; row[o++] = y[i]; row[o++] = z[i]
        } else if (a.name === "normal") {
          row[o++] = nx; row[o++] = ny; row[o++] = nz
        } else if (a.name === "tangent") {
          // keep the original tangent, squared up against the new normal
          let tx = d[i * 4], ty = d[i * 4 + 1], tz = d[i * 4 + 2]
          const dot = tx * nx + ty * ny + tz * nz
          tx -= nx * dot; ty -= ny * dot; tz -= nz * dot
          const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1
          row[o++] = tx / tl; row[o++] = ty / tl; row[o++] = tz / tl; row[o++] = d[i * 4 + 3]
        } else {
          for (let k = 0; k < a.size; k++) row[o++] = d[i * a.size + k]
        }
      }
      this.builder.setVertexInterleaved(i, row)
    }
    this.builder.updateMesh()
    this.lastMs = Date.now() - t0
  }
}
