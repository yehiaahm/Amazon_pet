package com.animasys.modules.iam.controller;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.JwtTokenProvider;
import com.animasys.core.security.LoginRateLimiter;
import com.animasys.core.security.PinPolicy;
import com.animasys.core.security.RoleHierarchy;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.repository.EmployeeRepository;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeRepository employeeRepository;
    private final PasswordEncoder passwordEncoder;
    private final LoginRateLimiter loginRateLimiter;
    private final JwtTokenProvider tokenProvider;

    @GetMapping
    @PreAuthorize("@authz.has('employees.view')")
    public ResponseEntity<ApiResponseWrapper<List<Employee>>> getEmployees() {
        String tenantId = SecurityUtils.requireTenantId();
        List<Employee> list = employeeRepository.findByTenantId(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع قائمة الموظفين بنجاح"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('employees.add')")
    public ResponseEntity<ApiResponseWrapper<Employee>> createEmployee(@RequestBody EmployeeCreateRequest request) {
        if (request.getUsername() == null || request.getUsername().trim().isEmpty()) {
            throw new BusinessRuleException("اسم المستخدم مطلوب");
        }
        if (request.getPassword() == null || request.getPassword().trim().isEmpty()) {
            throw new BusinessRuleException("كلمة المرور مطلوبة");
        }
        PinPolicy.validate(request.getPassword().trim());
        if (request.getFullName() == null || request.getFullName().trim().isEmpty()) {
            throw new BusinessRuleException("الاسم بالكامل مطلوب");
        }
        if (request.getRole() == null || request.getRole().trim().isEmpty()) {
            throw new BusinessRuleException("صلاحية المستخدم مطلوبة");
        }

        // Validate uniqueness
        if (employeeRepository.findByUsername(request.getUsername().trim()).isPresent()) {
            throw new BusinessRuleException("اسم المستخدم موجود بالفعل!");
        }
        if (request.getEmail() != null && !request.getEmail().trim().isEmpty()) {
            if (employeeRepository.findByEmail(request.getEmail().trim()).isPresent()) {
                throw new BusinessRuleException("البريد الإلكتروني مستخدم بالفعل!");
            }
        }

        Employee current = SecurityUtils.requireEmployee();

        // Same bound as updateEmployee: employees.add must not be a way to mint an account
        // more privileged than your own and then simply log in as it.
        if (!RoleHierarchy.canManage(current.getRole(), request.getRole().trim())) {
            throw new BusinessRuleException("لا يمكنك إنشاء حساب بصلاحية أعلى من صلاحيتك");
        }

        requirePinNotAlreadyInUse(current.getTenant().getId(), request.getPassword().trim(), null);

        Tenant tenant = current.getTenant();
        Branch branch = current.getBranch();

        Employee newEmployee = Employee.builder()
                .id("e-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username(request.getUsername().trim())
                .passwordHash(passwordEncoder.encode(request.getPassword().trim()))
                .fullName(request.getFullName().trim())
                .email(request.getEmail() != null && !request.getEmail().trim().isEmpty() 
                        ? request.getEmail().trim() 
                        : (request.getUsername().trim() + "@animasys.com"))
                .role(request.getRole().trim().toUpperCase())
                .active(true)
                .build();

        Employee saved = employeeRepository.save(newEmployee);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(saved, "تم إضافة الموظف بنجاح"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('employees.delete')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteEmployee(@PathVariable String id) {
        if (id.equals(SecurityUtils.requireEmployeeId())) {
            throw new BusinessRuleException("لا يمكنك حذف حسابك الحالي!");
        }

        Employee target = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessRuleException("الموظف غير موجود"));

        if (!target.getTenant().getId().equals(SecurityUtils.requireTenantId())) {
            throw new BusinessRuleException("غير مصرح لك بحذف هذا الموظف");
        }

        try {
            employeeRepository.delete(target);
        } catch (DataIntegrityViolationException ex) {
            // Employee is still referenced by historical records (sales, appointments,
            // POS sessions, audit logs, ...) that must not be orphaned/lost. Deactivating
            // keeps that history intact while blocking the account from logging in.
            throw new BusinessRuleException(
                    "لا يمكن حذف الموظف \"" + target.getFullName() + "\" لأن لديه سجلات مرتبطة بالنظام "
                            + "(مثل فواتير مبيعات أو مواعيد أو ورديات سابقة)، وحذفها قد يفقد بيانات تاريخية مهمة. "
                            + "بدلاً من الحذف، عدّل بيانات الموظف وقم بإلغاء تفعيل \"نشط\" لمنعه من الدخول إلى النظام مع الاحتفاظ بسجله.");
        }
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف الموظف بنجاح"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("@authz.has('employees.edit')")
    public ResponseEntity<ApiResponseWrapper<Employee>> updateEmployee(
            @PathVariable String id,
            @RequestBody EmployeeUpdateRequest request) {

        Employee current = SecurityUtils.requireEmployee();
        Employee target = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessRuleException("الموظف غير موجود"));

        if (!target.getTenant().getId().equals(current.getTenant().getId())) {
            throw new BusinessRuleException("الموظف غير موجود في نفس المؤسسة");
        }

        guardRoleBoundary(current, target, request.getRole());

        if (request.getFullName() != null && !request.getFullName().trim().isEmpty()) {
            target.setFullName(request.getFullName().trim());
        }
        if (request.getEmail() != null) {
            target.setEmail(request.getEmail().trim());
        }
        if (request.getRole() != null && !request.getRole().trim().isEmpty()) {
            target.setRole(request.getRole().trim().toUpperCase());
        }
        if (request.getActive() != null) {
            target.setActive(request.getActive());
        }

        Employee saved = employeeRepository.save(target);
        return ResponseEntity.ok(ApiResponseWrapper.success(saved, "تم تحديث بيانات ومواصفات الموظف بنجاح"));
    }

    @PutMapping("/{id}/password")
    @PreAuthorize("isAuthenticated() and (#id == authentication.principal.employee.id or @authz.has('employees.edit'))")
    public ResponseEntity<ApiResponseWrapper<PasswordChangeResult>> changePassword(
            @PathVariable String id,
            @RequestBody PasswordChangeRequest request) {
        
        if (request.getNewPassword() == null || request.getNewPassword().trim().isEmpty()) {
            throw new BusinessRuleException("كلمة المرور الجديدة مطلوبة");
        }

        validatePasswordPolicy(request.getNewPassword().trim());

        Employee current = SecurityUtils.requireEmployee();
        boolean isSelf = current.getId().equals(id);
        boolean isAdmin = "OWNER".equals(current.getRole()) || "MANAGER".equals(current.getRole());

        if (!isSelf && !isAdmin) {
            throw new BusinessRuleException("غير مصرح لك بتغيير كلمة مرور هذا المستخدم");
        }

        Employee target = employeeRepository.findById(id)
                .orElseThrow(() -> new BusinessRuleException("الموظف غير موجود"));

        if (!target.getTenant().getId().equals(current.getTenant().getId())) {
            throw new BusinessRuleException("الموظف غير موجود في نفس المؤسسة");
        }

        if (isSelf) {
            requireCurrentPin(current, request.getCurrentPassword());
        } else if (!RoleHierarchy.canManage(current.getRole(), target.getRole())) {
            // "OWNER or MANAGER" on its own let a MANAGER overwrite the owner's PIN and
            // then log in as the owner — a full takeover from one rung below.
            throw new BusinessRuleException("لا يمكنك تغيير رمز دخول حساب بصلاحية أعلى من صلاحيتك");
        }

        // Deliberately after the identity and authority checks above: answering "is this PIN
        // already taken?" before the caller has proved who they are would turn this endpoint
        // into a way to test colleagues' PINs one guess at a time.
        requirePinNotAlreadyInUse(
                target.getTenant().getId(), request.getNewPassword().trim(), target.getId());

        target.setPasswordHash(passwordEncoder.encode(request.getNewPassword().trim()));
        // A PIN change must end the sessions opened with the old PIN. Otherwise an admin
        // resetting a compromised account does not actually evict whoever is inside it, and
        // a token lifted by XSS keeps working for the rest of its 24h life.
        target.setTokenVersion(target.getTokenVersion() + 1);
        employeeRepository.save(target);

        // Changing your own PIN revokes the token you are holding too, so hand back a
        // replacement — otherwise the caller is signed out by their own successful request.
        // Minted from `target`, which already carries the new counter; the principal in the
        // SecurityContext still has the old one and would produce a dead token.
        // An admin resetting someone else's PIN gets no token; that eviction is the point.
        String replacementToken = isSelf ? tokenProvider.generateToken(target) : null;

        return ResponseEntity.ok(ApiResponseWrapper.success(
                new PasswordChangeResult(replacementToken), "تم تغيير كلمة المرور بنجاح"));
    }

    /**
     * Refuses a PIN that another employee in the same tenant already uses.
     *
     * /auth/pin-login carries no username: it finds the account by hashing the typed PIN
     * against everyone in the tenant. A shared PIN therefore makes two accounts
     * indistinguishable at login — it used to resolve that by signing you in as whichever of
     * them held the most authority, so a cashier who picked the owner's PIN got the owner's
     * session. Keeping PINs unique is what makes that lookup unambiguous, so it is enforced
     * here on every write rather than left to chance.
     *
     * Costs one bcrypt comparison per employee in the tenant, on a path used a handful of
     * times a year; the PIN itself is never stored or compared in plaintext.
     */
    private void requirePinNotAlreadyInUse(String tenantId, String pin, String excludeEmployeeId) {
        boolean taken = employeeRepository.findByTenantId(tenantId).stream()
                .filter(e -> excludeEmployeeId == null || !excludeEmployeeId.equals(e.getId()))
                .anyMatch(e -> e.getPasswordHash() != null && passwordEncoder.matches(pin, e.getPasswordHash()));
        if (taken) {
            throw new BusinessRuleException(
                    "هذا الرمز مستخدم بالفعل لحساب آخر. اختر رمزاً مختلفاً حتى يبقى الدخول بالرمز وحده واضحاً.");
        }
    }

    /**
     * Changing your own PIN has to re-prove you know it. The JWT lives in localStorage, so
     * any XSS can reach it; without this check a stolen token converts into permanent access
     * by just setting a new PIN, and the real owner's next login failure is the first signal.
     * Throttled because this is also a verification oracle against the caller's own hash.
     */
    private void requireCurrentPin(Employee current, String suppliedCurrentPin) {
        if (suppliedCurrentPin == null || suppliedCurrentPin.isBlank()) {
            throw new BusinessRuleException("يجب إدخال رمز الدخول الحالي لتغيير رمزك");
        }
        String rateLimitKey = "self-pin-change:" + current.getId();
        loginRateLimiter.checkAllowed(rateLimitKey);
        if (!passwordEncoder.matches(suppliedCurrentPin.trim(), current.getPasswordHash())) {
            loginRateLimiter.recordFailure(rateLimitKey);
            throw new BusinessRuleException("رمز الدخول الحالي غير صحيح");
        }
        loginRateLimiter.recordSuccess(rateLimitKey);
    }

    /**
     * {@code employees.edit} is a single permission, but the records behind it are not
     * equal. Without this bound its holder could PUT their own record with role=OWNER —
     * the role is taken straight from the request body — and a MANAGER could rewrite or
     * deactivate the owner's account. RBAC can only answer "may edit employees"; the
     * "which ones, and which roles may they hand out" half belongs here.
     *
     * Assigning a <em>less</em> privileged role stays allowed, including to yourself, so
     * the custom-role flow in Employees.tsx keeps working.
     */
    private void guardRoleBoundary(Employee current, Employee target, String requestedRole) {
        if (!RoleHierarchy.canManage(current.getRole(), target.getRole())) {
            throw new BusinessRuleException("لا يمكنك تعديل حساب بصلاحية أعلى من صلاحيتك");
        }
        if (requestedRole == null || requestedRole.trim().isEmpty()) {
            return;
        }
        String newRole = requestedRole.trim().toUpperCase();
        if (newRole.equals(target.getRole())) {
            return;
        }
        if (!RoleHierarchy.canManage(current.getRole(), newRole)) {
            throw new BusinessRuleException("لا يمكنك منح صلاحية أعلى من صلاحيتك");
        }
    }

    /**
     * Every employee logs in through the same 4-digit numeric keypad (Login.tsx), so any
     * PIN this endpoint accepts must be something that keypad can actually submit again —
     * see {@link PinPolicy}.
     */
    private void validatePasswordPolicy(String password) {
        PinPolicy.validate(password);
    }

    @Data
    public static class EmployeeCreateRequest {
        private String username;
        private String password;
        private String fullName;
        private String email;
        private String role;
    }

    @Data
    public static class PasswordChangeRequest {
        private String newPassword;
        /** Required only when changing your own PIN — see {@link #requireCurrentPin}. */
        private String currentPassword;
    }

    @Data
    @AllArgsConstructor
    public static class PasswordChangeResult {
        /**
         * A replacement JWT, present only when you changed your own PIN. The change revokes
         * every token issued for the account beforehand, including the one used to make this
         * request, so the client must swap to this one. Null when an admin reset someone
         * else's PIN — that account is meant to be signed out.
         */
        private String token;
    }

    @Data
    public static class EmployeeUpdateRequest {
        private String fullName;
        private String email;
        private String role;
        private Boolean active;
    }
}
