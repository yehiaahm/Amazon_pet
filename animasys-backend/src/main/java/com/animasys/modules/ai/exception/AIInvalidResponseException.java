package com.animasys.modules.ai.exception;

import org.springframework.http.HttpStatus;

public class AIInvalidResponseException extends AIServiceException {

    public AIInvalidResponseException(String message) {
        super("AI_INVALID_RESPONSE", message);
    }

    @Override
    public HttpStatus getHttpStatus() {
        return HttpStatus.UNPROCESSABLE_ENTITY;
    }
}
