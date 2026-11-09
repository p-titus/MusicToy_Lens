// Shared helpers for the LEAF scenarios. Names come from the scene (Stage > Pads / Toys).
// Pad_0N controls toy number N. Nothing here changes the Lens; it only reads state.

import { findSceneObjectByName } from "Leaf.lspkg/Utils/common/Utils"
import { ToyVolume } from "../Scripts/ToyVolume"

export const PAD_NAMES = ["Pad_01", "Pad_02", "Pad_03", "Pad_04", "Pad_05", "Pad_06", "Pad_07"]
export const TOY_NAMES = [
  "Toy_01_PianoMel",
  "Toy_02_PianoVar",
  "Toy_03_Cello",
  "Toy_04_Violin",
  "Toy_05_Chimes",
  "Toy_06_SFX",
  "Toy_07_MixPerc",
]

// Longer than StageConfig > Same Hand Cooldown (default 1.0 s), so two deliberate taps both count.
export const PAST_SAME_HAND_LOCK_MS = 1300

export function getToyVolume(toyName: string): ToyVolume {
  const obj = findSceneObjectByName(toyName)
  if (!obj) throw new Error('Toy "' + toyName + '" not found in the scene')
  const vol = obj.getComponent(ToyVolume.getTypeName()) as ToyVolume
  if (!vol) throw new Error('Toy "' + toyName + '" has no ToyVolume')
  return vol
}
