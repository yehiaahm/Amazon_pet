package com.animasys.modules.services.domain;

import com.animasys.modules.crm.domain.Pet;
import com.animasys.modules.iam.domain.Employee;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
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
    @JsonIgnore
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Pet pet;

    @JsonProperty("petId")
    public String getPetId() {
        return pet != null ? pet.getId() : null;
    }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "service_id", nullable = false)
    @JsonIgnore
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private GroomingService service;

    @JsonProperty("serviceId")
    public String getServiceId() {
        return service != null ? service.getId() : null;
    }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    @JsonIgnore
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Employee employee; // groomer

    @JsonProperty("employeeId")
    public String getEmployeeId() {
        return employee != null ? employee.getId() : null;
    }

    @Column(name = "date_time", nullable = false)
    private Instant dateTime;

    @Column(nullable = false)
    @Builder.Default
    private String status = "SCHEDULED"; // SCHEDULED, COMPLETED, CANCELLED

    private String notes;
}
