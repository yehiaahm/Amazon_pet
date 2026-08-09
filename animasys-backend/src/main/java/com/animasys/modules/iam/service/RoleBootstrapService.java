package com.animasys.modules.iam.service;

import com.animasys.modules.iam.domain.Permission;
import com.animasys.modules.iam.domain.Role;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.PermissionRepository;
import com.animasys.modules.iam.repository.RoleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Ensures each tenant has the four system roles with default permissions.
 * Used when a new tenant is created outside Flyway seed (e.g. first-setup wizard).
 */
@Service
@RequiredArgsConstructor
public class RoleBootstrapService {

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;

    private static final List<SystemRoleDef> SYSTEM_ROLES = List.of(
            new SystemRoleDef("OWNER", "المالك / المدير العام", "صلاحيات كاملة وإدارة جميع أجزاء النظام", PermissionScope.ALL),
            new SystemRoleDef("MANAGER", "مدير الفرع / التشغيل", "إدارة العمليات والموظفين والمخزون والمالية", PermissionScope.ALL_EXCEPT_FACTORY_RESET),
            new SystemRoleDef("CASHIER", "الكاشير / المبيعات", "عمليات نقطة البيع POS والتحصيل وإدارة الدرج", PermissionScope.CASHIER),
            new SystemRoleDef("GROOMER", "أخصائي التجميل والعناية", "إدارة مواعيد وحجوزات الخدمات والحيوانات", PermissionScope.GROOMER)
    );

    @Transactional
    public void ensureSystemRolesForTenant(Tenant tenant) {
        if (tenant == null || tenant.getId() == null) {
            return;
        }
        String tenantId = tenant.getId();
        if (roleRepository.countByTenantId(tenantId) >= SYSTEM_ROLES.size()) {
            return;
        }
        List<Permission> allPermissions = permissionRepository.findAll();
        for (SystemRoleDef def : SYSTEM_ROLES) {
            if (roleRepository.findByTenantIdAndCode(tenantId, def.code).isPresent()) {
                continue;
            }
            Role role = Role.builder()
                    .id("role-" + tenantId + "-" + def.code.toLowerCase())
                    .tenant(tenant)
                    .code(def.code)
                    .name(def.name)
                    .description(def.description)
                    .systemRole(true)
                    .permissions(resolvePermissions(def.scope, allPermissions))
                    .build();
            roleRepository.save(role);
        }
    }

    private Set<Permission> resolvePermissions(PermissionScope scope, List<Permission> all) {
        Set<Permission> result = new HashSet<>();
        for (Permission p : all) {
            if (scope.includes(p.getCode())) {
                result.add(p);
            }
        }
        return result;
    }

    private enum PermissionScope {
        ALL {
            @Override
            boolean includes(String code) {
                return true;
            }
        },
        ALL_EXCEPT_FACTORY_RESET {
            @Override
            boolean includes(String code) {
                return !"settings.factory_reset".equals(code);
            }
        },
        CASHIER {
            @Override
            boolean includes(String code) {
                return Set.of(
                        "sales.open_shift", "sales.close_shift", "sales.create_sale", "sales.apply_discount",
                        "sales.override_price", "sales.refund_sale", "sales.void_invoice", "sales.reprint_invoice",
                        "sales.print_thermal_receipt", "sales.print_a4_invoice",
                        "inventory.view", "products.view", "products.print_barcode",
                        "customers.view", "customers.view_purchase_history",
                        "boarding.view_reservations", "boarding.create_reservation", "boarding.edit_reservation",
                        "grooming.view_appointments", "grooming.create_appointment", "grooming.edit_appointment",
                        "grooming.complete_appointment",
                        "finance.view_expenses", "finance.add_expense",
                        "dashboard.view", "pets.view"
                ).contains(code);
            }
        },
        GROOMER {
            @Override
            boolean includes(String code) {
                return Set.of(
                        "grooming.view_appointments", "grooming.create_appointment", "grooming.edit_appointment",
                        "grooming.cancel_appointment", "grooming.complete_appointment",
                        "pets.view", "pets.add", "pets.edit",
                        "customers.view",
                        "boarding.view_reservations", "boarding.create_reservation"
                ).contains(code);
            }
        };

        abstract boolean includes(String code);
    }

    private record SystemRoleDef(String code, String name, String description, PermissionScope scope) {}
}
