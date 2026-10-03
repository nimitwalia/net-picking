import { expect, it } from 'vitest';
import { validMatchCounts } from './index';

it('vitest runs', () => {
  expect(validMatchCounts(5)).toEqual([4]);
});
