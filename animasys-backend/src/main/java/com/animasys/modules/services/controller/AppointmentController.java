package com.animasys.modules.services.controller;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.crm.domain.Pet;
import com.animasys.modules.crm.repository.PetRepository;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.services.domain.Appointment;
import com.animasys.modules.services.domain.GroomingService;
import com.animasys.modules.services.dto.AppointmentRequest;
import com.animasys.modules.services.repository.AppointmentRepository;
import com.animasys.modules.services.repository.GroomingServiceRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/appointments")
@RequiredArgsConstructor
public class AppointmentController {

    private final AppointmentRepository appointmentRepository;
    private final PetRepository petRepository;
    private final GroomingServiceRepository serviceRepository;
    private final EmployeeRepository employeeRepository;

    @GetMapping
    @PreAuthorize("@authz.has('grooming.view_appointments')")
    public ResponseEntity<ApiResponseWrapper<List<Appointment>>> getAllAppointments() {
        String tenantId = SecurityUtils.requireTenantId();
        List<Appointment> list = appointmentRepository.findByCustomerTenantId(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "Appointments schedule retrieved successfully"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('grooming.create_appointment')")
    public ResponseEntity<ApiResponseWrapper<Appointment>> scheduleAppointment(@Valid @RequestBody AppointmentRequest request) {
        String tenantId = SecurityUtils.requireTenantId();

        Pet pet = petRepository.findByIdWithCustomer(request.getPetId())
                .orElseThrow(() -> new ResourceNotFoundException("Pet profile not found: " + request.getPetId()));
        requirePetTenant(pet, tenantId);

        GroomingService service = serviceRepository.findByIdAndTenantId(request.getServiceId(), tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Grooming Service not found: " + request.getServiceId()));

        Employee groomer = employeeRepository.findByIdWithTenant(request.getEmployeeId())
                .orElseThrow(() -> new ResourceNotFoundException("Groomer employee profile not found: " + request.getEmployeeId()));
        requireEmployeeTenant(groomer, tenantId);

        Appointment appointment = Appointment.builder()
                .id(UUID.randomUUID().toString())
                .pet(pet)
                .service(service)
                .employee(groomer)
                .dateTime(request.getDateTime())
                .notes(request.getNotes())
                .status("SCHEDULED")
                .build();

        appointment = appointmentRepository.save(appointment);
        return ResponseEntity.ok(ApiResponseWrapper.success(appointment, "Appointment scheduled successfully"));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("@authz.has('grooming.edit_appointment')")
    public ResponseEntity<ApiResponseWrapper<Appointment>> updateAppointmentStatus(
            @PathVariable String id,
            @RequestBody Map<String, String> body) {
        String tenantId = SecurityUtils.requireTenantId();
        Appointment appointment = appointmentRepository.findByIdAndCustomerTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Appointment not found: " + id));
        String status = body.get("status");
        if (status == null || status.isBlank()) {
            throw new BusinessRuleException("status is required");
        }
        String normalized = status.trim().toUpperCase();
        if (!normalized.equals("SCHEDULED") && !normalized.equals("COMPLETED") && !normalized.equals("CANCELLED")) {
            throw new BusinessRuleException("Invalid appointment status: " + status);
        }
        appointment.setStatus(normalized);
        return ResponseEntity.ok(ApiResponseWrapper.success(
                appointmentRepository.save(appointment),
                "Appointment status updated"));
    }

    private void requirePetTenant(Pet pet, String tenantId) {
        if (pet.getCustomer() == null
                || pet.getCustomer().getTenant() == null
                || !tenantId.equals(pet.getCustomer().getTenant().getId())) {
            throw new AccessDeniedException("Pet not accessible for this tenant");
        }
    }

    private void requireEmployeeTenant(Employee employee, String tenantId) {
        if (employee.getTenant() == null || !tenantId.equals(employee.getTenant().getId())) {
            throw new AccessDeniedException("Employee not accessible for this tenant");
        }
    }
}
