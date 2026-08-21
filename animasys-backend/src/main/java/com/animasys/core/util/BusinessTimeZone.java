package com.animasys.core.util;

import java.time.ZoneId;

/**
 * Single source of truth for "what day is it" across the backend. Every
 * report/query that buckets records by calendar day must use this instead of
 * {@link ZoneId#systemDefault()} — the JVM's default zone depends on the host
 * machine (Cairo on a dev PC today, but UTC by default in the Docker image
 * this project ships), so relying on it silently shifts day boundaries by a
 * few hours the moment the backend runs somewhere else, splitting late-night
 * sales onto the wrong day in one report but not another.
 */
public final class BusinessTimeZone {

    public static final ZoneId ZONE = ZoneId.of("Africa/Cairo");

    private BusinessTimeZone() {
    }
}
