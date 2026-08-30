package com.animasys.modules.ai.exception;

import org.springframework.http.HttpStatus;

public class AIProviderUnavailableException extends AIServiceException {

    public AIProviderUnavailableException(String message) {
        super("AI_PROVIDER_UNAVAILABLE", message);
    }

    public AIProviderUnavailableException(String message, Throwable cause) {
        super("AI_PROVIDER_UNAVAILABLE", message, cause);
    }

    @Override
    public HttpStatus getHttpStatus() {
        return HttpStatus.SERVICE_UNAVAILABLE;
    }
}
