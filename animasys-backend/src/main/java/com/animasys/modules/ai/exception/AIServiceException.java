package com.animasys.modules.ai.exception;

import org.springframework.http.HttpStatus;

/**
 * Base exception for AI subsystem failures. Messages are safe for clients (no secrets).
 */
public abstract class AIServiceException extends RuntimeException {

    private final String errorCode;

    protected AIServiceException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    protected AIServiceException(String errorCode, String message, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public abstract HttpStatus getHttpStatus();
}
