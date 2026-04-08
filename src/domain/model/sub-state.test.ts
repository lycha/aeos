import { describe, it, expect } from 'vitest';
import { SubState, isValidSubState } from './sub-state.js';
import type { SubStateOrNull } from './sub-state.js';

describe('SubState', () => {
  it('SubState.WORKING equals the string "WORKING"', () => {
    expect(SubState.WORKING).toBe('WORKING');
  });

  it('all 7 sub-state values are distinct strings', () => {
    const values = Object.values(SubState);
    expect(values).toHaveLength(7);
    expect(new Set(values).size).toBe(7);
  });
});

describe('isValidSubState', () => {
  it.each(Object.values(SubState))('returns true for valid sub-state "%s"', (ss) => {
    expect(isValidSubState(ss)).toBe(true);
  });

  it('returns true for "WORKING" and narrows the type', () => {
    const value: string = 'WORKING';
    if (isValidSubState(value)) {
      // If this compiles, the type guard narrows correctly
      const _narrowed: SubState = value;
      expect(_narrowed).toBe('WORKING');
    } else {
      expect.unreachable('isValidSubState should return true for WORKING');
    }
  });

  it('returns false for an invalid string', () => {
    expect(isValidSubState('NOT_A_STATE')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidSubState('')).toBe(false);
  });

  it('returns false for lowercase variant', () => {
    expect(isValidSubState('blocked')).toBe(false);
  });
});

describe('SubStateOrNull', () => {
  it('accepts null as a valid value', () => {
    const value: SubStateOrNull = null;
    expect(value).toBeNull();
  });

  it('accepts a valid SubState as a value', () => {
    const value: SubStateOrNull = SubState.BLOCKED;
    expect(value).toBe('BLOCKED');
  });
});
