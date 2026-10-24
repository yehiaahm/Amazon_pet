package com.animasys.core.security;

import com.animasys.core.exception.RateLimitExceededException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The throttle itself, plus the memory bound added to it.
 *
 * Nothing used to remove an entry except a successful login, so the map grew once per distinct
 * key that ever failed — and the key is caller-influenced (client IP, or the first hop of
 * X-Forwarded-For when trust-proxy-headers is on, which a caller sets freely). A long run of
 * failures with a fresh spoofed header each time was an unbounded leak in a process meant to
 * stay up for months.
 */
class LoginRateLimiterTest {

    @Test
    void allowsAttemptsUpToTheLimitThenBlocks() {
        LoginRateLimiter limiter = new LoginRateLimiter();

        for (int i = 0; i < 10; i++) {
            assertThatCode(() -> limiter.checkAllowed("10.0.0.1")).doesNotThrowAnyException();
            limiter.recordFailure("10.0.0.1");
        }

        assertThatThrownBy(() -> limiter.checkAllowed("10.0.0.1"))
                .isInstanceOf(RateLimitExceededException.class);
    }

    @Test
    void aSuccessfulLoginClearsTheCounter() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 10; i++) {
            limiter.recordFailure("10.0.0.2");
        }
        assertThatThrownBy(() -> limiter.checkAllowed("10.0.0.2"))
                .isInstanceOf(RateLimitExceededException.class);

        limiter.recordSuccess("10.0.0.2");

        assertThatCode(() -> limiter.checkAllowed("10.0.0.2")).doesNotThrowAnyException();
    }

    @Test
    void throttlesEachKeyIndependently() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 10; i++) {
            limiter.recordFailure("10.0.0.3");
        }

        assertThatThrownBy(() -> limiter.checkAllowed("10.0.0.3"))
                .isInstanceOf(RateLimitExceededException.class);
        assertThatCode(() -> limiter.checkAllowed("10.0.0.4")).doesNotThrowAnyException();
    }

    /** The leak: far more distinct keys than the cap must not all be retained. */
    @Test
    void stopsGrowingOnceTheKeyCeilingIsReached() {
        LoginRateLimiter limiter = new LoginRateLimiter();

        for (int i = 0; i < 25_000; i++) {
            limiter.recordFailure("spoofed-" + i);
        }

        assertThat(limiter.trackedKeyCount()).isLessThanOrEqualTo(10_000);
    }

    /**
     * Evicting to stay inside the cap must not hand an attacker a clean slate: the key being
     * hammered right now is the newest, and eviction drops the stalest entries first.
     */
    @Test
    void keepsThrottlingTheMostRecentKeyAcrossAnEviction() {
        LoginRateLimiter limiter = new LoginRateLimiter();
        for (int i = 0; i < 15_000; i++) {
            limiter.recordFailure("filler-" + i);
        }

        for (int i = 0; i < 10; i++) {
            limiter.recordFailure("attacker");
        }

        assertThatThrownBy(() -> limiter.checkAllowed("attacker"))
                .isInstanceOf(RateLimitExceededException.class);
    }
}
