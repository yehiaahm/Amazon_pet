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
public class AnimalReminderResponse {
    private String id;
    private String petId;
    private String petName;
    private String ownerId;
    private String ownerName;
    private String ownerPhone;
    private String title;
    private String description;
    private LocalDate dueDate;
    /** UPCOMING | DUE_SOON | DUE_TODAY | OVERDUE | COMPLETED */
    private String status;
    /** Null when status is COMPLETED. */
    private Integer daysUntilDue;
    private String createdByName;
    private String completedByName;
    private Instant createdAt;
    private Instant completedAt;
}
