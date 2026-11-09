// PadArc - small helpers for the DIAL BUTTON (the small flat disc on each socket ring's outer rim, facing the viewer).
// (The file and the "arc" names are kept from the earlier curved-tab version so nothing in the scene has to be re-hooked.)
// Plain helpers, not a component. ToyPad owns one ArcLookDriver and one PressSpring per pad.
//
// Nothing is made here: no mesh, no material, no shader. The button is drawn by YOUR material (Arc_Mat) on a flat quad
// (Pad_Plane.mesh). This file only works out numbers and hands them to that material:
//   arcColorOff / arcColorLow / arcColorMed / arcColorHigh   colours (RGBA): the toy's own edge colour at each state.
//               The name is the Colour Prefix + Off / Low / Med / High. Meaning on the button: Off = every part when unlit,
//               Low = the centre circle when lit, Med = the middle ring when lit, High = the outer ring when lit.
//               (Blended over Colour Blend Seconds. If one cannot be read, the pad's own state colour is used.)
//   outlineColor   colour (RGBA): the soft outline around the button (the toy's Off body colour)
//   outlineWidth   float, fraction of the quad's half-width (unitless): how far the outline reaches OUTSIDE the disc edge
//   outlineSoftness float, fraction of the quad's half-width (unitless): the feather on the outline's outer edge only
//   discRadius  float, fraction of the quad's half-width (0..1, unitless): the button's outer edge
//   coreEnd     float, fraction of the DISC radius (0..1, unitless): where the central circle ends
//   midEnd      float, fraction of the DISC radius (0..1, unitless): where the middle ring ends (the outer ring runs to 1)
//   seg1..seg3  float 0..1, unitless: how far the centre (seg1), middle ring (seg2) and outer ring (seg3) have moved from
//               the Off colour to their own lit colour (1 = fully lit, Arc Unlit Level = unlit). Low lights seg1, Medium
//               seg1+2, High all three. Off lights none. A lit part keeps ITS colour: centre Low, middle Med, outer High.
//   press       float, unitless: 0 at rest, 1 fully pressed, a little below 0 while it springs back past the top
// (all names are Inspector text fields in StageConfig > Dial button > Parameter names).
// Values go to the visual's mainPassOverrides, so the one shared material asset is never cloned or edited.

export function degToRad(d: number): number {
  return (d * Math.PI) / 180
}

// Any angle (radians) brought into -PI .. PI.
export function wrapRad(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

// A damped spring for the press: pressed = true pulls toward 1 (the ring sinks), false pulls toward 0 (it comes back,
// and with low damping it bounces past 0 and settles). x is the press amount (unitless), v its speed.
export class PressSpring {
  x: number = 0
  v: number = 0

  // hz = how fast it swings (cycles per second); downDamping / upDamping = 0 (never settles) .. 1 (no bounce)
  step(dt: number, pressed: boolean, hz: number, downDamping: number, upDamping: number): void {
    const w = 2 * Math.PI * Math.max(0.1, hz)
    const z = Math.max(0, pressed ? downDamping : upDamping)
    const target = pressed ? 1 : 0
    let left = Math.min(Math.max(0, dt), 0.1)
    while (left > 0) {
      const h = Math.min(left, 0.008) // small steps keep a stiff spring stable
      this.v += (w * w * (target - this.x) - 2 * z * w * this.v) * h
      this.x += this.v * h
      left -= h
    }
    if (!pressed && Math.abs(this.x) < 0.0005 && Math.abs(this.v) < 0.005) {
      this.x = 0
      this.v = 0
    }
  }
}

export interface ArcLookSettings {
  names: { colourPrefix: string; outlineColour: string; outlineWidth: string; outlineSoftness: string; discRadius: string; coreEnd: string; midEnd: string; segPrefix: string; press: string }
  outlineWidthCm: number // outline reach outside the disc edge, cm
  outlineSoftCm: number // feather on the outline's outer edge, cm
  quadCm: number // drawn size of the button quad (cm, square)
  discDiameterCm: number // the button's diameter, cm
  coreEnd: number // 0..1 of the disc radius
  midEnd: number // 0..1 of the disc radius
  unlit: number // 0..1: how bright an unlit part stays
  blendSeconds: number // seconds for the parts and colour to follow a state change (0 = instant)
}

export class ArcLookDriver {
  private seg: number[] = [-1, -1, -1]
  private colours: vec4[] | null = null
  private outline: vec4 | null = null
  private key: string = ""
  private warned: Set<string> = new Set<string>()

  constructor(
    private label: string,
    private getVisual: () => RenderMeshVisual | null,
    private getSettings: () => ArcLookSettings
  ) {}

  // state: 0 off .. 3 high (unitless). colours: the four state colours [off, low, med, high]. outline: the outline colour.
  // press: the spring's x.
  update(dt: number, state: number, colours: vec4[], outline: vec4, press: number): void {
    const v = this.getVisual()
    if (!v || !v.mainMaterial) return
    const s = this.getSettings()
    const k = s.blendSeconds <= 0 ? 1 : 1 - Math.exp(-dt / s.blendSeconds)
    const unlit = Math.max(0, Math.min(1, s.unlit))
    for (let i = 0; i < 3; i++) {
      const lit = Math.max(0, Math.min(1, state - i)) // segment i+1 is lit once the state passes i
      const goal = unlit + (1 - unlit) * lit
      this.seg[i] = this.seg[i] < 0 ? goal : this.seg[i] + (goal - this.seg[i]) * k
    }
    this.colours = this.colours ? this.colours.map((old, i) => vec4.lerp(old, colours[i], k)) : colours.slice()
    this.outline = this.outline ? vec4.lerp(this.outline, outline, k) : outline
    const half = Math.max(0.01, s.quadCm * 0.5)
    const discRadius = Math.min(1, (s.discDiameterCm * 0.5) / half)
    const outlineWidth = Math.max(0, s.outlineWidthCm) / half
    const outlineSoft = Math.max(0, s.outlineSoftCm) / half
    const hex = (c: vec4): string => c.x.toFixed(3) + "," + c.y.toFixed(3) + "," + c.z.toFixed(3)
    const key = [this.seg.map((x) => x.toFixed(3)).join(","), this.colours.map(hex).join(";"), hex(this.outline), discRadius.toFixed(4), outlineWidth.toFixed(4), outlineSoft.toFixed(4), s.coreEnd, s.midEnd, press.toFixed(3)].join("|")
    if (key === this.key) return
    this.key = key
    const o = v.mainPassOverrides as any
    // each value on its own, so one missing parameter in the material never blocks the others
    const put = (name: string, value: any): void => {
      try {
        o[name] = value
      } catch (err) {
        if (!this.warned.has(name)) {
          this.warned.add(name)
          console.warn("[Dial] " + this.label + ": could not write '" + name + "' to the Arc material (" + err + "). Check the parameter names in StageConfig > Dial button > Parameter names.")
        }
      }
    }
    const suffix = ["Off", "Low", "Med", "High"]
    for (let i = 0; i < 4; i++) put(s.names.colourPrefix + suffix[i], this.colours[i])
    put(s.names.outlineColour, this.outline)
    put(s.names.outlineWidth, outlineWidth)
    put(s.names.outlineSoftness, outlineSoft)
    put(s.names.discRadius, discRadius)
    put(s.names.coreEnd, s.coreEnd)
    put(s.names.midEnd, s.midEnd)
    put(s.names.press, press)
    for (let i = 0; i < 3; i++) put(s.names.segPrefix + (i + 1), this.seg[i])
  }
}
