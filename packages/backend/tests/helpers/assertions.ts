import { expect } from 'vitest';

export const DEFAULT_EPSILON = 0.01;

export function expectAmountsClose(accounted: number, expected: number, epsilon: number = DEFAULT_EPSILON): void {
  expect(Math.abs(accounted - expected)).toBeLessThan(epsilon);
}

export function expectAmountsNotClose(accounted: number, expected: number, epsilon: number = DEFAULT_EPSILON): void {
  expect(Math.abs(accounted - expected)).toBeGreaterThan(epsilon);
} 