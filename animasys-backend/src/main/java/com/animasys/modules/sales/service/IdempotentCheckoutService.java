package com.animasys.modules.sales.service;

import com.animasys.modules.sales.domain.IdempotencyKey;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.dto.CreateSaleRequest;
import com.animasys.modules.sales.repository.IdempotencyKeyRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class IdempotentCheckoutService {

    private final JdbcTemplate jdbcTemplate;
    private final IdempotencyKeyRepository repository;
    private final IdempotentCheckoutTransactionExecutor transactionExecutor;
    private final ObjectMapper objectMapper;

    public Sale processCheckout(String idempotencyKey, CreateSaleRequest request, List<SaleItem> items, String tenantId, String employeeId) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key header is required");
        }

        if (!transactionExecutor.tryInsertProcessing(idempotencyKey, tenantId)) {
            log.warn("Idempotency key collision detected for key: {}", idempotencyKey);
            return handleDuplicateKey(idempotencyKey, request, items, tenantId, employeeId);
        }

        return runAndRecordOutcome(idempotencyKey, request, items, employeeId);
    }

    private Sale handleDuplicateKey(String idempotencyKey, CreateSaleRequest request, List<SaleItem> items, String tenantId, String employeeId) {
        Optional<IdempotencyKey> existingOpt = repository.findById(idempotencyKey);
        if (existingOpt.isEmpty()) {
            throw new IllegalStateException("Duplicate key exception but row not found: " + idempotencyKey);
        }

        IdempotencyKey record = existingOpt.get();

        if ("COMPLETED".equals(record.getStatus())) {
            try {
                return objectMapper.readValue(record.getResponsePayload(), Sale.class);
            } catch (Exception e) {
                log.error("Failed to deserialize payload for key: {}", idempotencyKey, e);
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to deserialize idempotent response");
            }
        }

        if ("PROCESSING".equals(record.getStatus())) {
            Instant threshold = Instant.now().minus(60, ChronoUnit.SECONDS);
            if (record.getCreatedAt().isAfter(threshold)) {
                // It's a recent processing request, concurrent execution is in progress
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Concurrent checkout attempt in progress");
            }
        }

        // Stale PROCESSING (crashed) or FAILED. We try to take over.
        int updated = jdbcTemplate.update(
                "UPDATE idempotency_keys SET status = 'PROCESSING', created_at = ? WHERE idempotency_key = ? AND status = ?",
                Timestamp.from(Instant.now()), idempotencyKey, record.getStatus()
        );

        if (updated == 1) {
            // We took over! Proceed with sale inside a new transaction.
            return runAndRecordOutcome(idempotencyKey, request, items, employeeId);
        } else {
            // Someone else took over, or it just completed! Retry checking.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Concurrent checkout attempt taking over");
        }
    }

    private Sale runAndRecordOutcome(String idempotencyKey, CreateSaleRequest request, List<SaleItem> items, String employeeId) {
        try {
            return transactionExecutor.executeSaleAndComplete(idempotencyKey, request, items, employeeId);
        } catch (Exception ex) {
            // Recorded in its own transaction so it survives the sale's own rollback.
            transactionExecutor.markFailed(idempotencyKey);
            throw new RuntimeException("Checkout transaction failed", ex);
        }
    }
}
