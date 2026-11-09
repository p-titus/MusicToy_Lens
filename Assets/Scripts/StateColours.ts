// StateColours - shared helpers for the per-state colours of toys and pads (off, low, medium, high).
// Not a component: ToyConfig and ToyPad each own one StateColourDriver and give it their own four colours.
//
// deriveStateColours(base): the DEFAULT set from one base colour. Off is dim and desaturated, then each
// state is brighter: low = a little muted, medium = the base colour, high = lifted toward white.
// The four colours stay independent Inspector values; this only fills them in (and Reset puts them back).

export const STATE_NAMES = ["off", "low", "medium", "high"]

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// grey-ward and darker/lighter copy of a colour (alpha is kept)
function tone(c: vec4, desaturate: number, brightness: number, towardWhite: number): vec4 {
  const grey = c.x * 0.299 + c.y * 0.587 + c.z * 0.114
  const f = (v: number): number => {
    const s = mix(v, grey, desaturate) * brightness
    return Math.max(0, Math.min(1, mix(s, 1, towardWhite)))
  }
  return new vec4(f(c.x), f(c.y), f(c.z), c.w)
}

export function deriveStateColours(base: vec4): vec4[] {
  return [tone(base, 0.7, 0.35, 0), tone(base, 0.3, 0.65, 0), tone(base, 0, 0.9, 0), tone(base, 0, 1, 0.25)]
}

export interface ColourSettings {
  colours: vec4[] // index = state (0 off, 1 low, 2 medium, 3 high)
  seconds: number // blend time between two colours
  param: string // material parameter that receives the colour
  shade?: number // multiplies the red, green and blue (default 1), e.g. 0.55 for a darker "shadow" copy
}

// Blends to the colour of the current state and writes it to a material parameter on a COPY of the
// visual's material (the asset itself is never changed). Settings are read live every frame, so
// Inspector edits show at once. If the parameter does not exist it warns once and writes nothing.
export class StateColourDriver {
  private state: number = 0
  private current: vec4 | null = null
  private from: vec4 = vec4.zero()
  private to: vec4 | null = null
  private t: number = 1
  private cloned: RenderMeshVisual | null = null
  private warnedParam: string = ""
  private written: string = ""

  constructor(
    private label: string,
    private getVisual: () => RenderMeshVisual | null,
    private getSettings: () => ColourSettings
  ) {}

  setState(state: number): void {
    this.state = Math.max(0, Math.min(3, state))
  }

  // Jump straight to the current state's colour (no blend), e.g. right after a reset.
  snap(): void {
    this.current = null
    this.to = null
    this.written = ""
  }

  update(dt: number): void {
    const v = this.getVisual()
    if (!v || !v.mainMaterial) return
    if (this.cloned !== v) {
      v.mainMaterial = v.mainMaterial.clone() // a private copy: the asset is never edited
      this.cloned = v
      this.written = ""
    }
    const s = this.getSettings()
    const target = s.colours[this.state]
    if (!target || !s.param) return
    if (!this.current) {
      this.current = target
      this.to = target
      this.t = 1
    } else if (!this.to || !same(this.to, target)) {
      this.from = this.current
      this.to = target
      this.t = s.seconds > 0 ? 0 : 1
    }
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / Math.max(0.0001, s.seconds))
      this.current = vec4.lerp(this.from, this.to as vec4, this.t)
    } else {
      this.current = this.to
    }
    const pass = v.mainPass as any
    if (!pass || pass[s.param] === undefined) {
      if (this.warnedParam !== s.param) {
        this.warnedParam = s.param
        console.warn("[Colours] " + this.label + ": the material has no parameter named '" + s.param + "'. Set the Material Parameter to the name your material uses.")
      }
      return
    }
    const key = this.current.x + "," + this.current.y + "," + this.current.z + "," + this.current.w + "," + s.shade
    if (key === this.written) return
    this.written = key
    const k = s.shade === undefined ? 1 : s.shade
    pass[s.param] = k === 1 ? this.current : new vec4(this.current.x * k, this.current.y * k, this.current.z * k, this.current.w)
  }
}

function same(a: vec4, b: vec4): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w
}

