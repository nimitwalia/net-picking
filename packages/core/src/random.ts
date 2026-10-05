/** Returns a float in [0, 1), like Math.random. */
export type RandomFn = () => number;
/** Returns milliseconds, like Date.now. */
export type ClockFn = () => number;

export interface SchedulerDeps {
  /** Defaults to Math.random. */
  random?: RandomFn;
  /** Defaults to Date.now. */
  now?: ClockFn;
}

/** Small deterministic seeded PRNG (mulberry32). Same seed gives the same sequence. */
export function mulberry32(seed: number): RandomFn {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
