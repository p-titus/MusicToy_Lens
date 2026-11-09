// SocketRipple - the sound-wave rings that spread from ONE socket (one per pad).
// It only keeps a few waves alive and sends NUMBERS to the artist's Ripple_Mat material (nothing is made in code:
// the Ripple object under each pad, its mesh and its material are yours; the look is your shader graph).
//
// A wave is started by ToyPad: on every hit of the toy's stem (not while the toy is off) and, softer, on landing.
// Each wave lives for Ripple Seconds. While no wave is alive the Ripple object is DISABLED, so it costs nothing.
//
// Parameters written to Ripple_Mat's Visual (mainPassOverrides), all unitless 0..1 unless noted.
// Fractions are of the quad's HALF width (1 = the quad edge):
//   per wave i = 0, 1, 2 (names get the suffix "" / "1" / "2"):  rippleProgress (0 = no wave, else 0..1 travel)
//                                                                  rippleStrength (0..1, how strong this wave is)
//   shared: rippleStartRadius, rippleEndRadius, rippleStartWidth, rippleEndWidth, rippleStartBrightness,
//           rippleEndBrightness, rippleLighten, rippleFadeStart, rippleSoftness, and a colour (rippleColor)
// The first three names can be changed in StageConfig > Ripples; the shared ones are fixed (see PLAN.md 35b).

export interface RippleSettings {
  enabled: boolean
  seconds: number // s one wave lives
  quadCm: number // cm, the drawn size of the ripple quad
  startWidthCm: number // cm
  endWidthCm: number // cm
  startBrightness: number // multiple of the ring's own brightness
  endBrightness: number // fraction of the start brightness
  lighten: number // 0..1 toward white
  fadeDistanceCm: number // cm before the quad edge over which the wave fades out
  softness: number // 0..1
  maxWaves: number // 1..3
  minGapSeconds: number // s, least time between two separate waves; closer hits merge into the newest wave
  mergeGain: number // 0..1, how much of a merged hit's strength is added to the wave it merges into
  fadeSeconds: number // s, the wave fades out over this long at the end of its life
  startRadius: number // 0..1 of the quad's half width: where the home ring is
  names: { progress: string; strength: string; colour: string }
}

// A wave is plain data (age and strength), so a future stage-wide pool can hold the same thing plus a position and colour.
type Wave = { age: number; strength: number }

export class RippleDriver {
  private waves: Wave[] = []
  private shown: boolean = false
  private warned: boolean = false

  constructor(
    private label: string,
    private getObject: () => SceneObject | null,
    private getSettings: () => RippleSettings
  ) {}

  // Start one wave (strength 0..1), with a throttle:
  //  - if the newest wave is younger than Min Gap, or all wave slots are busy, this hit MERGES into the newest wave
  //    (its strength grows by strength x Merge Gain, capped at 1) and no new ring starts;
  //  - otherwise a new wave starts. Nothing is ever dropped abruptly, so a ring never pops out of view.
  spawn(strength: number): void {
    const s = this.getSettings()
    if (!s.enabled || strength <= 0) return
    const max = Math.max(1, Math.min(3, Math.round(s.maxWaves)))
    const add = Math.min(1, strength)
    const newest = this.waves[this.waves.length - 1]
    if (newest && (newest.age < s.minGapSeconds || this.waves.length >= max)) {
      newest.strength = Math.min(1, newest.strength + add * Math.max(0, Math.min(1, s.mergeGain)))
      return
    }
    this.waves.push({ age: 0, strength: add })
  }

  // ringLevel = the ring's own brightness now (0..1); colour = the ring colour (null = leave the material's own).
  update(dt: number, ringLevel: number, colour: vec4 | null): void {
    const obj = this.getObject()
    if (!obj) return
    const s = this.getSettings()
    const life = Math.max(0.05, s.seconds)
    for (const w of this.waves) w.age += dt
    this.waves = this.waves.filter((w) => w.age < life)
    if (!s.enabled) this.waves = []

    if (this.waves.length === 0) {
      if (this.shown) {
        this.write(obj, s, ringLevel, colour) // progress 0 everywhere, then hide
        obj.enabled = false
        this.shown = false
      }
      return
    }
    if (!this.shown) {
      obj.enabled = true
      this.shown = true
    }
    this.write(obj, s, ringLevel, colour)
  }

  private write(obj: SceneObject, s: RippleSettings, ringLevel: number, colour: vec4 | null): void {
    const rmv = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (!rmv || !rmv.mainMaterial) return
    const o = rmv.mainPassOverrides as any
    const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
    const half = Math.max(0.1, s.quadCm * 0.5)
    const startR = clamp01(s.startRadius)
    const endW = Math.max(0.001, s.endWidthCm / half)
    const endR = Math.max(startR, Math.min(1, 1 - endW * 0.5 - 0.01)) // the wave ends just inside the quad edge
    const travelCm = (endR - startR) * half
    const life = Math.max(0.05, s.seconds)
    // the fade starts at the EARLIER of: Fade Distance before the quad edge, and Fade Seconds before the end of life
    const fadeByDist = s.fadeDistanceCm <= 0 ? 1 : clamp01(1 - s.fadeDistanceCm / Math.max(0.01, travelCm))
    const fadeBySecs = s.fadeSeconds <= 0 ? 1 : clamp01(1 - s.fadeSeconds / life)
    const fadeStart = Math.min(fadeByDist, fadeBySecs)
    const startB = clamp01(ringLevel * s.startBrightness)
    try {
      o["rippleStartRadius"] = startR
      o["rippleEndRadius"] = endR
      o["rippleStartWidth"] = clamp01(s.startWidthCm / half)
      o["rippleEndWidth"] = clamp01(endW)
      o["rippleStartBrightness"] = startB
      o["rippleEndBrightness"] = clamp01(startB * s.endBrightness)
      o["rippleLighten"] = clamp01(s.lighten)
      o["rippleFadeStart"] = fadeStart
      o["rippleSoftness"] = clamp01(s.softness)
      if (colour) o[s.names.colour] = new vec4(colour.x, colour.y, colour.z, 1)
      for (let i = 0; i < 3; i++) {
        const suffix = i === 0 ? "" : String(i)
        const w = this.waves[i]
        o[s.names.progress + suffix] = w ? clamp01(w.age / life) : 0
        o[s.names.strength + suffix] = w ? w.strength : 0
      }
    } catch (err) {
      if (!this.warned) {
        this.warned = true
        console.warn("[Ripple] " + this.label + ": could not write to the Ripple material (" + err + "). Check Ripple_Mat's parameter names (PLAN.md section 35b) and StageConfig > Ripples.")
      }
    }
  }
}
