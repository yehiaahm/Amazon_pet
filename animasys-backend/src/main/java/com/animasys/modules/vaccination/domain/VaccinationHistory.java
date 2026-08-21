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

/** Append-only log of every vaccination administration — the "Completion History". */
@Entity
@Table(name = "vaccination_history")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VaccinationHistory {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vaccination_record_id", nullable = false)
    @JsonIgnore
    private VaccinationRecord vaccinationRecord;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pet_id", nullable = false)
    @JsonIgnore
    private Pet pet;

    /** Snapshot of the vaccine name at the time it was administered. */
    @Column(name = "vaccine_name", nullable = false)
    private String vaccineName;

    @Column(name = "administered_date", nullable = false)
    private LocalDate administeredDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "administered_by")
    @JsonIgnore
    private Employee administeredBy;

    @Column(length = 500)
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
