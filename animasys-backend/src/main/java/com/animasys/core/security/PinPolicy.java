package com.animasys.core.security;

import com.animasys.core.exception.BusinessRuleException;

import java.util.regex.Pattern;

/**
 * Single source of truth for the employee login PIN shape.
 *
 * Every employee (OWNER, MANAGER, CASHIER, GROOMER) authenticates through the same
 * numeric keypad in Login.tsx, which can only ever produce a 4-digit string. Any write
 * path (create employee, change password, PIN reset) must reject anything that keypad
 * could not later submit — otherwise the account is locked out of its own login screen.
 */
public final class PinPolicy {

    /** Compile-time constant so it can be reused in jakarta.validation @Pattern annotations. */
    public static final String PIN_REGEX = "^[0-9]{4}$";

    private static final Pattern PIN_PATTERN = Pattern.compile(PIN_REGEX);

    private PinPolicy() {
    }

    public static boolean isValid(String pin) {
        return pin != null && PIN_PATTERN.matcher(pin).matches();
    }

    /** @throws BusinessRuleException with an Arabic, user-facing message when the PIN is invalid. */
    public static void validate(String pin) {
        if (!isValid(pin)) {
            throw new BusinessRuleException("يجب أن يتكون رمز الدخول السري (PIN) من 4 أرقام بالضبط (0-9)، بدون حروف أو رموز أو مسافات");
        }
    }
}
