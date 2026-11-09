// MusicSync - starts all 9 stems together and keeps them together.
//
// What testing showed (Editor Preview): starting nine AudioComponents in a loop leaves them about
// 85 ms apart (each play() call takes ~10 ms), and they then stay that way. Setting `position` on a
// playing stem makes it WORSE. But setting each stem's position BEFORE play() to the delay it is going
// to suffer brings the gap down to about 1 ms. So:
//   1. Silent calibration: start every stem at volume 0, measure each stem's lag behind the foundation,
//      stop them, remember the lags.
//   2. Real start (and every loop restart): position = remembered lag, then play(), all in ONE call.
//   3. The FOUNDATION track is the clock: it is audible the whole time and never moved. Every so often each
//      toy stem's position is compared with it. A stem that is out gets restarted ON ITS OWN (fade out, stop,
//      seek to the foundation's position plus a learned lead, play, fade in). The lead is re-learned after every
//      single restart. The other stems are not touched.
//   4. Looping: the end of the piece is DETECTED here every frame (the foundation stopped, wrapped round to the
//      start, or is within 0.05 s of its end), not left to the engine's finish callback, which did not fire in
//      Preview. Every loop is a full restart with the start-up pre-seek, so it also resets any drift.
//   5. Safeguards: if most stems are off in the same direction, the foundation is the one that slipped, so
//      everything is restarted together (as at the start). The same happens if one stem keeps failing.
// "Off" toys are just volume 0. Nothing here stops a stem except these restarts.
// Settings (loop, check interval, tolerance, fade, safeguards, log) live in StageConfig > Music and sync.

import { StageConfig } from "./StageConfig"
import { ToyVolume } from "./ToyVolume"

enum Phase {
  Waiting,
  Calibrating,
  Stopped,
  Playing
}

// what one toy stem is doing in a single-stem correction
enum Fix {
  Idle, // nothing wrong
  Fading, // fading out, about to be restarted
  Verifying // restarted, waiting to measure it again
}

const VERIFY_DELAY = 0.25 // seconds after a single restart before the stem is measured again

@component
export class MusicSync extends BaseScriptComponent {
  private cfg: StageConfig
  private stems: AudioComponent[] = [] // [0] = foundation, then the toys
  private toyVolumes: ToyVolume[] = []
  private stemVolumes: ToyVolume[] = [] // parallel to `stems`; [0] (foundation) is null
  private fix: Fix[] = []
  private fixTime: number[] = []
  private fixTries: number[] = []
  private lead: number[] = [] // seconds a single restarted stem is seeked ahead of the foundation (learned)
  private offsets: number[] = []
  private phase: Phase = Phase.Waiting
  private phaseStart: number = 0
  private lastCheck: number = 0
  private foundationVolume: number = 0
  private started: boolean = false
  private lastFoundationPos: number = 0 // the foundation's position on the previous frame (to spot a wrap-around)
  private endDetectedAt: number = 0 // Date.now() when the end was detected, to log the gap at the seam

