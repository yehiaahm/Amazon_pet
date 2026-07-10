package com.animasys.modules.sales.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Entity
@Table(name = "sale_items")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SaleItem {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sale_id", nullable = false)
    private Sale sale;

    @Column(nullable = false)
    private String type; // PRODUCT, SERVICE

    @Column(name = "item_id", nullable = false)
    private String itemId; // ProductVariant ID or Service ID

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private int quantity;

    @Column(nullable = false)
    private BigDecimal price;

    @Column(nullable = false)
    private BigDecimal cost;
}
