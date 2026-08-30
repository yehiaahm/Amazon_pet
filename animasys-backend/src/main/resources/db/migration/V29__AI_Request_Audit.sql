-- AI request audit trail (no prompts, images, or secrets)

CREATE TABLE ai_request_logs (
    id              VARCHAR(50)  PRIMARY KEY,
    tenant_id       VARCHAR(50)  NOT NULL,
    employee_id     VARCHAR(50),
    endpoint        VARCHAR(120) NOT NULL,
    provider        VARCHAR(50)  NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    duration_ms     BIGINT       NOT NULL,
    failure_reason  VARCHAR(500),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX idx_ai_request_logs_tenant_created ON ai_request_logs(tenant_id, created_at DESC);
