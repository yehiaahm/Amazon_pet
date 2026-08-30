package com.animasys.modules.vaccination.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** Combined per-pet follow-up view: owner + vaccination schedule + general reminders. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PetFollowUpView {
    private String petId;
    private String petName;
    private PetOwnerSummary owner;
    private List<VaccinationRecordResponse> vaccinations;
    private List<AnimalReminderResponse> reminders;
}
