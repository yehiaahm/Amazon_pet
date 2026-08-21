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
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Current vaccination schedule state for one (pet, vaccine) pair. lastAdministeredDate
 * and nextDueDate are recomputed by AnimalFollowUpService whenever a vaccination is
 * administered — see VaccinationHistory for the append-only administration log.
 */
@Entity
@Table(name = "vaccination_records")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VaccinationRecord {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pet_id", nullable = false)
    @JsonIgnore
    private Pet pet;

    @Column(name = "vaccine_name", nullable = false)
    private String vaccineName;

    /** Recurrence interval in months. Null means one-time — no auto next-due-date. */
    @Column(name = "interval_months")
    private Integer intervalMonths;

    @Column(name = "last_administered_date")
    private LocalDate lastAdministeredDate;

    @Column(name = "next_due_date")
    private LocalDate nextDueDate;

    @Column(length = 500)
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    @JsonIgnore
    private Employee createdBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
}
