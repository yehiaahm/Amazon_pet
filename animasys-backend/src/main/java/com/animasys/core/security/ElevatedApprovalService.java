package com.animasys.core.security;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * Single entry point for the "a manager has to approve this" overrides — selling below
 * the price floor, and a cashier refunding a sale.
 *
 * The approval credential is the manager's own login PIN, which {@link PinPolicy} caps
 * at four digits: a 10,000-value keyspace. This check used to live inline in both
 * SaleController and SaleService as two near-identical copies that called
 * AuthenticationManager directly with no throttling, while {@link LoginRateLimiter} was
 * wired into /auth/login and /auth/pin-login only. An authenticated cashier could
 * therefore walk the entire keyspace through POST /v1/sales or POST /v1/sales/{id}/refund
 * and recover an OWNER PIN, with no username needed (a blank managerUsername resolves to
 * the first approver in the tenant). Routing both call sites through here puts every
 * attempt under one counter.
 */
@Component
@RequiredArgsConstructor
public class ElevatedApprovalService {

    private static final Set<String> APPROVER_ROLES = Set.of("OWNER", "MANAGER");

    /**
     * Deliberately the same message for "wrong PIN" and "that PIN is not a manager's".
     * A distinct second message would confirm to the cashier that a guessed PIN is valid
     * for <em>some</em> account, which turns this into an oracle for their colleagues'
     * PINs as well as the manager's.
     */
    private static final String REJECTED_MESSAGE = "رمز المدير غير صحيح.";

    private final AuthenticationManager authenticationManager;
    private final EmployeeRepository employeeRepository;
    private final LoginRateLimiter rateLimiter;

    /**
     * @param missingPinMessage shown when no PIN was supplied at all — the caller's own
     *                          wording, since this is a normal prompt rather than a
     *                          rejected attempt.
     * @throws com.animasys.core.exception.RateLimitExceededException once the approver's
     *                          attempt budget for the current window is spent (HTTP 429).
     */
    public void require(String managerUsername, String managerPassword, String tenantId, String missingPinMessage) {
        if (managerPassword == null || managerPassword.isBlank()) {
            throw new BusinessRuleException(missingPinMessage);
        }

        Employee approver = resolveApprover(managerUsername, tenantId)
                // An unknown or non-approver username is rejected before a counter exists
                // for it, so a caller cannot grow the rate-limiter map by inventing names.
                .orElseThrow(() -> new BusinessRuleException(REJECTED_MESSAGE));

        // Keyed on the account whose PIN is being guessed rather than the caller's IP:
        // the attacker here is an already-authenticated cashier sharing the shop's
        // address, and the asset to protect is the manager account. A correct PIN clears
        // the counter, so ordinary mistyping never locks a shift out of approvals.
        String rateLimitKey = "elevated-approval:" + tenantId + ":" + approver.getId();
        rateLimiter.checkAllowed(rateLimitKey);

        Authentication auth;
        try {
            auth = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(approver.getUsername(), managerPassword));
        } catch (Exception ex) {
            // Also covers a deactivated approver: DaoAuthenticationProvider checks
            // UserPrincipal.isEnabled(), which reads Employee.active.
            rateLimiter.recordFailure(rateLimitKey);
            throw new BusinessRuleException(REJECTED_MESSAGE);
        }

        if (!isApprover(auth)) {
            rateLimiter.recordFailure(rateLimitKey);
            throw new BusinessRuleException(REJECTED_MESSAGE);
        }

        rateLimiter.recordSuccess(rateLimitKey);
    }

    /** Re-checks the role off the authenticated principal, not just the pre-auth lookup. */
    private boolean isApprover(Authentication auth) {
        if (!(auth.getPrincipal() instanceof UserPrincipal principal) || principal.getEmployee() == null) {
            return false;
        }
        return isApproverRole(principal.getEmployee().getRole());
    }

    private static boolean isApproverRole(String role) {
        return role != null && APPROVER_ROLES.contains(role.trim().toUpperCase(Locale.ROOT));
    }

    /**
     * A blank username means "whoever is on duty" — the desktop shop flow, where the
     * cashier hands the device over and the manager just types their PIN.
     */
    private Optional<Employee> resolveApprover(String managerUsername, String tenantId) {
        List<Employee> approvers = employeeRepository.findByTenantId(tenantId).stream()
                .filter(e -> isApproverRole(e.getRole()))
                .toList();
        if (approvers.isEmpty()) {
            throw new BusinessRuleException("لا يوجد مدير متاح في النظام لطلب الموافقة.");
        }
        if (managerUsername == null || managerUsername.isBlank()) {
            return approvers.stream().findFirst();
        }
        String wanted = managerUsername.trim();
        return approvers.stream()
                .filter(e -> wanted.equalsIgnoreCase(e.getUsername()))
                .findFirst();
    }
}
