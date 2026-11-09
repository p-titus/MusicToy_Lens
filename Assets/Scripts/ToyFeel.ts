// ToyFeel - the plain data for how a blob MOVES (its "Feel") and the comfort limiter that keeps it gentle.
// No scene objects here: ToyShape (per toy) fills a FeelParams from its Inspector, limitFeel() forces it inside the
// limits, and the result is handed to that toy's ToyConfig (toyCfg.feel) for ToySquish / ToyAudioReact / ToyInteraction.
// Nothing here is shared between toys: every toy has its own FeelParams object and its own seed.
//
// Units: squash / stretch / pulse are fractions of the blob (0.2 = 20%), bounce is cm, wobble is degrees, frequencies
// are per second (Hz), times are seconds, damping is unitless (below 1 = the blob springs past rest and wobbles back).

export interface FeelParams {
  reactAmount: number // x: overall strength of the music motion (unitless, 1 = normal)
  scalePulse: number // fraction: extra size at full music level
  bounceCm: number // cm: bounce height at full music level
  wobbleDegrees: number // degrees: sideways wobble at full music level
  wobbleHz: number // Hz: base wobble speed (the toy's seed nudges it a little, the limiter caps it)
  pokeSquash: number // fraction: how much a poke squashes
  landSquash: number // fraction: how much touching down squashes
  grabStretch: number // fraction: how much holding it stretches
  squishBulge: number // x: sideways bulge when squashed (0.5 keeps the volume about the same)
  squishHz: number // Hz: springiness speed
  damping: number // unitless: wobble fade (below 1 always)
  driftSpeed: number // cm per second: how fast it falls back to the stage after being let go
  settleSeconds: number // seconds: how long the landing takes
  feelSeed: number // whole number: gives this toy its own wobble phase and rate
  onsetSensitivity: number // unitless 0-1: how quiet a hit can be and still kick the toy (higher = more hits)
  sustain: number // fraction 0-1: how much steady loudness (not hits) leans the toy
  levelFloor: number // RMS 0-0.02 (unitless loudness): this toy's own quiet cut-off. 0 = use StageConfig > Level Floor
  bandSplitHz: number // Hz: split this stem into lows and highs at this frequency. 0 = off (one loudness for everything)
  bandMixKick: number // 0-1: what the kick / pop follows: 0 = lows only, 0.5 = both, 1 = highs only (needs the split on)
  bandMixSway: number // 0-1: what the sway / rocking follows: 0 = lows only, 0.5 = both, 1 = highs only
  bandMixVfx: number // 0-1: what the glitter VFX follows: 0 = lows only, 0.5 = both, 1 = highs only
  hitSpacing: number // seconds: the shortest gap between two hits (longer = calmer on busy or sustained stems)
  kickHz: number // Hz: speed of the beat spring (the pop and rebound)
  kickDamping: number // unitless: beat spring fade (below 1 always; about 0.7 = a slight overshoot)
  swayAmount: number // fraction of the blob's longest side: how far the tips sway on a hit (shader deform only)
  noiseAmount: number // fraction of the blob's longest side: surface ripple size (shader deform only)
  noiseScale: number // noise cycles across the blob: higher = finer ripples (shader deform only)
  noiseSpeed: number // x: how fast the ripples drift (1 = normal, shader deform only)
}

type Range = { min: number; max: number; def: number }

