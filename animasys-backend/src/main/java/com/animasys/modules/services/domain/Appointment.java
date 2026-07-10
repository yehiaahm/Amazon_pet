package com.animasys.modules.services.domain;

import com.animasys.modules.crm.domain.Pet;
import com.animasys.modules.iam.domain.Employee;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Entity
@Table(name = "appointments")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Appointment {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pet_id", nullable = false)
    private Pet pet;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "service_id", nullable = false)
    private GroomingService service;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee; // groomer

    @Column(name = "date_time", nullable = false)
    private Instant dateTime;

    @Column(nullable = false)
    @Builder.Default
    private String status = "SCHEDULED"; // SCHEDULED, COMPLETED, CANCELLED

    private String notes;
}
