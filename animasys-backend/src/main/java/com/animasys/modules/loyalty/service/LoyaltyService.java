package com.animasys.modules.loyalty.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.inventory.domain.Category;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.loyalty.domain.LoyaltyAccount;
import com.animasys.modules.loyalty.domain.LoyaltyLedgerEntry;
import com.animasys.modules.loyalty.domain.LoyaltyLedgerType;
import com.animasys.modules.loyalty.domain.LoyaltySettings;
import com.animasys.modules.loyalty.dto.LoyaltyDashboardResponse;
import com.animasys.modules.loyalty.repository.LoyaltyAccountRepository;
import com.animasys.modules.loyalty.repository.LoyaltyLedgerEntryRepository;
import com.animasys.modules.loyalty.repository.LoyaltySettingsRepository;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
@Slf4j
public class LoyaltyService {

    private final LoyaltyAccountRepository accountRepository;
    private final LoyaltyLedgerEntryRepository ledgerRepository;
    private final LoyaltySettingsRepository settingsRepository;
    private final SaleRepository saleRepository;
    private final EmployeeRepository employeeRepository;
    private final ProductVariantRepository variantRepository;

    // ─── Read helpers ───────────────────────────────────────────────────────

    public BigDecimal getBalance(String customerId) {
        return accountRepository.findById(customerId).map(LoyaltyAccount::getBalance).orElse(BigDecimal.ZERO);
    }

    /** For display only — does not create a DB row just from viewing a customer with no activity yet. */
    public LoyaltyAccount getAccount(Customer customer) {
        return accountRepository.findById(customer.getId())
                .orElse(LoyaltyAccount.builder()
                        .customerId(customer.getId())
                        .customer(customer)
                        .tenantId(customer.getTenant() != null ? customer.getTenant().getId() : null)
                        .balance(BigDecimal.ZERO)
                        .build());
    }

    /** Tenant-wide summary: current liability, all-time earn/redeem/expire totals, and every customer's balance. */
    @Transactional(readOnly = true)
    public LoyaltyDashboardResponse buildDashboard(String tenantId) {
        Map<LoyaltyLedgerType, BigDecimal> totalsByType = new EnumMap<>(LoyaltyLedgerType.class);
        for (Object[] row : ledgerRepository.sumAmountByTypeForTenant(tenantId)) {
            totalsByType.put((LoyaltyLedgerType) row[0], (BigDecimal) row[1]);
        }

        List<LoyaltyDashboardResponse.CustomerBalance> customers = accountRepository.findAllCustomerBalances(tenantId).stream()
                .map(row -> LoyaltyDashboardResponse.CustomerBalance.builder()
                        .customerId((String) row[0])
                        .name((String) row[1])
                        .phone((String) row[2])
                        .balance(nz((BigDecimal) row[3]).setScale(2, RoundingMode.HALF_UP))
                        .build())
                .sorted(Comparator.comparing(LoyaltyDashboardResponse.CustomerBalance::getBalance).reversed())
                .toList();

        return LoyaltyDashboardResponse.builder()
                .totalOutstandingLiability(nz(accountRepository.sumBalanceByTenantId(tenantId)).setScale(2, RoundingMode.HALF_UP))
                .totalEarned(nz(totalsByType.get(LoyaltyLedgerType.EARNED)).setScale(2, RoundingMode.HALF_UP))
                .totalRedeemed(nz(totalsByType.get(LoyaltyLedgerType.USED)).abs().setScale(2, RoundingMode.HALF_UP))
                .totalExpired(nz(totalsByType.get(LoyaltyLedgerType.EXPIRED)).abs().setScale(2, RoundingMode.HALF_UP))
                .totalReturnReversals(nz(totalsByType.get(LoyaltyLedgerType.RETURN_REVERSAL)).setScale(2, RoundingMode.HALF_UP))
                .totalManualAdjustments(nz(totalsByType.get(LoyaltyLedgerType.MANUAL_ADJUSTMENT)).setScale(2, RoundingMode.HALF_UP))
                .activeCustomersCount(accountRepository.countWithPositiveBalance(tenantId))
                .customers(customers)
                .build();
    }

    // ─── Checkout: redemption (synchronous, same transaction as the sale) ──