// Hard bounds (the Inspector sliders use these) and defaults. The comfort limiter below can be tighter.
export const FEEL_RANGES: { [K in keyof FeelParams]: Range } = {
  reactAmount: { min: 0, max: 2, def: 1 },
  scalePulse: { min: 0, max: 0.3, def: 0.15 },
  bounceCm: { min: 0, max: 1, def: 0.5 },
  wobbleDegrees: { min: 0, max: 10, def: 6 },
  wobbleHz: { min: 0.3, max: 1.6, def: 1.1 },
  pokeSquash: { min: 0, max: 0.35, def: 0.22 },
  landSquash: { min: 0, max: 0.35, def: 0.16 },
  grabStretch: { min: 0, max: 0.25, def: 0.07 },
  squishBulge: { min: 0, max: 1, def: 0.5 },
  squishHz: { min: 1, max: 7, def: 4.5 },
  damping: { min: 0.3, max: 0.9, def: 0.6 },
  driftSpeed: { min: 1, max: 8, def: 4 },
  settleSeconds: { min: 0.2, max: 1.2, def: 0.45 },
  feelSeed: { min: 0, max: 9999, def: 0 },
  onsetSensitivity: { min: 0, max: 1, def: 0.6 },
  sustain: { min: 0, max: 1, def: 0.2 },
  levelFloor: { min: 0, max: 0.02, def: 0 },
  hitSpacing: { min: 0.05, max: 1, def: 0.1 },
  bandSplitHz: { min: 0, max: 8000, def: 0 },
  bandMixKick: { min: 0, max: 1, def: 0 },
  bandMixSway: { min: 0, max: 1, def: 0.5 },
  bandMixVfx: { min: 0, max: 1, def: 1 },
  kickHz: { min: 1, max: 8, def: 3.5 },
  kickDamping: { min: 0.4, max: 0.95, def: 0.7 },
  swayAmount: { min: 0, max: 0.25, def: 0.07 },
  noiseAmount: { min: 0, max: 0.06, def: 0.01 },
  noiseScale: { min: 0.5, max: 6, def: 2 },
  noiseSpeed: { min: 0, max: 3, def: 0.4 }
}

// Music Class: a ready-made set of the music-motion values (strings flow, percussion snaps, chimes shimmer).
// "Custom" (0) uses the sliders as typed. Any other class REPLACES these keys while it is chosen.
export const MOTION_CLASSES = ["Custom (my sliders)", "Strings (slow, flowing)", "Piano (even, gentle)", "Chimes / FX (shimmery)", "Percussion (snappy)"]
export const CLASS_KEYS: Array<keyof FeelParams> = [
  "scalePulse", "bounceCm", "wobbleDegrees", "wobbleHz", "onsetSensitivity", "sustain", "levelFloor", "hitSpacing",
  "kickHz", "kickDamping", "swayAmount", "noiseAmount", "noiseScale", "noiseSpeed"
]
const CLASS_VALUES: Array<number[]> = [
  // scale  bounce wobble wHz   onset  sustain floor   spacing kickHz damp  sway   noise  nScale nSpeed
  // floor 0 = StageConfig > Level Floor. Strings are always loud, so they get fewer, calmer hits (spacing 0.4 s).
  // Chimes are very quiet, so they get a much lower floor (0.0005) or the toy would never move.
  [0.10, 0.30, 5, 0.6, 0.30, 0.5, 0, 0.4, 2.0, 0.80, 0.10, 0.015, 1.5, 0.35], // Strings
  [0.15, 0.50, 6, 1.0, 0.60, 0.15, 0, 0.1, 3.5, 0.70, 0.07, 0.010, 2.0, 0.40], // Piano
  [0.08, 0.25, 4, 1.25, 0.75, 0.30, 0.0005, 0.1, 6.0, 0.55, 0.05, 0.030, 4.5, 1.60], // Chimes / FX
  [0.22, 0.70, 3, 1.3, 0.85, 0.00, 0, 0.1, 6.0, 0.60, 0.04, 0.005, 2.0, 0.30] // Percussion
]

// Writes the chosen class's values over `p` (index 0 = Custom: nothing changes).
export function applyMotionClass(p: FeelParams, classIndex: number): void {
  const row = CLASS_VALUES[classIndex - 1]
  if (!row) return
  for (let i = 0; i < CLASS_KEYS.length; i++) p[CLASS_KEYS[i]] = row[i]
}

export const FEEL_KEYS = Object.keys(FEEL_RANGES) as Array<keyof FeelParams>

export function defaultFeel(): FeelParams {
  const p: any = {}
  for (const k of FEEL_KEYS) p[k] = FEEL_RANGES[k].def
  return p as FeelParams
}

