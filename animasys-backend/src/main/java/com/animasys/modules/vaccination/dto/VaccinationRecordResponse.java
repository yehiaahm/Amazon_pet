package com.animasys.modules.vaccination.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VaccinationRecordResponse {
    private String id;
    private String petId;
    private String petName;
    private String ownerId;
    private String ownerName;
    private String ownerPhone;
    private String vaccineName;
    private Integer intervalMonths;
    private LocalDate lastAdministeredDate;
    private LocalDate nextDueDate;
    private String notes;
    /** UPCOMING | DUE_SOON | DUE_TODAY | OVERDUE | COMPLETED */
    private String status;
    /** Null when status is COMPLETED (no active next-due-date). */
    private Integer daysUntilDue;
    private String createdByName;
    private Instant createdAt;
}
