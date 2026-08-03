package com.animasys.modules.inventory.service;

import com.animasys.core.exception.BusinessRuleException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class TransferService {

    public void transferStock(String variantId, String sourceWarehouseId, String targetWarehouseId, int qty, String employeeId) {
        throw new BusinessRuleException(
                "تحويل المخزون بين المخازن غير متاح حالياً مع نظام الدفعات الموحّد. استخدم فاتورة شراء أو تعديل الدفعة.");
    }
}
