// ToyShaderDeform - hands one toy's motion to its material, for the vertex-deform shader you build in Shader Graph.
// A plain class (not a component): ToyAudioReact owns one per toy. It only writes numbers; the look is your graph.
// The names below are the PARAMETER CONTRACT: each must be a Float Parameter node in the graph with exactly this
// Script Name (PLAN.md section 25 lists type, range and unit of each).
// It writes to the Visual's `mainPassOverrides`, so only this toy's Visual changes and the material asset is never edited.

export const DEFORM_PARAMS = {
  amount: "deformAmount", // float 0..1, unitless: how much of the deform shows (0 = off, 1 = full)
  kick: "kick", // float -1..1.5, unitless: the beat spring (up on a hit, a little under on the rebound)
  squash: "squash", // float -0.4..0.4, fraction: + = flatter and wider, - = taller and thinner (volume kept)
  swayX: "swayX", // float, about -0.25..0.25, mesh units (the mesh is 1 on its longest side): sideways lean of the top along x
  swayZ: "swayZ", // float, about -0.25..0.25, mesh units: sideways lean of the top along z
  noiseStrength: "noiseStrength", // float 0..0.06, fraction of the blob's longest side
  noiseScale: "noiseScale", // float 0.5..6, noise cycles across the blob (higher = finer ripples)
  noiseTime: "noiseTime", // float 0..1000, seconds: this toy's own noise clock (wraps at 1000)
  noiseSeed: "noiseSeed", // float 0..100, unitless: per-toy offset so no two toys ripple alike
  reachBaseY: "reachBaseY", // float, mesh units (the mesh is 1 on its longest side): height of the blob's base
  reachHeight: "reachHeight", // float > 0, mesh units: base-to-top height; reach is 0 at the base, 1 at the top
  coreHeat: "coreHeat" // float 0..1, unitless: glow of the blob's core (0 = cold/dim, 1 = hot); slow follower of loudness
}

export interface DeformState {
  amount: number
  kick: number
  squash: number
  swayX: number
  swayZ: number
  noiseStrength: number
  noiseScale: number
  noiseTime: number
  noiseSeed: number
  reachBaseY: number
  reachHeight: number
}

export function newDeformState(): DeformState {
  return { amount: 0, kick: 0, squash: 0, swayX: 0, swayZ: 0, noiseStrength: 0, noiseScale: 2, noiseTime: 0, noiseSeed: 0, reachBaseY: -0.5, reachHeight: 1 }
}

export class ShaderDeformWriter {
  constructor(private rmv: RenderMeshVisual) {}

  // The core glow is independent of the Shader Deform switch, so it has its own call.
  writeCore(heat: number): void {
    this.rmv.mainPassOverrides[DEFORM_PARAMS.coreHeat] = heat
  }

  write(s: DeformState): void {
    const o = this.rmv.mainPassOverrides
    const P = DEFORM_PARAMS
    o[P.amount] = s.amount
    o[P.kick] = s.kick
    o[P.squash] = s.squash
    o[P.swayX] = s.swayX
    o[P.swayZ] = s.swayZ
    o[P.noiseStrength] = s.noiseStrength
    o[P.noiseScale] = s.noiseScale
    o[P.noiseTime] = s.noiseTime
    o[P.noiseSeed] = s.noiseSeed
    o[P.reachBaseY] = s.reachBaseY
    o[P.reachHeight] = s.reachHeight
  }
}
