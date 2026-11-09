# Toy Stage

A playful music Lens for Snap Spectacles (Specs). You sit at a real table and a small stage appears on it. On the stage are seven soft, balloon-like toys. Each toy controls one stem of an eight-track piece of music.

## What it does

- **The stage.** A compact half-ellipse stage (default 23 cm wide, 29 cm deep) is anchored on the table in front of you. It is placed by gaze using World Query, with a floating fallback when no surface is found. You can re-place it with a palm tap held for about 1 second, and move it by pinch-dragging the handle in front of it.
- **The toys.** Seven toys: PianoMel, PianoVar, Cello, Violin, Chimes, SFX and MixPerc. Each one plays one stem. A foundation track (MixBase) plays quietly underneath all the time.
- **Volume.** Each toy has a socket on the stage with a small dial button. Tap the button to step through off, low, medium, high, off. A toy's stem is never stopped, "off" is just volume 0.
- **Carrying.** Pinch a toy to pick it up and move it. When you let go, it floats back to its socket. Moving a toy never changes its volume.
- **Call Home.** One button (or the H key in the Preview) sends every toy back to its socket and can reset all sockets to their starting positions.
- **Alive and reactive.** Toys react to the music (hits kick springs and glows) and notice a nearby hand. Waves from the sockets spread across a shared wave field on the table.

All visual choices (shaders, materials, colours, shapes) are authored in Lens Studio. The scripts only write values to them. Every tunable value is an Inspector setting with units in its tooltip (centimeters, degrees, seconds).

## Opening the project

Requirements:

- **Lens Studio 5.22 or newer**, with the **SPECS** (Spectacles) project type.
- Spectacles Interaction Kit (SIK) and Spectacles UI Kit. Both are included in `Packages/`.

Steps:

1. Open Lens Studio and choose **Open Project**.
2. Select `Specs_Oct25_PT_A.esproj` in this folder.
3. Let Lens Studio finish compiling the TypeScript scripts in `Assets/Scripts/`.
4. Open `Assets/Scene.scene` if it is not already open.
5. Press play in the Preview panel.

## Testing and status

- In the Editor Preview there is no real table, so the stage always uses the floating fallback, and the mouse stands in for a fingertip. Keys: H calls toys home, R re-places the stage, 1 to 8 trigger test hits.
- This project has **not been tested on a Spectacles device**. All testing so far is in the Editor Preview and with LEAF.
- Music: the eight stems are in `Assets/RS_Mp3_ABR/`. They are fixed by the artist and must not be re-encoded or changed. The published Lens must stay within the Specs 25 MB limit.

## Project layout

- `Assets/Scripts/`: TypeScript only.
- `Assets/Materials/`, `Assets/Meshes/`: shaders, materials and meshes authored in Lens Studio.
- `BRIEF.md`: the current design, in plain language.
- `PLAN.md`: the current technical plan and status. `PLAN_history.md` and `BRIEF_history.md` hold the dated logs.

## Built with

Built with [Claude Code](https://claude.com/claude-code) and CLAD (the Lens Studio agent toolkit), working with Lens Studio through its MCP tools. The artist makes the design decisions and authors the shaders, materials and music; Claude Code writes the TypeScript scripts and the plumbing.
