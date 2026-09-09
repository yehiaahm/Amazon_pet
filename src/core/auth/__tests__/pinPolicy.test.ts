import { describe, it, expect } from 'vitest';
import { isValidPin } from '../pinPolicy';

describe('pinPolicy', () => {
  it.each(['1234', '0123', '0000', '9876'])('accepts exactly four digits (%s)', (pin) => {
    expect(isValidPin(pin)).toBe(true);
  });

  it.each(['123', '12345', '20-26', 'abcd', '12a4', '12 4', '', '123456'])(
    'rejects anything that is not exactly four digits (%s)',
    (pin) => {
      expect(isValidPin(pin)).toBe(false);
    }
  );

  it('keeps a leading zero as part of the string', () => {
    expect(isValidPin('0123')).toBe(true);
    expect(isValidPin('123')).toBe(false);
  });
});
