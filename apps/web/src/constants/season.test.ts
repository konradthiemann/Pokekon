import { describe, it, expect } from 'vitest';
import { ROTATION_DATE, ROTATION_PERIOD, isPostRotation, isPostRotationPeriod } from './season';

describe('season rotation cutoff', () => {
  it('accepts the rotation day itself and everything after', () => {
    expect(isPostRotation(ROTATION_DATE)).toBe(true);
    expect(isPostRotation('2026-03-27')).toBe(true);
    expect(isPostRotation('2026-12-01')).toBe(true);
    expect(isPostRotation(new Date('2026-04-15T12:00:00Z'))).toBe(true);
  });

  it('rejects everything before the rotation', () => {
    expect(isPostRotation('2026-03-25')).toBe(false);
    expect(isPostRotation('2026-01-01')).toBe(false);
    expect(isPostRotation('2025-11-30')).toBe(false);
  });

  it('handles ISO timestamps from the Limitless API', () => {
    expect(isPostRotation('2026-03-25T23:59:00.000Z')).toBe(false);
    expect(isPostRotation('2026-03-26T00:00:00.000Z')).toBe(true);
  });

  it('classifies period labels relative to the rotation week', () => {
    expect(isPostRotationPeriod(ROTATION_PERIOD)).toBe(true);
    expect(isPostRotationPeriod('2026-W15')).toBe(true);
    expect(isPostRotationPeriod('2026-W52')).toBe(true);
    expect(isPostRotationPeriod('2026-W12')).toBe(false);
    expect(isPostRotationPeriod('2025-W50')).toBe(false);
  });
});
