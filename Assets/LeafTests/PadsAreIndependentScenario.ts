// Each pad controls only its own toy: tapping Pad_01 must leave every other toy's volume alone.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { expect } from "Leaf.lspkg/Utils/common/Expect"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils"
import { getToyVolume, PAST_SAME_HAND_LOCK_MS, TOY_NAMES } from "./ToyLeafHelpers"

@component
export class PadsAreIndependentScenario extends Scenario {
  async run(): Promise<void> {
    await sleep(1500)
    const interactor = new DefaultLeafInteractor()
    const pad = findInteractableByName("Pad_01")
    if (!pad) throw new Error('Pad "Pad_01" not found or has no Interactable')

    await sleep(PAST_SAME_HAND_LOCK_MS)
    const before = TOY_NAMES.map((n) => getToyVolume(n).getState())
    await interactor.trigger(pad)
    await sleep(500)

    TOY_NAMES.forEach((name, i) => {
      const now = getToyVolume(name).getState()
      // only Toy_01 (index 0) moves, by exactly one step
      expect(now).toBe(i === 0 ? (before[i] + 1) % 4 : before[i])
    })
  }
}
