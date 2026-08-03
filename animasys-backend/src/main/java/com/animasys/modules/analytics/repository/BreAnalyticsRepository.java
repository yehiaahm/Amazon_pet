package com.animasys.modules.analytics.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Repository
public class BreAnalyticsRepository {

    @PersistenceContext
    private EntityManager em;

    @SuppressWarnings("unchecked")
    public List<LowStockAlertRow> lowStockAlerts(String tenantId) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT p.name, pv.name, pv.stock_quantity, p.min_stock_limit
                FROM product_variants pv
                JOIN products p ON pv.product_id = p.id
                WHERE p.tenant_id = :tenantId
                  AND pv.stock_quantity < p.min_stock_limit
                  AND NOT EXISTS (
                    SELECT 1 FROM product_variants pv2
                    JOIN products p2 ON pv2.product_id = p2.id
                    WHERE p2.tenant_id = :tenantId
                      AND UPPER(TRIM(pv2.sku)) = UPPER(TRIM(pv.sku))
                      AND pv2.stock_quantity > pv.stock_quantity
                  )
                ORDER BY pv.stock_quantity ASC
                """)
                .setParameter("tenantId", tenantId)
                .getResultList();
        List<LowStockAlertRow> out = new ArrayList<>();
        for (Object[] r : rows) {
            out.add(new LowStockAlertRow(
                    String.valueOf(r[0]),
                    String.valueOf(r[1]),
                    toInt(r[2]),
                    toInt(r[3])));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    public List<ExpiringBatchAlertRow> expiringBatchCandidates(String tenantId) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT ib.batch_number, pv.name, ib.expiry_date
                FROM inventory_batches ib
                JOIN product_variants pv ON ib.product_variant_id = pv.id
                WHERE ib.tenant_id = :tenantId
                  AND ib.remaining_quantity > 0
                  AND ib.expiry_date IS NOT NULL
                ORDER BY ib.expiry_date ASC
                """)
                .setParameter("tenantId", tenantId)
                .getResultList();
        List<ExpiringBatchAlertRow> out = new ArrayList<>();
        for (Object[] r : rows) {
            out.add(new ExpiringBatchAlertRow(
                    String.valueOf(r[0]),
                    String.valueOf(r[1]),
                    toLocalDate(r[2])));
        }
        return out;
    }

    private int toInt(Object v) {
        if (v == null) {
            return 0;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        return Integer.parseInt(v.toString());
    }

    private LocalDate toLocalDate(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof LocalDate ld) {
            return ld;
        }
        if (v instanceof java.sql.Date sd) {
            return sd.toLocalDate();
        }
        return LocalDate.parse(v.toString());
    }

    public record LowStockAlertRow(String productName, String variantName, int stockQuantity, int minStockLimit) {}
    public record ExpiringBatchAlertRow(String batchNumber, String variantName, LocalDate expiryDate) {}
}