    /**
     * Clamps the cashier's requested redemption against balance and the configured caps.
     * Locks the account row for the rest of this transaction (PESSIMISTIC_WRITE), so the
     * amount returned here stays valid when {@link #recordRedemption} writes the ledger
     * later in the same transaction — no other checkout can interleave and overspend it.
     */
    public BigDecimal resolveRedemption(String tenantId, Customer customer, BigDecimal preLoyaltyTotal, BigDecimal requestedAmount) {
        if (customer == null || requestedAmount == null || requestedAmount.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }
        LoyaltySettings settings = settingsRepository.findById(tenantId).orElse(null);
        if (settings == null || !settings.isEnabled()) {
            return BigDecimal.ZERO;
        }

        LoyaltyAccount account = getOrCreateAccountLocked(tenantId, customer);
        BigDecimal cap = account.getBalance();

        if (settings.getMaxUsageAmount() != null) {
            cap = cap.min(settings.getMaxUsageAmount());
        }
        if (settings.getMaxUsagePercent() != null && preLoyaltyTotal != null) {
            BigDecimal pctCap = preLoyaltyTotal.multiply(settings.getMaxUsagePercent())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            cap = cap.min(pctCap);
        }
        if (preLoyaltyTotal != null) {
            cap = cap.min(preLoyaltyTotal);
        }

        return requestedAmount.min(cap).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    /** Writes the USED ledger entry for an amount already clamped by {@link #resolveRedemption}. */
    public void recordRedemption(Sale sale, Customer customer, BigDecimal amount, Employee employee) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        String tenantId = customer.getTenant() != null ? customer.getTenant().getId() : null;
        applyLedgerEntry(tenantId, customer, LoyaltyLedgerType.USED, amount.negate(), sale, employee, null, null, null, null);
    }

    // ─── Post-commit: earning ───────────────────────────────────────────────

    /** Called from LoyaltyEarnListener after the sale transaction commits. */
    public void earn(String saleId) {
        Sale sale = saleRepository.findById(saleId).orElse(null);
        if (sale == null || sale.getCustomer() == null || sale.getItems() == null || sale.getItems().isEmpty()) {
            return;
        }

        String tenantId = resolveTenantId(sale);
        if (tenantId == null) {
            log.warn("Loyalty earn: cannot resolve tenant for sale {}", sale.getSaleNumber());
            return;
        }
        LoyaltySettings settings = settingsRepository.findById(tenantId).orElse(null);
        if (settings == null || !settings.isEnabled() || !settings.isProgramOpen()) {
            return;
        }

        BigDecimal grossSubtotal = BigDecimal.ZERO;
        BigDecimal eligibleGross = BigDecimal.ZERO;
        for (SaleItem item : sale.getItems()) {
            BigDecimal lineTotal = item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
            grossSubtotal = grossSubtotal.add(lineTotal);
            if (isEligible(settings, item)) {
                eligibleGross = eligibleGross.add(lineTotal);
            }
        }
        if (grossSubtotal.compareTo(BigDecimal.ZERO) <= 0 || eligibleGross.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }

        BigDecimal discount = nz(sale.getDiscount());
        BigDecimal redeemed = nz(sale.getLoyaltyRedeemed());
        BigDecimal netPaid = grossSubtotal.subtract(discount).subtract(redeemed).max(BigDecimal.ZERO);
        BigDecimal eligibleShare = eligibleGross.divide(grossSubtotal, 6, RoundingMode.HALF_UP);
        BigDecimal eligibleNetBase = netPaid.multiply(eligibleShare);

        BigDecimal earned = eligibleNetBase.multiply(settings.getEarnRatePercent())
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        if (earned.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }

        Instant expiresAt = null;
        if (settings.isExpirationEnabled() && settings.getExpirationMonths() != null) {
            expiresAt = Instant.now().atZone(ZoneOffset.UTC).plusMonths(settings.getExpirationMonths()).toInstant();
        }

        applyLedgerEntry(tenantId, sale.getCustomer(), LoyaltyLedgerType.EARNED, earned, sale, sale.getEmployee(),
                null, null, earned, expiresAt);

        sale.setLoyaltyEarned(earned);
        saleRepository.save(sale);
    }

    // ─── Post-commit: return reversal ───────────────────────────────────────

