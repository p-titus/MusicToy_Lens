// ToyPad - the flat LOLLIPOP pad on the table for ONE toy: a small circle under the toy (like a shadow) and a
// rounded, narrow strip in front of it (toward you), like a piano key or a mixing-board fader.
//   TAP the strip (fingertip poke, mouse click, phone tap, or a pinch aimed at it): the volume steps
//     off -> low -> medium -> high -> off.
//   SLIDE a finger along the strip: the volume follows the finger. The end nearest the toy is the loudest, the end
//     nearest you is off (like pushing a fader away from you). Slide moves the volume continuously through the four
//     state volumes (ToyVolume.setLevel); with Pad Slide Snap it settles on the nearest state when the finger lifts.
//
// What it does
//   - Follows its toy: it slides along the stage floor to stay a short distance in front of the toy, along the
//     stage's fixed front direction (Pad position group). It stays flat, on the table. The toy and its pad count
//     as ONE unit for edge padding, clamping and overlap nudging (ToyConfig.unitDiscs).
//   - Is a SIK Interactable with a generous touch box over the strip (StageConfig > Pads).
//   - Tap or slide? A touch that stays within Pad Slide Threshold of where it started and then ends is a TAP (it
//     counts when the finger lifts). A touch that travels further along the strip becomes a SLIDE and never taps.
//   - Shows the volume: blends to this pad's own colour for the state (Pad colours group, written to a material
//     parameter you name on a copy of your material), and writes 0..3 to the property named in
//     StageConfig > Pad State Param (a smooth value while sliding). The circle under the toy uses a darker copy
//     of the same colour (Pad Base Shade).
//   - Presses down a tiny bit when tapped (StageConfig > Pad Press Depth / Seconds).
//
// One finger, one change
//   Taps go through ToyVolume.requestCycle(), which ignores any further change on that toy for
//   StageConfig > Volume Cooldown seconds, and further changes from the SAME HAND for Same Hand Cooldown seconds
//   (a finger often brushes the toy on its way to or from the pad). A slide counts as a change too, so the finger
//   leaving the strip cannot tap the toy straight afterwards.
// Overlapping touch boxes: whichever pad receives the touch hands it to the pad whose strip is nearest to
//   the touch point, so one touch never changes two toys.
//
// DIAL BUTTON (StageConfig > Dial button; used when Arc Visual and Arc Hit are filled, otherwise everything above
// still applies): the strip is replaced by a small flat disc on the socket ring's outer rim, on the side facing the
// viewer, resting on the rim (touching, never inside the ring) like the head of a snowman lying down. It swings around the ring to face the viewer.
// Three concentric parts light for low (centre), medium (+ middle ring), high (+ outer ring); off lights none, in the
// toy's own Off edge colour. TAP it (counted on release) = next state. DRAG it = move the socket (the ring, the button
// and the toy follow; Home Position is the reset). Slide-to-set-volume is not available on it. While touched, the
// button sinks a hair into the table on a spring and bounces back when the finger lifts.
//
// Events (subscribe from your own scripts): onPadTap (taps only).

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent"
import { Interactor, InteractorInputType, InteractorTriggerType, TargetingMode } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import { StageConfig } from "./StageConfig"
import { StageBounds } from "./StageBounds"
import { ToyVolume, VolumeSource } from "./ToyVolume"
import { ToyInteraction } from "./ToyInteraction"
import { ToyConfig } from "./ToyConfig"
import { StateColourDriver, deriveStateColours, HomeLookDriver } from "./StateColours"
import { RippleDriver } from "./SocketRipple"
import { WaveField } from "./WaveField"
import * as G from "./StageGeometry"
import { padMesh, shapeArea } from "./PadShape"
import { ArcLookDriver, PressSpring, degToRad, wrapRad } from "./PadArc"
import { NearTracker, breath01, phaseFor } from "./Alive"

export type PadTap = { pad: ToyPad; toy: ToyVolume; source: VolumeSource; newState: number }

@component
export class ToyPad extends BaseScriptComponent {
  @input
  @hint("The toy this pad controls (a Toy_xx object with ToyVolume).")
  toy: SceneObject

  @input
  @allowUndefined
  @hint("The STRIP's artwork (old look, hidden when the arc is in use): a child object with a RenderMeshVisual. The script gives it the strip shape from StageConfig > Pads (or the mesh in Pad Strip Mesh), lifted by Pad Lift, sinking a little when pressed. Swap its material freely.")
  padVisual: SceneObject

  @input
  @allowUndefined
  @hint("The small circle under the toy, like a shadow: a child object with a RenderMeshVisual. The script gives it the circle shape from StageConfig > Pads (or the mesh in Pad Base Mesh). It follows the toy. Empty = no circle.")
  baseVisual: SceneObject

  @input
  @allowUndefined
  @hint("A child object holding a ColliderComponent for the circle under the toy (used only if StageConfig > Pad Base Touchable is on). Keep its scale at 1: the script sizes the collider. Empty = the circle cannot be touched.")
  baseHit: SceneObject

  @input
  @allowUndefined
  @hint("The ARC's artwork: a child object with a RenderMeshVisual that uses your Arc_Mat and the flat quad mesh (Pad_Plane.mesh). The script sizes it (StageConfig > Arc dial tab > Arc Quad Size, cm), lays it on the ring and turns it to face you every frame. Empty = no arc (the old strip is used).")
  arcVisual: SceneObject

  @input
  @allowUndefined
  @hint("The ARC's touch box: a child object with a ColliderComponent (any box; keep its scale at 1). The script sizes it to the arc, places it on the arc and turns it with the arc. Empty = no arc (the old strip is used).")
  arcHit: SceneObject

  // ---- where the pad sits ----
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Pad position</span>')
  @ui.group_start("Pad position (this pad)")
  @input
  @hint("ON: this pad uses the default offset from its toy (StageConfig > Pads > Pad Front Offset, straight toward the front of the stage). OFF: it uses the Offset below.")
  useDefaultOffset: boolean = true

  @input
  @hint("This pad's own offset from its toy (cm), in the stage's own directions: x = right, y = toward you (front of the stage; the stage's fixed front, it does not turn with the toy). Used only when 'Use Default Offset' is OFF.")
  offset: vec2 = new vec2(0, 5)

  @input
  @hint("Tick to put THIS pad back at the default offset from its toy. It un-ticks itself in the Lens. Changes nothing else (not its colours, not its toy).")
  resetPadPosition: boolean = false

  @input
  @hint("Tick to put THIS socket (ring, arc and toy) back at its Home Position, undoing any dragging. It un-ticks itself in the Lens. Changes nothing else.")
  resetSocket: boolean = false

  @input
  @hint("Where THIS toy's dial button sits around its ring, as an angle in degrees ON TOP OF facing you. 0 = on the side facing you (as before). Positive turns it toward the stage's right, negative toward its left; 180 = the far side. The user can turn it by hand (hold the button, then drag around the ring); that stays until Reset Sockets or Call Home. Changing this number while the Lens runs sets the button to it again.")
  buttonAngle: number = 0
  @ui.group_end

  // ---- colours ----
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Pad colours</span>')
  @ui.group_start("Pad colours (this pad, per state)")
  @input
  @hint("Base colour (RGBA) the default colour set is made from. Changing it does nothing by itself: tick 'Reset Pad Colours' (below, or in StageConfig for all pads) to rebuild the four colours from it.")
  @widget(new ColorWidget())
  baseColor: vec4 = new vec4(0.62, 0.82, 1, 1)

  @input
  @hint("Pad colour when its toy is OFF (RGBA). Default: dim and desaturated. Independent of the toy's own colours.")
  @widget(new ColorWidget())
  colourOff: vec4 = new vec4(0.256, 0.277, 0.296, 1)

