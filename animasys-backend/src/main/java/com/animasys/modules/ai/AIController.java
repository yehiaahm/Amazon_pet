package com.animasys.modules.ai;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.modules.ai.engine.BusinessContextBuilder;
import com.animasys.modules.ai.engine.PromptBuilder;
import com.animasys.modules.ai.providers.AIProvider;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/ai")
@RequiredArgsConstructor
public class AIController {

    private final BusinessContextBuilder contextBuilder;
    private final PromptBuilder promptBuilder;
    private final AIProvider aiProvider;

    @GetMapping("/insights")
    public ResponseEntity<ApiResponseWrapper<String>> getBusinessInsights(@RequestParam String tenantId) {
        String context = contextBuilder.buildContextString(tenantId);
        String prompt = promptBuilder.assembleInsightsPrompt(context);
        String response = aiProvider.generateResponse(prompt);

        return ResponseEntity.ok(ApiResponseWrapper.success(response, "تم تجميع تشخيص مؤشرات الأعمال بنجاح"));
    }

    @PostMapping("/ask")
    public ResponseEntity<ApiResponseWrapper<String>> askAdvisor(@Valid @RequestBody AskRequest request) {
        String context = contextBuilder.buildContextString(request.getTenantId());
        String prompt = promptBuilder.assembleChatPrompt(context, request.getQuery());
        String response = aiProvider.generateResponse(prompt);

        return ResponseEntity.ok(ApiResponseWrapper.success(response, "تمت معالجة سؤال المستشار بنجاح"));
    }
}
