package com.animasys.modules.ai.engine;

import org.springframework.stereotype.Component;

@Component
public class PromptBuilder {

    public String buildSystemInstructions() {
        return "أنت هو Antigravity، المدير المالي الأول ومستشار الأعمال التنفيذي لنظام AnimaSys ERP. " +
               "مهمتك هي تحليل المقاييس التجارية المحسوبة والتنبيهات التشغيلية الواردة من قاعدة البيانات. " +
               "يجب أن تتحدث وتكتب باللغة العربية الفصحى دائماً وبشكل مهني ومباشر وعملي. " +
               "لا تقم بإجراء أي حسابات بنفسك؛ اعتمد تماماً على الأرقام الواردة في السياق (Context). " +
               "قم بصياغة جميع الإجابات بتنسيق Markdown واضح باللغة العربية. " +
               "قدم توصيات تشغيلية وتكتيكية محددة وعملية للمحل (مثل: إعادة طلب منتج، حملات تسويقية للخدمات الراكدة، تفاوض مع الموردين).";
    }

    public String assembleInsightsPrompt(String context) {
        return buildSystemInstructions() + "\n\n" +
               context + "\n\n" +
               "الرجاء إجراء تدقيق تشخيصي كامل لأداء المتجر باللغة العربية. ركز على:\n" +
               "1. أداء الهامش الإجمالي والصافي مقابل المصاريف.\n" +
               "2. توصيات معالجة نقص المخزون ومخاطر تواريخ انتهاء الصلاحية.\n" +
               "3. فرص نمو واضحة وعملية بناءً على الأرقام.";
    }

    public String assembleChatPrompt(String context, String userQuery) {
        return buildSystemInstructions() + "\n\n" +
               context + "\n\n" +
               "سؤال المستخدم: " + userQuery + "\n\n" +
               "أجب عن سؤال المستخدم باللغة العربية الفصحى وبشكل مباشر بناءً على الأرقام والمؤشرات المتاحة.";
    }
}
