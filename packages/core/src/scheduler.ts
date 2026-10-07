import fs from 'node:fs';
/* Scheduler, ported from index.html (SCHED_START..SCHED_END). Behaviour preserved. */

import type { RandomFn, SchedulerDeps } from './random';
export type Pair = [number, number];
export interface Match {
  t1: Pair;
  t2: Pair;
}
export interface ScheduleStats {
  partnerRepeats: number;
  oppRepeats: number;
  backToBack: number;
  cost: number;
}
export interface Schedule {
  matches: Match[];
  stats: ScheduleStats;
}
type Four = [number, number, number, number];
type Split = [Pair, Pair];

export function shuffle<T>(a: readonly T[], random: RandomFn = Math.random): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [r[i], r[j]] = [r[j] as T, r[i] as T];
  }
  return r;
}

/** Order-independent key for a pair of player indexes. */
export function pk(a: number, b: number): number {
  return a < b ? a * 1000 + b : b * 1000 + a;
}

export function combosOf(arr: readonly number[], k: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  (function rec(start: number) {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i] as number);
      rec(i + 1);
      cur.pop();
    }
  })(0);
  return out;
}

export function nCk(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

export function candidateCombos(
  pool: readonly number[],
  k: number,
  random: RandomFn = Math.random,
): number[][] {
  if (k === 0) return [[]];
  if (nCk(pool.length, k) <= 500) return combosOf(pool, k);
  const out: number[][] = [];
  for (let i = 0; i < 500; i++) out.push(shuffle(pool, random).slice(0, k));
  return out;
}

export function splitsOf(f: Four): Split[] {
  return [
    [[f[0], f[1]], [f[2], f[3]]],
    [[f[0], f[2]], [f[1], f[3]]],
    [[f[0], f[3]], [f[1], f[2]]],
  ];
}

/** One randomised greedy attempt. Returns null if it paints itself into a corner. */
export function trySchedule(
  N: number,
  m: number,
  total: number,
  random: RandomFn = Math.random,
): Match[] | null {
  const rem: number[] = Array(N).fill(m);
  const last: number[] = Array(N).fill(-10);
  const partner = new Map<number, number>();
  const opp = new Map<number, number>();
  let prev: number[] = [];
  const matches: Match[] = [];
  const get = (mp: Map<number, number>, k: number) => mp.get(k) || 0;
  for (let s = 0; s < total; s++) {
    const slotsLeft = total - s;
    const forced: number[] = [];
    const pool: number[] = [];
    for (let i = 0; i < N; i++) {
      const ri = rem[i] as number;
      if (ri > slotsLeft) return null;
      if (ri === slotsLeft) forced.push(i);
      else if (ri > 0) pool.push(i);
    }
    if (forced.length > 4) return null;
    const need = 4 - forced.length;
    if (pool.length < need) return null;
    let best: Split | null = null;
    let bestCost = Infinity;
    for (const c of candidateCombos(pool, need, random)) {
      const four = forced.concat(c) as Four;
      let base = 0;
      for (const p of four) {
        if (prev.includes(p)) base += 15;
        base -= Math.min(s - (last[p] as number), 4) * 0.8;
        base -= (rem[p] as number) * 0.15;
      }
      for (const sp of splitsOf(four)) {
        const [[a, b], [c1, d]] = sp;
        let sc = base;
        sc += get(partner, pk(a, b)) * 20 + get(partner, pk(c1, d)) * 20;
        for (const x of [a, b]) for (const y of [c1, d]) sc += get(opp, pk(x, y)) * 3;
        sc += random() * 0.7;
        if (sc < bestCost) {
          bestCost = sc;
          best = sp;
        }
      }
    }
    if (!best) return null;
    const [[a, b], [c1, d]] = best;
    matches.push({ t1: [a, b], t2: [c1, d] });
    partner.set(pk(a, b), get(partner, pk(a, b)) + 1);
    partner.set(pk(c1, d), get(partner, pk(c1, d)) + 1);
    for (const x of [a, b]) for (const y of [c1, d]) opp.set(pk(x, y), get(opp, pk(x, y)) + 1);
    for (const p of [a, b, c1, d]) {
      rem[p] = (rem[p] as number) - 1;
      last[p] = s;
    }
    prev = [a, b, c1, d];
  }
  return matches;
}

export function evaluate(matches: readonly Match[]): ScheduleStats {
  const partner = new Map<number, number>();
  const opp = new Map<number, number>();
  let partnerRepeats = 0;
  let oppRepeats = 0;
  let backToBack = 0;
  matches.forEach((m, i) => {
    const [a, b] = m.t1;
    const [c, d] = m.t2;
    for (const k of [pk(a, b), pk(c, d)]) {
      const v = partner.get(k) || 0;
      if (v >= 1) partnerRepeats++;
      partner.set(k, v + 1);
    }
    for (const x of [a, b])
      for (const y of [c, d]) {
        const k = pk(x, y);
        const v = opp.get(k) || 0;
        if (v >= 1) oppRepeats++;
        opp.set(k, v + 1);
      }
    if (i > 0) {
      const pm = matches[i - 1] as Match;
      const pv = [...pm.t1, ...pm.t2];
      for (const p of [a, b, c, d]) if (pv.includes(p)) backToBack++;
    }
  });
  return {
    partnerRepeats,
    oppRepeats,
    backToBack,
    cost: partnerRepeats * 20 + oppRepeats * 3 + backToBack * 15,
  };
}

/** Best of up to 800 random attempts, stopping early at cost 0 or after timeMs (default 1500). */
export function buildSchedule(
  N: number,
  m: number,
  timeMs?: number,
  deps: SchedulerDeps = {},
): Schedule | null {
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;
  const total = (N * m) / 4;
  const t0 = now();
  let best: Match[] | null = null;
  let bestEval: ScheduleStats | null = null;
  for (let att = 0; att < 800; att++) {
    const r = trySchedule(N, m, total, random);
    if (r) {
      const ev = evaluate(r);
      if (!best || !bestEval || ev.cost < bestEval.cost) {
        best = r;
        bestEval = ev;
      }
      if (ev.cost === 0) break;
    }
    if (now() - t0 > (timeMs || 1500) && best) break;
  }
  return best && bestEval ? { matches: best, stats: bestEval } : null;
}

/** Matches-per-player values m where N*m is divisible by 4 and m <= N-1. */
export function validMatchCounts(N: number): number[] {
  const out: number[] = [];
  for (let m = 1; m <= N - 1; m++) if ((N * m) % 4 === 0) out.push(m);
  return out;
}
