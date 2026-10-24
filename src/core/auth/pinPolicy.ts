/**
 * Single source of truth for the employee login PIN shape — mirrors
 * animasys-backend PinPolicy.java, and must stay in step with it: this side decides what the
 * Employees screen will submit, the backend decides what it will store, and a mismatch either
 * rejects a PIN the server would have taken or creates one the keypad cannot enter again.
 *
 * Was exactly four digits for every role, OWNER included — a 10,000-value keypad protecting
 * the account that can factory-reset the shop. The range now starts at four so every PIN
 * already in use stays valid, and allows up to ten so a privileged account can be given a
 * credential that is not trivially enumerable. Login.tsx accepts the same range.
 */
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 10;

export const PIN_REGEX = new RegExp(`^[0-9]{${MIN_PIN_LENGTH},${MAX_PIN_LENGTH}}$`);

export function isValidPin(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export const PIN_POLICY_MESSAGE =
  `يجب أن يتكون رمز الدخول السري (PIN) من ${MIN_PIN_LENGTH} إلى ${MAX_PIN_LENGTH} أرقام (0-9)، بدون حروف أو رموز أو مسافات`;
