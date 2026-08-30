package com.animasys.modules.inventory.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "tenant_barcode_settings")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TenantBarcodeSettings {
    @Id
    @Column(name = "tenant_id")
    private String tenantId;

    @Column(name = "auto_generate_barcode", nullable = false)
    @Builder.Default
    private boolean autoGenerateBarcode = true;

    @Enumerated(EnumType.STRING)
    @Column(name = "default_barcode_format", nullable = false)
    @Builder.Default
    private BarcodeFormat defaultBarcodeFormat = BarcodeFormat.CODE_128;

    @Column(name = "default_label_size", nullable = false)
    @Builder.Default
    private String defaultLabelSize = "50x25";

    @Column(name = "include_price", nullable = false)
    @Builder.Default
    private boolean includePrice = true;

    @Column(name = "include_name", nullable = false)
    @Builder.Default
    private boolean includeName = true;

    @Column(name = "include_sku", nullable = false)
    @Builder.Default
    private boolean includeSku = true;

    @Enumerated(EnumType.STRING)
    @Column(name = "default_template_style", nullable = false)
    @Builder.Default
    private TemplateStyle defaultTemplateStyle = TemplateStyle.PET_SHOP_SMALL;
}
