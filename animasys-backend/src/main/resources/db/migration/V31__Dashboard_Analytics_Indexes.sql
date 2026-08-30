-- Sprint 5.3B: dashboard aggregation lookups (expenses by tenant+date)

CREATE INDEX idx_expenses_tenant_date ON expenses (tenant_id, date);

CREATE INDEX idx_purchase_invoices_uploaded_by ON purchase_invoices (uploaded_by);
