package com.animasys.core.config;

import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Owner PIN recovery for hosted deployments.
 *
 * A fresh install generates random PINs and logs them once (see DatabaseSeeder).
 * On a hosted deployment that log line is easily lost, which locks everybody out
 * of a database that cannot be reached with a SQL client. This is the recovery
 * path: set the environment variable
 *
 *     APP_OWNER_PIN_RESET=2026
 *
 * on the deployment and restart. The owner account's PIN becomes 2026.
 *
 * Two properties make this safe to leave switched on by accident:
 *   - it is a startup-only path, so it adds no HTTP endpoint an attacker can reach;
 *   - each distinct value is applied exactly once, recorded in admin_pin_reset_marker.
 *     A variable forgotten in the environment therefore cannot overwrite a PIN the
 *     owner changed later, no matter how many times the app restarts.
 *
 * To run the same reset again later (e.g. the PIN was changed and forgotten again),
 * append a nonce after a colon — {@code 2026:2}, {@code 2026:sep} — which the marker
 * treats as a new request while the PIN stays 2026.
 *
 * Remove the variable once you are logged in.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class OwnerPinRecoveryService {

    /** Matches the PIN rules enforced by PinLoginRequest. */
    private static final Pattern PIN_PATTERN = Pattern.compile("[0-9]{4,8}");

    private final EmployeeRepository employeeRepository;
    private final PasswordEncoder passwordEncoder;
    private final NamedParameterJdbcTemplate jdbcTemplate;

    @Value("${app.owner-pin-reset:}")
    private String ownerPinReset;

    /** Called at the end of seeding, so the owner account is guaranteed to exist by now. */
    public void applyIfRequested() {
        String request = ownerPinReset == null ? "" : ownerPinReset.trim();
        if (request.isEmpty()) {
            return;
        }

        int separator = request.indexOf(':');
        String pin = separator < 0 ? request : request.substring(0, separator);
        if (!PIN_PATTERN.matcher(pin).matches()) {
            log.error("APP_OWNER_PIN_RESET is set but its PIN part is not 4-8 digits — ignoring it. " +
                    "Expected e.g. '2026' or '2026:<nonce>'.");
            return;
        }

        String tokenHash = sha256Hex("owner-pin-reset|v1|" + request);
        if (alreadyApplied(tokenHash)) {
            log.info("Owner PIN recovery for the current APP_OWNER_PIN_RESET value was already applied — " +
                    "skipping. Remove the variable; to run a new reset, change its value.");
            return;
        }

        Optional<Employee> ownerOpt = findOwner();
        if (ownerOpt.isEmpty()) {
            log.error("APP_OWNER_PIN_RESET is set but no OWNER account exists yet — nothing to reset.");
            return;
        }

        Employee owner = ownerOpt.get();
        owner.setPasswordHash(passwordEncoder.encode(pin));
        if (!owner.isActive()) {
            // A deactivated owner cannot log in, so a PIN alone would not end the lockout.
            owner.setActive(true);
            log.warn("Owner account '{}' was inactive — reactivated as part of the PIN recovery.",
                    owner.getUsername());
        }
        employeeRepository.save(owner);
        recordApplied(tokenHash);

        log.warn("Owner PIN recovery applied to account '{}' from APP_OWNER_PIN_RESET. " +
                        "Log in now and remove the variable from the deployment environment.",
                owner.getUsername());
    }

    private Optional<Employee> findOwner() {
        Optional<Employee> byUsername = employeeRepository.findByUsername(DatabaseSeeder.DEFAULT_OWNER_USERNAME);
        if (byUsername.isPresent()) {
            return byUsername;
        }
        Optional<Employee> byId = employeeRepository.findByIdWithTenant("e-1");
        if (byId.isPresent() && "OWNER".equals(byId.get().getRole())) {
            return byId;
        }
        return employeeRepository.findAll().stream()
                .filter(e -> "OWNER".equals(e.getRole()))
                .findFirst();
    }

    private boolean alreadyApplied(String tokenHash) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM admin_pin_reset_marker WHERE token_hash = :tokenHash",
                new MapSqlParameterSource("tokenHash", tokenHash),
                Integer.class);
        return count != null && count > 0;
    }

    private void recordApplied(String tokenHash) {
        jdbcTemplate.update(
                "INSERT INTO admin_pin_reset_marker (token_hash, applied_at) VALUES (:tokenHash, :appliedAt)",
                new MapSqlParameterSource()
                        .addValue("tokenHash", tokenHash)
                        .addValue("appliedAt", Timestamp.from(Instant.now())));
    }

    private static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required but unavailable", e);
        }
    }
}
