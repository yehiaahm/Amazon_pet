package com.animasys.modules.analytics.repository;

import com.animasys.core.util.BusinessTimeZone;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Repository
public class DashboardAnalyticsRepository {

    private static final ZoneId ZONE = BusinessTimeZone.ZONE;
    private static final String COUNTABLE_SALE =
            "(s.status IS NULL OR TRIM(s.status) = '' OR UPPER(s.status) IN ('COMPLETED', 'PARTIALLY_REFUNDED'))";

    @PersistenceContext
    private EntityManager em;

    public PeriodMetrics aggregatePeriod(String tenantId, LocalDate from, LocalDate to) {
        Instant fromInstant = from.atStartOfDay(ZONE).toInstant();
        Instant toExclusive = to.plusDays(1).atStartOfDay(ZONE).toInstant();
        Object[] sales = (Object[]) em.createNativeQuery(salePeriodSql())
                .setParameter("tenantId", tenantId)
                .setParameter("from", fromInstant)
                .setParameter("toExclusive", toExclusive)
                .getSingleResult();
        BigDecimal expenses = scalarDecimal(em.createNativeQuery("""
                SELECT COALESCE(SUM(ex.amount), 0) FROM expenses ex
                WHERE ex.tenant_id = :tenantId AND ex.date >= :fromDate AND ex.date <= :toDate
                """)
                .setParameter("tenantId", tenantId)
                .setParameter("fromDate", from)
                .setParameter("toDate", to));
        BigDecimal purchases = scalarDecimal(em.createNativeQuery("""
                SELECT COALESCE(SUM(pi.grand_total), 0) FROM purchase_invoices pi
                JOIN employees e ON pi.uploaded_by = e.id
                WHERE e.tenant_id = :tenantId
                  AND (pi.status IS NULL OR UPPER(pi.status) = 'COMPLETED')
                  AND SUBSTRING(pi.invoice_date, 1, 10) >= :fromStr
                  AND SUBSTRING(pi.invoice_date, 1, 10) <= :toStr
                """)
                .setParameter("tenantId", tenantId)
                .setParameter("fromStr", from.toString())
                .setParameter("toStr", to.toString()));
        return new PeriodMetrics(
                toBd(sales[0]), toBd(sales[1]), toBd(sales[2]), toBd(sales[3]),
                toLong(sales[4]), expenses, purchases);
    }

    public KpiSalesMetrics aggregateKpiSales(String tenantId) {
        Object[] row = (Object[]) em.createNativeQuery(saleAllTimeSql())
                .setParameter("tenantId", tenantId)
                .getSingleResult();
        return new KpiSalesMetrics(toBd(row[0]), toBd(row[1]), toLong(row[4]));
    }

    public BigDecimal sumExpenses(String tenantId) {
        return scalarDecimal(em.createNativeQuery(
                "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE tenant_id = :tenantId")
                .setParameter("tenantId", tenantId));
    }

    public double repeatCustomerRate(String tenantId) {
        Object[] row = (Object[]) em.createNativeQuery("""
                SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(CASE WHEN cnt >= 2 THEN 1 ELSE 0 END), 0)
                FROM (
                  SELECT COUNT(*) AS cnt FROM sales s
                  JOIN employees e ON s.employee_id = e.id
                  WHERE e.tenant_id = :tenantId AND s.customer_id IS NOT NULL AND """
                + COUNTABLE_SALE + """
                  GROUP BY s.customer_id
                ) t
                """)
                .setParameter("tenantId", tenantId)
                .getSingleResult();
        long total = toLong(row[0]);
        long repeat = toLong(row[1]);
        return total == 0 ? 0.0 : (repeat * 100.0) / total;
    }

