package com.animasys.modules.ai.exception;

import org.springframework.http.HttpStatus;

public class AIQuotaExceededException extends AIServiceException {

    public AIQuotaExceededException(String message) {
        super("AI_QUOTA_EXCEEDED", message);
    }

    @Override
    public HttpStatus getHttpStatus() {
        return HttpStatus.TOO_MANY_REQUESTS;
    }
}
