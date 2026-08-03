package com.animasys.modules.ai.audit;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "ai_request_logs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiRequestLog {

    @Id
    private String id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    @Column(name = "employee_id")
    private String employeeId;

    @Column(nullable = false, length = 120)
    private String endpoint;

    @Column(nullable = false, length = 50)
    private String provider;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "duration_ms", nullable = false)
    private long durationMs;

    @Column(name = "failure_reason", length = 500)
    private String failureReason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
}