// The comfort limiter (StageConfig > Comfort limiter). Whatever a toy asks for, it never goes past these.
export interface ComfortLimits {
  enabled: boolean
  maxSquash: number // fraction: deepest squash (poke / landing / music)
  maxStretch: number // fraction: tallest stretch
  maxBulge: number // x: sideways bulge
  maxOvershoot: number // fraction (0.25 = the blob springs 25% past rest at most): sets the lowest damping allowed
  maxDamping: number // unitless: damping is kept at or below this (always below 1)
  maxSquishHz: number // Hz: springiness speed
  maxWobbleHz: number // Hz: wobble speed
  maxWobbleDegrees: number // degrees: wobble angle
  maxScalePulse: number // fraction: music pulse size
  maxBounceCm: number // cm: music bounce height
}

// The lowest damping that keeps the first overshoot of a damped spring at or below `overshoot` (a fraction).
export function dampingForOvershoot(overshoot: number): number {
  const o = Math.min(0.6, Math.max(0.02, overshoot))
  const l = Math.log(o)
  return -l / Math.sqrt(Math.PI * Math.PI + l * l)
}

// What a toy's ToyConfig carries: the limited values the motion scripts read, plus the seeded wobble.
export interface FeelOut extends FeelParams {
  wobbleRate: number // radians per second (the wobble's own speed for THIS toy)
  wobblePhase: number // radians (where in its cycle THIS toy starts)
}

// A repeatable 0..1 number from a seed (the same seed always gives the same number).
export function rand01(seed: number, k: number): number {
  const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453
  return s - Math.floor(s)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// Fills `out` from `p`: every value clamped into its range, then into the comfort limits, then the seeded wobble.
// Returns "" when nothing had to change, else one line per value that was clamped (so the caller can warn once).
export function limitFeel(p: FeelParams, L: ComfortLimits, out: FeelOut): string {
  let msg = ""
  for (const k of FEEL_KEYS) {
    const r = FEEL_RANGES[k]
    let v = p[k]
    if (typeof v !== "number" || isNaN(v)) v = r.def
    let c = clamp(v, r.min, r.max)
    if (k === "feelSeed") c = Math.round(c)
    if (c !== p[k]) msg += k + " " + p[k] + " -> " + c + "; "
    out[k] = c
  }
  if (L.enabled) {
    const lim = (k: keyof FeelParams, hi: number, lo?: number): void => {
      const c = clamp(out[k], lo === undefined ? FEEL_RANGES[k].min : lo, hi)
      if (c !== out[k]) msg += k + " " + out[k] + " -> " + c + " (comfort limiter); "
      out[k] = c
    }
    lim("pokeSquash", L.maxSquash)
    lim("landSquash", L.maxSquash)
    lim("grabStretch", L.maxStretch)
    lim("squishBulge", L.maxBulge)
    lim("squishHz", L.maxSquishHz)
    lim("kickHz", L.maxSquishHz)
    lim("scalePulse", L.maxScalePulse)
    lim("bounceCm", L.maxBounceCm)
    lim("wobbleDegrees", L.maxWobbleDegrees)
    // damping: never 1 or more, and never so low that the first overshoot passes the allowed amount
    lim("damping", Math.min(0.95, L.maxDamping), dampingForOvershoot(L.maxOvershoot))
    lim("kickDamping", Math.min(0.95, L.maxDamping), dampingForOvershoot(L.maxOvershoot))
  }
  // this toy's own wobble: rate within +-15% of the base from its seed, phase anywhere in the cycle
  const hz = out.wobbleHz * (0.85 + 0.3 * rand01(out.feelSeed, 1))
  const hzCap = L.enabled ? Math.min(FEEL_RANGES.wobbleHz.max, L.maxWobbleHz) : FEEL_RANGES.wobbleHz.max
  if (hz > hzCap) msg += "wobble speed " + hz.toFixed(2) + " Hz -> " + hzCap + " Hz (comfort limiter); "
  out.wobbleRate = 2 * Math.PI * Math.min(hz, hzCap)
  out.wobblePhase = 2 * Math.PI * rand01(out.feelSeed, 2)
  return msg
}
