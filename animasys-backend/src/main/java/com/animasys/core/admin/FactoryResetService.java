package com.animasys.core.admin;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
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

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional
    public Map<String, Object> resetToFirstUse(String tenantId) {
        Map<String, Long> cleared = new LinkedHashMap<>();

        cleared.put("sale_item_batch_allocations", delete("""
                DELETE siba FROM sale_item_batch_allocations siba
                INNER JOIN sale_items si ON siba.sale_item_id = si.id
                INNER JOIN sales s ON si.sale_id = s.id
                INNER JOIN employees e ON s.employee_id = e.id
                WHERE e.tenant_id = :tenantId
                """, tenantId));

        cleared.put("sale_items", delete("""
                DELETE si FROM sale_items si
                INNER JOIN sales s ON si.sale_id = s.id
                INNER JOIN employees e ON s.employee_id = e.id
                WHERE e.tenant_id = :tenantId
                """, tenantId));

        cleared.put("sales", delete("""
                DELETE s FROM sales s
                INNER JOIN employees e ON s.employee_id = e.id
                WHERE e.tenant_id = :tenantId
                """, tenantId));

        cleared.put("pos_sessions", delete("""
                DELETE ps FROM pos_sessions ps
                INNER JOIN branches b ON ps.branch_id = b.id
                WHERE b.tenant_id = :tenantId
                """, tenantId));

        cleared.put("inventory_ledger_transactions", delete(
                "DELETE FROM inventory_ledger_transactions WHERE tenant_id = :tenantId", tenantId));

        cleared.put("inventory_adjustment_items", delete("""
                DELETE iai FROM inventory_adjustment_items iai
                INNER JOIN inventory_adjustments ia ON iai.adjustment_id = ia.id
                WHERE ia.tenant_id = :tenantId
                """, tenantId));

        cleared.put("inventory_adjustments", delete(
                "DELETE FROM inventory_adjustments WHERE tenant_id = :tenantId", tenantId));

        cleared.put("stock_transfers", delete(
                "DELETE FROM stock_transfers WHERE tenant_id = :tenantId", tenantId));

        cleared.put("inventory_batches", delete(
                "DELETE FROM inventory_batches WHERE tenant_id = :tenantId", tenantId));

        cleared.put("appointments", delete("""
                DELETE a FROM appointments a
                INNER JOIN pets p ON a.pet_id = p.id
                INNER JOIN customers c ON p.customer_id = c.id
                WHERE c.tenant_id = :tenantId
                """, tenantId));

        cleared.put("boarding_reservations", delete("""
                DELETE br FROM boarding_reservations br
                INNER JOIN pets p ON br.pet_id = p.id
                INNER JOIN customers c ON p.customer_id = c.id
                WHERE c.tenant_id = :tenantId
                """, tenantId));

        cleared.put("pets", delete("""
                DELETE p FROM pets p
                INNER JOIN customers c ON p.customer_id = c.id
                WHERE c.tenant_id = :tenantId
                """, tenantId));

        cleared.put("customers", delete(
                "DELETE FROM customers WHERE tenant_id = :tenantId", tenantId));

        cleared.put("journal_entries", delete("""
                DELETE je FROM journal_entries je
                INNER JOIN journals j ON je.journal_id = j.id
                WHERE j.tenant_id = :tenantId
                """, tenantId));

        cleared.put("journals", delete(
                "DELETE FROM journals WHERE tenant_id = :tenantId", tenantId));

        cleared.put("expenses", delete(
                "DELETE FROM expenses WHERE tenant_id = :tenantId", tenantId));

        cleared.put("daily_closings", delete("""
                DELETE dc FROM daily_closings dc
                INNER JOIN branches b ON dc.branch_id = b.id
                WHERE b.tenant_id = :tenantId
                """, tenantId));

        cleared.put("purchase_invoice_installments", delete("""
                DELETE pii FROM purchase_invoice_installments pii
                INNER JOIN purchase_invoices pi ON pii.purchase_invoice_id = pi.id
                INNER JOIN employees e ON pi.uploaded_by = e.id
                WHERE e.tenant_id = :tenantId
                """, tenantId));

        cleared.put("purchase_invoice_items", delete("""
                DELETE pii FROM purchase_invoice_items pii
                INNER JOIN purchase_invoices pi ON pii.purchase_invoice_id = pi.id
                INNER JOIN employees e ON pi.uploaded_by = e.id
                WHERE e.tenant_id = :tenantId
                """, tenantId));

        cleared.put("purchase_invoices", delete("""
                DELETE pi FROM purchase_invoices pi
                INNER JOIN employees e ON pi.uploaded_by = e.id
                WHERE e.tenant_id = :tenantId
                """, tenantId));

        cleared.put("import_session_items", delete("""
                DELETE isi FROM import_session_items isi
                INNER JOIN import_sessions iss ON isi.session_id = iss.id
                INNER JOIN employees e ON iss.uploaded_by = e.id
                WHERE e.tenant_id = :tenantId
                """, tenantId));

        cleared.put("import_sessions", delete("""
                DELETE iss FROM import_sessions iss
                INNER JOIN employees e ON iss.uploaded_by = e.id
                WHERE e.tenant_id = :tenantId
                """, tenantId));

        cleared.put("stock_movements", delete("""
                DELETE sm FROM stock_movements sm
                INNER JOIN employees e ON sm.employee_id = e.id
                WHERE e.tenant_id = :tenantId
                """, tenantId));

        cleared.put("warehouse_stocks", delete("""
                DELETE ws FROM warehouse_stocks ws
                INNER JOIN product_variants pv ON ws.product_variant_id = pv.id
                WHERE pv.tenant_id = :tenantId
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
                DELETE al FROM audit_logs al
                INNER JOIN employees e ON al.employee_id = e.id
                WHERE e.tenant_id = :tenantId
                """, tenantId));

        try {
            entityManager.createNativeQuery(
                            "UPDATE bank_accounts SET balance = 0 WHERE tenant_id = :tenantId")
                    .setParameter("tenantId", tenantId)
                    .executeUpdate();
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
            return entityManager.createNativeQuery(sql)
                    .setParameter("tenantId", tenantId)
                    .executeUpdate();
        } catch (Exception ex) {
            return 0L;
        }
    }
}