    /**
     * Called from LoyaltyReturnListener after a refund commits. {@code ratio} is the same
     * returnedLineSubtotal/saleSubtotal ratio SaleService already uses to reverse discount/tax.
     * Reverses against the sale's own persisted loyaltyEarned/loyaltyRedeemed (never the
     * current settings, which may have changed since the original sale), and only applies
     * the incremental delta so repeated partial returns on one invoice never double-reverse.
     */
    public void reverseForReturn(String saleId, BigDecimal ratio, String employeeId) {
        if (ratio == null || ratio.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        Sale sale = saleRepository.findById(saleId).orElse(null);
        if (sale == null || sale.getCustomer() == null) {
            return;
        }
        String tenantId = resolveTenantId(sale);
        if (tenantId == null) {
            return;
        }
        Employee actor = employeeId != null ? employeeRepository.findById(employeeId).orElse(null) : null;
        Customer customer = sale.getCustomer();

        BigDecimal earned = nz(sale.getLoyaltyEarned());
        BigDecimal earnedAlreadyReversed = nz(sale.getLoyaltyEarnedReversed());
        BigDecimal targetEarnedReversed = earned.multiply(ratio).setScale(2, RoundingMode.HALF_UP).min(earned);
        BigDecimal earnedDelta = targetEarnedReversed.subtract(earnedAlreadyReversed).max(BigDecimal.ZERO);

        BigDecimal redeemed = nz(sale.getLoyaltyRedeemed());
        BigDecimal redeemedAlreadyReversed = nz(sale.getLoyaltyRedeemedReversed());
        BigDecimal targetRedeemedReversed = redeemed.multiply(ratio).setScale(2, RoundingMode.HALF_UP).min(redeemed);
        BigDecimal redeemedDelta = targetRedeemedReversed.subtract(redeemedAlreadyReversed).max(BigDecimal.ZERO);

        if (earnedDelta.compareTo(BigDecimal.ZERO) > 0) {
            LoyaltyAccount account = getOrCreateAccountLocked(tenantId, customer);
            String note = account.getBalance().compareTo(earnedDelta) < 0
                    ? "الرصيد الحالي أقل من النقاط المطلوب سحبها لهذا المرتجع — تم ترحيل الرصيد لسالب."
                    : null;
            applyLedgerEntry(tenantId, customer, LoyaltyLedgerType.RETURN_REVERSAL, earnedDelta.negate(), sale, actor,
                    note, null, null, null);
        }
        if (redeemedDelta.compareTo(BigDecimal.ZERO) > 0) {
            applyLedgerEntry(tenantId, customer, LoyaltyLedgerType.RETURN_REVERSAL, redeemedDelta, sale, actor,
                    null, null, null, null);
        }

        sale.setLoyaltyEarnedReversed(targetEarnedReversed);
        sale.setLoyaltyRedeemedReversed(targetRedeemedReversed);
        saleRepository.save(sale);
    }

    // ─── Manual adjustment ───────────────────────────────────────────────────

    public LoyaltyLedgerEntry manualAdjustment(String tenantId, Customer customer, BigDecimal amount, String reason, Employee employee) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) == 0) {
            throw new BusinessRuleException("قيمة التعديل يجب ألا تساوي صفر");
        }
        if (reason == null || reason.isBlank()) {
            throw new BusinessRuleException("سبب التعديل مطلوب");
        }
        return applyLedgerEntry(tenantId, customer, LoyaltyLedgerType.MANUAL_ADJUSTMENT,
                amount.setScale(2, RoundingMode.HALF_UP), null, employee, reason, null, null, null);
    }

    // ─── Expiration ──────────────────────────────────────────────────────────

    @Scheduled(cron = "0 30 2 * * *")
    public void expireDueLots() {
        List<LoyaltySettings> tenantsWithExpiration = settingsRepository.findAll().stream()
                .filter(LoyaltySettings::isExpirationEnabled)
                .toList();
        for (LoyaltySettings settings : tenantsWithExpiration) {
            try {
                expireDueLotsForTenant(settings.getTenantId());
            } catch (Exception ex) {
                log.error("Loyalty expiry failed for tenant {}: {}", settings.getTenantId(), ex.getMessage(), ex);
            }
        }
    }

    private void expireDueLotsForTenant(String tenantId) {
        List<LoyaltyLedgerEntry> due = ledgerRepository.findDueForExpiry(tenantId, Instant.now());
        for (LoyaltyLedgerEntry lot : due) {
            Customer customer = lot.getCustomer();
            LoyaltyAccount account = getOrCreateAccountLocked(tenantId, customer);
            BigDecimal amountToExpire = lot.getRemainingAmount().min(account.getBalance()).max(BigDecimal.ZERO);
            if (amountToExpire.compareTo(BigDecimal.ZERO) > 0) {
                applyLedgerEntry(tenantId, customer, LoyaltyLedgerType.EXPIRED, amountToExpire.negate(),
                        null, null, null, lot.getId(), null, null);
            }
            lot.setRemainingAmount(BigDecimal.ZERO);
            ledgerRepository.save(lot);
        }
    }

    // ─── Core ledger primitive ───────────────────────────────────────────────

    private LoyaltyLedgerEntry applyLedgerEntry(String tenantId, Customer customer, LoyaltyLedgerType type,
            BigDecimal signedAmount, Sale sale, Employee employee, String note, String relatedEntryId,
            BigDecimal remainingAmount, Instant expiresAt) {
        LoyaltyAccount account = getOrCreateAccountLocked(tenantId, customer);
        BigDecimal before = account.getBalance();
        BigDecimal after = before.add(signedAmount).setScale(2, RoundingMode.HALF_UP);
        account.setBalance(after);
        accountRepository.save(account);

        LoyaltyLedgerEntry entry = LoyaltyLedgerEntry.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(tenantId)
                .customer(customer)
                .sale(sale)
                .employee(employee)
                .type(type)
                .amount(signedAmount.setScale(2, RoundingMode.HALF_UP))
                .balanceBefore(before)
                .balanceAfter(after)
                .note(note)
                .relatedEntryId(relatedEntryId)
                .remainingAmount(type == LoyaltyLedgerType.EARNED ? remainingAmount : null)
                .expiresAt(type == LoyaltyLedgerType.EARNED ? expiresAt : null)
                .build();
        entry = ledgerRepository.save(entry);

        if (signedAmount.compareTo(BigDecimal.ZERO) < 0) {
            consumeFifo(customer.getId(), signedAmount.abs());
        }
        return entry;
    }

    /** Decrements remainingAmount off the oldest not-yet-exhausted EARNED lots first, so expiry never over-expires already-spent points. */
    private void consumeFifo(String customerId, BigDecimal debitAmount) {
        BigDecimal remaining = debitAmount;
        for (LoyaltyLedgerEntry lot : ledgerRepository.findUnconsumedEarnedLotsFifo(customerId)) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                break;
            }
            BigDecimal available = lot.getRemainingAmount();
            BigDecimal consume = available.min(remaining);
            lot.setRemainingAmount(available.subtract(consume));
            ledgerRepository.save(lot);
            remaining = remaining.subtract(consume);
        }
    }

    private LoyaltyAccount getOrCreateAccountLocked(String tenantId, Customer customer) {
        return accountRepository.findByCustomerIdForUpdate(customer.getId())
                .orElseGet(() -> accountRepository.save(LoyaltyAccount.builder()
                        .customerId(customer.getId())
                        .customer(customer)
                        .tenantId(tenantId)
                        .balance(BigDecimal.ZERO)
                        .build()));
    }

    private boolean isEligible(LoyaltySettings settings, SaleItem item) {
        if (!"PRODUCT".equalsIgnoreCase(item.getType())) {
            // No category system for services — always eligible.
            return true;
        }
        String categoryId = variantRepository.findByIdWithProduct(item.getItemId())
                .map(ProductVariant::getProduct)
                .map(Product::getCategory)
                .map(Category::getId)
                .orElse(null);

        boolean eligibleListsEmpty = settings.getEligibleCategoryIds().isEmpty() && settings.getEligibleProductIds().isEmpty();
        boolean explicitlyEligible = settings.getEligibleProductIds().contains(item.getItemId())
                || (categoryId != null && settings.getEligibleCategoryIds().contains(categoryId));
        boolean allowedByAllowList = eligibleListsEmpty || explicitlyEligible;

        boolean excluded = settings.getExcludedProductIds().contains(item.getItemId())
                || (categoryId != null && settings.getExcludedCategoryIds().contains(categoryId));

        return allowedByAllowList && !excluded;
    }

    private String resolveTenantId(Sale sale) {
        if (sale.getEmployee() == null) {
            return null;
        }
        Employee employee = employeeRepository.findByIdWithTenant(sale.getEmployee().getId()).orElse(null);
        if (employee == null || employee.getTenant() == null) {
            return null;
        }
        return employee.getTenant().getId();
    }

    private BigDecimal nz(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }
}
