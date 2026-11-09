// Reachability: can a real arm reach a pad and tap it? The IK interactor physically reaches for the target,
// so a pad that is too far away, hidden or too small makes trigger() fail to converge. That is a finding
// about where the stage sits, not a test bug.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario"
import { expect } from "Leaf.lspkg/Utils/common/Expect"
import { sleep } from "Leaf.lspkg/Utils/common/Utils"
import { findInteractableByName } from "Leaf.lspkg/Interactors/InteractableUtils"
import { createIKInteractor } from "Leaf.lspkg/Interactors/interactor/ik/visualizer/BitmojiAvatar"
import { getToyVolume, PAST_SAME_HAND_LOCK_MS } from "./ToyLeafHelpers"

@component
export class PadIKReachScenario extends Scenario {
  private readonly _ik = createIKInteractor()

  async run(): Promise<void> {
    await sleep(1500)
    const pad = findInteractableByName("Pad_02")
    if (!pad) throw new Error('Pad "Pad_02" not found or has no Interactable')
    const vol = getToyVolume("Toy_02_PianoVar")

    await sleep(PAST_SAME_HAND_LOCK_MS)
    const before = vol.getState()
    await this._ik.trigger(pad)
    await sleep(500)
    expect(vol.getState()).toBe((before + 1) % 4)
  }
}
