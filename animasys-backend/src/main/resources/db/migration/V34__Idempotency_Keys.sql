CREATE TABLE idempotency_keys (
    idempotency_key VARCHAR(128) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    status VARCHAR(20) NOT NULL,
    response_payload TEXT,
    sale_id VARCHAR(36),
    created_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP
);

CREATE INDEX idx_idempotency_tenant_status ON idempotency_keys(tenant_id, status);
