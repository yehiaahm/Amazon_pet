package com.animasys.modules.vaccination.domain;

import com.animasys.modules.crm.domain.Pet;
import com.animasys.modules.iam.domain.Employee;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.time.LocalDate;

/** General (non-vaccination) follow-up reminder attached to a pet — e.g. a vet recheck or grooming. */
@Entity
@Table(name = "animal_reminders")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnimalReminder {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pet_id", nullable = false)
    @JsonIgnore
    private Pet pet;

    @Column(nullable = false)
    private String title;

    @Column(length = 1000)
    private String description;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    /** OPEN or COMPLETED. Due/overdue urgency is computed on read from dueDate while OPEN. */
    @Builder.Default
    @Column(nullable = false)
    private String status = "OPEN";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    @JsonIgnore
    private Employee createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "completed_by")
    @JsonIgnore
    private Employee completedBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;
}