    public long deadStockCount(String tenantId, Instant soldSince) {
        Number n = (Number) em.createNativeQuery("""
                SELECT COUNT(*) FROM product_variants pv
                JOIN products p ON pv.product_id = p.id
                WHERE p.tenant_id = :tenantId AND pv.stock_quantity > 0
                  AND NOT EXISTS (
                    SELECT 1 FROM sale_items si
                    JOIN sales s ON si.sale_id = s.id
                    JOIN employees e ON s.employee_id = e.id
                    WHERE si.item_id = pv.id AND UPPER(si.type) = 'PRODUCT'
                      AND e.tenant_id = :tenantId AND s.date >= :soldSince AND """
                + COUNTABLE_SALE + """
                  )
                """)
                .setParameter("tenantId", tenantId)
                .setParameter("soldSince", soldSince)
                .getSingleResult();
        return n.longValue();
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> topProducts(String tenantId, LocalDate from, LocalDate to, int limit) {
        return mapRows(em.createNativeQuery("""
                SELECT si.name,
                       COALESCE(SUM(GREATEST(0, si.quantity - si.quantity_returned)), 0),
                       COALESCE(SUM(si.price * GREATEST(0, si.quantity - si.quantity_returned)), 0)
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                JOIN employees e ON s.employee_id = e.id
                WHERE e.tenant_id = :tenantId AND UPPER(si.type) = 'PRODUCT'
                  AND s.date >= :from AND s.date < :toExclusive AND """
                + COUNTABLE_SALE + """
                GROUP BY si.item_id, si.name
                ORDER BY 2 DESC
                LIMIT :lim
                """)
                .setParameter("tenantId", tenantId)
                .setParameter("from", from.atStartOfDay(ZONE).toInstant())
                .setParameter("toExclusive", to.plusDays(1).atStartOfDay(ZONE).toInstant())
                .setParameter("lim", limit)
                .getResultList(), "name", "quantity", "revenue");
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> topCustomers(String tenantId, LocalDate from, LocalDate to, int limit) {
        return mapSpendRows(em.createNativeQuery(customerSpendSql() + " ORDER BY 3 DESC LIMIT :lim")
                .setParameter("tenantId", tenantId)
                .setParameter("from", from.atStartOfDay(ZONE).toInstant())
                .setParameter("toExclusive", to.plusDays(1).atStartOfDay(ZONE).toInstant())
                .setParameter("lim", limit)
                .getResultList());
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> topSuppliers(String tenantId, LocalDate from, LocalDate to, int limit) {
        return mapInvoiceRows(em.createNativeQuery("""
                SELECT pi.supplier_name, COUNT(*), COALESCE(SUM(pi.grand_total), 0)
                FROM purchase_invoices pi
                JOIN employees e ON pi.uploaded_by = e.id
                WHERE e.tenant_id = :tenantId
                  AND (pi.status IS NULL OR UPPER(pi.status) = 'COMPLETED')
                  AND SUBSTRING(pi.invoice_date, 1, 10) >= :fromStr
                  AND SUBSTRING(pi.invoice_date, 1, 10) <= :toStr
                GROUP BY pi.supplier_id, pi.supplier_name
                ORDER BY 3 DESC
                LIMIT :lim
                """)
                .setParameter("tenantId", tenantId)
                .setParameter("fromStr", from.toString())
                .setParameter("toStr", to.toString())
                .setParameter("lim", limit)
                .getResultList());
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> monthlyChart(String tenantId, int months) {
        LocalDate anchor = LocalDate.now(ZONE).withDayOfMonth(1);
        LocalDate start = anchor.minusMonths(months - 1L);
        Instant from = start.atStartOfDay(ZONE).toInstant();
        List<Object[]> salesRows = em.createNativeQuery("""
                SELECT EXTRACT(YEAR FROM s.date) AS yr, EXTRACT(MONTH FROM s.date) AS mo,
                       COALESCE(SUM(m.sale_revenue), 0), COALESCE(SUM(m.product_revenue), 0),
                       COALESCE(SUM(m.service_revenue), 0)
                FROM sales s
                JOIN employees e ON s.employee_id = e.id
                JOIN (""" + saleMetricInner() + ") m ON m.sale_id = s.id\n"
                + "WHERE e.tenant_id = :tenantId AND s.date >= :from AND " + COUNTABLE_SALE + "\n"
                + "GROUP BY EXTRACT(YEAR FROM s.date), EXTRACT(MONTH FROM s.date)\n"
                + "ORDER BY yr, mo")
                .setParameter("tenantId", tenantId)
                .setParameter("from", from)
                .getResultList();
        Map<String, BigDecimal[]> expenseByMonth = monthAmountMap(em.createNativeQuery("""
                SELECT EXTRACT(YEAR FROM ex.date), EXTRACT(MONTH FROM ex.date), COALESCE(SUM(ex.amount), 0)
                FROM expenses ex WHERE ex.tenant_id = :tenantId AND ex.date >= :startDate
                GROUP BY EXTRACT(YEAR FROM ex.date), EXTRACT(MONTH FROM ex.date)
                """)
                .setParameter("tenantId", tenantId)
                .setParameter("startDate", start));
        Map<String, BigDecimal[]> purchaseByMonth = monthAmountMap(em.createNativeQuery("""
                SELECT EXTRACT(YEAR FROM CAST(SUBSTRING(pi.invoice_date,1,10) AS DATE)),
                       EXTRACT(MONTH FROM CAST(SUBSTRING(pi.invoice_date,1,10) AS DATE)),
                       COALESCE(SUM(pi.grand_total), 0)
                FROM purchase_invoices pi JOIN employees e ON pi.uploaded_by = e.id
                WHERE e.tenant_id = :tenantId
                  AND (pi.status IS NULL OR UPPER(pi.status) = 'COMPLETED')
                  AND SUBSTRING(pi.invoice_date, 1, 10) >= :startStr
                GROUP BY 1, 2
                """)
                .setParameter("tenantId", tenantId)
                .setParameter("startStr", start.toString()));

        String[] arabicMonths = {"يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
                "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"};
        List<Map<String, Object>> points = new ArrayList<>();
        Map<String, BigDecimal[]> salesMap = new LinkedHashMap<>();
        for (Object[] r : salesRows) {
            salesMap.put(monthKey(r[0], r[1]), new BigDecimal[]{toBd(r[2]), toBd(r[3]), toBd(r[4])});
        }
        for (int i = months - 1; i >= 0; i--) {
            LocalDate mStart = anchor.minusMonths(i);
            String key = monthKey(mStart.getYear(), mStart.getMonthValue());
            BigDecimal[] s = salesMap.getOrDefault(key, new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal exp = expenseByMonth.getOrDefault(key, new BigDecimal[]{BigDecimal.ZERO})[0];
            BigDecimal pur = purchaseByMonth.getOrDefault(key, new BigDecimal[]{BigDecimal.ZERO})[0];
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("month", arabicMonths[mStart.getMonthValue() - 1] + " "
                    + String.format(Locale.US, "%02d", mStart.getYear() % 100));
            point.put("sales", s[0].setScale(2, RoundingMode.HALF_UP));
            point.put("expenses", exp.setScale(2, RoundingMode.HALF_UP));
            point.put("purchases", pur.setScale(2, RoundingMode.HALF_UP));
            point.put("productRevenue", s[1].setScale(2, RoundingMode.HALF_UP));
            point.put("serviceRevenue", s[2].setScale(2, RoundingMode.HALF_UP));
            points.add(point);
        }
        return points;
    }

    private String saleAllTimeSql() {
        return """
                SELECT COALESCE(SUM(m.sale_revenue), 0), COALESCE(SUM(m.sale_cogs), 0),
                       COALESCE(SUM(m.product_revenue), 0), COALESCE(SUM(m.service_revenue), 0),
                       COUNT(*)
                FROM sales s
                JOIN employees e ON s.employee_id = e.id
                JOIN (""" + saleMetricInner() + ") m ON m.sale_id = s.id\n"
                + "WHERE e.tenant_id = :tenantId AND " + COUNTABLE_SALE;
    }

    private String salePeriodSql() {
        return """
                SELECT COALESCE(SUM(m.sale_revenue), 0), COALESCE(SUM(m.sale_cogs), 0),
                       COALESCE(SUM(m.product_revenue), 0), COALESCE(SUM(m.service_revenue), 0),
                       COUNT(*)
                FROM sales s
                JOIN employees e ON s.employee_id = e.id
                JOIN (""" + saleMetricInner() + ") m ON m.sale_id = s.id\n"
                + "WHERE e.tenant_id = :tenantId AND " + COUNTABLE_SALE + "\n"
                + "AND s.date >= :from AND s.date < :toExclusive";
    }

    private String saleMetricInner() {
        return """
                SELECT s.id AS sale_id,
                  CASE WHEN UPPER(s.status) = 'REFUNDED' THEN 0
                       WHEN COALESCE(line.cnt, 0) > 0 THEN GREATEST(0,
                         line.net_subtotal - (COALESCE(s.discount, 0) * line.net_subtotal / NULLIF(line.gross_subtotal, 0)))
                       ELSE GREATEST(0, s.total_amount - COALESCE(s.tax, 0)) END AS sale_revenue,
                  CASE WHEN UPPER(s.status) = 'REFUNDED' THEN 0 ELSE COALESCE(line.cogs, 0) END AS sale_cogs,
                  CASE WHEN COALESCE(line.cnt, 0) > 0 THEN GREATEST(0,
                         line.product_net - (COALESCE(s.discount, 0) * line.product_net / NULLIF(line.gross_subtotal, 0)))
                       ELSE 0 END AS product_revenue,
                  CASE WHEN COALESCE(line.cnt, 0) > 0 THEN GREATEST(0,
                         line.service_net - (COALESCE(s.discount, 0) * line.service_net / NULLIF(line.gross_subtotal, 0)))
                       ELSE 0 END AS service_revenue
                FROM sales s
                LEFT JOIN (
                  SELECT si.sale_id, COUNT(*) AS cnt,
                    SUM(si.price * GREATEST(0, si.quantity - si.quantity_returned)) AS net_subtotal,
                    SUM(si.price * si.quantity) AS gross_subtotal,
                    SUM(CASE WHEN UPPER(si.type) = 'PRODUCT'
                      THEN si.price * GREATEST(0, si.quantity - si.quantity_returned) ELSE 0 END) AS product_net,
                    SUM(CASE WHEN UPPER(si.type) = 'SERVICE'
                      THEN si.price * GREATEST(0, si.quantity - si.quantity_returned) ELSE 0 END) AS service_net,
                    SUM(CASE WHEN UPPER(si.type) = 'PRODUCT' THEN
                      CASE WHEN si.cogs > 0 THEN si.cogs
                           ELSE si.cost * GREATEST(0, si.quantity - si.quantity_returned) END
                      ELSE 0 END) AS cogs
                  FROM sale_items si GROUP BY si.sale_id
                ) line ON line.sale_id = s.id
                """;
    }

    private String customerSpendSql() {
        return """
                SELECT c.name, COUNT(DISTINCT s.id), COALESCE(SUM(m.sale_revenue), 0)
                FROM sales s
                JOIN employees e ON s.employee_id = e.id
                JOIN customers c ON s.customer_id = c.id
                JOIN (""" + saleMetricInner() + ") m ON m.sale_id = s.id\n"
                + "WHERE e.tenant_id = :tenantId AND s.date >= :from AND s.date < :toExclusive AND "
                + COUNTABLE_SALE + "\nGROUP BY c.id, c.name";
    }

    @SuppressWarnings("unchecked")
    private Map<String, BigDecimal[]> monthAmountMap(Query q) {
        Map<String, BigDecimal[]> map = new LinkedHashMap<>();
        for (Object[] r : (List<Object[]>) q.getResultList()) {
            map.put(monthKey(r[0], r[1]), new BigDecimal[]{toBd(r[2])});
        }
        return map;
    }

    private String monthKey(Object year, Object month) {
        return toLong(year) + "-" + toLong(month);
    }

    private List<Map<String, Object>> mapRows(List<Object[]> rows, String... keys) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put(keys[0], r[0]);
            m.put(keys[1], toBd(r[1]).setScale(0, RoundingMode.HALF_UP));
            m.put(keys[2], toBd(r[2]).setScale(2, RoundingMode.HALF_UP));
            out.add(m);
        }
        return out;
    }

    private List<Map<String, Object>> mapSpendRows(List<Object[]> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", r[0]);
            m.put("orderCount", toLong(r[1]));
            m.put("totalSpend", toBd(r[2]).setScale(2, RoundingMode.HALF_UP));
            out.add(m);
        }
        return out;
    }

    private List<Map<String, Object>> mapInvoiceRows(List<Object[]> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", r[0]);
            m.put("invoiceCount", toLong(r[1]));
            m.put("totalPurchases", toBd(r[2]).setScale(2, RoundingMode.HALF_UP));
            out.add(m);
        }
        return out;
    }

    private BigDecimal scalarDecimal(Query q) {
        Object r = q.getSingleResult();
        return r == null ? BigDecimal.ZERO : toBd(r);
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

    public record PeriodMetrics(
            BigDecimal revenue, BigDecimal cogs, BigDecimal productRevenue, BigDecimal serviceRevenue,
            long saleCount, BigDecimal expenses, BigDecimal purchases) {
        public BigDecimal netProfit() {
            return revenue.subtract(cogs).subtract(expenses);
        }
        public BigDecimal grossMargin() {
            if (revenue.compareTo(BigDecimal.ZERO) <= 0) return BigDecimal.ZERO;
            return revenue.subtract(cogs).divide(revenue, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));
        }
    }

    public record KpiSalesMetrics(BigDecimal revenue, BigDecimal cogs, long saleCount) {}

    public String explainPeriodAggregation(String tenantId, LocalDate from, LocalDate to) {
        Instant fromInstant = from.atStartOfDay(ZONE).toInstant();
        Instant toExclusive = to.plusDays(1).atStartOfDay(ZONE).toInstant();
        Object result = em.createNativeQuery("EXPLAIN " + salePeriodSql())
                .setParameter("tenantId", tenantId)
                .setParameter("from", fromInstant)
                .setParameter("toExclusive", toExclusive)
                .getSingleResult();
        return result == null ? "" : result.toString();
    }
}
