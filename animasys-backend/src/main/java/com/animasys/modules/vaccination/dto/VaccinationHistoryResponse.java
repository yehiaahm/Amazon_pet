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
public class VaccinationHistoryResponse {
    private String id;
    private String vaccinationRecordId;
    private String petId;
    private String vaccineName;
    private LocalDate administeredDate;
    private String administeredByName;
    private String notes;
    private Instant createdAt;
}
