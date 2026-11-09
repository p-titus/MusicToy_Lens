// Registers every LEAF scenario so the LEAF panel can list and run them. Attach to a scene object named "LeafIndex".

import { scenariosIndex } from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import { ScenarioMetadata } from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import { PadCycleScenario } from "./PadCycleScenario"
import { PadOneTapOneChangeScenario } from "./PadOneTapOneChangeScenario"
import { PadsAreIndependentScenario } from "./PadsAreIndependentScenario"
import { PadIKReachScenario } from "./PadIKReachScenario"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    { id: "pad-cycle-volume", typename: PadCycleScenario.getTypeName() },
    { id: "pad-one-tap-one-change", typename: PadOneTapOneChangeScenario.getTypeName() },
    { id: "pads-are-independent", typename: PadsAreIndependentScenario.getTypeName() },
    { id: "pad-ik-reach", typename: PadIKReachScenario.getTypeName() },
  ]
}
