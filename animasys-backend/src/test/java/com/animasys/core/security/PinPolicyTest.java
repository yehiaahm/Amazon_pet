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
    void acceptsExactlyFourDigits(String pin) {
        assertThat(PinPolicy.isValid(pin)).isTrue();
        assertThatCode(() -> PinPolicy.validate(pin)).doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"123", "12345", "20-26", "abcd", "12a4", "12 4", "123456"})
    void rejectsAnythingThatIsNotExactlyFourDigits(String pin) {
        assertThat(PinPolicy.isValid(pin)).isFalse();
        assertThatThrownBy(() -> PinPolicy.validate(pin)).isInstanceOf(BusinessRuleException.class);
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
