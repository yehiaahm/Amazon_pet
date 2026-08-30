package com.animasys.modules.crm.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

@Data
public class CreateCustomerRequest {

    /** Nested wrapper from POS: `{ customer: { name, phone, ... } }` */
    private CustomerFields customer;

    /** Flat fields (CRM form / legacy). */
    private String name;
    private String phone;
    private String email;
    private String address;
    private Boolean isBanned;
    @Min(0) @Max(100)
    private Integer discount;
    private String notes;

    private CreateCustomerPetRequest pet;

    @Data
    public static class CustomerFields {
        private String name;
        private String phone;
        private String email;
        private String address;
        private Boolean isBanned;
        @Min(0) @Max(100)
        private Integer discount;
        private String notes;
    }

    public String resolvedName() {
        if (customer != null && customer.getName() != null && !customer.getName().isBlank()) {
            return customer.getName().trim();
        }
        return name != null ? name.trim() : "";
    }

    public String resolvedPhone() {
        return pick(customer != null ? customer.getPhone() : null, phone);
    }

    public String resolvedEmail() {
        return pick(customer != null ? customer.getEmail() : null, email);
    }

    public String resolvedAddress() {
        return pick(customer != null ? customer.getAddress() : null, address);
    }

    public Boolean resolvedIsBanned() {
        if (customer != null && customer.getIsBanned() != null) return customer.getIsBanned();
        return isBanned != null ? isBanned : Boolean.FALSE;
    }

    public Integer resolvedDiscount() {
        if (customer != null && customer.getDiscount() != null) return customer.getDiscount();
        return discount != null ? discount : 0;
    }

    public String resolvedNotes() {
        return pick(customer != null ? customer.getNotes() : null, notes);
    }

    private static String pick(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) return primary.trim();
        if (fallback != null && !fallback.isBlank()) return fallback.trim();
        return null;
    }
}
