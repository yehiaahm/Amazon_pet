package com.animasys.modules.sales.service;

import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.dto.CreateSaleRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * Holds the transactional steps of idempotent checkout as separate proxied bean methods.
 * IdempotentCheckoutService used to call these on itself (this.txExecuteSale(...)), which
 * silently skips Spring's @Transactional entirely — no new transaction was ever opened, so
 * by the time the completed Sale was serialized for the response payload, the Hibernate
 * session from SaleService.createSale had already closed (LazyInitializationException on
 * every checkout). Calling across a real bean boundary makes REQUIRES_NEW actually apply.
 */
@Service
@RequiredArgsConstructor
@Slf4j
class IdempotentCheckoutTransactionExecutor {

    private final JdbcTemplate jdbcTemplate;
    private final SaleService saleService;
    private final ObjectMapper objectMapper;

    /** Own short transaction so the PROCESSING row is durable even if the sale itself later fails. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean tryInsertProcessing(String idempotencyKey, String tenantId) {
        try {
            jdbcTemplate.update(
                    "INSERT INTO idempotency_keys (idempotency_key, tenant_id, status, created_at) VALUES (?, ?, 'PROCESSING', ?)",
                    idempotencyKey, tenantId, Timestamp.from(Instant.now())
            );
            return true;
        } catch (DataIntegrityViolationException e) {
            return false;
        }
    }

    /** Sale creation and response-payload serialization must share one transaction/session. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Sale executeSaleAndComplete(String idempotencyKey, CreateSaleRequest request, List<SaleItem> items, String employeeId) {
        Sale sale = saleService.createSale(
                request.getPosSessionId(),
                employeeId,
                request.getCustomerId(),
                request.getTotalAmount(),
                request.getTax(),
                request.getDiscount(),
                request.getPaymentMethod(),
                items,
                request.getManagerUsername(),
                request.getManagerPassword(),
                request.isDelivery(),
                request.getDeliveryFee(),
                request.getLoyaltyRedeem(),
                request.getPayments()
        );

        String payload;
        try {
            payload = objectMapper.writeValueAsString(sale);
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize idempotent checkout response", e);
        }

        jdbcTemplate.update(
                "UPDATE idempotency_keys SET status = 'COMPLETED', completed_at = ?, response_payload = ?, sale_id = ? WHERE idempotency_key = ?",
                Timestamp.from(Instant.now()), payload, sale.getId(), idempotencyKey
        );

        return sale;
    }

    /** Own independent transaction so this commits even though the caller is about to rethrow. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(String idempotencyKey) {
        jdbcTemplate.update(
                "UPDATE idempotency_keys SET status = 'FAILED', completed_at = ? WHERE idempotency_key = ?",
                Timestamp.from(Instant.now()), idempotencyKey
        );
    }
}
