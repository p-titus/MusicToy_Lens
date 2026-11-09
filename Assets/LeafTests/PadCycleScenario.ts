// Tapping a pad cycles that toy's volume: off -> low -> medium -> high -> off.
// Uses relative checks (read the state first), because scenarios share one live Lens.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { expect } from "Leaf.lspkg/Utils/common/Expect"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils"
import { getToyVolume, PAST_SAME_HAND_LOCK_MS } from "./ToyLeafHelpers"

@component
export class PadCycleScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(1500) // let the stage place itself and the pads register with SIK
    const interactor = new DefaultLeafInteractor()
    const pad = findInteractableByName("Pad_03")
    if (!pad) throw new Error('Pad "Pad_03" not found or has no Interactable')
    const vol = getToyVolume("Toy_03_Cello")

    // four taps bring the toy all the way round to where it started
    const start = vol.getState()
    for (let i = 1; i <= 4; i++) {
      const before = vol.getState()
      await interactor.trigger(pad)
      await sleep(PAST_SAME_HAND_LOCK_MS)
      expect(vol.getState()).toBe((before + 1) % 4)
    }
    expect(vol.getState()).toBe(start)
  }
}
