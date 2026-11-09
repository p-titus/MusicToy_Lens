// ToyMotionMath - the small maths behind the music motion. Plain classes, not components: nothing to hook up.
// OnsetDetector: spots the start of a hit (a note, a beat) in a stem's loudness, instead of following the loudness itself.
// Spring: a damped spring that a hit kicks. Only slightly underdamped, it overshoots a little and settles, like jelly.
// Used by ToyAudioReact. All numbers come from the toy's ToyShape > Feel (and its Class).

const AVG_SECONDS = 0.35 // seconds: the slow average a hit has to rise above
const REFRACTORY_SECONDS = 0.1 // seconds: no second hit this soon after one

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export class OnsetDetector {
  private avg: number = 0
  private lastHit: number = -10

  // `level` is the stem's loudness, 0..1 (auto-levelled). `sensitivity` is 0..1 (higher = reacts to quieter hits).
  // Returns 0 normally, or the strength (0.3..1) on the frame a new hit starts.
  // `spacing` (seconds) is the shortest gap between two hits; 0 or less uses the built-in 0.1 s.
  update(level: number, now: number, dt: number, sensitivity: number, spacing: number = 0): number {
    const rise = level - this.avg
    this.avg += (level - this.avg) * (1 - Math.exp(-dt / AVG_SECONDS))
    const threshold = 0.3 - 0.26 * clamp(sensitivity, 0, 1) // the rise (0..1) a hit needs: 0.3 down to 0.04
    if (rise > threshold && now - this.lastHit > (spacing > 0 ? spacing : REFRACTORY_SECONDS)) {
      this.lastHit = now
      return clamp(rise / 0.5, 0.3, 1)
    }
    return 0
  }

  reset(): void {
    this.avg = 0
    this.lastHit = -10
  }
}

// Peak position reached by a hit of strength 1 is about 1 (the spring's own units), see KICK_IMPULSE.
const KICK_IMPULSE = 2.2 // x the spring's angular speed: gives a peak near 1 for damping around 0.7

export class Spring {
  x: number = 0 // position (the spring's own units; 1 = a full-strength hit's peak)
  v: number = 0 // velocity

  // A hit: a sudden push of `strength` (0..1). The spring then swings out, overshoots a little, and settles.
  kick(strength: number, hz: number): void {
    this.v += strength * KICK_IMPULSE * 2 * Math.PI * Math.max(0.1, hz)
  }

  // Pulled toward `target`. hz = natural speed (Hz), zeta = damping (below 1 = a little overshoot).
  // Small steps keep it stable at any frame rate. The position is kept inside [lo, hi].
  step(dt: number, hz: number, zeta: number, target: number, lo: number, hi: number): void {
    const w = 2 * Math.PI * Math.max(0.1, hz)
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / steps
    for (let i = 0; i < steps; i++) {
      this.v += (w * w * (target - this.x) - 2 * zeta * w * this.v) * h
      this.x += this.v * h
    }
    if (this.x < lo) {
      this.x = lo
      this.v = Math.max(0, this.v)
    } else if (this.x > hi) {
      this.x = hi
      this.v = Math.min(0, this.v)
    }
  }

  reset(): void {
    this.x = 0
    this.v = 0
  }
}
