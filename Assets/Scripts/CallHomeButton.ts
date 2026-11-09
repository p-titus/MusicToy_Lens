// CallHomeButton - puts a scene button in charge of CALL HOME: every toy floats back to its own socket.
//
// You make and style the button yourself (a SIK PinchButton, a Spectacles UI Kit button, or any object with an
// Interactable on it or on one of its children) and drop it into "Button Object". This script only listens for the
// button being pressed and released; it makes no visuals. The same call can be made from the Inspector
// (StageConfig > Resets > Call Home Now) and, in the Editor Preview, with the H key.

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import { StageConfig } from "./StageConfig"

@component
export class CallHomeButton extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("The button object. It (or one of its children) needs an Interactable. Empty = this object.")
  buttonObject: SceneObject

  @input
  @hint("Seconds (s) after a press during which another press is ignored, so a double tap does not call twice.")
  cooldownSeconds: number = 1

  @input
  @hint("ON: pressing also puts every socket back at its starting Home Position (the same as ticking StageConfig > Sockets > Reset Sockets), so each toy floats back to its original spot, even a socket you dragged. OFF: toys only return to their current sockets.")
  alsoResetSockets: boolean = true

  private cfg: StageConfig
  private last: number = -100

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    // SIK subscriptions are made in OnStart, not in onAwake
    this.createEvent("OnStartEvent").bind(() => this.onStart())
  }

  private onStart(): void {
    const root = this.buttonObject ? this.buttonObject : this.sceneObject
    const it = this.findInteractable(root)
    if (!it) {
      console.warn("[CallHomeButton] no Interactable found on " + root.name + " or its children; the button will do nothing")
      return
    }
    it.onTriggerEnd.add(() => this.press()) // counted when the finger lifts, like the dial button
  }

  private findInteractable(o: SceneObject): Interactable | null {
    const here = o.getComponent(Interactable.getTypeName()) as Interactable
    if (here) return here
    for (let i = 0; i < o.getChildrenCount(); i++) {
      const found = this.findInteractable(o.getChild(i))
      if (found) return found
    }
    return null
  }

  // Call every toy home (also callable from your own scripts).
  press(): void {
    if (!this.cfg || getTime() - this.last < this.cooldownSeconds) return
    this.last = getTime()
    // sockets first, so the toys then head for the restored sockets
    if (this.alsoResetSockets) this.cfg.triggerReset("sockets")
    this.cfg.triggerReset("callHome")
  }
}
