package com.animasys.core.security;

import com.animasys.core.exception.RateLimitExceededException;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.Map;
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

    /**
     * Hard ceiling on tracked keys. Nothing ever removed an entry except a successful login,
     * so the map grew without bound for every distinct key that ever failed — and the keys are
     * caller-influenced: a client IP normally, or the first hop of X-Forwarded-For when
     * app.security.trust-proxy-headers is on, which a caller sets freely. A long run of failed
     * logins with a fresh spoofed header each time was therefore an unbounded memory leak in a
     * process that is meant to stay up for months on a shop PC.
     *
     * One shop never has thousands of genuine client addresses, so reaching this means
     * something abnormal is happening and dropping the stalest buckets is the right answer.
     */
    private static final int MAX_TRACKED_KEYS = 10_000;

    /** How much of the map to clear when pruning expired entries is not enough on its own. */
    private static final double OVERFLOW_EVICTION_SHARE = 0.1;

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
        if (attemptsByKey.size() >= MAX_TRACKED_KEYS && !attemptsByKey.containsKey(key)) {
            evictToMakeRoom(now);
        }
        attemptsByKey.compute(key, (k, existing) -> {
            Attempts a = (existing == null || now - existing.windowStart > WINDOW_MILLIS)
                    ? new Attempts(now)
                    : existing;
            a.count.incrementAndGet();
            return a;
        });
    }

    /**
     * Expired buckets first, since those no longer throttle anything. If every bucket is still
     * inside its window, drop the ones closest to expiring: keeping the newest preserves the
     * throttle on whoever is attacking right now, which is the point of the limiter.
     */
    private void evictToMakeRoom(long now) {
        attemptsByKey.values().removeIf(a -> now - a.windowStart > WINDOW_MILLIS);
        if (attemptsByKey.size() < MAX_TRACKED_KEYS) {
            return;
        }
        int toDrop = (int) Math.max(1, MAX_TRACKED_KEYS * OVERFLOW_EVICTION_SHARE);
        attemptsByKey.entrySet().stream()
                .sorted(Comparator.comparingLong(e -> e.getValue().windowStart))
                .limit(toDrop)
                .map(Map.Entry::getKey)
                .toList()
                .forEach(attemptsByKey::remove);
    }

    /** Visible for tests: how many keys are currently being tracked. */
    int trackedKeyCount() {
        return attemptsByKey.size();
    }

    public void recordSuccess(String key) {
        attemptsByKey.remove(key);
    }
}