// ---------------------------------------------------------------------------------------------------------
// BlobLookDriver - hands the toy's state to the BlobShader_01 material. The LOOK itself lives in the shader graph.
// It writes only two numbers to this toy's Visual (mainPassOverrides; the material asset is never edited or cloned):
//   lookState  float 0..3, unitless: 0 = off, 1 = low, 2 = medium, 3 = loud. Smoothed, so 1.5 = halfway between
//              low and medium. The graph picks its Off / Low / Med / High values with it.
//   audioLevel float 0..1, unitless: the smoothed stem loudness (read before volume).
// If the material has no `lookState` parameter, update() returns false and the material is left exactly as it is.
export const LOOK_PARAMS = {
  state: "lookState",
  audio: "audioLevel"
}

export interface BlobLookSettings {
  seconds: number // seconds for lookState to move by one state step (0 = instant)
}

export class BlobLookDriver {
  private state: number = 0
  private cur: number = -1 // smoothed lookState; -1 = not set yet (the first frame snaps to the state)
  private audioLevel: number = 0
  private written: string = ""
  private checked: RenderMeshVisual | null = null
  private supported: boolean = false

  constructor(
    private label: string,
    private getVisual: () => RenderMeshVisual | null,
    private getSettings: () => BlobLookSettings
  ) {}

  setState(state: number): void {
    this.state = Math.max(0, Math.min(3, Math.round(state)))
  }

  // the smoothed stem level 0..1 (before volume)
  setAudioLevel(level: number): void {
    this.audioLevel = level
  }

  // Returns true when it handled the material (the material has the lookState parameter).
  update(dt: number): boolean {
    const v = this.getVisual()
    if (!v || !v.mainMaterial) return false
    if (this.checked !== v) {
      this.checked = v
      const p0 = v.mainPass as any
      this.supported = !!p0 && p0[LOOK_PARAMS.state] !== undefined
      this.written = ""
      this.cur = -1
    }
    if (!this.supported) return false
    const s = this.getSettings()
    if (this.cur < 0 || s.seconds <= 0) this.cur = this.state
    else {
      const step = dt / s.seconds
      this.cur += Math.max(-step, Math.min(step, this.state - this.cur))
    }
    const key = this.cur + "|" + this.audioLevel
    if (key === this.written) return true
    this.written = key
    const o = v.mainPassOverrides as any
    o[LOOK_PARAMS.state] = this.cur
    o[LOOK_PARAMS.audio] = this.audioLevel
    return true
  }
}

// ---------------------------------------------------------------------------------------------------------
// HomeLookDriver - hands the "home marker" values to the shared Home material (Home_Mat) on ONE pad's BaseVisual.
// All seven homes share the one material asset: nothing is cloned, the values go to this Visual's mainPassOverrides.
// The look itself (ring, soft edge, dimmer centre, additive) is the artist's shader graph; this only sends numbers.
// Parameter names come from StageConfig > Home (defaults homeColor, brightness, ringRadius, ringSoftness, beatPulse, padState).
// Each row of the table below is "one signal -> one parameter": add a row to map another signal later.
export interface HomeInput {
  state: number // 0 off .. 3 high (unitless, may be fractional while sliding)
  colour: vec4 | null // the ring colour (null = leave the material's own)
  heightCm: number // cm above the stage floor
  squash: number // + = flatter, - = taller (unitless)
  hitSeq: number // counter of beats (ToySignals.hitSeq)
  hitStrength: number // 0.3..1
  padState: number // 0..3 (the pad's smooth state value)
  away: boolean // the toy is not on its socket (carried, drifting, settling)
}

export interface HomeSettings {
  names: { colour: string; brightness: string; radius: string; softness: string; beat: string; padState: string }
  rest: number // brightness when off
  onOpacity: number // 0..1: multiplier on the ring brightness when the toy is on (low, med, high)
  low: number
  med: number
  high: number
  brightnessSeconds: number
  ringRadius: number
  ringSoftness: number
  tightenBySquash: number
  widenPerCm: number
  brightenBySquash: number
  beatStrength: number
  beatFallSeconds: number
  awayDim: number // 0..1: brightness multiplier while the toy is away
  awayPulseSeconds: number // s per pulse while away
  awayPulseAmount: number // 0..1 depth of that pulse
  flashSeconds: number // s for the landing flash to ease back
}

