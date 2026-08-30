package com.animasys.modules.loyalty.listeners;

import com.animasys.modules.loyalty.service.LoyaltyService;
import com.animasys.modules.sales.events.SaleCompletedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Credits loyalty after the checkout transaction commits — kept out of the hot checkout
 * path, same pattern as SaleCompletedListener's GL posting on the same event.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class LoyaltyEarnListener {

    private final LoyaltyService loyaltyService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handleSaleCompleted(SaleCompletedEvent event) {
        try {
            loyaltyService.earn(event.getSale().getId());
        } catch (Exception ex) {
            log.error("Failed to credit loyalty for sale {}: {}", event.getSale().getSaleNumber(), ex.getMessage(), ex);
        }
    }
}
