package com.animasys.modules.ai.providers;

public interface AIProvider {
    String generateResponse(String prompt);
    default String generateVisionResponse(String prompt, String imageBase64, String mimeType) {
        return generateResponse(prompt);
    }
}