  @input
  @hint("Pad colour in the LOW state (RGBA).")
  @widget(new ColorWidget())
  colourLow: vec4 = new vec4(0.434, 0.525, 0.607, 1)

  @input
  @hint("Pad colour in the MEDIUM state (RGBA).")
  @widget(new ColorWidget())
  colourMedium: vec4 = new vec4(0.558, 0.738, 0.9, 1)

  @input
  @hint("Pad colour in the HIGH state (RGBA). Default: the brightest.")
  @widget(new ColorWidget())
  colourHigh: vec4 = new vec4(0.715, 0.865, 1, 1)

  @input
  @hint("Seconds the colour takes to blend when the state changes (seconds). 0 = instant.")
  colourSeconds: number = 0.15

  @input
  @hint("Name of the material parameter that receives the colour (a colour/vec4 parameter, for example baseColor). Change it to match your own material. The pad's material is copied first, so your asset is never edited. A warning is printed once if the name is not found.")
  colourParam: string = "baseColor"

  @input
  @hint("Tick to put THIS pad's four colours back to the default set made from Base Color. It un-ticks itself in the Lens. Changes nothing else.")
  resetPadColours: boolean = false
  @ui.group_end

  // ---- home marker (StageConfig > Home) ----
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Home marker</span>')
  @ui.group_start("Home marker (this pad)")
  @input
  @hint("Drawn size of THIS pad's home quad (cm, square). 0 = use StageConfig > Home > Home Quad Size. Picture only: it never changes stage spacing.")
  homeSizeOverride: number = 0
  @ui.group_end

  // ---- ripple (StageConfig > Ripples) ----
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Ripple</span>')
  @ui.group_start("Ripple (this pad)")
  @input
  @allowUndefined
  @hint("The Ripple object under this pad: a child with a RenderMeshVisual using your Ripple_Mat, kept DISABLED in the scene (the script enables it only while a wave plays). The script sizes it (StageConfig > Ripples > Ripple Size, cm) and places it flat at the socket. Empty = no waves from this socket.")
  rippleVisual: SceneObject
  @ui.group_end

  // Fires when a touch changed this toy's volume (not when it was ignored by the cooldown).
  public onPadTap: Event<PadTap> = new Event()
  // Fires when this pad's toy has landed on its socket (together with the ring flash and the landing wave).
  public onSocketLanded: Event<{ pad: ToyPad; toy: ToyVolume }> = new Event()

  private static all: ToyPad[] = []

