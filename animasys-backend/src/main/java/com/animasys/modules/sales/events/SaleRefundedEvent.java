package com.animasys.modules.sales.events;

import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.dto.SaleRefundFinancials;
import lombok.Getter;
import org.springframework.context.ApplicationEvent;

@Getter
public class SaleRefundedEvent extends ApplicationEvent {
    private final Sale sale;
    private final String refundedByEmployeeId;
    private final SaleRefundFinancials financials;

    public SaleRefundedEvent(Object source, Sale sale, String refundedByEmployeeId, SaleRefundFinancials financials) {
        super(source);
        this.sale = sale;
        this.refundedByEmployeeId = refundedByEmployeeId;
        this.financials = financials;
    }
}
