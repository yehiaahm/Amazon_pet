package com.animasys.modules.vaccination.dto;

import lombok.Data;

import java.time.LocalDate;

@Data
public class AdministerVaccinationRequest {
    /** Defaults to today (business timezone) when omitted. */
    private LocalDate administeredDate;
    private String notes;
}
