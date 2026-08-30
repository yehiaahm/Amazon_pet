package com.animasys.core.admin;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/admin")
@RequiredArgsConstructor
public class FactoryResetController {

    public static final String CONFIRM_PHRASE = "RESET TO FIRST USE";

    private final FactoryResetService factoryResetService;

    /**
     * Factory reset: clears products, sales, customers, stock, finance history, etc.
     * Keeps owner/cashier logins, branch, warehouses.
     * Body: { "confirm": "RESET TO FIRST USE" }
     */
    @PostMapping("/factory-reset")
    @PreAuthorize("@authz.has('settings.factory_reset')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> factoryReset(
            @RequestBody Map<String, String> body
    ) {
        String confirm = body == null ? null : body.get("confirm");
        if (!CONFIRM_PHRASE.equals(confirm)) {
            return ResponseEntity.badRequest().body(
                    ApiResponseWrapper.error(
                            "Confirmation required. Send { \"confirm\": \"" + CONFIRM_PHRASE + "\" }"
                    )
            );
        }
        String tenantId = SecurityUtils.requireTenantId();
        Map<String, Object> summary = factoryResetService.resetToFirstUse(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(summary, "تم تصفير النظام بالكامل — كأول استخدام"));
    }
}
