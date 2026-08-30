package com.animasys.modules.crm.dto;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class BoardingReservationResponse {
    private String id;
    private String petId;
    private String petName;
    private String customerName;
    private String customerPhone;
    private Instant checkInDate;
    private Instant checkOutDate;
    private String roomNumber;
    private String notes;
    private String status;
}
