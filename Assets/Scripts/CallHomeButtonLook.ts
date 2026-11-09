// CallHomeButtonLook - the picture, text and "alive" feel of the CALL HOME button.
//
// What it draws: a flat rounded rectangle (your CallHome_Mat on a flat quad) with a rim, and a text "RESET?" made of two
// Text objects so the "?" can pulse on its own. All the numbers live in this Inspector. The script only writes numbers to
// the material (never edits the material asset) and moves/rotates/scales the objects you give it. No mesh, material or
// shader is created in code.
//
// What it does NOT do: pressing. The existing CallHomeButton script (on the same object) listens to the button's
// Interactable and sends every toy home. This script only listens to hover, to make the button glow.
//
// Alive behaviour (same idea as the toys and dial buttons, see Alive.ts): a hand coming close, or hovering, eases the rim
// and the text up to a glow; the "?" also pulses while that is on.
//
// Units: all lengths are centimetres (cm), angles are degrees, times are seconds (s). Positions are in the STAGE's
// local space: X left/right, Y height above the table, Z back/front (+Z = toward you).

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { StageConfig } from "./StageConfig"
import { NearTracker, breath01 } from "./Alive"
import { degToRad, PressSpring } from "./PadArc"

// em height of Text in world space: size / 43.886 cm (from the Lens Studio Text docs)
const TEXT_SIZE_PER_CM = 43.886

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

@component
export class CallHomeButtonLook extends BaseScriptComponent {
  // ------------------------------------------------------------------ objects
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Objects (hook-up)</span>')
  @input
  @allowUndefined
  @hint("The flat quad that shows the button: a RenderMeshVisual using CallHome_Mat on a flat 1 cm quad (the same mesh as the dial button). This script scales it. Empty = nothing is drawn.")
  quad: SceneObject

  @input
  @allowUndefined
  @hint("The object that carries the Interactable and the Collider (the touch box). The script tilts it, sizes its box and moves the picture and text with it. Empty = this object.")
  face: SceneObject

  @input
  @allowUndefined
  @hint("The Text component for the main word (default RESET). Its font, size and colour are driven from this Inspector.")
  labelText: Text

  @input
  @allowUndefined
  @hint("The Text component for the pulsing suffix (default ?). Empty = no suffix.")
  suffixText: Text

  // ------------------------------------------------------------------ layout
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Size and location</span>')
  @input
  @hint("Where the button sits, in the STAGE's local space (cm): X left/right, Y height above the table, Z back/front (+Z toward you). The move handle is at about Z = 4 cm, so 8 puts the button just in front of it.")
  positionCm: vec3 = new vec3(0, 0.05, 8)

  @input
  @hint("Width of the button body (cm), not counting the rim.")
  widthCm: number = 5

  @input
  @hint("Height of the button body (cm), not counting the rim.")
  heightCm: number = 2

  @input
  @hint("Roundness: corner radius (cm). 0 = square corners. It stops at half the shorter side, which makes a full pill shape.")
  cornerRadiusCm: number = 0.8

  @input
  @hint("Tilt (degrees). 0 = lying flat on the table. 90 = standing upright facing you. Positive tilts the far edge up toward you.")
  tiltDegrees: number = 0

  @input
  @hint("Extra touch area (cm) added around the body and rim, so a slightly off finger still hits. 0 = the touch box is exactly body + rim.")
  hitMarginCm: number = 0.4

  @input
  @hint("Depth (cm) of the touch box, measured up from the button face. A flat button needs a little height to be touchable.")
  touchDepthCm: number = 1

  // ------------------------------------------------------------------ colours and rim
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Background and rim</span>')
  @input
  @widget(new ColorWidget())
  @hint("Background (body) colour. On an additive material, black = invisible and brighter = more solid.")
  backgroundColor: vec4 = new vec4(0.05, 0.1, 0.2, 1)

  @input
  @widget(new ColorWidget())
  @hint("Rim colour. The hover halo uses this colour too.")
  rimColor: vec4 = new vec4(0.3, 0.7, 1, 1)

