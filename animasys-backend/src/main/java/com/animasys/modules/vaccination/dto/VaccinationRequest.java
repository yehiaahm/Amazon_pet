package com.animasys.modules.vaccination.dto;

import lombok.Data;

import java.time.LocalDate;

/** Create/update payload for a vaccination schedule row. petId is required only on create. */
@Data
public class VaccinationRequest {
    private String petId;
    private String vaccineName;
    private Integer intervalMonths;
    private LocalDate lastAdministeredDate;
    private LocalDate nextDueDate;
    private String notes;
}
