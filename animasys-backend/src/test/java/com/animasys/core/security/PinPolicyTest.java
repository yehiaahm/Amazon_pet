package com.animasys.core.security;

import com.animasys.core.exception.BusinessRuleException;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

class PinPolicyTest {

    @ParameterizedTest
    @ValueSource(strings = {"1234", "0123", "0000", "9876"})
    void acceptsFourDigits(String pin) {
        assertThat(PinPolicy.isValid(pin)).isTrue();
        assertThatCode(() -> PinPolicy.validate(pin)).doesNotThrowAnyException();
    }

    /**
     * The policy used to be exactly four digits for every role, OWNER included — a
     * 10,000-value keyspace in front of the account that can factory-reset the shop, which no
     * amount of throttling makes genuinely hard. Longer PINs are now allowed so a privileged
     * account can be given a credential worth guessing at; four is still valid, so nothing
     * already in use was invalidated.
     */
    @ParameterizedTest
    @ValueSource(strings = {"12345", "123456", "12345678", "1234567890"})
    void acceptsLongerNumericPins(String pin) {
        assertThat(PinPolicy.isValid(pin)).isTrue();
        assertThatCode(() -> PinPolicy.validate(pin)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"123", "12345678901", "20-26", "abcd", "12a4", "12 4"})
    void rejectsAnythingOutsideTheAllowedNumericRange(String pin) {
        assertThat(PinPolicy.isValid(pin)).isFalse();
        assertThatThrownBy(() -> PinPolicy.validate(pin)).isInstanceOf(BusinessRuleException.class);
    }

    @Test
    void agreesWithItsOwnBounds() {
        assertThat(PinPolicy.isValid("1".repeat(PinPolicy.MIN_LENGTH))).isTrue();
        assertThat(PinPolicy.isValid("1".repeat(PinPolicy.MAX_LENGTH))).isTrue();
        assertThat(PinPolicy.isValid("1".repeat(PinPolicy.MIN_LENGTH - 1))).isFalse();
        assertThat(PinPolicy.isValid("1".repeat(PinPolicy.MAX_LENGTH + 1))).isFalse();
    }

    @Test
    void rejectsEmptyAndNull() {
        assertThat(PinPolicy.isValid("")).isFalse();
        assertThat(PinPolicy.isValid(null)).isFalse();
        assertThatThrownBy(() -> PinPolicy.validate("")).isInstanceOf(BusinessRuleException.class);
        assertThatThrownBy(() -> PinPolicy.validate(null)).isInstanceOf(BusinessRuleException.class);
    }

    @Test
    void leadingZeroIsPreservedAsAString() {
        // "0123" must stay "0123", not collapse to "123" via any numeric conversion.
        assertThat(PinPolicy.isValid("0123")).isTrue();
        assertThat(PinPolicy.isValid("123")).isFalse();
    }
}
