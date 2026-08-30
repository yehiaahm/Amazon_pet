package com.animasys.core.security;

import com.animasys.core.exception.RateLimitExceededException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LoginRateLimiterTest {

    @Test
    void allowsUpToTheThresholdThenBlocks() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        String key = "203.0.113.10";

        for (int i = 0; i < 10; i++) {
            assertDoesNotThrow(() -> limiter.checkAllowed(key), "attempt " + i + " should still be allowed");
            limiter.recordFailure(key);
        }

        assertThrows(RateLimitExceededException.class, () -> limiter.checkAllowed(key),
                "the 11th attempt after 10 recorded failures must be blocked");
    }

    @Test
    void successResetsTheCounter() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        String key = "203.0.113.20";

        for (int i = 0; i < 9; i++) {
            limiter.recordFailure(key);
        }
        assertDoesNotThrow(() -> limiter.checkAllowed(key));

        limiter.recordSuccess(key);

        // A successful login clears the count; the caller should not be blocked
        // even though 9 failures happened right before it.
        assertDoesNotThrow(() -> limiter.checkAllowed(key));
        limiter.recordFailure(key);
        assertDoesNotThrow(() -> limiter.checkAllowed(key), "counter must have been reset by the earlier success");
    }

    @Test
    void differentKeysAreTrackedIndependently() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        String attackerKey = "203.0.113.30";
        String legitimateKey = "203.0.113.40";

        for (int i = 0; i < 10; i++) {
            limiter.recordFailure(attackerKey);
        }

        assertThrows(RateLimitExceededException.class, () -> limiter.checkAllowed(attackerKey));
        assertDoesNotThrow(() -> limiter.checkAllowed(legitimateKey),
                "a different client (e.g. a different cashier terminal) must not be penalized");
    }
}
