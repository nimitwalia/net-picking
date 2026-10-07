import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSchedule, mulberry32, validMatchCounts } from './index';

// While a generator and clock are injected, the scheduler must never touch the global
// Math.random or Date.now (that would make seeded runs non-reproducible).
describe('scheduler does not leak to global Math.random / Date.now', { timeout: 120000 }, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('N = 4..20, several valid m each', () => {
    const origRandom = Math.random;
    const origNow = Date.now;
    let leaks = 0;
    try {
      Math.random = () => {
        leaks++;
        throw new Error('global Math.random used');
      };
      Date.now = () => {
        leaks++;
        throw new Error('global Date.now used');
      };
      for (let N = 4; N <= 20; N++) {
        const ms = validMatchCounts(N);
        const picks = [...new Set([ms[0]!, ms[Math.floor(ms.length / 2)]!, ms[ms.length - 1]!])].filter(
          (m) => m <= 4 || N <= 8,
        );
        for (const m of picks) {
          let t = 0;
          const s = buildSchedule(N, m, 5, { random: mulberry32(N * 100 + m), now: () => t++ });
          expect(s, `N=${N} m=${m}`).not.toBeNull();
          expect(s!.matches).toHaveLength((N * m) / 4);
        }
      }
    } finally {
      Math.random = origRandom;
      Date.now = origNow;
    }
    expect(leaks).toBe(0);
  });
});
