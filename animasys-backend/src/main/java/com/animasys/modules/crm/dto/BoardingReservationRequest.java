package com.animasys.modules.crm.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.Instant;

@Data
public class BoardingReservationRequest {
    @NotBlank
    private String petId;

    @NotNull
    private Instant checkInDate;

    @NotNull
    private Instant checkOutDate;

    private String roomNumber;

    private String notes;
}
