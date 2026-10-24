import { describe, it, expect } from 'vitest';
import { isValidPin, MAX_PIN_LENGTH, MIN_PIN_LENGTH } from '../pinPolicy';

describe('pinPolicy', () => {
  it.each(['1234', '0123', '0000', '9876'])('accepts four digits (%s)', (pin) => {
    expect(isValidPin(pin)).toBe(true);
  });

  // The policy used to be exactly four digits for every role, OWNER included. Longer PINs
  // are now accepted so a privileged account can have a credential worth more than 10,000
  // guesses; four still works, so no existing PIN is invalidated.
  it.each(['12345', '123456', '12345678', '1234567890'])(
    'accepts a longer numeric PIN (%s)',
    (pin) => {
      expect(isValidPin(pin)).toBe(true);
    }
  );

  it.each(['123', '20-26', 'abcd', '12a4', '12 4', '', '12345678901'])(
    'rejects anything outside the allowed numeric range (%s)',
    (pin) => {
      expect(isValidPin(pin)).toBe(false);
    }
  );

  it('keeps a leading zero as part of the string', () => {
    expect(isValidPin('0123')).toBe(true);
    expect(isValidPin('123')).toBe(false);
  });

  it('agrees with its own bounds', () => {
    expect(isValidPin('1'.repeat(MIN_PIN_LENGTH))).toBe(true);
    expect(isValidPin('1'.repeat(MAX_PIN_LENGTH))).toBe(true);
    expect(isValidPin('1'.repeat(MIN_PIN_LENGTH - 1))).toBe(false);
    expect(isValidPin('1'.repeat(MAX_PIN_LENGTH + 1))).toBe(false);
  });
});
