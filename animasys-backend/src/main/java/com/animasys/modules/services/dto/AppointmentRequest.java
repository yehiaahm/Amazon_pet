package com.animasys.modules.services.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.Instant;

@Data
public class AppointmentRequest {
    @NotBlank
    private String petId;

    @NotBlank
    private String serviceId;

    @NotBlank
    private String employeeId; // groomer id

    @NotNull
    private Instant dateTime;

    private String notes;
}
