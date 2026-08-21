package com.animasys.modules.loyalty.listeners;

import com.animasys.modules.loyalty.service.LoyaltyService;
import com.animasys.modules.sales.dto.SaleRefundFinancials;
import com.animasys.modules.sales.events.SaleRefundedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** Reverses (proportionally) the loyalty earned/redeemed on a sale after its refund commits. */
@Component
@RequiredArgsConstructor
@Slf4j
public class LoyaltyReturnListener {

    private final LoyaltyService loyaltyService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handleSaleRefunded(SaleRefundedEvent event) {
        SaleRefundFinancials fin = event.getFinancials();
        if (fin == null || fin.getLoyaltyRatio() == null) {
            return;
        }
        try {
            loyaltyService.reverseForReturn(event.getSale().getId(), fin.getLoyaltyRatio(), event.getRefundedByEmployeeId());
        } catch (Exception ex) {
            log.error("Failed to reverse loyalty for refunded sale {}: {}", event.getSale().getSaleNumber(), ex.getMessage(), ex);
        }
    }
}
