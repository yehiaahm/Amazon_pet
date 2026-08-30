package com.animasys.modules.vaccination.dto;

import lombok.Data;

import java.time.LocalDate;

/** Create/update payload for a general animal reminder. petId is required only on create. */
@Data
public class AnimalReminderRequest {
    private String petId;
    private String title;
    private String description;
    private LocalDate dueDate;
}
