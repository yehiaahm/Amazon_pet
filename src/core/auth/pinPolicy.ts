/**
 * Single source of truth for the employee login PIN shape — mirrors
 * animasys-backend PinPolicy.java. Every employee (OWNER, MANAGER, CASHIER,
 * GROOMER) logs in through the same numeric keypad in Login.tsx, which can
 * only ever produce a 4-digit string, so any PIN set here must match what
 * that keypad can submit again.
 */
export const PIN_REGEX = /^[0-9]{4}$/;

export function isValidPin(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export const PIN_POLICY_MESSAGE =
  'يجب أن يتكون رمز الدخول السري (PIN) من 4 أرقام بالضبط (0-9)، بدون حروف أو رموز أو مسافات';
