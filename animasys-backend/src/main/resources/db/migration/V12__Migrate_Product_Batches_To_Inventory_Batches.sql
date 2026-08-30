-- Migrate legacy product_batches into inventory_batches (one-time, idempotent)
INSERT INTO inventory_batches (
    id,
    tenant_id,
    product_variant_id,
    batch_number,
    unit_cost,
    initial_quantity,
    remaining_quantity,
    purchase_date,
    expiry_date,
    status,
    version
)
SELECT
    CONCAT('mig-', pb.id),
    p.tenant_id,
    pb.product_variant_id,
    pb.batch_number,
    COALESCE(pv.cost, 0.0000),
    pb.quantity,
    pb.quantity,
    CURRENT_TIMESTAMP,
    pb.expiry_date,
    'ACTIVE',
    0
FROM product_batches pb
INNER JOIN product_variants pv ON pv.id = pb.product_variant_id
INNER JOIN products p ON p.id = pv.product_id
WHERE pb.quantity > 0
  AND NOT EXISTS (
    SELECT 1 FROM inventory_batches ib WHERE ib.id = CONCAT('mig-', pb.id)
  );
