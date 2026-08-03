package com.animasys.modules.services.controller;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.services.domain.GroomingService;
import com.animasys.modules.services.dto.CreateServiceRequest;
import com.animasys.modules.services.repository.GroomingServiceRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/services")
@RequiredArgsConstructor
public class GroomingServiceController {

    private final GroomingServiceRepository serviceRepository;
    private final TenantRepository tenantRepository;

    @GetMapping
    @PreAuthorize("@authz.has('grooming.view_appointments')")
    public ResponseEntity<ApiResponseWrapper<List<GroomingService>>> getAllServices() {
        String tenantId = SecurityUtils.requireTenantId();
        List<GroomingService> list = serviceRepository.findByTenantId(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "Grooming services list retrieved successfully"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('grooming.edit_appointment')")
    public ResponseEntity<ApiResponseWrapper<GroomingService>> createService(
            @Valid @RequestBody CreateServiceRequest request
    ) {
        String name = request.getName() == null ? "" : request.getName().trim();
        if (name.isEmpty()) {
            throw new BusinessRuleException("Service name is required");
        }
        if (request.getDurationMinutes() < 1) {
            throw new BusinessRuleException("Duration must be at least 1 minute");
        }

        String tenantId = SecurityUtils.requireTenantId();
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant not found: " + tenantId));

        GroomingService service = GroomingService.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name(name)
                .price(request.getPrice())
                .durationMinutes(request.getDurationMinutes())
                .build();

        service = serviceRepository.save(service);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(service, "تم إضافة الخدمة بنجاح"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("@authz.has('grooming.edit_appointment')")
    public ResponseEntity<ApiResponseWrapper<GroomingService>> updateService(
            @PathVariable String id,
            @Valid @RequestBody CreateServiceRequest request
    ) {
        GroomingService service = serviceRepository.findByIdAndTenantId(id, SecurityUtils.requireTenantId())
                .orElseThrow(() -> new ResourceNotFoundException("Service not found: " + id));

        String name = request.getName() == null ? "" : request.getName().trim();
        if (name.isEmpty()) {
            throw new BusinessRuleException("Service name is required");
        }
        if (request.getDurationMinutes() < 1) {
            throw new BusinessRuleException("Duration must be at least 1 minute");
        }

        service.setName(name);
        service.setPrice(request.getPrice());
        service.setDurationMinutes(request.getDurationMinutes());
        return ResponseEntity.ok(ApiResponseWrapper.success(
                serviceRepository.save(service),
                "تم تحديث الخدمة بنجاح"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('grooming.edit_appointment')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteService(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        GroomingService service = serviceRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Service not found: " + id));
        serviceRepository.delete(service);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف الخدمة بنجاح"));
    }

    @PostMapping("/seed-defaults")
    @PreAuthorize("@authz.has('grooming.edit_appointment')")
    public ResponseEntity<ApiResponseWrapper<List<GroomingService>>> seedDefaults() {
        String tenantId = SecurityUtils.requireTenantId();
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseGet(() -> tenantRepository.findById("t-1").orElse(null));

        List<GroomingService> defaults = List.of(
            GroomingService.builder().id("svc-1").tenant(tenant).name("حمام وتنشيف كامل (Full Grooming & Bath)").price(new java.math.BigDecimal("180.00")).durationMinutes(45).build(),
            GroomingService.builder().id("svc-2").tenant(tenant).name("قص وتصفيف شعر (Haircut & Styling)").price(new java.math.BigDecimal("250.00")).durationMinutes(60).build(),
            GroomingService.builder().id("svc-3").tenant(tenant).name("قص وتظليم أظافر + تنظيف أذن (Nail & Ear Care)").price(new java.math.BigDecimal("80.00")).durationMinutes(20).build(),
            GroomingService.builder().id("svc-4").tenant(tenant).name("تطعيمات وفحص طبي دوري (Vaccination & Health Check)").price(new java.math.BigDecimal("350.00")).durationMinutes(30).build(),
            GroomingService.builder().id("svc-5").tenant(tenant).name("تنظيف وتلميع أسنان (Pet Dental Cleaning)").price(new java.math.BigDecimal("200.00")).durationMinutes(40).build(),
            GroomingService.builder().id("svc-6").tenant(tenant).name("علاج وبخ طفيليات وحشرات (Flea & Tick Treatment)").price(new java.math.BigDecimal("150.00")).durationMinutes(25).build(),
            GroomingService.builder().id("svc-7").tenant(tenant).name("إقامة وفندقة ليلة واحدة (Pet Boarding - 1 Night)").price(new java.math.BigDecimal("300.00")).durationMinutes(1440).build(),
            GroomingService.builder().id("svc-8").tenant(tenant).name("تركيب شريحة تتبع إلكترونية (Microchip Installation)").price(new java.math.BigDecimal("450.00")).durationMinutes(15).build(),
            GroomingService.builder().id("svc-9").tenant(tenant).name("حمام طبي وتطهير جلد (Medicated Bath)").price(new java.math.BigDecimal("220.00")).durationMinutes(50).build(),
            GroomingService.builder().id("svc-10").tenant(tenant).name("تدريب وتعديل سلوك أليف (Behavior Training)").price(new java.math.BigDecimal("400.00")).durationMinutes(60).build()
        );

        for (GroomingService svc : defaults) {
            if (!serviceRepository.existsById(svc.getId())) {
                serviceRepository.save(svc);
            }
        }

        List<GroomingService> allServices = serviceRepository.findByTenantId(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(allServices, "تمت إضافة خدمات الحيوانات القياسية وإعادة الضبط بنجاح"));
    }
}
