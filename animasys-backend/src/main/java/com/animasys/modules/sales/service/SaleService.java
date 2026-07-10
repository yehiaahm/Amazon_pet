package com.animasys.modules.sales.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.crm.repository.CustomerRepository;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.sales.domain.*;
import com.animasys.modules.sales.events.SaleCompletedEvent;
import com.animasys.modules.sales.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional
public class SaleService {
    private final SaleRepository saleRepository;
    private final SaleItemRepository itemRepository;
    private final POSSessionRepository sessionRepository;
    private final EmployeeRepository employeeRepository;
    private final CustomerRepository customerRepository;
    private final ApplicationEventPublisher eventPublisher;

    public Sale createSale(String posSessionId, String employeeId, String customerId, BigDecimal totalAmount, BigDecimal tax, BigDecimal discount, String paymentMethod, List<SaleItem> items) {
        POSSession session = sessionRepository.findById(posSessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Active POS Session not found: " + posSessionId));

        if (!"OPEN".equals(session.getStatus())) {
            throw new BusinessRuleException("Cannot checkout a sale on a closed POS session.");
        }

        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee not found: " + employeeId));

        Customer customer = null;
        if (customerId != null && !customerId.trim().isEmpty()) {
            customer = customerRepository.findById(customerId).orElse(null);
        }

        String saleNumber = "INV-" + System.currentTimeMillis();

        Sale sale = Sale.builder()
                .id(UUID.randomUUID().toString())
                .saleNumber(saleNumber)
                .posSession(session)
                .totalAmount(totalAmount)
                .tax(tax)
                .discount(discount)
                .paymentMethod(paymentMethod)
                .employee(employee)
                .customer(customer)
                .date(Instant.now())
                .build();

        sale = saleRepository.save(sale);

        List<SaleItem> savedItems = new ArrayList<>();
        for (SaleItem item : items) {
            item.setId(UUID.randomUUID().toString());
            item.setSale(sale);
            savedItems.add(itemRepository.save(item));
        }
        sale.setItems(savedItems);

        // Publish event to decouple stock reduction, financial ledger posting, audit log, and notifications
        eventPublisher.publishEvent(new SaleCompletedEvent(this, sale));

        return sale;
    }
}
