package com.animasys.modules.ai.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@Configuration
public class AiRestTemplateConfig {

    @Bean(name = "geminiRestTemplate")
    public RestTemplate geminiRestTemplate(AiProperties aiProperties, RestTemplateBuilder builder) {
        Duration timeout = Duration.ofMillis(Math.max(1_000, aiProperties.getRequestTimeoutMs()));
        return builder
                .setConnectTimeout(timeout)
                .setReadTimeout(timeout)
                .build();
    }
}
