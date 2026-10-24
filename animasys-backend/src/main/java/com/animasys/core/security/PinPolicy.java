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

    public static final int MIN_LENGTH = 4;
    public static final int MAX_LENGTH = 10;

    /**
     * Compile-time constant so it can be reused in jakarta.validation @Pattern annotations.
     *
     * Was {@code ^[0-9]{4}$}: exactly four digits, for every role including OWNER. That is a
     * 10,000-value keyspace protecting the account that can factory-reset the shop, and no
     * amount of throttling makes a space that small genuinely hard — the structural answer is
     * to allow a longer credential. The range starts at 4 so every PIN already in use stays
     * valid and nobody is locked out by an upgrade; an owner who wants 8 digits can now set
     * one, and {@code Login.tsx} accepts up to {@link #MAX_LENGTH}.
     */
    public static final String PIN_REGEX = "^[0-9]{" + MIN_LENGTH + "," + MAX_LENGTH + "}$";

    private static final Pattern PIN_PATTERN = Pattern.compile(PIN_REGEX);

    private PinPolicy() {
    }

    public static boolean isValid(String pin) {
        return pin != null && PIN_PATTERN.matcher(pin).matches();
    }

    /** @throws BusinessRuleException with an Arabic, user-facing message when the PIN is invalid. */
    public static void validate(String pin) {
        if (!isValid(pin)) {
            throw new BusinessRuleException("يجب أن يتكون رمز الدخول السري (PIN) من " + MIN_LENGTH + " إلى "
                    + MAX_LENGTH + " أرقام (0-9)، بدون حروف أو رموز أو مسافات");
        }
    }
}