  @input
  @hint("Rim thickness (cm), drawn OUTSIDE the body so the body keeps its size. 0 = no rim. 0.15 = 1.5 mm.")
  rimWidthCm: number = 0.15

  @input
  @hint("Feather (cm) on the body and rim edges. 0.03 = about 0.3 mm, enough to take the sharpness off. 0 = hard edge.")
  edgeSoftnessCm: number = 0.03

  @input
  @hint("Rim brightness at rest (unitless multiplier, 1 = the colour as set, 0 = rim invisible until hover).")
  rimRestGlow: number = 1

  @input
  @hint("Overall opacity (0 to 1, unitless). Applies to the whole button picture, not the text.")
  opacity: number = 1

  // ------------------------------------------------------------------ hover glow
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Hover glow</span>')
  @input
  @hint("Switch the hover reaction on or off. Off = the button stays at its rest look. (Also off when StageConfig > Alive and hover is off.)")
  hoverEnabled: boolean = true

  @input
  @hint("Rim brightness at full hover (unitless multiplier of the rim colour). 1 = no change from rest, 2 = twice as bright.")
  hoverGlow: number = 2

  @input
  @hint("How far the soft glow around the rim reaches outside it (cm). 0 = no outer halo, only the rim itself brightens.")
  haloReachCm: number = 0.5

  @input
  @hint("Brightness of that outer halo at full hover (unitless, 1 = same as the rim colour).")
  haloStrength: number = 0.6

  @input
  @hint("Distance from the button's surface (cm) at which a fingertip counts as fully near (glow at 100%).")
  nearInnerCm: number = 1

  @input
  @hint("Distance from the button's surface (cm) at which a fingertip starts to count (glow starts at 0%). How quickly the glow eases is StageConfig > Alive and hover > Ease Seconds.")
  nearOuterCm: number = 6

  // ------------------------------------------------------------------ text
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Text</span>')
  @input
  @hint("The main word. Change it to anything (RESET, HOME, CALL HOME ...).")
  label: string = "RESET"

  @input
  @hint("The suffix that pulses (default ?). Leave empty for no suffix.")
  suffix: string = "?"

  @input
  @allowUndefined
  @hint("Font for both texts. Empty = whatever font is already on the Text components.")
  font: Font

  @input
  @hint("Text size (cm): the height of the letter box (em). 0.7 cm is a little over a third of the default button height. Converted to Text size at 43.886 per cm.")
  textSizeCm: number = 0.7

  @input
  @widget(new ColorWidget())
  @hint("Text colour at rest (RGBA).")
  textColor: vec4 = new vec4(0.8, 0.9, 1, 1)

  @input
  @widget(new ColorWidget())
  @hint("Text colour at full hover (RGBA). The text eases from the rest colour to this one.")
  textHoverColor: vec4 = new vec4(1, 1, 1, 1)

  @input
  @hint("Extra brightness of the text at full hover (percent of its colour, 100 = no extra, 150 = half again as bright). RGB only.")
  textHoverBrightnessPercent: number = 150

  @input
  @hint("Gap (cm) between the main word and the suffix.")
  textGapCm: number = 0.12

  @input
  @hint("How far the text floats above the button face (cm), so it never flickers with the picture. Keep it tiny.")
  textLiftCm: number = 0.03

  // ------------------------------------------------------------------ pulse
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Pulse of the suffix</span>')
  @input
  @hint("Seconds (s) for one full pulse of the suffix (minimum 0.5).")
  pulsePeriodSeconds: number = 1.2

  @input
  @hint("How much the suffix grows at the top of a pulse (percent of its size). 15 = 15% bigger.")
  pulseScalePercent: number = 15

  @input
  @hint("How much brighter the suffix gets at the top of a pulse (percent on top of its hover brightness).")
  pulseBrightPercent: number = 40

