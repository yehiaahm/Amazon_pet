package com.animasys.core.audit;

import com.animasys.modules.iam.domain.Employee;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Entity
@Table(name = "audit_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuditLog {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    @Column(nullable = false)
    private String action;

    @Column(name = "affected_entity", nullable = false)
    private String affectedEntity;

    @Column(name = "entity_id", nullable = false)
    private String entityId;

    @Column(name = "old_state", columnDefinition = "TEXT")
    private String oldState;

    @Column(name = "new_state", columnDefinition = "TEXT")
    private String newState;

    @Builder.Default
    private Instant timestamp = Instant.now();
}
