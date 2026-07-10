package com.animasys.modules.services.controller;

import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.core.response.ApiResponseWrapper;
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
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/appointments")
@RequiredArgsConstructor
public class AppointmentController {

    private final AppointmentRepository appointmentRepository;
    private final PetRepository petRepository;
    private final GroomingServiceRepository serviceRepository;
    private final EmployeeRepository employeeRepository;

    @GetMapping
    public ResponseEntity<ApiResponseWrapper<List<Appointment>>> getAllAppointments() {
        List<Appointment> list = appointmentRepository.findAll();
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "Appointments schedule retrieved successfully"));
    }

    @PostMapping
    public ResponseEntity<ApiResponseWrapper<Appointment>> scheduleAppointment(@Valid @RequestBody AppointmentRequest request) {
        Pet pet = petRepository.findById(request.getPetId())
                .orElseThrow(() -> new ResourceNotFoundException("Pet profile not found: " + request.getPetId()));

        GroomingService service = serviceRepository.findById(request.getServiceId())
                .orElseThrow(() -> new ResourceNotFoundException("Grooming Service not found: " + request.getServiceId()));

        Employee groomer = employeeRepository.findById(request.getEmployeeId())
                .orElseThrow(() -> new ResourceNotFoundException("Groomer employee profile not found: " + request.getEmployeeId()));

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
}