  @input
  @hint("How much of the pulse also runs when nobody is near (percent of the full pulse). 0 = the suffix only pulses on hover. 100 = it pulses all the time.")
  pulseIdlePercent: number = 0

  // ------------------------------------------------------------------ press
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Press (the click)</span>')
  @input
  @hint("Switch the press reaction (sink, shrink, glow) on or off.")
  pressEnabled: boolean = true

  @input
  @hint("How deep the button picture and text sink while pressed (cm). Keep it tiny: 0.15 = 1.5 mm.")
  pressDepthCm: number = 0.15

  @input
  @hint("How much the button picture and text shrink while fully pressed (fraction, unitless: 0.03 = 3% smaller). 0 = no shrink.")
  pressShrink: number = 0.03

  @input
  @hint("Extra rim and halo glow while pressed (percent on top of the hover glow). 50 = the hover glow multiplier is 1.5 times bigger. 0 = no extra glow.")
  pressGlowPercent: number = 50

  @input
  @hint("Extra text brightness while pressed (percent on top of its colour). 30 = 30% brighter. RGB only.")
  pressTextBrightPercent: number = 30

  @input
  @hint("Shortest time (s) the button stays pressed, so a very quick tap still shows the click. 0 = follow the finger exactly.")
  pressMinSeconds: number = 0.08

  @input
  @hint("Spring speed of the press and the bounce back (cycles per second, Hz). Higher = snappier. Default matches the dial button.")
  pressSpringHz: number = 5

  @input
  @hint("Damping while PRESSING DOWN (0 to 1, unitless). 1 = sinks with no overshoot; lower overshoots a little.")
  pressDownDamping: number = 0.8

  @input
  @hint("Damping while BOUNCING BACK (0 to 1, unitless). 1 = no bounce; 0.3 = a clear bounce past the top.")
  pressUpDamping: number = 0.3

  // ------------------------------------------------------------------ private
  private spring: PressSpring = new PressSpring()
  private held: boolean = false
  private pressUntil: number = 0
  private quadScale: vec3 = new vec3(1, 1, 1)
  private labelX: number = 0
  private suffixX: number = 0
  private cfg: StageConfig | null = null
  private near: NearTracker = new NearTracker()
  private hoverCount: number = 0
  private interactable: Interactable | null = null
  private collider: ColliderComponent | null = null
  private rmv: RenderMeshVisual | null = null
  private tr: Transform
  private layoutKey: string = ""
  private textKey: string = ""
  private measureTries: number = 0
  private lastWritten: { [name: string]: number } = {}
  private warned: { [name: string]: boolean } = {}

