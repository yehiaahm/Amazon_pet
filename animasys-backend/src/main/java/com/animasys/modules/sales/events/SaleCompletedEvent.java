package com.animasys.modules.sales.events;

import com.animasys.modules.sales.domain.Sale;
import lombok.Getter;
import org.springframework.context.ApplicationEvent;

@Getter
public class SaleCompletedEvent extends ApplicationEvent {
    private final Sale sale;

    public SaleCompletedEvent(Object source, Sale sale) {
        super(source);
        this.sale = sale;
    }
}
