package com.animasys.core.exception;

import org.junit.jupiter.api.Test;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.http.HttpStatus;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the Phase 4 hardening gap found in the post-hardening soak test: under heavy concurrent
 * contention, checkout code wraps failures in a generic RuntimeException, so the handlers below
 * must match both the directly-thrown type AND when it's buried in a cause chain -- otherwise the
 * client sees a raw, unhelpful 500 for what is really a clean "try again" business/concurrency
 * condition (409) or a transient capacity-pressure condition (503), not an application bug.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void lockAcquisitionFailureReturnsClean409_directType() {
        var response = handler.handleLockAcquisitionFailure(
                new CannotAcquireLockException("could not acquire lock", new RuntimeException("lock wait timeout")));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().isSuccess()).isFalse();
    }

    @Test
    void lockAcquisitionFailureReturnsClean409_wrappedInGenericRuntimeException() {
        RuntimeException wrapped = new RuntimeException("Checkout transaction failed",
                new CannotAcquireLockException("could not acquire lock", new RuntimeException("lock wait timeout")));
        var response = handler.handleGeneric(wrapped);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void connectionPoolExhaustedReturnsClean503_directType() {
        var response = handler.handleConnectionPoolExhausted(
                new CannotCreateTransactionException("could not open connection", new RuntimeException("timeout")));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody().isSuccess()).isFalse();
    }

    @Test
    void connectionPoolExhaustedReturnsClean503_wrappedInGenericRuntimeException() {
        RuntimeException wrapped = new RuntimeException("Checkout transaction failed",
                new CannotCreateTransactionException("could not open connection", new RuntimeException("timeout")));
        var response = handler.handleGeneric(wrapped);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Test
    void optimisticLockStillReturnsClean409_wrappedInGenericRuntimeException() {
        RuntimeException wrapped = new RuntimeException("Checkout transaction failed",
                new ObjectOptimisticLockingFailureException("Sale", "sale-1"));
        var response = handler.handleGeneric(wrapped);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void responseStatusExceptionReturnsItsOwnStatus_directType() {
        var response = handler.handleResponseStatus(
                new ResponseStatusException(HttpStatus.CONFLICT, "Concurrent checkout attempt in progress"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().getMessage()).isEqualTo("Concurrent checkout attempt in progress");
    }

    @Test
    void responseStatusExceptionReturnsItsOwnStatus_wrappedInGenericRuntimeException() {
        RuntimeException wrapped = new RuntimeException("Checkout transaction failed",
                new ResponseStatusException(HttpStatus.CONFLICT, "Concurrent checkout attempt in progress"));
        var response = handler.handleGeneric(wrapped);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void genuinelyUnknownFailureStillReturns500_noLeakedStackTrace() {
        var response = handler.handleGeneric(new RuntimeException("something truly unexpected"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().getMessage()).doesNotContain("something truly unexpected");
    }
}
