// BlobProfile - the plain data for a blob's SHAPE (Form + Surface detail).
// No scene objects here: ToyShape (per toy) fills a BlobParams from the Inspector, BlobBake turns it into a mesh.
//
// Every value has a default, a min and a max in RANGES. clampParams() forces a profile into the safe range and
// reports each value it had to change. The amplitudes are capped small on purpose (fractions of the blob's longest
// side) so the detail can never turn spiky or harsh, and all patterns come from the seed, so a blob looks the
// same every run.
// Units: lengths are fractions of the blob's longest side (1 = the whole blob), angles are radians unless noted.

export interface BlobParams {
  // ---- Form (the resting silhouette) ----
  taper: number // -1..1: >0 the top narrows (teardrop, pear), <0 the bottom narrows (mushroom)
  bendAmount: number // -1..1: curl along the bend axis; >0 the ends curl up (a smile), <0 they curl down
  bendAxis: number // 0 = along x (left-right), 1 = along z (front-back)
  flattenBottom: number // 0..1: flattens the underside so the blob sits on its pad
  squareness: number // 0..1: pulls the round blob toward a soft cube / pillow
  // ---- Surface: ruffles (a wavy skirt of soft folds around the blob) ----
  ruffleCount: number // 0..10 folds around the blob; 0 = none (the mesh resolves about 10 cleanly)
  ruffleAmp: number // 0..0.15 height of the folds (fraction of size)
  ruffleSoftness: number // 0..1: 0 = creased folds, 1 = rounded waves
  ruffleBand: number // -1..1: where the ruffles sit: -1 bottom, 0 middle, 1 top
  ruffleBandWidth: number // 0.1..2: how tall the band is (1 = about half the blob)
  ruffleTwist: number // -1..1: how much the folds spiral up the blob (turns over the full height)
  // ---- Surface: lumps (soft bumps, like keys or a pile of beans) ----
  lumpCount: number // 0..20; 0 = none
  lumpAmp: number // 0..0.15 how far the bumps stand out (fraction of size)
  lumpSize: number // 0.1..0.5 how wide each bump is, as a fraction of the gap between neighbouring bumps (0.3 = clearly separate, 0.5 = starting to merge)
  // ---- Surface: dimples (little pressed-in spots) ----
  dimpleCount: number // 0..12; 0 = none
  dimpleDepth: number // 0..0.10 how deep (fraction of size)
  dimpleSize: number // 0.1..0.5 how wide each spot is, as a fraction of the gap between neighbouring spots
  // ---- Surface: ridges (long soft stripes) ----
  ridgeCount: number // 0..10; 0 = none (rings around the blob resolve cleanly only up to about 5)
  ridgeAmp: number // 0..0.08 how high (fraction of size)
  ridgeDirection: number // 0 = longitudinal (stripes run top to bottom), 1 = latitudinal (rings around the blob)
  // ---- shared ----
  seed: number // 0..9999: the same seed always gives the same lumps and dimples
}

type Range = { min: number; max: number; def: number; integer?: boolean; what: string }

// min / max / default / one-line meaning for every value (the Inspector hints repeat these).
export const RANGES: { [K in keyof BlobParams]: Range } = {
  taper: { min: -1, max: 1, def: 0, what: "top (+) or bottom (-) narrowing" },
  bendAmount: { min: -1, max: 1, def: 0, what: "curl along the bend axis" },
  bendAxis: { min: 0, max: 1, def: 0, integer: true, what: "0 = x, 1 = z" },
  flattenBottom: { min: 0, max: 1, def: 0, what: "flat underside" },
  squareness: { min: 0, max: 1, def: 0, what: "toward a soft cube" },
  ruffleCount: { min: 0, max: 10, def: 0, integer: true, what: "folds around the blob" },
  ruffleAmp: { min: 0, max: 0.15, def: 0.02, what: "fold height" },
  ruffleSoftness: { min: 0, max: 1, def: 0.8, what: "creased to rounded" },
  ruffleBand: { min: -1, max: 1, def: 0, what: "height of the ruffle band" },
  ruffleBandWidth: { min: 0.1, max: 2, def: 0.6, what: "height of the band" },
  ruffleTwist: { min: -1, max: 1, def: 0, what: "spiral of the folds" },
  lumpCount: { min: 0, max: 20, def: 0, integer: true, what: "soft bumps" },
  lumpAmp: { min: 0, max: 0.15, def: 0.03, what: "bump height" },
  lumpSize: { min: 0.1, max: 0.5, def: 0.3, what: "bump width" },
  dimpleCount: { min: 0, max: 12, def: 0, integer: true, what: "pressed-in spots" },
  dimpleDepth: { min: 0, max: 0.1, def: 0.025, what: "spot depth" },
  dimpleSize: { min: 0.1, max: 0.5, def: 0.3, what: "spot width" },
  ridgeCount: { min: 0, max: 10, def: 0, integer: true, what: "soft stripes" },
  ridgeAmp: { min: 0, max: 0.08, def: 0.015, what: "stripe height" },
  ridgeDirection: { min: 0, max: 1, def: 0, integer: true, what: "0 = top to bottom, 1 = rings" },
  seed: { min: 0, max: 9999, def: 0, integer: true, what: "pattern seed" }
}

// The last safety clamp on any single vertex push (fraction of the longest side), used by BlobBake. Keep it above the largest
// single amplitude cap above (0.15) and low enough that overlapping bumps can't turn spiky.
// The Inspector slider ranges in ToyShape.ts are literal numbers: when you change a cap here, change them too.
export const MAX_OFFSET = 0.2

export const PARAM_KEYS = Object.keys(RANGES) as Array<keyof BlobParams>

export function defaultParams(): BlobParams {
  const p: any = {}
  for (const k of PARAM_KEYS) p[k] = RANGES[k].def
  return p as BlobParams
}

// Forces every value into its safe range (and whole numbers where needed). Returns one message per value changed.
export function clampParams(p: BlobParams): string[] {
  const out: string[] = []
  for (const k of PARAM_KEYS) {
    const r = RANGES[k]
    let v = p[k]
    if (typeof v !== "number" || isNaN(v)) v = r.def
    let c = Math.min(r.max, Math.max(r.min, v))
    if (r.integer) c = Math.round(c)
    if (c !== p[k]) out.push(k + " " + p[k] + " -> " + c + " (allowed " + r.min + " to " + r.max + ")")
    p[k] = c
  }
  return out
}

// True when the profile changes nothing (the plain base blob).
export function isPlain(p: BlobParams): boolean {
  return (
    p.taper === 0 && p.bendAmount === 0 && p.flattenBottom === 0 && p.squareness === 0 &&
    p.ruffleCount === 0 && p.lumpCount === 0 && p.dimpleCount === 0 && p.ridgeCount === 0
  )
}

// A number that changes whenever any value changes (cheap, no allocation): used to notice Inspector edits.
export function paramsHash(p: BlobParams): number {
  let h = 0
  for (let i = 0; i < PARAM_KEYS.length; i++) h = (h * 31 + p[PARAM_KEYS[i]] * (i + 1.7)) % 1000003
  return h
}
