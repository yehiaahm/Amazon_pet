package com.animasys.modules.vaccination.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnimalFollowUpDashboard {
    private int dueSoonThresholdDays;

    private List<VaccinationRecordResponse> vaccinationsDueSoon;
    private List<VaccinationRecordResponse> vaccinationsOverdue;

    private List<AnimalReminderResponse> remindersOverdue;
    private List<AnimalReminderResponse> remindersDueToday;
    private List<AnimalReminderResponse> remindersDueThisWeek;

    private int vaccinationsDueSoonCount;
    private int vaccinationsOverdueCount;
    private int remindersOverdueCount;
    private int remindersDueTodayCount;
    private int remindersDueThisWeekCount;
}
