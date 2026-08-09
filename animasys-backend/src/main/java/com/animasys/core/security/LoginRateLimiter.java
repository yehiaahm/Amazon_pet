package com.animasys.core.security;

import com.animasys.core.exception.RateLimitExceededException;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * In-memory brute-force guard for /auth/login and /auth/pin-login.
 * Single-process, fixed-window design matches this app's actual deployment model
 * (one desktop-installed backend per shop) — no distributed store needed.
 */
@Component
public class LoginRateLimiter {

    private static final int MAX_ATTEMPTS = 10;
    private static final long WINDOW_MILLIS = 15 * 60 * 1000L;

    private static final class Attempts {
        final AtomicInteger count = new AtomicInteger(0);
        final long windowStart;

        Attempts(long windowStart) {
            this.windowStart = windowStart;
        }
    }

    private final ConcurrentHashMap<String, Attempts> attemptsByKey = new ConcurrentHashMap<>();

    public void checkAllowed(String key) {
        Attempts a = attemptsByKey.get(key);
        if (a == null) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now - a.windowStart > WINDOW_MILLIS) {
            return;
        }
        if (a.count.get() >= MAX_ATTEMPTS) {
            long remainingMinutes = Math.max(1, (WINDOW_MILLIS - (now - a.windowStart)) / 60_000);
            throw new RateLimitExceededException(
                    "عدد محاولات الدخول تجاوز الحد المسموح. حاول مرة أخرى بعد " + remainingMinutes + " دقيقة."
            );
        }
    }

    public void recordFailure(String key) {
        long now = System.currentTimeMillis();
        attemptsByKey.compute(key, (k, existing) -> {
            Attempts a = (existing == null || now - existing.windowStart > WINDOW_MILLIS)
                    ? new Attempts(now)
                    : existing;
            a.count.incrementAndGet();
            return a;
        });
    }

    public void recordSuccess(String key) {
        attemptsByKey.remove(key);
    }
}
