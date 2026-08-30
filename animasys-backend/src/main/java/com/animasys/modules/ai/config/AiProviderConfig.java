package com.animasys.modules.ai.config;

import com.animasys.modules.ai.providers.AIProvider;
import com.animasys.modules.ai.providers.AiMockProvider;
import com.animasys.modules.ai.providers.GeminiProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class AiProviderConfig {

    @Bean
    @Primary
    public AIProvider aiProvider(AiProperties properties, GeminiProvider geminiProvider, AiMockProvider mockProvider) {
        if (properties.isMockEnabled()) {
            return mockProvider;
        }
        return geminiProvider;
    }
}
