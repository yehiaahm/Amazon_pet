package com.animasys.modules.ai.exception;

import org.springframework.http.HttpStatus;

public class AIConfigurationException extends AIServiceException {

    public AIConfigurationException(String message) {
        super("AI_CONFIGURATION", message);
    }

    @Override
    public HttpStatus getHttpStatus() {
        return HttpStatus.SERVICE_UNAVAILABLE;
    }
}