  private cfg: StageConfig
  private bounds: StageBounds
  private vol: ToyVolume
  private toyInter: ToyInteraction | null = null
  private interactable: Interactable
  private collider: ColliderComponent | null = null
  private visual: RenderMeshVisual | null = null
  private baseRMV: RenderMeshVisual | null = null
  private baseCollider: ColliderComponent | null = null
  private colliderKey: string = ""
  private modeKey: number = -1
  private shownState: number = -1
  private pressStart: number = -10
  private local: vec3 = vec3.zero() // where the pad currently is, stage-local
  private placed: boolean = false
  private toyCfg: ToyConfig | null = null
  private colours: StateColourDriver
  private baseColours: StateColourDriver
  private home: HomeLookDriver
  private ripple: RippleDriver
  private lastHitSeq: number = -1
  private homeColour: vec4 | null = null
  private homeColourKey: string = ""
  private homeColourTry: number = -10
  private warnedHomeMesh: boolean = false
  private paramShown: string = ""
  private touch: { interactor: Interactor; source: VolumeSource; hand: number; t0: number; z0: number; trigger: number; last: number; sliding: boolean; ptr0: vec3 | null; sock0: vec3 | null; ray: boolean; start: number; armed: boolean; orbit: boolean; grab: number } | null = null
  // arc dial tab
  private arcRMV: RenderMeshVisual | null = null
  private arcCollider: ColliderComponent | null = null
  private arcLook: ArcLookDriver
  private dialNear: NearTracker = new NearTracker() // is a hand close to the dial button (Alive.ts)
  private hoverCount: number = 0 // how many interactors hover this pad (ring, button)
  private spring: PressSpring = new PressSpring()
  private pressUntil: number = -10
  private yaw: number = 0 // radians, stage-local: the direction from the ring toward the viewer (0 = toward the stage front, +Z)
  private yawInit: boolean = false
  private angleOffset: number = 0 // radians: the button's turn around the ring on top of facing the viewer (Inspector value, or what the user turned it to)
  private angleSeen: number = NaN // the last Button Angle (degrees) read from the Inspector
  private arcHitKey: string = ""
  private edgeColours: (vec4 | null)[] = [null, null, null, null] // the toy material's edge colour for off / low / med / high
  private bodyOffColour: vec4 | null = null // the toy material's bodyColorOff (the button outline)
  private edgeTry: number = -10
  private warnedEdge: Set<string> = new Set<string>()
  private warnedArc: boolean = false
  private warnedCamera: boolean = false
  private forwardTo: ToyPad | null = null // the pad that took over the touch that started on this one's collider
  private meshKey: string = ""
  private baseMeshKey: string = ""
  private lastTouchLog: number = -10
  private warnedBase: boolean = false

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
      c.onReset("padPositions", () => this.resetPosition())
      c.onReset("padColours", () => this.resetColours())
      c.onReset("sockets", () => this.resetSocketNow())
      c.onReset("callHome", () => this.resetButtonAngle())
    })
    this.colours = new StateColourDriver(
      this.sceneObject.name + " (pad)",
      () => (this.arcOn() ? null : this.visual), // (the hidden strip is left alone, so its material is never copied)
      () => ({ colours: [this.colourOff, this.colourLow, this.colourMedium, this.colourHigh], seconds: this.colourSeconds, param: this.colourParam })
    )
    this.arcLook = new ArcLookDriver(
      this.sceneObject.name + " (arc)",
      () => this.arcRMV,
      () => {
        const c = this.cfg
        return {
          names: { colourPrefix: c.arcColorParam, outlineColour: c.buttonOutlineColorParam, outlineWidth: c.buttonOutlineWidthParam, outlineSoftness: c.buttonOutlineSoftParam, discRadius: c.buttonDiscRadiusParam, coreEnd: c.buttonCoreEndParam, midEnd: c.buttonMidEndParam, segPrefix: c.arcSegmentParamPrefix, press: c.arcPressParam },
          outlineWidthCm: c.buttonOutlineWidth, outlineSoftCm: c.buttonOutlineSoftness,
          quadCm: this.buttonQuad(), discDiameterCm: c.buttonDiameter,
          coreEnd: Math.max(0, Math.min(1, c.buttonCoreEnd)), midEnd: Math.max(0, Math.min(1, c.buttonMidEnd)),
          unlit: c.arcUnlit, blendSeconds: c.arcBlendSeconds
        }
      }
    )
    this.baseColours = new StateColourDriver(
      this.sceneObject.name + " (pad base)",
      () => this.baseRMV,
      () => ({
        colours: [this.colourOff, this.colourLow, this.colourMedium, this.colourHigh],
        seconds: this.colourSeconds,
        param: this.colourParam,
        shade: this.cfg ? this.cfg.padBaseShade : 1
      })
    )
    this.home = new HomeLookDriver(
      this.sceneObject.name + " (home)",
      () => this.baseRMV,
      () => {
        const c = this.cfg
        return {
          names: { colour: c.homeColorParam, brightness: c.homeBrightnessParam, radius: c.homeRingRadiusParam, softness: c.homeRingSoftnessParam, beat: c.homeBeatParam, padState: c.homePadStateParam },
          rest: c.homeRestBrightness, onOpacity: c.homeOnOpacity, low: c.homeBrightnessLow, med: c.homeBrightnessMed, high: c.homeBrightnessHigh,
          brightnessSeconds: c.homeBrightnessSeconds, ringRadius: c.homeRingRadius, ringSoftness: c.homeRingSoftness,
          tightenBySquash: c.homeTightenBySquash, widenPerCm: c.homeWidenPerCm, brightenBySquash: c.homeBrightenBySquash,
          beatStrength: c.homeBeatStrength, beatFallSeconds: c.homeBeatFallSeconds,
          awayDim: c.awayDim, awayPulseSeconds: c.awayPulseSeconds, awayPulseAmount: c.awayPulseAmount, flashSeconds: c.landingFlashSeconds
        }
      }
    )
    this.ripple = new RippleDriver(
      this.sceneObject.name + " (ripple)",
      () => this.rippleVisual,
      () => {
        const c = this.cfg
        const homeQuad = this.homeSizeOverride > 0 ? this.homeSizeOverride : c.homeQuadSize
        return {
          enabled: c.rippleEnabled && c.homeEnabled, seconds: c.rippleSeconds, quadCm: c.rippleSize,
          startWidthCm: c.rippleStartWidth, endWidthCm: c.rippleEndWidth, startBrightness: c.rippleStartBrightness,
          endBrightness: c.rippleEndBrightness, lighten: c.rippleLighten, fadeDistanceCm: c.rippleFadeDistance,
          softness: c.rippleSoftness, maxWaves: c.rippleMaxWaves,
          minGapSeconds: c.rippleMinGap, mergeGain: c.rippleMergeGain, fadeSeconds: c.rippleFadeSeconds,
          startRadius: (homeQuad * c.homeRingRadius) / Math.max(0.1, c.rippleSize), // the wave starts where the ring is
          names: { progress: c.rippleProgressParam, strength: c.rippleStrengthParam, colour: c.rippleColourParam }
        }
      }
    )
    // Preview only: keys 1 to 7 fire a fake beat for the toy whose name holds that number (Toy_01 ...)
    this.createEvent("KeyPressEvent").bind((e) => {
      if (!this.cfg || !this.cfg.homeMockBeats || !this.toy || !this.toyCfg || !global.deviceInfoSystem.isEditor()) return
      const m = /(\d+)/.exec(this.toy.name)
      const keys = [Keys.One, Keys.Two, Keys.Three, Keys.Four, Keys.Five, Keys.Six, Keys.Seven]
      if (m && keys[parseInt(m[1], 10) - 1] === e.key) this.toyCfg.fireHit(1)
    })
    ToyPad.all.push(this)
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
    this.createEvent("OnDestroyEvent").bind(() => {
      const i = ToyPad.all.indexOf(this)
      if (i >= 0) ToyPad.all.splice(i, 1)
    })
  }

  private onStart(): void {
    const stageObj = this.cfg.getSceneObject()
    this.bounds = stageObj.getComponent(StageBounds.getTypeName()) as StageBounds
    this.vol = this.toy ? (this.toy.getComponent(ToyVolume.getTypeName()) as ToyVolume) : null
    this.toyInter = this.toy ? (this.toy.getComponent(ToyInteraction.getTypeName()) as ToyInteraction) : null
    if (!this.bounds || !this.vol) {
      console.error("[ToyPad] " + this.sceneObject.name + " needs a Toy (with ToyVolume) and a StageBounds on the stage object")
      return
    }
    if (this.padVisual) {
      this.visual = this.padVisual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      // (the colour driver makes a private copy of YOUR material before it changes anything)
    }
    if (this.baseVisual) this.baseRMV = this.baseVisual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    if (this.arcVisual) {
      this.arcRMV = this.arcVisual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (!this.arcRMV) console.warn("[ToyPad] " + this.sceneObject.name + ": Arc Visual has no RenderMeshVisual, so the arc cannot be drawn")
    }
    if (this.arcHit) {
      this.arcCollider = this.arcHit.getComponent("Component.ColliderComponent") as ColliderComponent
      if (!this.arcCollider) console.warn("[ToyPad] " + this.sceneObject.name + ": Arc Hit has no ColliderComponent, so the arc cannot be touched")
    }
    if (!!this.arcVisual !== !!this.arcHit && !this.warnedArc) {
      this.warnedArc = true
      console.warn("[ToyPad] " + this.sceneObject.name + ": the arc needs BOTH Arc Visual and Arc Hit. Only one is set, so this pad keeps the old strip.")
    }
    if (this.baseHit) {
      this.baseCollider = this.baseHit.getComponent("Component.ColliderComponent") as ColliderComponent
      if (!this.baseCollider) console.warn("[ToyPad] " + this.sceneObject.name + ": Base Hit has no ColliderComponent, so the base circle cannot be touched")
    }
    this.collider = this.sceneObject.getComponent("Component.ColliderComponent") as ColliderComponent
    if (!this.collider) this.collider = this.sceneObject.createComponent("Component.ColliderComponent") as ColliderComponent
    this.interactable = this.sceneObject.getComponent(Interactable.getTypeName()) as Interactable
    if (!this.interactable) this.interactable = this.sceneObject.createComponent(Interactable.getTypeName()) as Interactable

    this.toyCfg = this.toy.getComponent(ToyConfig.getTypeName()) as ToyConfig
    if (this.toyCfg) {
      this.toyCfg.padDiscProvider = () => this.discs() // the toy and this pad are ONE unit for the stage
      this.toyCfg.padEquivalentProvider = () => this.equivalentDiameter()
      this.toyCfg.baseDiameterProvider = () => (this.baseVisual ? Math.max(this.cfg.padBaseWidth, this.cfg.padBaseLength) : 0)
    }

    this.interactable.onTriggerStart.add((e) => this.onTouch(e))
    this.interactable.onTriggerEnd.add(() => this.touchEnded())
    this.interactable.onTriggerEndOutside.add(() => this.touchEnded())
    this.interactable.onTriggerCanceled.add(() => this.touchEnded())
    // hover is only counted, for the "alive" button glow (Alive.ts)
    this.interactable.onHoverEnter.add(() => {
      this.hoverCount++
    })
    this.interactable.onHoverExit.add(() => {
      this.hoverCount = Math.max(0, this.hoverCount - 1)
    })
    this.vol.onStateChange.add(() => this.showState())
    if (this.toyInter) this.toyInter.onSettle.add(() => this.onLanded())
    this.applySettings()
    this.showState()
  }

  // ---- touch ---------------------------------------------------------------------
  private onTouch(e: InteractorEvent): void {
    if (!this.cfg || !this.vol) return
    const it = e.interactor
    const trig = it.currentTrigger
    let source: VolumeSource
    if (it.inputType === InteractorInputType.Mouse || (trig & InteractorTriggerType.Pinch) !== 0) {
      if (!this.cfg.padAcceptsClick) return
      source = "padClick"
    } else if ((trig & InteractorTriggerType.Poke) !== 0) {
      if (!this.cfg.padAcceptsPoke) return
      source = "padPoke"
    } else {
      return
    }
    // hand the touch to the pad whose strip is nearest to the touch point (touch boxes may overlap)
    const point = it.targetHitPosition ?? it.endPoint
    const winner = point ? this.nearestPad(point) : this
    if (winner.arcOn() && point) {
      // the touch box is a plain box around the arc: only a touch on (or just beside) the curved band counts
      const miss = winner.arcDistance(this.bounds.worldToLocal(point))
      if (miss > this.cfg.arcHitMargin) {
        this.cfg.log(this.sceneObject.name + " touch missed the arc by " + miss.toFixed(2) + " cm")
        return
      }
    }
    this.cfg.log(this.sceneObject.name + " touched (" + source + ") -> " + winner.sceneObject.name)
    this.forwardTo = winner
    winner.beginTouch(it, source, it.inputType === InteractorInputType.Mouse ? -1 : it.inputType) // the mouse never 'brushes', so it is not hand-locked
  }

  private touchEnded(): void {
    const w = this.forwardTo ?? this
    this.forwardTo = null
    w.finishTouch()
  }

  // A touch starts on this pad. It is decided later whether it was a tap or a slide.
  private beginTouch(it: Interactor, source: VolumeSource, hand: number): void {
    if (!this.vol || (this.toyInter && this.toyInter.isHeld())) return // a carried toy keeps its volume
    const arc = this.arcOn()
    const hit = arc ? null : this.hitAlongStrip(it)
    const z0 = !arc && it.startPoint ? this.bounds.worldToLocal(it.startPoint).z : 0
    const t0 = hit === null ? 0.5 : hit
    this.pressUntil = getTime() + this.cfg.padPressSeconds // even a very quick tap shows a press
    this.touch = {
      interactor: it, source: source, hand: hand, t0: t0, z0: z0, trigger: it.currentTrigger, last: t0, sliding: false,
      ptr0: arc ? this.pointerLocal(it) : null, sock0: arc && this.toyInter ? this.toyInter.socketLocal() : null, ray: this.isRay(it),
      start: getTime(), armed: false, orbit: false, grab: 0
    }
  }

  // The touch ended: a tap steps the volume, a slide just finishes.
  private finishTouch(): void {
    const t = this.touch
    this.touch = null
    if (!t || !this.vol) return
    if (t.sliding) this.vol.endSlide(this.arcOn() ? false : this.cfg.padSlideSnap) // a drag or slide counts as a change: no tap right after it
    else this.activate(t.source, t.hand)
  }

  // Each frame of a touch: has it turned into a slide? If so, follow the finger.
  private updateTouch(): void {
    const t = this.touch
    if (!t || !this.vol) return
    if (t.interactor.currentTrigger === InteractorTriggerType.None) {
      this.finishTouch() // the finger let go but no end event arrived
      return
    }
    if (this.arcOn()) {
      this.updateArcDrag(t)
      return
    }
    if (!this.cfg.padSlideEnabled) return
    if (t.trigger !== t.interactor.currentTrigger && t.interactor.startPoint) {
      // a poke turned into a pinch (or the other way round): the hand reports a different point now, so measure
      // from here, keeping the volume where it is
      t.trigger = t.interactor.currentTrigger
      t.z0 = this.bounds.worldToLocal(t.interactor.startPoint).z
      t.t0 = t.last
    }
    const now = this.fingerPosition(t)
    if (this.cfg.verbose && getTime() - this.lastTouchLog > 0.25) {
      this.lastTouchLog = getTime()
      this.cfg.log(this.sceneObject.name + " touch along strip " + (now === null ? "null" : now.toFixed(2)) + " (started at " + t.t0.toFixed(2) + ", trigger " + t.interactor.currentTrigger + ")")
    }
    if (now === null) return
    t.last = now
    if (!t.sliding && Math.abs(now - t.t0) * this.stripSpan() >= this.cfg.padSlideThreshold) {
      t.sliding = true
      this.cfg.log(this.sceneObject.name + " slide started")
    }
    if (t.sliding) this.vol.setLevel(now, t.hand)
  }

  // How far the volume marker can travel along the strip (cm).
  private stripSpan(): number {
    return Math.max(0, this.cfg.padStripLength - this.cfg.padStripWidth * 0.5)
  }

  // Where the finger is on the strip: 0 at the end nearest you (off) to 1 at the end nearest the toy (loudest).
  // The mouse is read where its ray meets the strip. A HAND is read by how far it has moved along the strip since
  // the touch began (the hand's own position, which keeps moving even if the first contact point is fixed), times
  // Pad Slide Hand Scale. null if nothing is known.
  private fingerPosition(t: { interactor: Interactor; t0: number; z0: number }): number | null {
    const span = this.stripSpan()
    if (span < 0.01) return null
    if (t.interactor.inputType === InteractorInputType.Mouse) return this.hitAlongStrip(t.interactor)
    const sp = t.interactor.startPoint
    if (!sp) return null
    const dz = this.bounds.worldToLocal(sp).z - t.z0 // +z is toward you: moving toward the toy is negative
    return Math.max(0, Math.min(1, t.t0 - (dz * this.cfg.padSlideHandScale) / span))
  }

  // Where the interactor's hit point lies along the strip (null if unknown).
  private hitAlongStrip(it: Interactor): number | null {
    const span = this.stripSpan()
    if (span < 0.01) return null
    const point = it.targetHitPosition ?? it.endPoint ?? it.startPoint
    if (!point) return null
    const local = this.bounds.worldToLocal(point)
    return Math.max(0, Math.min(1, 0.5 - (local.z - this.local.z) / span))
  }

  private nearestPad(worldPoint: vec3): ToyPad {
    const p = this.bounds.worldToLocal(worldPoint)
    let best: ToyPad = this
    let bestD = Infinity
    for (const pad of ToyPad.all) {
      if (!pad.placed || !pad.vol) continue
      const d = pad.surfaceDistance(p)
      if (d < bestD) {
        bestD = d
        best = pad
      }
    }
    return best
  }

  // How far (cm) a stage-local point is from this pad's strip: negative inside it. The pad whose strip is nearest
  // to a touch wins, so a touch on one pad never goes to a neighbour's strip.
  private surfaceDistance(p: vec3): number {
    if (this.arcOn()) return this.arcDistance(p)
    const span = this.stripSpan()
    const along = Math.max(-span * 0.5, Math.min(span * 0.5, p.z - this.local.z))
    const strip = Math.hypot(p.x - this.local.x, p.z - this.local.z - along) - this.cfg.padStripWidth * 0.5
    if (!this.baseVisual || !this.cfg.padBaseTouchable) return strip
    const off = this.currentOffset()
    const bc = this.baseOffset()
    const ex = Math.abs(p.x - (this.local.x - off.x + bc.x)) - this.cfg.padBaseWidth * 0.5
    const ez = Math.abs(p.z - (this.local.z - off.y + bc.y)) - this.cfg.padBaseLength * 0.5
    const base = Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) + Math.min(Math.max(ex, ez), 0) // distance to a box
    return Math.min(strip, base)
  }

  // ---- arc dial tab ---------------------------------------------------------------
  // The arc is in use when it is switched on and both of its slots are filled.
  arcOn(): boolean {
    return !!this.cfg && this.cfg.arcEnabled && !!this.arcVisual && !!this.arcHit
  }

  // Centre of the ring, stage-local cm (x right, z toward you).
  private arcCentre(): vec3 {
    const bo = this.baseOffset()
    return new vec3(this.local.x + bo.x, 0, this.local.z + bo.y)
  }

  // ---- dial button geometry (all cm) ----
  // The ring's resting outer radius: the Inspector number, or worked out from the Home quad and ring radius.
  private rimRadius(): number {
    const c = this.cfg
    if (c.buttonRimRadius > 0) return c.buttonRimRadius
    const q = this.homeSizeOverride > 0 ? this.homeSizeOverride : c.homeQuadSize
    return q * c.homeRingRadius * 0.5
  }

  private buttonRadius(): number {
    return Math.max(0.05, this.cfg.buttonDiameter * 0.5)
  }

  // Distance from the ring centre to the button centre: the button rests on the ring's edge (plus Button Gap, never negative),
  // so its circle never goes inside the ring.
  private buttonDistance(): number {
    return this.rimRadius() + this.buttonRadius() + Math.max(0, this.cfg.buttonGap)
  }

  // The button's drawn quad (cm, square): the disc plus a margin for glow.
  private buttonQuad(): number {
    // (the quad always has room for the outline and its feather outside the disc)
    const c = this.cfg
    return c.buttonDiameter + 2 * Math.max(0, c.buttonGlowMargin, c.buttonOutlineWidth + c.buttonOutlineSoftness)
  }

  // Button centre, stage-local cm, on the line from the ring toward the viewer.
  private buttonCentre(): vec3 {
    const ctr = this.arcCentre()
    const d = this.buttonDistance()
    return new vec3(ctr.x + Math.sin(this.buttonYaw()) * d, 0, ctr.z + Math.cos(this.buttonYaw()) * d)
  }

  // One fixed disc (cm) that covers the ring and the button wherever it swings around the ring.
  private arcDiscDiameter(): number {
    return 2 * (this.buttonDistance() + this.buttonRadius())
  }

  // How far (cm) a stage-local point is from the button's edge: negative inside it.
  private arcDistance(p: vec3): number {
    const b = this.buttonCentre()
    return Math.hypot(p.x - b.x, p.z - b.z) - this.buttonRadius()
  }

  // The four button colours [off, low, med, high]: the toy's own edge colours, read from the toy's material about once a
  // second. Any that cannot be read fall back to the pad's own colour for that state. On the button: Off = unlit parts,
  // Low = centre circle, Med = middle ring, High = outer ring (the shader picks which, see PadArc).
  // The button colours with the "alive" look on top (StageConfig > Alive and hover): every colour gets brighter when a hand
  // is close, and the Off colour breathes very gently while the toy is off. It only scales the colours already sent to
  // the existing Arc_Mat colour parameters: no new material parameter.
  private buttonColours(): vec4[] {
    const cols = this.buttonColoursBase()
    const c = this.cfg
    if (!c.aliveEnabled || !c.aliveDialEnabled) return cols
    const off = this.vol.getState() === 0
    const rest = off ? (c.aliveDialIdlePercent / 100) * breath01(c.aliveBreathSeconds, phaseFor(this.sceneObject.name, c.aliveStagger)) : 0
    const near = (c.aliveDialNearPercent / 100) * this.dialNear.amount
    return cols.map((col, i) => {
      const k = 1 + near + (i === 0 ? rest : 0)
      return new vec4(col.x * k, col.y * k, col.z * k, col.w)
    })
  }

  private buttonColoursBase(): vec4[] {
    const c = this.cfg
    const own =[this.colourOff, this.colourLow, this.colourMedium, this.colourHigh]
    if (!c.buttonUseToyEdgeColour) return own
    this.refreshToyColours()
    const base = [0, 1, 2, 3].map((i) => this.edgeColours[i] || own[i])
    // Off is the toy's own edge colour scaled by Off Brightness (percent); alpha is kept at the colour's own value.
    // Low, Med and High work the same way but go 0 to 200 percent (RGB only, alpha kept).
    const scale = (col: vec4, percent: number, max: number): vec4 => {
      const k = Math.max(0, Math.min(max, percent)) / 100
      return new vec4(col.x * k, col.y * k, col.z * k, col.w)
    }
    base[0] = scale(base[0], c.buttonOffBrightness, 100)
    base[1] = scale(base[1], c.buttonLowBrightness, 200)
    base[2] = scale(base[2], c.buttonMedBrightness, 200)
    base[3] = scale(base[3], c.buttonHighBrightness, 200)
    return base
  }

  // The outline colour: the toy's OFF body colour (bodyColorOff). Falls back to the Off edge colour.
  private buttonOutlineColour(): vec4 {
    const c = this.cfg
    if (c.buttonUseToyEdgeColour) {
      this.refreshToyColours()
      if (this.bodyOffColour) return this.bodyOffColour
    }
    return this.edgeColours[0] || this.colourOff
  }

  // Reads edgeColorOff/Low/Med/High and bodyColorOff from the toy's material, at most once a second.
  private refreshToyColours(): void {
    const c = this.cfg
    const now = getTime()
    if (now - this.edgeTry <= 1) return
    this.edgeTry = now
    const rmv = this.toyCfg && this.toyCfg.visual ? (this.toyCfg.visual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null
    const suffix = ["Off", "Low", "Med", "High"]
    const read = (name: string, what: string): vec4 | null => {
      let v: any = undefined
      try {
        v = rmv && rmv.mainMaterial ? (rmv.mainPass as any)[name] : undefined
      } catch (err) {
        v = undefined
      }
      if (v === undefined || v === null || v.x === undefined) {
        if (rmv && !this.warnedEdge.has(name)) {
          this.warnedEdge.add(name)
          console.warn("[Dial] " + this.sceneObject.name + ": could not read '" + name + "' from the toy's material, so the button uses a fallback colour for " + what + " (StageConfig > Dial button > Toy Edge / Body Colour Prefix).")
        }
        return null
      }
      return new vec4(v.x, v.y, v.z, 1)
    }
    for (let i = 0; i < 4; i++) this.edgeColours[i] = read(c.buttonToyEdgeColourPrefix + suffix[i], "state " + suffix[i])
    this.bodyOffColour = read(c.buttonToyBodyColourPrefix + "Off", "the outline")
  }

  // A pointing ray (mouse, or a pinch aimed from a distance) is read where it meets the table; a fingertip or a close
  // pinch is read at the hand itself.
  private isRay(it: Interactor): boolean {
    return it.inputType === InteractorInputType.Mouse || (it.activeTargetingMode & TargetingMode.Indirect) !== 0
  }

  // Where the interactor is on the stage floor, stage-local cm (null if unknown).
  private pointerLocal(it: Interactor): vec3 | null {
    const o = it.startPoint
    if (!o) return null
    const d = it.direction
    if (this.isRay(it) && d) {
      const lo = this.bounds.worldToLocal(o)
      const ld = this.bounds.worldToLocal(o.add(d)).sub(lo)
      if (Math.abs(ld.y) < 0.0001) return null
      const k = -lo.y / ld.y
      if (k < 0) return null
      return lo.add(ld.uniformScale(k))
    }
    return this.bounds.worldToLocal(o)
  }

  // Each frame of a touch on the arc: has it turned into a drag? If so, the socket follows the finger.
  private updateArcDrag(t: { interactor: Interactor; sliding: boolean; ptr0: vec3 | null; sock0: vec3 | null; ray: boolean; start: number; armed: boolean; orbit: boolean; grab: number }): void {
    const c = this.cfg
    const canMove = c.arcDragEnabled && c.toysReturnToSockets && !!this.toyInter
    if (!canMove && !c.arcOrbitEnabled) return
    const p = this.pointerLocal(t.interactor)
    if (!p) return
    const ray = this.isRay(t.interactor)
    if (!t.ptr0 || t.ray !== ray) {
      // first reading, or a poke turned into a pinch (the hand reports a different point now): measure from here
      t.ptr0 = p
      t.ray = ray
      t.sock0 = this.toyInter ? this.toyInter.socketLocal() : null
      return
    }
    // Turning the button by hand: hold it still for Arc Orbit Hold Seconds, then drag around the ring.
    if (c.arcOrbitEnabled && !t.sliding && !t.armed && getTime() - t.start >= c.arcOrbitHoldSeconds) t.armed = true
    const scale = ray ? 1 : c.arcDragHandScale
    const dx = (p.x - t.ptr0.x) * scale
    const dz = (p.z - t.ptr0.z) * scale
    const moved = Math.hypot(dx, dz) >= c.arcDragThreshold
    if (t.armed && !t.sliding && moved) {
      const a = this.pointerAngle(p)
      if (a !== null) {
        t.sliding = true
        t.orbit = true
        t.grab = wrapRad(a - this.buttonYaw()) // where on the button it was grabbed, so it does not jump
        c.log(this.sceneObject.name + " button turn started")
      }
    }
    if (t.orbit) {
      const a = this.pointerAngle(p)
      if (a !== null) this.angleOffset = wrapRad(a - t.grab - this.yaw)
      return
    }
    if (!canMove || !t.sock0 || t.armed) return
    if (!t.sliding && moved) {
      t.sliding = true
      c.log(this.sceneObject.name + " socket drag started")
    }
    if (t.sliding && this.toyInter) this.toyInter.moveSocketTo(t.sock0.x + dx, t.sock0.z + dz)
  }

  // The direction (radians, stage-local) from the ring centre to a point on the stage floor; null if the point is
  // too close to the centre to give a steady direction.
  private pointerAngle(p: vec3): number | null {
    const ctr = this.arcCentre()
    const dx = p.x - ctr.x
    const dz = p.z - ctr.z
    if (Math.hypot(dx, dz) < 0.5) return null
    return Math.atan2(dx, dz)
  }

  // The direction (radians, stage-local) the button sits from the ring centre: facing the viewer plus the button angle.
  private buttonYaw(): number {
    return wrapRad(this.yaw + this.angleOffset)
  }

  // Back to the Inspector's Button Angle (undoes any turning by hand).
  private resetButtonAngle(): void {
    this.angleOffset = degToRad(this.buttonAngle)
    this.angleSeen = this.buttonAngle
  }

  // Turn the arc to face the viewer's head (smoothly, at most Arc Turn Speed degrees per second).
  private aimAtViewer(dt: number): void {
    const c = this.cfg
    const cam = c.cameraObject
    if (!cam) {
      if (!this.warnedCamera) {
        this.warnedCamera = true
        console.warn("[ToyPad] StageConfig has no Camera Object, so the arc cannot face you and keeps facing the stage front")
      }
      return
    }
    const head = this.bounds.worldToLocal(cam.getTransform().getWorldPosition())
    const ctr = this.arcCentre()
    const dx = head.x - ctr.x
    const dz = head.z - ctr.z
    if (Math.hypot(dx, dz) < 1) return // the head is straight above: keep the last direction
    const goal = Math.atan2(dx, dz)
    if (!this.yawInit || c.arcTurnSpeed <= 0) {
      this.yaw = goal
      this.yawInit = true
      return
    }
    const maxStep = degToRad(c.arcTurnSpeed) * dt
    this.yaw = wrapRad(this.yaw + Math.max(-maxStep, Math.min(maxStep, wrapRad(goal - this.yaw))))
  }

  // Back to Home Position (the toy slides there on its own). Touches nothing else.
  resetSocketNow(): void {
    this.resetButtonAngle()
    if (this.toyInter) this.toyInter.resetSocket()
  }

  // Change this pad's toy volume, unless the toy is being carried or its cooldown is running.
  activate(source: VolumeSource, hand: number = -1): void {
    if (!this.vol) return
    if (this.toyInter && this.toyInter.isHeld()) return // a carried toy keeps its volume
    if (!this.vol.requestCycle(source, hand)) return
    this.pressStart = getTime()
    this.onPadTap.invoke({ pad: this, toy: this.vol, source: source, newState: this.vol.getState() })
  }

  // ---- look ---------------------------------------------------------------------
  private showState(): void {
    if (!this.vol) return
    this.colours.setState(this.vol.getState())
    this.baseColours.setState(this.vol.getState())
    this.shownState = this.vol.getState()
  }

  // The pad's state number for shaders (0..3; a smooth value while sliding), written AFTER the colour driver has
  // made its material copy.
  private writeStateParam(): void {
    const value = this.vol.stateValue()
    const key = value.toFixed(3)
    const strip = this.arcOn() ? null : this.visual // (a hidden strip is never copied, so it is never written to)
    if (key === this.paramShown || !strip || !this.cfg.padStateParam) return
    this.paramShown = key
    for (const v of [strip, this.homeOn() ? null : this.baseRMV]) {
      const pass = v ? (v.mainPass as any) : null
      if (!pass) continue
      try {
        pass[this.cfg.padStateParam] = value
      } catch (err) {
        this.cfg.log("pad material has no '" + this.cfg.padStateParam + "': " + err)
      }
    }
  }

  private homeOn(): boolean {
    return !!this.cfg && this.cfg.homeEnabled && !!this.baseRMV
  }

  // The ring colour from the TOY's own material (StageConfig > Home > Home Colour Source), read once per change.
  private readHomeColour(): vec4 | null {
    const src = Math.round(this.cfg.homeColourSource)
    const names = ["edgeColorLow", "edgeColorMed", "edgeColorHigh", "bodyColorLow", "bodyColorMed", "bodyColorHigh"]
    if (src >= 6) return this.colourMedium
    const key = src + "|" + (this.homeColour ? "ok" : "no")
    const now = getTime()
    if (key === this.homeColourKey && (this.homeColour || now - this.homeColourTry < 2)) return this.homeColour
    this.homeColourKey = key
    this.homeColourTry = now
    const rmv = this.toyCfg && this.toyCfg.visual ? (this.toyCfg.visual.getComponent("Component.RenderMeshVisual") as RenderMeshVisual) : null
    const v = rmv && rmv.mainMaterial ? ((rmv.mainPass as any)[names[src]] as any) : undefined
    if (v === undefined || v === null || v.x === undefined) {
      if (!this.homeColour) console.warn("[Home] " + this.sceneObject.name + ": could not read '" + names[src] + "' from the toy's material, so the ring keeps the Home material's own colour. Tell the artist; do not guess a fallback.")
      return this.homeColour
    }
    this.homeColour = new vec4(v.x, v.y, v.z, 1)
    this.cfg.log("[Home] " + this.sceneObject.name + " " + names[src] + " = " + v.x.toFixed(2) + ", " + v.y.toFixed(2) + ", " + v.z.toFixed(2))
    return this.homeColour
  }

  private updateHome(dt: number): void {
    if (!this.toyCfg) return
    const sig = this.toyCfg.signals
    const toyLocal = this.bounds.worldToLocal(this.toy.getTransform().getWorldPosition())
    sig.heightCm = Math.max(0, toyLocal.y)
    const colour = this.readHomeColour()
    this.home.update(dt, {
      away: !!this.toyInter && this.cfg.toysReturnToSockets && this.toyInter.isAway(),
      state: this.vol.stateValue(),
      colour: colour,
      heightCm: sig.heightCm,
      squash: sig.squash,
      hitSeq: sig.hitSeq,
      hitStrength: sig.hitStrength,
      padState: this.vol.stateValue()
    })
    // waves: one per hit of this toy's stem while it is not OFF (Off is never audio reactive), started here
    if (this.lastHitSeq < 0) this.lastHitSeq = sig.hitSeq
    if (sig.hitSeq !== this.lastHitSeq) {
      this.lastHitSeq = sig.hitSeq
      if (this.cfg.rippleOnHits && this.vol.getState() > 0) this.spawnWave(1)
    }
    this.ripple.update(dt, this.home.level, colour)
  }

  // Start a wave from this socket. With Shared Wave Field ON it goes to the big shared quad (WaveField), where waves
  // from all sockets add up; its strength is scaled by the ring's own brightness now, like the per-socket ripple.
  // Otherwise it goes to this pad's own ripple quad, as before.
  private spawnWave(strength: number): void {
    const c = this.cfg
    const field = WaveField.instance
    if (c.sharedWaveField && c.rippleEnabled && c.homeEnabled && field && field.isActive() && this.toyInter) {
      const s = this.toyInter.socketLocal() // read fresh: a moved socket sends waves from its new spot
      const bo = this.baseOffset() // the ring (the wave's centre) sits at the socket + Pad Base Offset
      const amp = Math.max(0, Math.min(1, this.home.level * c.rippleStartBrightness)) * strength
      if (c.waveDebugLog) console.log("[WaveField] " + this.sceneObject.name + " sends a wave: amp " + amp.toFixed(3) + " (ring level " + this.home.level.toFixed(3) + " x start brightness " + c.rippleStartBrightness + " x strength " + strength + ")")
      field.spawn(this.sceneObject.name, s.x + bo.x, s.z + bo.y, amp)
      return
    }
    if (c.waveDebugLog) console.log("[WaveField] " + this.sceneObject.name + " used its OWN ripple, not the shared field: sharedWaveField=" + c.sharedWaveField + " rippleEnabled=" + c.rippleEnabled + " homeEnabled=" + c.homeEnabled + " field=" + !!field + " fieldActive=" + (field ? field.isActive() : false) + " toyInter=" + !!this.toyInter)
    this.ripple.spawn(strength)
  }

  // The toy has finished settling onto its socket: one flash of the ring and one soft wave.
  private onLanded(): void {
    if (!this.cfg || !this.homeOn()) return
    this.home.flash(this.cfg.landingFlashStrength)
    this.spawnWave(this.cfg.rippleLandingStrength)
    if (this.vol) this.onSocketLanded.invoke({ pad: this, toy: this.vol })
  }

  // ---- position: offset from the toy (stage-local cm; x = right, z = toward you) ----
  currentOffset(): vec2 {
    if (this.arcOn()) return vec2.zero() // the arc lives on the ring: the pad object sits at the socket itself
    return this.useDefaultOffset ? new vec2(0, this.cfg.padFrontOffset) : this.offset
  }

  // The strip as discs for the stage maths: small discs the width of the strip, in a row along it (stage-local cm,
  // relative to the toy), so the whole rounded strip counts as part of the toy's unit.
  private discs(): G.Disc[] {
    if (!this.cfg) return []
    if (this.arcOn()) {
      // the arc turns to follow you, so the stage maths uses ONE fixed disc that covers the whole arc
      const bo = this.baseOffset()
      return [{ dx: bo.x, dz: bo.y, d: this.arcDiscDiameter() }]
    }
    const o = this.currentOffset()
    const w = Math.max(0.1, this.cfg.padStripWidth)
    const span = this.stripSpan()
    const n = Math.max(2, Math.ceil(span / (w * 0.5)) + 1)
    const out: G.Disc[] = []
    for (let i = 0; i < n; i++) out.push({ dx: o.x, dz: o.y - span * 0.5 + (span * i) / (n - 1), d: w })
    return out
  }

  // One disc diameter with the same area as the strip.
  private equivalentDiameter(): number {
    if (this.arcOn()) return this.arcDiscDiameter()
    const c = this.cfg
    const area = c ? shapeArea(c.padStripShape, c.padStripWidth, c.padStripLength, c.padStripRoundness) : 0
    return 2 * Math.sqrt(area / Math.PI)
  }

  // Where the circle under the toy is drawn, relative to the toy (stage-local cm; picture only).
  private baseOffset(): vec2 {
    return this.cfg.padBaseOffset
  }

  // Back to the default offset. Touches nothing else.
  resetPosition(): void {
    this.useDefaultOffset = true
    this.offset = new vec2(0, this.cfg.padFrontOffset)
  }

  // Back to the default colour set, made from Base Color. Touches nothing else.
  resetColours(): void {
    const d = deriveStateColours(this.baseColor)
    this.colourOff = d[0]
    this.colourLow = d[1]
    this.colourMedium = d[2]
    this.colourHigh = d[3]
  }

  // Touch box + targeting mode from the Inspector values (rebuilt only when a number changes).
  // One flat box over the strip (on this object); optionally a flat box over the circle under the toy (on Base Hit).
  private applySettings(): void {
    const c = this.cfg
    const key = [c.padStripWidth, c.padStripLength, c.padBaseWidth, c.padBaseLength, c.padHitMargin, c.padColliderHeight, c.padBaseTouchable, this.arcOn()].join("|")
    if (key !== this.colliderKey) {
      this.colliderKey = key
      if (this.collider) {
        const box = Shape.createBoxShape()
        // with the arc in use this box is shrunk to a speck: the arc's own box (Arc Hit) takes over
        box.size = this.arcOn() ? new vec3(0.01, 0.01, 0.01) : new vec3(c.padStripWidth + 2 * c.padHitMargin, c.padColliderHeight, c.padStripLength + 2 * c.padHitMargin)
        this.collider.shape = box
      }
      if (this.baseCollider) {
        const box = Shape.createBoxShape()
        box.size = new vec3(c.padBaseWidth + 2 * c.padHitMargin, c.padColliderHeight, c.padBaseLength + 2 * c.padHitMargin)
        this.baseCollider.shape = box
        this.baseCollider.enabled = c.padBaseTouchable
      }
    }
    // 1 = direct, 2 = indirect (pointing ray), 4 = poke (fingertip). Poke on or off, click = direct + indirect.
    const mode = (c.padAcceptsPoke ? 4 : 0) | (c.padAcceptsClick ? 3 : 0)
    if (mode !== this.modeKey) {
      this.modeKey = mode
      this.interactable.targetingMode = mode
    }
  }

  // Give the strip and the circle their meshes: your own (Pad Strip Mesh / Pad Base Mesh) or the generated shape.
  private applyMeshes(): void {
    const c = this.cfg
    if (this.padVisual) this.padVisual.enabled = !this.arcOn() // the old strip is hidden while the arc is in use
    if (this.visual && !this.arcOn()) {
      const key = c.padStripMesh ? "own" : [c.padStripShape, c.padStripWidth, c.padStripLength, c.padStripRoundness, c.padCurveSteps].join("|")
      if (key !== this.meshKey) {
        this.meshKey = key
        this.visual.mesh = c.padStripMesh ? c.padStripMesh : padMesh(c.padStripShape, c.padStripWidth, c.padStripLength, c.padStripRoundness, c.padCurveSteps)
      }
    }
    if (this.baseRMV) {
      const key = c.padBaseMesh ? "own" : [c.padBaseShape, c.padBaseWidth, c.padBaseLength, c.padBaseRoundness, c.padCurveSteps].join("|")
      if (key !== this.baseMeshKey) {
        this.baseMeshKey = key
        this.baseRMV.mesh = c.padBaseMesh ? c.padBaseMesh : padMesh(c.padBaseShape, c.padBaseWidth, c.padBaseLength, c.padBaseRoundness, c.padCurveSteps)
      }
    }
    // the circle should peek out from under the toy: say so once if it does not
    if (!this.warnedBase && this.toyCfg && this.baseVisual && Math.max(c.padBaseWidth, c.padBaseLength) >= this.toyCfg.footprint()) {
      this.warnedBase = true
      console.warn("[ToyPad] " + this.sceneObject.name + ": the circle under the toy (" + Math.max(c.padBaseWidth, c.padBaseLength).toFixed(1) + " cm) is not smaller than the toy's footprint (" + this.toyCfg.footprint().toFixed(1) + " cm), so it will not read as a shadow, and it counts in the stage spacing. Lower Pad Base Width / Length.")
    }
  }

  // The dial button, once per frame: spring, aim at the viewer, artwork and touch box. Returns how far (cm) the button
  // is sunk right now (negative while it bounces above the top).
  private updateArc(dt: number): number {
    const c = this.cfg
    const pressed = !!this.touch || getTime() < this.pressUntil
    this.spring.step(dt, pressed, c.arcSpringHz, c.arcPressDamping, c.arcBounceDamping)
    this.aimAtViewer(dt)
    if (this.buttonAngle !== this.angleSeen) this.resetButtonAngle() // first frame, or the Inspector number was changed
    const sink = this.spring.x * c.buttonPressDepth
    const bo = this.baseOffset()
    const unit = c.primitiveMeshSize > 0 ? c.primitiveMeshSize : 1
    const sf = 1 - c.buttonPressShrink * Math.max(0, this.spring.x)
    const q = this.buttonQuad()
    const dist = this.buttonDistance()
    const by = this.buttonYaw()
    const bx = bo.x + Math.sin(by) * dist
    const bz = bo.y + Math.cos(by) * dist

    // artwork: a flat quad centred on the button, lying on the table level (+ Arc Yaw Offset if your material needs it)
    const at = this.arcVisual.getTransform()
    at.setLocalScale(new vec3((q / unit) * sf, 1, (q / unit) * sf))
    at.setLocalPosition(new vec3(bx, c.arcLift - sink, bz))
    at.setLocalRotation(quat.angleAxis(by + degToRad(c.arcYawOffset), vec3.up()))
    this.arcVisual.enabled = true
    if (c.aliveEnabled && c.aliveDialEnabled) {
      this.dialNear.update(dt, c, at.getWorldPosition(), this.buttonRadius(), c.aliveDialInnerCm, c.aliveDialOuterCm, this.hoverCount > 0)
    } else {
      this.dialNear.reset()
    }
    this.arcLook.update(dt, this.vol.stateValue(), this.buttonColours(), this.buttonOutlineColour(), Math.max(-0.5, Math.min(1.5, this.spring.x)))

    // touch box: a flat box around the disc plus the hit margin (the exact round test is arcDistance)
    const side = c.buttonDiameter + 2 * Math.max(0, c.arcHitMargin)
    const key = [side, c.padColliderHeight].map((x) => x.toFixed(3)).join("|")
    if (this.arcCollider && key !== this.arcHitKey) {
      this.arcHitKey = key
      const box = Shape.createBoxShape()
      box.size = new vec3(side, c.padColliderHeight, side)
      this.arcCollider.shape = box
    }
    const ht = this.arcHit.getTransform()
    ht.setLocalPosition(new vec3(bx, 0, bz))
    ht.setLocalRotation(quat.angleAxis(by, vec3.up()))
    return sink
  }

  private onUpdate(): void {
    if (!this.cfg || !this.bounds || !this.vol) return
    this.applySettings()
    this.applyMeshes()
    if (this.touch) this.updateTouch()
    if (StageConfig.consumeTick(this, "resetPadPosition")) this.resetPosition()
    if (StageConfig.consumeTick(this, "resetPadColours")) this.resetColours()
    if (StageConfig.consumeTick(this, "resetSocket")) this.resetSocketNow()
    if (this.vol.getState() !== this.shownState) this.showState()
    const dt = getDeltaTime()
    this.colours.update(dt)
    if (this.homeOn()) this.updateHome(dt)
    else this.baseColours.update(dt) // (the home marker never clones the material; the old circle look does)
    this.writeStateParam()

    // follow the toy: at the pad offset (stage-local, so it stays on the stage's front side), flat, at Pad Lift
    // the anchor is the toy's SOCKET (fixed, stage-local) with Toys Return To Sockets on, otherwise the toy itself
    const toyLocal = this.cfg.toysReturnToSockets && this.toyInter ? this.toyInter.socketLocal() : this.bounds.worldToLocal(this.toy.getTransform().getWorldPosition())
    const off = this.currentOffset()
    const goal = new vec3(toyLocal.x + off.x, this.cfg.padLift, toyLocal.z + off.y)
    const speed = this.cfg.padFollowSpeed
    if (!this.placed || speed <= 0) {
      this.local = goal
      this.placed = true
    } else {
      this.local = vec3.lerp(this.local, goal, 1 - Math.exp(-speed * dt))
    }
    const t = this.sceneObject.getTransform()
    t.setWorldPosition(this.bounds.localToWorld(this.local))
    t.setWorldRotation(this.bounds.sceneObject.getTransform().getWorldRotation())

    // artwork. Sizes come ONLY from the Inspector: nothing here reads the toy's size or the volume, so the strip and
    // the circle never grow or shrink with either. Both dip a tiny bit while pressed.
    const c = this.cfg
    const unit = c.primitiveMeshSize > 0 ? c.primitiveMeshSize : 1
    const k = (getTime() - this.pressStart) / Math.max(0.02, c.padPressSeconds)
    const arc = this.arcOn()
    // old strip: a quick dip when a tap registers. Dial button: the button sinks on a spring while touched, then bounces
    // back; the ring only goes with it if Button Ring Follows Press is ticked.
    const buttonSink = arc ? this.updateArc(dt) : 0
    const ringFollows = arc && c.buttonRingFollowsPress
    const dip = arc ? (ringFollows ? buttonSink : 0) : k >= 0 && k <= 1 ? Math.sin(Math.PI * k) * c.padPressDepth : 0
    const shrink = ringFollows ? 1 - c.buttonPressShrink * Math.max(0, this.spring.x) : 1
    if (this.padVisual && !arc) {
      const vt = this.padVisual.getTransform()
      // a generated shape is already the right size; your own mesh (1 x 1 cm) is stretched to the strip
      vt.setLocalScale(c.padStripMesh ? new vec3(c.padStripWidth / unit, 1, c.padStripLength / unit) : vec3.one())
      vt.setLocalPosition(new vec3(0, -dip, 0))
    }
    const bo = this.baseOffset()
    const base = new vec3(-off.x + bo.x, 0, -off.y + bo.y)
    if (this.baseVisual) {
      const bt = this.baseVisual.getTransform()
      this.baseVisual.enabled = c.padBaseWidth > 0 && c.padBaseLength > 0
      if (this.homeOn() && c.padBaseMesh) {
        // the home quad: drawn at its own size, which the stage maths never sees (baseDiameterProvider is unchanged)
        const q = this.homeSizeOverride > 0 ? this.homeSizeOverride : c.homeQuadSize
        bt.setLocalScale(new vec3((q / unit) * shrink, 1, (q / unit) * shrink))
      } else {
        bt.setLocalScale(c.padBaseMesh ? new vec3((c.padBaseWidth / unit) * shrink, 1, (c.padBaseLength / unit) * shrink) : new vec3(shrink, 1, shrink))
        if (this.homeOn() && !this.warnedHomeMesh) {
          this.warnedHomeMesh = true
          console.warn("[Home] " + this.sceneObject.name + ": Home is on but StageConfig > Pads > Pad Base Mesh is empty, so the circle is still the generated PadShape mesh. Set it to a flat 1 x 1 cm quad (Pad_Plane.mesh).")
        }
      }
      bt.setLocalPosition(new vec3(base.x, -c.padBaseDrop - dip, base.z))
    }
    if (this.baseHit) this.baseHit.getTransform().setLocalPosition(base)
    if (this.rippleVisual) {
      // the ripple quad sits flat at the ring (fixed to the socket), drawn at Ripple Size; picture only
      const rt = this.rippleVisual.getTransform()
      const rs = c.rippleSize
      rt.setLocalScale(new vec3(rs / unit, 1, rs / unit))
      rt.setLocalPosition(new vec3(base.x, -c.padBaseDrop + c.rippleLift, base.z))
    }
  }
}
