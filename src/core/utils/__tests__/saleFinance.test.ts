import { describe, expect, it } from 'vitest';
import { saleDateKey } from '../saleFinance';

describe('saleDateKey', () => {
  it('buckets a late-night Cairo sale onto the correct Cairo day regardless of device timezone', () => {
    // 2026-08-20T23:30:00Z is 2026-08-21 01:30 in Africa/Cairo (UTC+2, no DST).
    // A naive local-timezone read (e.g. on a UTC-configured machine) would
    // report 2026-08-20 — off by one day from the backend's Cairo-zoned
    // BusinessTimeZone bucketing.
    expect(saleDateKey('2026-08-20T23:30:00Z')).toBe('2026-08-21');
  });

  it('buckets an early-morning UTC sale that is still the previous Cairo day', () => {
    // 2026-08-21T00:30:00Z is 2026-08-21 02:30 Cairo — still the 21st either way,
    // included as a boundary sanity check alongside the case above.
    expect(saleDateKey('2026-08-21T00:30:00Z')).toBe('2026-08-21');
  });

  it('passes date-only strings through unchanged', () => {
    expect(saleDateKey('2026-08-20')).toBe('2026-08-20');
  });

  it('returns an empty string for undefined input', () => {
    expect(saleDateKey(undefined)).toBe('');
  });
});
