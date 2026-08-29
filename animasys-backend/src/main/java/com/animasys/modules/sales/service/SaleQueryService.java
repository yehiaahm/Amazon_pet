package com.animasys.modules.sales.service;

import com.animasys.core.util.BusinessTimeZone;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.domain.SalePayment;
import com.animasys.modules.sales.dto.SaleItemSummaryDTO;
import com.animasys.modules.sales.dto.SalePageResponse;
import com.animasys.modules.sales.dto.SalePaymentSummaryDTO;
import com.animasys.modules.sales.dto.SaleSearchCriteria;
import com.animasys.modules.sales.dto.SaleSummaryDTO;
import com.animasys.modules.sales.repository.SaleItemRepository;
import com.animasys.modules.sales.repository.SalePaymentRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class SaleQueryService {

    private static final ZoneId BUSINESS_ZONE = BusinessTimeZone.ZONE;
    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of("date", "saleNumber", "totalAmount", "status");

    private final SaleRepository saleRepository;
    private final SaleItemRepository saleItemRepository;
    private final SalePaymentRepository salePaymentRepository;

    @Transactional(readOnly = true)
    public SalePageResponse search(String tenantId, Employee actor, SaleSearchCriteria criteria) {
        int page = Math.max(0, criteria.getPage());
        int size = Math.min(Math.max(1, criteria.getSize()), SaleSearchCriteria.MAX_SIZE);
        Sort sort = parseSort(criteria.getSort());
        Pageable pageable = PageRequest.of(page, size, sort);

        Specification<Sale> spec = buildSpecification(tenantId, actor, criteria);
        Page<Sale> result = saleRepository.findAll(spec, pageable);

        List<String> saleIds = result.getContent().stream().map(Sale::getId).toList();
        Map<String, List<SaleItemSummaryDTO>> itemsBySaleId = loadItemsBySaleId(saleIds);
        Map<String, List<SalePaymentSummaryDTO>> paymentsBySaleId = loadPaymentsBySaleId(saleIds);

        List<SaleSummaryDTO> content = result.getContent().stream()
                .map(sale -> toSummary(sale, itemsBySaleId.getOrDefault(sale.getId(), List.of()),
                        paymentsBySaleId.getOrDefault(sale.getId(), List.of())))
                .toList();

        return SalePageResponse.builder()
                .content(content)
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .page(result.getNumber())
                .size(result.getSize())
                .sort(criteria.getSort() != null ? criteria.getSort() : "date,desc")
                .build();
    }

    private Specification<Sale> buildSpecification(String tenantId, Employee actor, SaleSearchCriteria criteria) {
        return (root, query, cb) -> {
            if (query.getResultType() != Long.class && query.getResultType() != long.class) {
                root.fetch("employee", JoinType.INNER);
                root.fetch("customer", JoinType.LEFT);
                query.distinct(true);
            }

            List<Predicate> predicates = new ArrayList<>();
            Join<Sale, Employee> employeeJoin = root.join("employee", JoinType.INNER);
            Join<Sale, Customer> customerJoin = root.join("customer", JoinType.LEFT);

            predicates.add(cb.equal(employeeJoin.get("tenant").get("id"), tenantId));

            boolean restricted = isRestrictedScope(actor);
            applyRoleScope(actor, criteria, root, employeeJoin, cb, predicates);
            applyFilters(criteria, root, employeeJoin, customerJoin, cb, predicates, query, restricted);

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /** Cashiers must look up one invoice at a time by its exact number, never browse a list. */
    private boolean isRestrictedScope(Employee actor) {
        String role = actor.getRole() != null ? actor.getRole().toUpperCase(Locale.ROOT) : "";
        return "CASHIER".equals(role);
    }

    private void applyRoleScope(
            Employee actor,
            SaleSearchCriteria criteria,
            Root<Sale> root,
            Join<Sale, Employee> employeeJoin,
            jakarta.persistence.criteria.CriteriaBuilder cb,
            List<Predicate> predicates
    ) {
        if (!isRestrictedScope(actor)) {
            return;
        }
        predicates.add(cb.equal(employeeJoin.get("id"), actor.getId()));
        // An exact invoice-number search (see applyFilters) already narrows to at most
        // one of the cashier's own sales, so it's safe to look past today for it - the
        // "today only" bound below is just the browsing-without-a-number default.
        boolean exactNumberSearch = criteria.getSearch() != null && !criteria.getSearch().isBlank();
        if (criteria.getDateFrom() == null && criteria.getDateTo() == null && !exactNumberSearch) {
            LocalDate today = LocalDate.now(BUSINESS_ZONE);
            Instant from = today.atStartOfDay(BUSINESS_ZONE).toInstant();
            Instant to = today.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();
            predicates.add(cb.greaterThanOrEqualTo(root.get("date"), from));
            predicates.add(cb.lessThan(root.get("date"), to));
        }
    }

    private void applyFilters(
            SaleSearchCriteria criteria,
            Root<Sale> root,
            Join<Sale, Employee> employeeJoin,
            Join<Sale, Customer> customerJoin,
            jakarta.persistence.criteria.CriteriaBuilder cb,
            List<Predicate> predicates,
            jakarta.persistence.criteria.CriteriaQuery<?> query,
            boolean restricted
    ) {
        if (criteria.getDateFrom() != null) {
            predicates.add(cb.greaterThanOrEqualTo(root.get("date"), criteria.getDateFrom()));
        }
        if (criteria.getDateTo() != null) {
            predicates.add(cb.lessThanOrEqualTo(root.get("date"), criteria.getDateTo()));
        }
        if (criteria.getCustomer() != null && !criteria.getCustomer().isBlank()) {
            predicates.add(cb.equal(customerJoin.get("id"), criteria.getCustomer().trim()));
        }
        if (criteria.getEmployee() != null && !criteria.getEmployee().isBlank()) {
            predicates.add(cb.equal(employeeJoin.get("id"), criteria.getEmployee().trim()));
        }
        if (criteria.getStatus() != null && !criteria.getStatus().isBlank()) {
            String status = criteria.getStatus().trim().toUpperCase(Locale.ROOT);
            if ("COMPLETED".equals(status)) {
                predicates.add(cb.or(
                        cb.isNull(root.get("status")),
                        cb.equal(cb.upper(root.get("status")), "COMPLETED")
                ));
            } else {
                predicates.add(cb.equal(cb.upper(root.get("status")), status));
            }
        }
        if (criteria.getPaymentMethod() != null && !criteria.getPaymentMethod().isBlank()) {
            predicates.add(cb.equal(
                    cb.upper(root.get("paymentMethod")),
                    criteria.getPaymentMethod().trim().toUpperCase(Locale.ROOT)
            ));
        }
        if (criteria.getSearch() != null && !criteria.getSearch().isBlank()) {
            String term = criteria.getSearch().trim();
            if (restricted) {
                // Cashiers may only pull up one invoice by its exact number (typed or
                // QR-scanned off the receipt) - never a fuzzy list by customer/item/name,
                // which would otherwise let them browse today's invoices.
                predicates.add(cb.equal(cb.upper(root.get("saleNumber")), term.toUpperCase(Locale.ROOT)));
                return;
            }
            String pattern = "%" + term.toLowerCase(Locale.ROOT) + "%";
            Subquery<Long> itemSubquery = query.subquery(Long.class);
            Root<SaleItem> itemRoot = itemSubquery.from(SaleItem.class);
            itemSubquery.select(cb.literal(1L));
            itemSubquery.where(
                    cb.equal(itemRoot.get("sale").get("id"), root.get("id")),
                    cb.or(
                            cb.like(cb.lower(itemRoot.get("name")), pattern),
                            cb.like(cb.lower(itemRoot.get("itemId")), pattern)
                    )
            );

            predicates.add(cb.or(
                    cb.like(cb.lower(root.get("saleNumber")), pattern),
                    cb.like(cb.lower(employeeJoin.get("fullName")), pattern),
                    cb.like(cb.lower(customerJoin.get("name")), pattern),
                    cb.like(customerJoin.get("phone"), "%" + term + "%"),
                    cb.exists(itemSubquery)
            ));
        }
    }

    private Sort parseSort(String sortParam) {
        if (sortParam == null || sortParam.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "date");
        }
        String[] parts = sortParam.split(",", 2);
        String field = parts[0].trim();
        if (!ALLOWED_SORT_FIELDS.contains(field)) {
            field = "date";
        }
        Sort.Direction direction = parts.length > 1 && "asc".equalsIgnoreCase(parts[1].trim())
                ? Sort.Direction.ASC
                : Sort.Direction.DESC;
        return Sort.by(direction, field);
    }

    private Map<String, List<SaleItemSummaryDTO>> loadItemsBySaleId(List<String> saleIds) {
        if (saleIds.isEmpty()) {
            return Map.of();
        }
        Map<String, List<SaleItemSummaryDTO>> bySaleId = new HashMap<>();
        for (SaleItem item : saleItemRepository.findBySale_IdIn(saleIds)) {
            bySaleId.computeIfAbsent(item.getSale().getId(), k -> new ArrayList<>()).add(toItemSummary(item));
        }
        return bySaleId;
    }

    private Map<String, List<SalePaymentSummaryDTO>> loadPaymentsBySaleId(List<String> saleIds) {
        if (saleIds.isEmpty()) {
            return Map.of();
        }
        Map<String, List<SalePaymentSummaryDTO>> bySaleId = new HashMap<>();
        for (SalePayment payment : salePaymentRepository.findBySale_IdIn(saleIds)) {
            bySaleId.computeIfAbsent(payment.getSale().getId(), k -> new ArrayList<>())
                    .add(SalePaymentSummaryDTO.builder()
                            .method(payment.getMethod())
                            .amount(payment.getAmount())
                            .build());
        }
        return bySaleId;
    }

    private SaleItemSummaryDTO toItemSummary(SaleItem item) {
        return SaleItemSummaryDTO.builder()
                .id(item.getId())
                .type(item.getType())
                .itemId(item.getItemId())
                .name(item.getName())
                .quantity(item.getQuantity())
                .price(item.getPrice())
                .listPrice(item.getListPrice())
                .cost(item.getCost())
                .cogs(item.getCogs())
                .unitCogs(item.getUnitCogs())
                .quantityReturned(item.getQuantityReturned())
                .grossProfit(item.getGrossProfit())
                .build();
    }

    private SaleSummaryDTO toSummary(Sale sale, List<SaleItemSummaryDTO> items, List<SalePaymentSummaryDTO> payments) {
        Employee employee = sale.getEmployee();
        Customer customer = sale.getCustomer();
        return SaleSummaryDTO.builder()
                .id(sale.getId())
                .saleNumber(sale.getSaleNumber())
                .posSessionId(sale.getPosSessionId())
                .totalAmount(sale.getTotalAmount())
                .tax(sale.getTax())
                .discount(sale.getDiscount())
                .paymentMethod(sale.getPaymentMethod())
                .employeeId(employee != null ? employee.getId() : null)
                .employeeFullName(employee != null ? employee.getFullName() : null)
                .customerId(customer != null ? customer.getId() : null)
                .customerName(customer != null ? customer.getName() : null)
                .date(sale.getDate())
                .status(sale.getStatus())
                .delivery(sale.isDelivery())
                .deliveryFee(sale.getDeliveryFee())
                .loyaltyEarned(sale.getLoyaltyEarned())
                .loyaltyRedeemed(sale.getLoyaltyRedeemed())
                .items(items)
                .payments(payments)
                .build();
    }
}
