package com.animasys.core.admin;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Wipes transactional / catalog data for a single tenant so the shop feels brand-new,
 * while keeping login accounts, branch, warehouses, and bank shell for that tenant.
 */
@Service
@RequiredArgsConstructor
public class FactoryResetService {

    private static final Logger log = LoggerFactory.getLogger(FactoryResetService.class);
    private final NamedParameterJdbcTemplate jdbcTemplate;

    @Transactional
    public Map<String, Object> resetToFirstUse(String tenantId) {
        Map<String, Long> cleared = new LinkedHashMap<>();

        // Standard SQL DELETE with IN subqueries for H2 and MySQL compatibility

        // Loyalty ledger/accounts reference customers, sales and employees without
        // ON DELETE CASCADE, so they must be cleared before those tables or the
        // reset aborts with a foreign-key violation.
        cleared.put("loyalty_ledger_entries", delete(
                "DELETE FROM loyalty_ledger_entries WHERE tenant_id = :tenantId", tenantId));

        cleared.put("loyalty_accounts", delete(
                "DELETE FROM loyalty_accounts WHERE tenant_id = :tenantId", tenantId));

        cleared.put("sale_payments", delete("""
                DELETE FROM sale_payments WHERE sale_id IN (
                    SELECT s.id FROM sales s
                    INNER JOIN employees e ON s.employee_id = e.id
                    WHERE e.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("sale_item_batch_allocations", delete("""
                DELETE FROM sale_item_batch_allocations WHERE sale_item_id IN (
                    SELECT si.id FROM sale_items si
                    INNER JOIN sales s ON si.sale_id = s.id
                    INNER JOIN employees e ON s.employee_id = e.id
                    WHERE e.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("sale_items", delete("""
                DELETE FROM sale_items WHERE sale_id IN (
                    SELECT s.id FROM sales s
                    INNER JOIN employees e ON s.employee_id = e.id
                    WHERE e.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("sales", delete("""
                DELETE FROM sales WHERE employee_id IN (
                    SELECT e.id FROM employees e
                    WHERE e.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("pos_sessions", delete("""
                DELETE FROM pos_sessions WHERE branch_id IN (
                    SELECT b.id FROM branches b
                    WHERE b.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("inventory_ledger_transactions", delete(
                "DELETE FROM inventory_ledger_transactions WHERE tenant_id = :tenantId", tenantId));

        cleared.put("inventory_adjustment_items", delete("""
                DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (
                    SELECT ia.id FROM inventory_adjustments ia
                    WHERE ia.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("inventory_adjustments", delete(
                "DELETE FROM inventory_adjustments WHERE tenant_id = :tenantId", tenantId));

        cleared.put("stock_transfers", delete(
                "DELETE FROM stock_transfers WHERE tenant_id = :tenantId", tenantId));

        cleared.put("inventory_batches", delete(
                "DELETE FROM inventory_batches WHERE tenant_id = :tenantId", tenantId));

        cleared.put("appointments", delete("""
                DELETE FROM appointments WHERE pet_id IN (
                    SELECT p.id FROM pets p
                    INNER JOIN customers c ON p.customer_id = c.id
                    WHERE c.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("boarding_reservations", delete("""
                DELETE FROM boarding_reservations WHERE pet_id IN (
                    SELECT p.id FROM pets p
                    INNER JOIN customers c ON p.customer_id = c.id
                    WHERE c.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("pets", delete("""
                DELETE FROM pets WHERE customer_id IN (
                    SELECT c.id FROM customers c
                    WHERE c.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("customers", delete(
                "DELETE FROM customers WHERE tenant_id = :tenantId", tenantId));

        cleared.put("journal_entries", delete("""
                DELETE FROM journal_entries WHERE journal_id IN (
                    SELECT j.id FROM journals j
                    WHERE j.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("journals", delete(
                "DELETE FROM journals WHERE tenant_id = :tenantId", tenantId));

        cleared.put("expenses", delete(
                "DELETE FROM expenses WHERE tenant_id = :tenantId", tenantId));

        cleared.put("daily_closings", delete("""
                DELETE FROM daily_closings WHERE branch_id IN (
                    SELECT b.id FROM branches b
                    WHERE b.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("purchase_invoice_installments", delete("""
                DELETE FROM purchase_invoice_installments WHERE purchase_invoice_id IN (
                    SELECT pi.id FROM purchase_invoices pi
                    INNER JOIN employees e ON pi.uploaded_by = e.id
                    WHERE e.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("purchase_invoice_items", delete("""
                DELETE FROM purchase_invoice_items WHERE purchase_invoice_id IN (
                    SELECT pi.id FROM purchase_invoices pi
                    INNER JOIN employees e ON pi.uploaded_by = e.id
                    WHERE e.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("purchase_invoices", delete("""
                DELETE FROM purchase_invoices WHERE uploaded_by IN (
                    SELECT e.id FROM employees e
                    WHERE e.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("stock_movements", delete("""
                DELETE FROM stock_movements WHERE employee_id IN (
                    SELECT e.id FROM employees e
                    WHERE e.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("warehouse_stocks", delete("""
                DELETE FROM warehouse_stocks WHERE product_variant_id IN (
                    SELECT pv.id FROM product_variants pv
                    WHERE pv.tenant_id = :tenantId
                )
                """, tenantId));

        cleared.put("product_variants", delete(
                "DELETE FROM product_variants WHERE tenant_id = :tenantId", tenantId));

        cleared.put("products", delete(
                "DELETE FROM products WHERE tenant_id = :tenantId", tenantId));

        cleared.put("categories", delete(
                "DELETE FROM categories WHERE tenant_id = :tenantId", tenantId));

        cleared.put("brands", delete(
                "DELETE FROM brands WHERE tenant_id = :tenantId", tenantId));

        cleared.put("suppliers", delete(
                "DELETE FROM suppliers WHERE tenant_id = :tenantId", tenantId));

        cleared.put("services", delete(
                "DELETE FROM services WHERE tenant_id = :tenantId", tenantId));

        cleared.put("audit_logs", delete("""
                DELETE FROM audit_logs WHERE employee_id IN (
                    SELECT e.id FROM employees e
                    WHERE e.tenant_id = :tenantId
                )
                """, tenantId));

        try {
            jdbcTemplate.update(
                    "UPDATE bank_accounts SET balance = 0 WHERE tenant_id = :tenantId",
                    new MapSqlParameterSource("tenantId", tenantId)
            );
        } catch (Exception ignored) {
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("tenantId", tenantId);
        summary.put("clearedTables", cleared);
        summary.put("kept", List.of("tenants", "branches", "employees", "warehouses", "bank_accounts"));
        summary.put("message", "Tenant reset to first-use state (including FIFO batches and ledger)");
        return summary;
    }

    private long delete(String sql, String tenantId) {
        try {
            return jdbcTemplate.update(sql, new MapSqlParameterSource("tenantId", tenantId));
        } catch (Exception ex) {
            log.error("Failed to execute factory reset query: {}", sql, ex);
            throw new RuntimeException("Factory reset failed: " + ex.getMessage(), ex);
        }
    }
}
