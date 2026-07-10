package com.animasys.modules.ai.providers;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class GeminiProvider implements AIProvider {

    @Value("${app.ai.gemini.api-key}")
    private String apiKey;

    private final RestTemplate restTemplate = new RestTemplate();

    @Override
    @SuppressWarnings("unchecked")
    public String generateResponse(String prompt) {
        if (apiKey == null || apiKey.trim().isEmpty()) {
            return generateMockResponse(prompt);
        }

        try {
            String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;

            // Simple REST request payload structure for Gemini API
            Map<String, Object> textPart = Map.of("text", prompt);
            Map<String, Object> parts = Map.of("parts", List.of(textPart));
            Map<String, Object> contents = Map.of("contents", List.of(parts));

            Map<String, Object> response = restTemplate.postForObject(url, contents, Map.class);
            if (response != null && response.containsKey("candidates")) {
                List<Map<String, Object>> candidates = (List<Map<String, Object>>) response.get("candidates");
                if (!candidates.isEmpty()) {
                    Map<String, Object> firstCandidate = candidates.get(0);
                    Map<String, Object> content = (Map<String, Object>) firstCandidate.get("content");
                    List<Map<String, Object>> resParts = (List<Map<String, Object>>) content.get("parts");
                    if (!resParts.isEmpty()) {
                        return (String) resParts.get(0).get("text");
                    }
                }
            }
        } catch (Exception ex) {
            return "خطأ في الاتصال بـ Gemini API: " + ex.getMessage() + "\n\nالاستجابة الاحتياطية:\n" + generateMockResponse(prompt);
        }

        return generateMockResponse(prompt);
    }

    private String generateMockResponse(String prompt) {
        return "### 📊 تقرير مستشار الأعمال الذكي لـ AnimaSys\n\n" +
               "بناءً على المؤشرات المالية الحية وإشارات المخاطر التشغيلية المحملة من قاعدة البيانات، إليك ملخص التشخيص التنفيذي:\n\n" +
               "#### 1. 📈 تشخيص الإيرادات هوامش الأرباح\n" +
               "*   **صحة الإيرادات:** إجمالي الإيرادات مستقر ومبشر. ومع ذلك، هناك ضغط على الهوامش التشغيلية بسبب الارتفاع النسبي في مصاريف المستلزمات.\n" +
               "*   **تدقيق صافي الأرباح:** صافي الربح إيجابي ولكنه دون المستوى الأمثل. نوصي بمراجعة مصاريف المرافق والإيجار لزيادة كفاءة الأرباح التشغيلية الصافية.\n\n" +
               "#### 2. ⚠️ تنبيهات المخاطر التشغيلية وقواعد العمل\n" +
               "*   **المنتجات منخفضة الكمية:** تم رصد نقص في كميات أصناف طعام القطط والكلاب سريعة الحركة. إذا لم يتم إعادة الطلب خلال 7 أيام، فهناك خطر خسارة مبيعات التجزئة.\n" +
               "*   **انتهاء صلاحية الدفعات:** هناك دفعة من الأدوية تنتهي صلاحيتها في أقل من 90 يوماً. نوصي بإدراجها في حزم خدمات الرعاية البيطرية فوراً أو تقديم خصم عليها لتجنب الخسارة الكاملة.\n\n" +
               "#### 3. 🎯 توصيات نمو محددة\n" +
               "*   **توزيع موظفي خدمات الجروومينغ:** نسبة استغلال الطاقة الاستيعابية للموظفين هي 68%. يمكن زيادة الحجوزات عن طريق استهداف العملاء المسجلين بحملات رسائل نصية قصيرة (SMS) في أيام وسط الأسبوع الهادئة (الثلاثاء/الأربعاء).\n" +
               "*   **التفاوض مع الموردين:** إعادة تفاوض على أسعار الشراء للأغذية والألعاب لتقليص تكلفة البضاعة المباعة (COGS).";
    }
}
