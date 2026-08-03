-- Per-warehouse inventory balances (source of truth for location-aware stock)
CREATE TABLE IF NOT EXISTS warehouse_stocks (
    id VARCHAR(36) PRIMARY KEY,
    warehouse_id VARCHAR(36) NOT NULL,
    product_variant_id VARCHAR(36) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    CONSTRAINT uk_warehouse_variant UNIQUE (warehouse_id, product_variant_id),
    CONSTRAINT fk_ws_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    CONSTRAINT fk_ws_variant FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

-- Backfill: place all existing global stock onto retail shelves (wh-shelf) when present
INSERT INTO warehouse_stocks (id, warehouse_id, product_variant_id, quantity)
SELECT CONCAT('ws-', pv.id), 'wh-shelf', pv.id, pv.stock_quantity
FROM product_variants pv
WHERE EXISTS (SELECT 1 FROM warehouses w WHERE w.id = 'wh-shelf')
  AND NOT EXISTS (
      SELECT 1 FROM warehouse_stocks ws
      WHERE ws.warehouse_id = 'wh-shelf' AND ws.product_variant_id = pv.id
  );

-- Track stock delta applied by each import row so undo reverses only that delta
ALTER TABLE import_session_items
    ADD COLUMN stock_delta INT NOT NULL DEFAULT 0;
