@AGENTS.md

# Specs_Oct25_PT_A: project rules
- TypeScript only. No JavaScript or `// @input` comment decorators.
- Never guess at Lens Studio or Spectacles APIs. Verify against the type
  definitions and docs. If unsure something exists, say so.
- This is an artist-driven project: expose settings in the Inspector, keep
  assets swappable, and don't hard-code visual choices.
- Don't generate shaders or materials in code. I author those in Lens Studio.
- Runtime meshes: the goal is that I keep maximum control over the assets in
  the project. Before ANY change that creates, bakes or generates a mesh in
  code (MeshBuilder, createFromMesh, procedural pads or frames), stop and warn
  me first, say what it replaces and what I lose control of, and wait for my
  go-ahead. Existing approved ones: blob bake (ToyShape/BlobBake) and pad shapes
  (PadShape).
- Units are centimeters. Label the unit (cm, degrees, seconds) in every
  Inspector tooltip. Remember rotation is degrees in the Editor API and
  radians at runtime.
- Scripts must not depend on scene hierarchy order for setup. A toy must wait
  for or safely fetch the global config rather than assuming it has already
  run.
- Keep each toy a separate, reorderable scene object so I can control
  render order for transparent materials.
- Read BRIEF.md and PLAN.md at the start of every session.
- After each change, tell me which scripts changed and what I need to hook up
  manually in Lens Studio.

## Core assumptions (set by the artist; do not change without asking)
- **Size budget.** The published Lens must fit the Specs limit of 25 MB. The
  working project may be somewhat larger than that. Before ANY change that
  would grow the project by more than 2 MB (new assets, textures, meshes,
  audio, packages), stop and tell me the estimated increase first. Do nothing
  until I answer.
- **Music is fixed.** Music quality and the number of stems (currently 8: one
  foundation plus 7 toys) are changed by me only. Never re-encode, resample,
  trim, replace, add, remove or re-assign stems, and never change bitrate or
  quality settings, even to save size. If size or sync is a problem, tell me and
  let me decide.