  onAwake(): void {
    this.tr = this.sceneObject.getTransform()
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private faceObject(): SceneObject {
    return this.face ? this.face : this.sceneObject
  }

  private onStart(): void {
    this.rmv = this.quad ? (this.quad.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null
    if (this.quad && !this.rmv) console.warn("[CallHomeButtonLook] Quad '" + this.quad.name + "' has no RenderMeshVisual: nothing will be drawn")
    this.collider = this.faceObject().getComponent("Component.ColliderComponent") as ColliderComponent
    if (!this.collider) console.warn("[CallHomeButtonLook] '" + this.faceObject().name + "' has no ColliderComponent: the button cannot be touched")
    this.interactable = this.faceObject().getComponent(Interactable.getTypeName()) as Interactable
    if (!this.interactable) {
      console.warn("[CallHomeButtonLook] '" + this.faceObject().name + "' has no Interactable: hover glow works from hand distance only")
    } else {
      this.interactable.onHoverEnter.add(() => {
        this.hoverCount++
      })
      this.interactable.onHoverExit.add(() => {
        this.hoverCount = Math.max(0, this.hoverCount - 1)
      })
      // press: down on trigger start, up when the finger lifts or the touch is cancelled
      this.interactable.onTriggerStart.add(() => {
        this.held = true
        this.pressUntil = getTime() + Math.max(0, this.pressMinSeconds)
      })
      this.interactable.onTriggerEnd.add(() => {
        this.held = false
      })
      this.interactable.onTriggerCanceled.add(() => {
        this.held = false
      })
    }
  }

  // ------------------------------------------------------------------ per frame
  private onUpdate(): void {
    const cfg = this.cfg
    if (!cfg) return
    const dt = getDeltaTime()

    // geometry numbers, kept sane
    const w = Math.max(0.1, this.widthCm)
    const h = Math.max(0.1, this.heightCm)
    const rim = Math.max(0, this.rimWidthCm)
    const reach = Math.max(0, this.haloReachCm)
    const margin = rim + reach + 0.05
    const quadW = w + 2 * margin
    const quadH = h + 2 * margin

    this.applyLayout(w, h, quadW, quadH)

    // how near is a hand (0..1)
    const aliveOn = this.hoverEnabled && cfg.aliveEnabled
    if (!aliveOn) {
      this.near.reset()
    } else {
      const centre = this.faceObject().getTransform().getWorldPosition()
      this.near.update(dt, cfg, centre, Math.max(w, h) * 0.5, this.nearInnerCm, Math.max(this.nearInnerCm + 0.1, this.nearOuterCm), this.hoverCount > 0)
    }
    const amount = this.near.amount

    // press spring: x = 0 at rest, 1 fully pressed, a little below 0 while it bounces back
    const pressed = this.pressEnabled && (this.held || getTime() < this.pressUntil)
    this.spring.step(dt, pressed, this.pressSpringHz, this.pressDownDamping, this.pressUpDamping)
    if (!this.pressEnabled) {
      this.spring.x = 0
      this.spring.v = 0
    }
    const px = this.spring.x

    // a pressed button counts as fully near, and glows more than a hover
    this.writeMaterial(w, h, quadW, quadH, rim, Math.max(amount, clamp01(px)), 1 + (Math.max(0, this.pressGlowPercent) / 100) * Math.max(0, px))
    this.updateText(amount)
    this.applyPress(px)
  }

  // Sink and shrink the picture and the two words with the spring (the touch box does not move).
  private applyPress(px: number): void {
    const sink = Math.max(0, this.pressDepthCm) * px
    const scale = 1 - Math.max(0, this.pressShrink) * px
    if (this.quad) {
      const qt = this.quad.getTransform()
      qt.setLocalPosition(new vec3(0, -sink, 0))
      qt.setLocalScale(new vec3(this.quadScale.x * scale, this.quadScale.y, this.quadScale.z * scale))
    }
    const lift = Math.max(0, this.textLiftCm) - sink
    if (this.labelText) {
      const t = this.labelText.sceneObject.getTransform()
      t.setLocalPosition(new vec3(this.labelX * scale, lift, 0))
      t.setLocalScale(new vec3(scale, scale, scale))
    }
    if (this.suffixText) {
      // its scale (pulse x press) is set in updateText
      this.suffixText.sceneObject.getTransform().setLocalPosition(new vec3(this.suffixX * scale, lift, 0))
    }
  }

  // Placement, tilt, quad scale, touch box. Only redone when a number changes.
  private applyLayout(w: number, h: number, quadW: number, quadH: number): void {
    const key = [this.positionCm.x, this.positionCm.y, this.positionCm.z, quadW, quadH, w, h, this.tiltDegrees, this.hitMarginCm, this.touchDepthCm, this.textLiftCm].map((x) => x.toFixed(3)).join("|")
    if (key === this.layoutKey) return
    this.layoutKey = key
    const cfg = this.cfg!

    this.tr.setLocalPosition(this.positionCm)

    const face = this.faceObject()
    if (face !== this.sceneObject) {
      face.getTransform().setLocalPosition(vec3.zero())
      face.getTransform().setLocalRotation(quat.angleAxis(degToRad(this.tiltDegrees), vec3.right()))
    } else {
      this.tr.setLocalRotation(quat.angleAxis(degToRad(this.tiltDegrees), vec3.right()))
    }

    // the quad lies in the XZ plane and is 1 cm across at scale 1 (primitive mesh size from StageConfig, like the dial quad)
    if (this.quad) {
      const unit = cfg.primitiveMeshSize > 0 ? cfg.primitiveMeshSize : 1
      const qt = this.quad.getTransform()
      this.quadScale = new vec3(quadW / unit, 1, quadH / unit) // the press shrink is applied on top, each frame
      qt.setLocalScale(this.quadScale)
      qt.setLocalPosition(vec3.zero())
      qt.setLocalRotation(quat.quatIdentity())
    }

    // touch box: body + rim + margin, in the face's own flat frame (X width, Z height, Y depth up from the face)
    if (this.collider) {
      const rim = Math.max(0, this.rimWidthCm)
      const box = Shape.createBoxShape()
      const depth = Math.max(0.1, this.touchDepthCm)
      box.size = new vec3(w + 2 * (rim + Math.max(0, this.hitMarginCm)), depth, h + 2 * (rim + Math.max(0, this.hitMarginCm)))
      this.collider.shape = box
      this.collider.sceneObject.getTransform().setLocalPosition(vec3.zero())
    }
    this.textKey = "" // layout changed: place the text again
  }

  // Writes the numbers the shader reads (Script Names of CallHome_Shader). Only values that changed.
  private writeMaterial(w: number, h: number, quadW: number, quadH: number, rim: number, hover: number, glowFactor: number): void {
    if (!this.rmv) return
    this.setNum("quadWidth", quadW)
    this.setNum("quadHeight", quadH)
    this.setNum("bodyWidth", w)
    this.setNum("bodyHeight", h)
    this.setNum("cornerRadius", Math.max(0, this.cornerRadiusCm))
    this.setNum("rimWidth", rim)
    this.setNum("edgeSoftness", Math.max(0, this.edgeSoftnessCm))
    this.setNum("haloReach", Math.max(0, this.haloReachCm))
    this.setNum("haloStrength", Math.max(0, this.haloStrength))
    this.setNum("hoverGlow", Math.max(0, this.hoverGlow) * glowFactor)
    this.setNum("rimRest", Math.max(0, this.rimRestGlow))
    this.setNum("opacity", clamp01(this.opacity))
    this.setNum("hover", hover)
    this.setColour("bgColor", this.backgroundColor)
    this.setColour("rimColor", this.rimColor)
  }

  private setNum(name: string, v: number): void {
    const last = this.lastWritten[name]
    if (last !== undefined && Math.abs(last - v) < 0.0005) return
    try {
      this.rmv!.mainPassOverrides[name] = v
      this.lastWritten[name] = v
    } catch (err) {
      this.warnOnce(name, "could not write '" + name + "' to the button material (" + err + "). Is the Quad's material CallHome_Mat?")
    }
  }

  private setColour(name: string, c: vec4): void {
    const k = c.r + c.g * 7 + c.b * 13
    const last = this.lastWritten[name]
    if (last !== undefined && Math.abs(last - k) < 0.0005) return
    try {
      this.rmv!.mainPassOverrides[name] = new vec3(c.r, c.g, c.b)
      this.lastWritten[name] = k
    } catch (err) {
      this.warnOnce(name, "could not write '" + name + "' to the button material (" + err + ")")
    }
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned[key]) return
    this.warned[key] = true
    console.warn("[CallHomeButtonLook] " + msg)
  }

  // ------------------------------------------------------------------ text
  private updateText(amount: number): void {
    const lab = this.labelText
    const suf = this.suffixText

    // text, font, size, alignment: only when changed
    const key = [this.label, this.suffix, this.textSizeCm, this.textGapCm, this.textLiftCm, this.font ? this.font.name : "", this.widthCm, this.heightCm].join("|")
    if (key !== this.textKey) {
      this.textKey = key
      this.measureTries = 0
      const size = Math.max(2, Math.min(800, this.textSizeCm * TEXT_SIZE_PER_CM))
      for (const t of [lab, suf]) {
        if (!t) continue
        if (this.font) t.font = this.font
        t.size = size
        t.horizontalAlignment = HorizontalAlignment.Center
        t.verticalAlignment = VerticalAlignment.Center
        // a wide layout box centred on the object (cm from the object's position), so nothing wraps or clips
        const hw = Math.max(this.widthCm, 4) * 2
        const hh = Math.max(this.heightCm, 1)
        t.layoutRect = Rect.create(-hw, hw, -hh, hh)
        t.horizontalOverflow = HorizontalOverflow.Overflow
        t.verticalOverflow = VerticalOverflow.Overflow
      }
      if (lab) lab.text = this.label
      if (suf) {
        suf.text = this.suffix
        suf.sceneObject.enabled = this.suffix.length > 0
      }
    }
    // Place the two words side by side, centred as one line. Needs the real text widths, which may take a few frames
    // to be ready after a font or text change, so measure for the first 30 frames after each change.
    if (this.measureTries < 30) {
      this.measureTries++
      this.placeText()
    }

    // colours
    const hoverMix = clamp01(amount)
    const pressBright = 1 + (Math.max(0, this.pressTextBrightPercent) / 100) * Math.max(0, this.spring.x)
    const bright = (1 + (this.textHoverBrightnessPercent / 100 - 1) * hoverMix) * pressBright
    const rest = this.textColor
    const hov = this.textHoverColor
    const baseR = (rest.r + (hov.r - rest.r) * hoverMix) * bright
    const baseG = (rest.g + (hov.g - rest.g) * hoverMix) * bright
    const baseB = (rest.b + (hov.b - rest.b) * hoverMix) * bright
    const baseA = rest.a + (hov.a - rest.a) * hoverMix
    if (lab) lab.textFill.color = new vec4(baseR, baseG, baseB, baseA)

    // the suffix pulses: full pulse at full hover, plus the idle share
    if (suf) {
      const idle = Math.max(0, this.pulseIdlePercent) / 100
      const strength = Math.min(1, Math.max(hoverMix, idle))
      const breath = breath01(this.pulsePeriodSeconds, 0) * strength
      const pb = 1 + (Math.max(0, this.pulseBrightPercent) / 100) * breath
      suf.textFill.color = new vec4(baseR * pb, baseG * pb, baseB * pb, baseA)
      const s = (1 + (this.pulseScalePercent / 100) * breath) * (1 - Math.max(0, this.pressShrink) * this.spring.x)
      suf.sceneObject.getTransform().setLocalScale(new vec3(s, s, s))
    }
  }

  private placeText(): void {
    const lab = this.labelText
    const suf = this.suffixText
    const lift = Math.max(0, this.textLiftCm)
    // text lies in the button's XZ plane: rotate -90 degrees about X so the letters face up, top of the letters toward -Z
    const flat = quat.angleAxis(degToRad(-90), vec3.right())
    let wL = 0
    let wS = 0
    try {
      if (lab && this.label.length > 0) wL = lab.getBoundingBox().getSize().x
      if (suf && this.suffix.length > 0) wS = suf.getBoundingBox().getSize().x
    } catch (err) {
      this.warnOnce("bbox", "could not measure the text (" + err + "); the words are centred separately")
    }
    const hasSuffix = !!suf && this.suffix.length > 0
    const total = wL + (hasSuffix ? Math.max(0, this.textGapCm) + wS : 0)
    if (lab) {
      const t = lab.sceneObject.getTransform()
      t.setLocalRotation(flat)
      this.labelX = hasSuffix && wL > 0 ? -total / 2 + wL / 2 : 0
      t.setLocalPosition(new vec3(this.labelX, lift, 0))
    }
    if (suf) {
      const t = suf.sceneObject.getTransform()
      t.setLocalRotation(flat)
      this.suffixX = wL > 0 && wS > 0 ? total / 2 - wS / 2 : 0
      t.setLocalPosition(new vec3(this.suffixX, lift, 0))
    }
  }
}
