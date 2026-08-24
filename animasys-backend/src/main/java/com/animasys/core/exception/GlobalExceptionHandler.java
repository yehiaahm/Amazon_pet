package com.animasys.core.exception;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.modules.ai.exception.AIServiceException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.hibernate.StaleObjectStateException;
import jakarta.persistence.OptimisticLockException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import jakarta.validation.ConstraintViolationException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(ApiResponseWrapper.error(ex.getMessage()));
    }

    @ExceptionHandler(AIServiceException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleAiService(AIServiceException ex) {
        log.warn("AI service failure [{}]: {}", ex.getErrorCode(), ex.getMessage());
        return ResponseEntity
                .status(ex.getHttpStatus())
                .body(ApiResponseWrapper.error(ex.getMessage()));
    }

    @ExceptionHandler(BusinessRuleException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleBusinessRule(BusinessRuleException ex) {
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error(ex.getMessage()));
    }

    /**
     * Without this, a deliberately-thrown ResponseStatusException (e.g. IdempotentCheckoutService's
     * 409 "concurrent checkout in progress" / 400 "Idempotency-Key required") falls through every
     * handler above to the generic Exception catch-all below, which always returns 500 -- silently
     * discarding the exception's own intended status. This was the actual root cause of the raw-500-
     * on-losing-idempotency-replay gap flagged across three prior test sessions and never traced.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleResponseStatus(ResponseStatusException ex) {
        if (ex.getStatusCode().is5xxServerError()) {
            log.error("ResponseStatusException [{}]: {}", MDC.get("requestId"), ex.getReason(), ex);
        } else {
            log.warn("ResponseStatusException [{}]: {}", MDC.get("requestId"), ex.getReason());
        }
        return ResponseEntity
                .status(ex.getStatusCode())
                .body(ApiResponseWrapper.error(ex.getReason() != null ? ex.getReason() : "Request failed"));
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleRateLimitExceeded(RateLimitExceededException ex) {
        log.warn("Rate limit exceeded [{}]: {}", MDC.get("requestId"), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.TOO_MANY_REQUESTS)
                .body(ApiResponseWrapper.error(ex.getMessage()));
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleBadCredentials(BadCredentialsException ex) {
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponseWrapper.error("Invalid username or password"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .body(ApiResponseWrapper.error("Access denied: You do not have permissions for this operation"));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleAuthentication(AuthenticationException ex) {
        log.warn("Authentication failed [{}]: {}", MDC.get("requestId"), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponseWrapper.error("Authentication required or token invalid"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        log.warn("Method not supported [{}]: {}", MDC.get("requestId"), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(ApiResponseWrapper.error("HTTP method not supported for this endpoint"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleNoResource(NoResourceFoundException ex) {
        log.debug("Resource not found [{}]: {}", MDC.get("requestId"), ex.getResourcePath());
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(ApiResponseWrapper.error("Resource not found"));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleMissingParam(MissingServletRequestParameterException ex) {
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error("Missing required parameter: " + ex.getParameterName()));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleMediaType(HttpMediaTypeNotSupportedException ex) {
        return ResponseEntity
                .status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .body(ApiResponseWrapper.error("Unsupported Content-Type"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String defaultMsg = ex.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .reduce((a, b) -> a + ", " + b)
                .orElse("Validation failed");
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error(defaultMsg));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleConstraintViolation(ConstraintViolationException ex) {
        String msg = ex.getConstraintViolations().stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .reduce((a, b) -> a + ", " + b)
                .orElse("Validation failed");
        log.warn("Constraint violation: {}", msg);
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error(msg));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        log.warn("Type mismatch for parameter '{}': {}", ex.getName(), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error("Invalid value for parameter: " + ex.getName()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleUnreadable(HttpMessageNotReadableException ex) {
        log.warn("Malformed request body [{}]: {}", MDC.get("requestId"), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error("طلب غير صالح: تعذر قراءة بيانات الطلب"));
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleOptimisticLock(ObjectOptimisticLockingFailureException ex) {
        log.warn("Optimistic locking conflict: {}", ex.getMessage());
        return optimisticLockConflictResponse();
    }

    /**
     * Raw Hibernate/JPA optimistic-lock types that only surface when a flush happens outside a
     * Spring Data repository proxy (no automatic translation to ObjectOptimisticLockingFailureException).
     * Concurrent checkout under stock contention can hit either of these depending on exactly where
     * the flush occurs, so both need the same clean-409 treatment as the translated type above.
     */
    @ExceptionHandler(StaleObjectStateException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleStaleObjectState(StaleObjectStateException ex) {
        log.warn("Stale object state (optimistic lock) conflict: {}", ex.getMessage());
        return optimisticLockConflictResponse();
    }

    @ExceptionHandler(OptimisticLockException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleJpaOptimisticLock(OptimisticLockException ex) {
        log.warn("JPA optimistic lock conflict: {}", ex.getMessage());
        return optimisticLockConflictResponse();
    }

    private static ResponseEntity<ApiResponseWrapper<Void>> optimisticLockConflictResponse() {
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(ApiResponseWrapper.error("This record was modified by another user. Please refresh and try again."));
    }

    /**
     * A DB row-lock wait timeout (or deadlock, translated by Spring's exception translation) under
     * concurrent writes to the same row -- e.g. two checkouts racing to deduct the same stock batch.
     * This is the same class of "someone else is touching this record right now" condition as an
     * optimistic-lock conflict, just detected pessimistically by the DB instead. Clean 409, not 500.
     */
    @ExceptionHandler(CannotAcquireLockException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleLockAcquisitionFailure(CannotAcquireLockException ex) {
        log.warn("Row lock acquisition failed under contention: {}", ex.getMessage());
        return optimisticLockConflictResponse();
    }

    /**
     * Hikari could not hand out a connection within connectionTimeout -- a genuine resource-pressure
     * condition, not a request the client did anything wrong to cause and not a code defect either.
     * This is a real server failure (5xx), but a specific, clean one: 503 tells the client (and any
     * retry logic) this is transient capacity pressure, distinct from an unexpected 500 bug.
     */
    @ExceptionHandler(CannotCreateTransactionException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleConnectionPoolExhausted(CannotCreateTransactionException ex) {
        log.error("Database connection pool exhausted: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponseWrapper.error("The server is under heavy load. Please try again in a moment."));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleDataIntegrity(DataIntegrityViolationException ex) {
        log.error("Data integrity violation: {}", ex.getMessage());
        String detail = rootMessage(ex);
        String lower = detail == null ? "" : detail.toLowerCase();
        if (lower.contains("sku") || lower.contains("products")) {
            return ResponseEntity
                    .status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(ApiResponseWrapper.error("كود SKU مستخدم مسبقاً"));
        }
        if (lower.contains("brand")) {
            return ResponseEntity
                    .status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(ApiResponseWrapper.error("تعذر حفظ الماركة — اسم الماركة متعارض"));
        }
        if (lower.contains("barcode")) {
            return ResponseEntity
                    .status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(ApiResponseWrapper.error("هذا الباركود مستخدم بالفعل لمنتج آخر"));
        }
        return ResponseEntity
                .status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(ApiResponseWrapper.error("تعذر حفظ البيانات بسبب قيد في قاعدة البيانات. راجع المدخلات وحاول مجدداً."));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("Illegal argument [{}]: {}", MDC.get("requestId"), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error("Invalid request parameters"));
    }

    @ExceptionHandler(NullPointerException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleNullPointer(NullPointerException ex) {
        log.error("NullPointerException [{}]: {}", MDC.get("requestId"), ex.getMessage(), ex);
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error("بيانات الطلب غير مكتملة. تحقق من الحقول المطلوبة وحاول مجدداً."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleGeneric(Exception ex) {
        AIServiceException ai = findCause(ex, AIServiceException.class);
        if (ai != null) {
            return handleAiService(ai);
        }
        BusinessRuleException business = findCause(ex, BusinessRuleException.class);
        if (business != null) {
            return handleBusinessRule(business);
        }
        ResponseStatusException responseStatus = findCause(ex, ResponseStatusException.class);
        if (responseStatus != null) {
            return handleResponseStatus(responseStatus);
        }
        ResourceNotFoundException notFound = findCause(ex, ResourceNotFoundException.class);
        if (notFound != null) {
            return handleNotFound(notFound);
        }
        DataIntegrityViolationException integrity = findCause(ex, DataIntegrityViolationException.class);
        if (integrity != null) {
            return handleDataIntegrity(integrity);
        }
        // Checkout and other transactional code paths wrap failures in a generic RuntimeException
        // (e.g. IdempotentCheckoutService.runAndRecordOutcome) so the concurrency conflict types
        // registered above never match as the *thrown* type — only as a cause. Without this, every
        // optimistic-lock race under concurrent checkout falls through to a raw 500 below instead of
        // the clean 409 the dedicated handlers already implement.
        ObjectOptimisticLockingFailureException optimisticLock = findCause(ex, ObjectOptimisticLockingFailureException.class);
        if (optimisticLock != null) {
            return handleOptimisticLock(optimisticLock);
        }
        StaleObjectStateException staleState = findCause(ex, StaleObjectStateException.class);
        if (staleState != null) {
            return handleStaleObjectState(staleState);
        }
        OptimisticLockException jpaOptimisticLock = findCause(ex, OptimisticLockException.class);
        if (jpaOptimisticLock != null) {
            return handleJpaOptimisticLock(jpaOptimisticLock);
        }
        CannotAcquireLockException lockTimeout = findCause(ex, CannotAcquireLockException.class);
        if (lockTimeout != null) {
            return handleLockAcquisitionFailure(lockTimeout);
        }
        CannotCreateTransactionException poolExhausted = findCause(ex, CannotCreateTransactionException.class);
        if (poolExhausted != null) {
            return handleConnectionPoolExhausted(poolExhausted);
        }
        NullPointerException npe = findCause(ex, NullPointerException.class);
        if (npe != null) {
            return handleNullPointer(npe);
        }

        log.error("Unexpected error [{}] tenant={} employee={}: {}",
                MDC.get("requestId"), MDC.get("tenantId"), MDC.get("employeeId"), ex.getMessage(), ex);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponseWrapper.error("An unexpected error occurred. Please contact support."));
    }

    private static String rootMessage(Throwable ex) {
        Throwable cur = ex;
        String last = ex.getMessage();
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
            if (cur.getMessage() != null && !cur.getMessage().isBlank()) {
                last = cur.getMessage();
            }
        }
        return last;
    }

    @SuppressWarnings("unchecked")
    private static <T extends Throwable> T findCause(Throwable ex, Class<T> type) {
        Throwable cur = ex;
        while (cur != null) {
            if (type.isInstance(cur)) {
                return (T) cur;
            }
            if (cur.getCause() == cur) {
                break;
            }
            cur = cur.getCause();
        }
        return null;
    }
}
