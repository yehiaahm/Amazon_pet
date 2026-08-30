package com.animasys.modules.ai.context;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Repository
public class AiContextRepository {

    private static final String COUNTABLE_SALE =
            "(s.status IS NULL OR TRIM(s.status) = '' OR UPPER(s.status) IN ('COMPLETED', 'PARTIALLY_REFUNDED'))";

    @PersistenceContext
    private EntityManager em;

    @SuppressWarnings("unchecked")
    public List<PaymentBreakdownRow> paymentBreakdown(String tenantId, Instant from, Instant toExclusive) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT UPPER(COALESCE(s.payment_method, 'CASH')),
                       COALESCE(SUM(GREATEST(0, s.total_amount - COALESCE(s.tax, 0))), 0)
                FROM sales s
                JOIN employees e ON s.employee_id = e.id
                WHERE e.tenant_id = :tenantId
                  AND s.date >= :from AND s.date < :toExclusive AND """
                + COUNTABLE_SALE + """
                GROUP BY UPPER(COALESCE(s.payment_method, 'CASH'))
                """)
                .setParameter("tenantId", tenantId)
                .setParameter("from", from)
                .setParameter("toExclusive", toExclusive)
                .getResultList();
        List<PaymentBreakdownRow> out = new ArrayList<>();
        for (Object[] r : rows) {
            out.add(new PaymentBreakdownRow(String.valueOf(r[0]), toBd(r[1])));
        }
        return out;
    }

    public long lowStockSkuCount(String tenantId) {
        Number n = (Number) em.createNativeQuery("""
                SELECT COUNT(*) FROM product_variants pv
                JOIN products p ON pv.product_id = p.id
                WHERE p.tenant_id = :tenantId
                  AND pv.stock_quantity <= p.min_stock_limit
                """)
                .setParameter("tenantId", tenantId)
                .getSingleResult();
        return n.longValue();
    }

    @SuppressWarnings("unchecked")
    public List<LowStockRow> topLowStock(String tenantId, int limit) {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT p.name, pv.name, pv.stock_quantity, p.min_stock_limit
                FROM product_variants pv
                JOIN products p ON pv.product_id = p.id
                WHERE p.tenant_id = :tenantId
                  AND pv.stock_quantity <= p.min_stock_limit
                ORDER BY pv.stock_quantity ASC
                LIMIT :lim
                """)
                .setParameter("tenantId", tenantId)
                .setParameter("lim", limit)
                .getResultList();
        List<LowStockRow> out = new ArrayList<>();
        for (Object[] r : rows) {
            out.add(new LowStockRow(
                    String.valueOf(r[0]), String.valueOf(r[1]),
                    toLong(r[2]), toLong(r[3])));
        }
        return out;
    }

    private BigDecimal toBd(Object v) {
        if (v == null) return BigDecimal.ZERO;
        if (v instanceof BigDecimal bd) return bd;
        return new BigDecimal(v.toString());
    }

    private long toLong(Object v) {
        if (v == null) return 0L;
        if (v instanceof Number n) return n.longValue();
        return Long.parseLong(v.toString());
    }

    public record PaymentBreakdownRow(String method, BigDecimal amount) {}
    public record LowStockRow(String productName, String variantName, long stock, long minStock) {}
}
