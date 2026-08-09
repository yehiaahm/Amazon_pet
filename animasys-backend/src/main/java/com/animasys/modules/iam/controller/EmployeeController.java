package com.animasys.modules.iam.controller;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.repository.EmployeeRepository;
import lombok.Data;
import lombok.RequiredArgsConstructor;
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

        employeeRepository.delete(target);
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
    public ResponseEntity<ApiResponseWrapper<Void>> changePassword(
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

        target.setPasswordHash(passwordEncoder.encode(request.getNewPassword().trim()));
        employeeRepository.save(target);

        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم تغيير كلمة المرور بنجاح"));
    }

    private void validatePasswordPolicy(String password) {
        if (password.length() < 4) {
            throw new BusinessRuleException("Password or PIN must be at least 4 characters");
        }
        if (password.length() > 128) {
            throw new BusinessRuleException("Password is too long");
        }
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
    }

    @Data
    public static class EmployeeUpdateRequest {
        private String fullName;
        private String email;
        private String role;
        private Boolean active;
    }
}
