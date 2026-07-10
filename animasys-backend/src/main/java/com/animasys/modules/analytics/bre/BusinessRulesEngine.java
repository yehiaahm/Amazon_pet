package com.animasys.modules.analytics.bre;

import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class BusinessRulesEngine {
    private final ProductVariantRepository variantRepository;
    private final ProductBatchRepository batchRepository;

    public List<Map<String, Object>> evaluateBusinessRules() {
        List<Map<String, Object>> alerts = new ArrayList<>();

        // 1. فحص تنبيهات المخزون (الكمية أقل من الحد الأدنى)
        List<ProductVariant> variants = variantRepository.findAll();
        for (ProductVariant variant : variants) {
            Product product = variant.getProduct();
            if (variant.getStockQuantity() < product.getMinStockLimit()) {
                alerts.add(Map.of(
                        "rule", "تنبيه_مخزون_منخفض",
                        "severity", "عالية",
                        "message", "كمية المخزون لـ '" + product.getName() + " - " + variant.getName() +
                                   "' هي " + variant.getStockQuantity() + "، وهي أقل من الحد الأدنى المحدد وهو " + product.getMinStockLimit()
                ));
            }
        }

        // 2. فحص تواريخ الانتهاء (الدفعات التي تنتهي خلال 90 يومًا)
        List<ProductBatch> batches = batchRepository.findAll();
        LocalDate now = LocalDate.now();
        for (ProductBatch batch : batches) {
            long daysLeft = ChronoUnit.DAYS.between(now, batch.getExpiryDate());
            if (daysLeft < 90) {
                alerts.add(Map.of(
                        "rule", "تحذير_انتهاء_صلاحية_الدفعة",
                        "severity", daysLeft < 30 ? "حرجة" : "متوسطة",
                        "message", "الدفعة '" + batch.getBatchNumber() + "' من المنتج '" +
                                   batch.getProductVariant().getName() + "' تنتهي صلاحيتها خلال " + daysLeft + " يوم (" + batch.getExpiryDate() + ")"
                ));
            }
        }

        return alerts;
    }
}