export class HomeLookDriver {
  private bright: number = -1
  private beat: number = 0
  private lastSeq: number = -1
  private warned: boolean = false
  private lastKey: string = ""
  private awayMix: number = 0 // 0 = on its socket, 1 = away (eased, so the dim fades in and out)
  private clock: number = 0
  private flashLevel: number = 0

  constructor(
    private label: string,
    private getVisual: () => RenderMeshVisual | null,
    private getSettings: () => HomeSettings
  ) {}

  // The ring's state brightness (0..1, before the away dim). The ripples start from it.
  get level(): number {
    return Math.max(0, this.bright)
  }

  // One flash of the ring (0..1, unitless), for example when the toy lands. It rides the same beat parameter.
  flash(strength: number): void {
    this.flashLevel = Math.max(this.flashLevel, Math.max(0, Math.min(1, strength)))
  }

  update(dt: number, inp: HomeInput): void {
    const v = this.getVisual()
    if (!v || !v.mainMaterial) return
    const s = this.getSettings()
    const o = v.mainPassOverrides as any
    const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

    // brightness from the volume state (blends between the four values; never below the resting glow)
    const table = [s.rest, s.low, s.med, s.high]
    const st = Math.max(0, Math.min(3, inp.state))
    const i = Math.min(2, Math.floor(st))
    const target = Math.max(s.rest, table[i] + (table[i + 1] - table[i]) * (st - i))
    if (this.bright < 0 || s.brightnessSeconds <= 0) this.bright = target
    else this.bright += (target - this.bright) * (1 - Math.exp(-dt / s.brightnessSeconds))

    // beats: a new hit sets the pulse, then it eases back
    if (this.lastSeq < 0) this.lastSeq = inp.hitSeq
    if (inp.hitSeq !== this.lastSeq) {
      this.lastSeq = inp.hitSeq
      this.beat = Math.max(this.beat, clamp01(inp.hitStrength * s.beatStrength))
    }
    this.beat = s.beatFallSeconds <= 0 ? 0 : Math.max(0, this.beat - dt / s.beatFallSeconds)
    this.flashLevel = s.flashSeconds <= 0 ? 0 : Math.max(0, this.flashLevel - dt / s.flashSeconds)

    // away from the socket: dimmer, with a slow gentle pulse (both fade in and out over Brightness Blend Seconds)
    this.clock += dt
    const goal = inp.away ? 1 : 0
    this.awayMix = s.brightnessSeconds <= 0 ? goal : this.awayMix + (goal - this.awayMix) * (1 - Math.exp(-dt / s.brightnessSeconds))
    const pulse = 0.5 - 0.5 * Math.cos((2 * Math.PI * this.clock) / Math.max(0.1, s.awayPulseSeconds)) // 0..1
    const awayFactor = 1 - this.awayMix * ((1 - clamp01(s.awayDim)) + clamp01(s.awayPulseAmount) * pulse)

    // height / squash: lower or squashed = tighter and brighter, higher = wider and fainter
    const h = Math.max(0, inp.heightCm)
    const radius = Math.max(0.05, Math.min(0.95, s.ringRadius - s.tightenBySquash * inp.squash + s.widenPerCm * h))
    // "on" opacity: fades from 1 (off) to On Opacity as the state goes from off to low, so the rest glow is untouched
    const onFactor = 1 + (clamp01(s.onOpacity) - 1) * clamp01(st)
    const brightness = clamp01(((this.bright * (1 + s.brightenBySquash * Math.max(0, inp.squash))) / (1 + s.widenPerCm * h)) * awayFactor * onFactor)
    const beatOut = Math.max(this.beat, this.flashLevel)

    const key = [radius, brightness, beatOut, s.ringSoftness, inp.padState, inp.colour ? inp.colour.x + "," + inp.colour.y + "," + inp.colour.z : ""].join("|")
    if (key === this.lastKey) return
    this.lastKey = key
    try {
      if (inp.colour) o[s.names.colour] = new vec4(inp.colour.x, inp.colour.y, inp.colour.z, 1)
      o[s.names.brightness] = brightness
      o[s.names.radius] = radius
      o[s.names.softness] = s.ringSoftness
      o[s.names.beat] = beatOut
      o[s.names.padState] = inp.padState
    } catch (err) {
      if (!this.warned) {
        this.warned = true
        console.warn("[Home] " + this.label + ": could not write to the Home material (" + err + "). Check the parameter names in StageConfig > Home.")
      }
    }
  }
}
