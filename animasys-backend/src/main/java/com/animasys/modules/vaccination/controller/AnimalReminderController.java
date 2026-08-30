package com.animasys.modules.vaccination.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.vaccination.dto.AnimalReminderRequest;
import com.animasys.modules.vaccination.dto.AnimalReminderResponse;
import com.animasys.modules.vaccination.service.AnimalFollowUpService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/animal-reminders")
@RequiredArgsConstructor
public class AnimalReminderController {

    private final AnimalFollowUpService followUpService;

    @GetMapping
    @PreAuthorize("@authz.has('animal_reminders.view')")
    public ResponseEntity<ApiResponseWrapper<List<AnimalReminderResponse>>> getReminders(
            @RequestParam(required = false) String petId) {
        String tenantId = SecurityUtils.requireTenantId();
        List<AnimalReminderResponse> list = followUpService.getReminders(tenantId, petId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع التذكيرات"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('animal_reminders.manage')")
    public ResponseEntity<ApiResponseWrapper<AnimalReminderResponse>> createReminder(
            @RequestBody AnimalReminderRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        Employee actor = SecurityUtils.requireEmployee();
        AnimalReminderResponse created = followUpService.createReminder(tenantId, actor, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "تم إضافة التذكير"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("@authz.has('animal_reminders.manage')")
    public ResponseEntity<ApiResponseWrapper<AnimalReminderResponse>> updateReminder(
            @PathVariable String id,
            @RequestBody AnimalReminderRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        AnimalReminderResponse updated = followUpService.updateReminder(tenantId, id, request);
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم تحديث التذكير"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('animal_reminders.manage')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteReminder(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        followUpService.deleteReminder(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف التذكير"));
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("@authz.has('animal_reminders.manage')")
    public ResponseEntity<ApiResponseWrapper<AnimalReminderResponse>> completeReminder(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        Employee actor = SecurityUtils.requireEmployee();
        AnimalReminderResponse updated = followUpService.completeReminder(tenantId, actor, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم إتمام التذكير"));
    }
}
