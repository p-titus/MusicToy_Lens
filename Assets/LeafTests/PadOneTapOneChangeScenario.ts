// Guard path: one finger action must never change a volume twice.
// Two taps on the same pad inside the cooldown window count as ONE change.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { expect } from "Leaf.lspkg/Utils/common/Expect"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils"
import { getToyVolume, PAST_SAME_HAND_LOCK_MS } from "./ToyLeafHelpers"

@component
export class PadOneTapOneChangeScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(1500)
    const interactor = new DefaultLeafInteractor()
    const pad = findInteractableByName("Pad_05")
    if (!pad) throw new Error('Pad "Pad_05" not found or has no Interactable')
    const vol = getToyVolume("Toy_05_Chimes")

    // count how many state-change events fire (the event is the public hook for artist reactions)
    let changes = 0
    const sub = (): void => {
      changes++
    }
    vol.onStateChange.add(sub)

    await sleep(PAST_SAME_HAND_LOCK_MS) // make sure no earlier scenario's cooldown is still running
    const before = vol.getState()
    await interactor.trigger(pad)
    await interactor.trigger(pad) // immediately again: inside Volume Cooldown / Same Hand Cooldown
    await sleep(500)

    vol.onStateChange.remove(sub)
    expect(changes).toBe(1)
    expect(vol.getState()).toBe((before + 1) % 4)
  }
}
