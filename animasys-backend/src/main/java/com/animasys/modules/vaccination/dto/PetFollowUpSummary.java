package com.animasys.modules.vaccination.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/** Per-pet follow-up badge — one entry per pet, used by the Pets list to avoid N+1 calls. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PetFollowUpSummary {
    private String petId;
    private int overdueCount;
    private int dueSoonCount;
    private LocalDate nextDueDate;
    private String nextItemTitle;
}