  onAwake(): void {
    StageConfig.whenAvailable((c) => {
      this.cfg = c
    })
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private onStart(): void {
    const f = this.cfg.foundationAudio
    if (!f) {
      console.error("[MusicSync] no foundation AudioComponent in StageConfig")
      return
    }
    if (f.audioTrack && f.audioTrack !== this.cfg.foundationTrack) {
      console.warn("[MusicSync] the Foundation AudioComponent has its own Audio Track filled; it is replaced by StageConfig > Foundation Track. Leave that slot empty.")
    }
    f.audioTrack = this.cfg.foundationTrack
    this.stems = [f]
    for (const o of this.cfg.toys) {
      const tv = o.getComponent(ToyVolume.getTypeName()) as ToyVolume
      if (!tv) {
        console.error("[MusicSync] " + o.name + " has no ToyVolume")
        continue
      }
      this.toyVolumes.push(tv)
    }
    f.volume = 0
  }

  // The first UpdateEvent comes after every OnStartEvent, so every toy has its stem assigned by now.
  private onUpdate(): void {
    if (!this.cfg || this.stems.length === 0) return
    if (!this.started) {
      this.started = true
      // a toy that is switched off in the scene never started, so it has no audio: skip it
      this.stemVolumes = [null]
      for (const tv of this.toyVolumes) {
        const a = tv.getAudio()
        if (a && a.audioTrack) {
          this.stems.push(a)
          this.stemVolumes.push(tv)
        } else console.warn("[MusicSync] skipping " + tv.sceneObject.name + " (disabled or no stem assigned)")
      }
      this.offsets = this.stems.map(() => 0)
      this.lead = this.stems.map(() => 0.01)
      this.resetFixes()
      this.calibrate()
      return
    }
    const now = getTime()
    const t = now - this.phaseStart

    // keep the foundation at its chosen volume (glides, so edits in the Inspector are smooth)
    const fTarget = this.phase === Phase.Playing ? this.cfg.foundationVolume : 0
    const k = 1 - Math.exp(-getDeltaTime() / Math.max(0.01, this.cfg.volumeSmoothing))
    this.foundationVolume += (fTarget - this.foundationVolume) * k
    this.stems[0].volume = this.foundationVolume

    if (this.phase === Phase.Calibrating && t >= 0.4) {
      this.measureLags()
      this.stopAll()
      this.phase = Phase.Stopped
      this.phaseStart = now
    } else if (this.phase === Phase.Stopped && t >= 0.3) {
      this.startAll("start")
    } else if (this.phase === Phase.Playing) {
      if (this.cfg.loopTestJump) this.jumpNearEndForTest()
      if (this.checkForEnd(t)) return
      this.updateFixes(now)
      const every = this.cfg.driftCheckInterval
      if (every > 0 && now - this.lastCheck >= every && t > 1.5 && this.phase === Phase.Playing) {
        this.lastCheck = now
        this.checkSync()
      }
    }
  }

  // ---- steps ------------------------------------------------------------------
  private silence(on: boolean): void {
    for (const tv of this.toyVolumes) tv.silenced = on
  }

  private calibrate(): void {
    console.log("[MusicSync] silent calibration of " + this.stems.length + " stems")
    this.silence(true)
    this.resetFixes()
    this.offsets = this.stems.map(() => 0)
    this.playAllNow()
    this.phase = Phase.Calibrating
    this.phaseStart = getTime()
  }

  private playAllNow(): void {
    // positions first, then play, in one go; the foundation is first in the list
    const t0 = Date.now()
    for (let i = 0; i < this.stems.length; i++) {
      this.stems[i].position = this.offsets[i]
      this.stems[i].play(1)
    }
    this.cfg.log("started " + this.stems.length + " stems in " + (Date.now() - t0) + " ms")
  }

  private measureLags(): void {
    const lead = this.stems[0].position
    for (let i = 0; i < this.stems.length; i++) {
      this.offsets[i] = Math.max(0, lead - this.stems[i].position)
    }
    this.cfg.log("start lags (ms): " + this.offsets.map((o) => (o * 1000).toFixed(0)).join(", "))
  }

  private stopAll(): void {
    for (const s of this.stems) s.stop(false)
  }

  private startAll(why: string): void {
    this.playAllNow()
    this.silence(false)
    this.phase = Phase.Playing
    this.phaseStart = getTime()
    this.lastCheck = this.phaseStart
    this.lastFoundationPos = 0
    // backup for the per-frame end check in checkForEnd(): the engine's finish callback (it may not fire)
    this.stems[0].setOnFinish(() => this.onFoundationFinished())
    const seam = why === "loop" ? ", gap at the seam " + (Date.now() - this.endDetectedAt) + " ms" : ""
    console.log("[MusicSync] playing (" + why + "), spread " + this.spread().toFixed(3) + " s" + seam)
  }

  // Every frame while playing: has the piece ended? Returns true if it restarted.
  private checkForEnd(sincePlayStart: number): boolean {
    if (!this.cfg.loopPiece || sincePlayStart < 1.5) return false // just started: let the stems settle first
    const f = this.stems[0]
    const pos = f.position
    const wrapped = pos < this.lastFoundationPos - 1.0
    const nearEnd = pos >= f.duration - 0.05
    this.lastFoundationPos = pos
    if (f.isPlaying() && !wrapped && !nearEnd) return false
    return this.loopNow(wrapped ? "wrapped to the start" : nearEnd ? "reached the end" : "foundation stopped")
  }

  // The engine says the foundation finished. A stop or a Lens reset fires this too, so it only counts if the
  // piece was within 1.5 s of its end on the last frame (position may already read 0 by now, so it is not read here).
  private onFoundationFinished(): void {
    if (this.lastFoundationPos < this.stems[0].duration - 1.5) return
    this.loopNow("finish callback")
  }

  // Restart all stems together. Phase is set first, so the finish callback (fired by stopping) is ignored.
  private loopNow(why: string): boolean {
    if (!this.cfg.loopPiece || this.phase !== Phase.Playing) return false
    this.endDetectedAt = Date.now()
    console.log("[MusicSync] end of piece (" + why + "): restarting all stems")
    this.phase = Phase.Stopped
    this.stopAll()
    this.startAll("loop")
    return true
  }

  // TEST: jump the foundation to 5 s before its end (every stem with it) so the loop can be heard without waiting.
  private jumpNearEndForTest(): void {
    this.cfg.loopTestJump = false
    const target = Math.max(0, this.stems[0].duration - 5)
    for (const s of this.stems) s.position = target
    this.lastFoundationPos = target
    console.log("[MusicSync] TEST: jumped all stems to " + target.toFixed(1) + " s")
  }

  // gap between the earliest and latest stem, in seconds
  private spread(): number {
    let lo = 1e9
    let hi = -1
    for (const s of this.stems) {
      lo = Math.min(lo, s.position)
      hi = Math.max(hi, s.position)
    }
    return hi - lo
  }

  // ---- the sync check: the foundation is the clock ----------------------------------
  private resetFixes(): void {
    this.fix = this.stems.map(() => Fix.Idle)
    this.fixTime = this.stems.map(() => 0)
    this.fixTries = this.stems.map(() => 0)
  }

  private shortName(i: number): string {
    const tv = this.stemVolumes[i]
    return tv ? tv.sceneObject.name : "Foundation"
  }

  // Everything restarts together (as at the start). Used when the foundation slipped or a stem keeps failing.
  private restartEverything(): void {
    this.phase = Phase.Stopped // set first so the finish callback is ignored
    this.stopAll()
    this.silence(true)
    this.calibrate()
  }

  private checkSync(): void {
    const clock = this.stems[0]
    const pos = clock.position
    if (pos > clock.duration - 1.5) return // about to loop anyway
    const tol = this.cfg.driftTolerance
    let ahead = 0
    let behind = 0
    let measured = 0
    const off: number[] = [0]
    for (let i = 1; i < this.stems.length; i++) {
      off[i] = this.stems[i].position - pos // + = stem is ahead of the foundation, - = behind
      if (this.fix[i] !== Fix.Idle) continue
      measured++
      if (off[i] > tol) ahead++
      else if (off[i] < -tol) behind++
    }
    if (this.cfg.syncLog) {
      const parts: string[] = []
      for (let i = 1; i < this.stems.length; i++) {
        const v = this.stemVolumes[i].currentVolume
        parts.push(this.shortName(i) + " " + (off[i] >= 0 ? "+" : "") + (off[i] * 1000).toFixed(0) + "ms (vol " + v.toFixed(2) + ")")
      }
      console.log("[MusicSync] sync check @" + pos.toFixed(2) + "s vs foundation: " + parts.join(", "))
    }
    // most stems off the same way: the foundation is the odd one out, so restart everything together once
    const most = Math.max(2, Math.ceil(this.cfg.syncOddOneOutFraction * measured))
    if (Math.max(ahead, behind) >= most) {
      console.warn("[MusicSync] " + Math.max(ahead, behind) + " of " + measured + " stems are off the same way: restarting all together")
      this.restartEverything()
      return
    }
    for (let i = 1; i < this.stems.length; i++) {
      if (this.fix[i] === Fix.Idle && Math.abs(off[i]) > tol) this.beginFix(i, off[i])
    }
  }

  // ---- fixing one stem ----------------------------------------------------------
  private beginFix(i: number, offset: number): void {
    console.warn("[MusicSync] " + this.shortName(i) + " is " + (offset * 1000).toFixed(0) + " ms from the foundation: restarting that stem")
    this.fix[i] = Fix.Fading
    this.fixTime[i] = getTime()
    this.stemVolumes[i].silenced = true // glides to 0 with the normal volume smoothing
  }

  // TEST helper: one deliberate knock on the Chimes stem (or the last toy stem if there is no Chimes)
  private knockForTest(): void {
    this.cfg.syncTestKnock = false
    let i = this.stems.length - 1
    for (let j = 1; j < this.stems.length; j++) if (this.shortName(j).indexOf("Chimes") >= 0) i = j
    const ms = this.cfg.syncTestKnockMs
    this.stems[i].position = this.stems[i].position + ms / 1000
    console.log("[MusicSync] TEST: knocked " + this.shortName(i) + " by " + ms + " ms")
  }

  private updateFixes(now: number): void {
    if (this.cfg.syncTestKnock) this.knockForTest()
    for (let i = 1; i < this.stems.length; i++) {
      if (this.fix[i] === Fix.Fading) {
        const quiet = this.stemVolumes[i].currentVolume < 0.005
        if (quiet || now - this.fixTime[i] >= this.cfg.syncFadeSeconds) this.restartStem(i, now)
      } else if (this.fix[i] === Fix.Verifying && now - this.fixTime[i] >= VERIFY_DELAY) {
        this.verifyStem(i, now)
      }
    }
  }

  private restartStem(i: number, now: number): void {
    const s = this.stems[i]
    const clock = this.stems[0]
    s.stop(false)
    // the same pre-seek that works at the start: seek ahead by the delay play() will cost
    s.position = Math.max(0, Math.min(clock.duration - 0.5, clock.position + this.lead[i]))
    s.play(1)
    this.stemVolumes[i].silenced = false // fades back up
    this.fix[i] = Fix.Verifying
    this.fixTime[i] = now
  }

  // Measure the stem again after its restart; learn the lead from what was left over.
  private verifyStem(i: number, now: number): void {
    const off = this.stems[i].position - this.stems[0].position
    this.lead[i] = Math.max(-0.2, Math.min(0.5, this.lead[i] - off))
    // after a restart, aim for half the tolerance: a stem that lands just inside it would stay that far off
    if (Math.abs(off) <= this.cfg.driftTolerance * 0.5) {
      this.fix[i] = Fix.Idle
      this.fixTries[i] = 0
      console.log("[MusicSync] " + this.shortName(i) + " back in sync (" + (off * 1000).toFixed(0) + " ms), lead now " + (this.lead[i] * 1000).toFixed(0) + " ms")
      return
    }
    this.fixTries[i]++
    if (this.fixTries[i] >= this.cfg.syncMaxFixTries) {
      console.warn("[MusicSync] " + this.shortName(i) + " would not stay in sync after " + this.fixTries[i] + " tries: restarting all together")
      this.restartEverything()
      return
    }
    console.warn("[MusicSync] " + this.shortName(i) + " still " + (off * 1000).toFixed(0) + " ms off; trying again with lead " + (this.lead[i] * 1000).toFixed(0) + " ms")
    this.beginFix(i, off)
  }
}
