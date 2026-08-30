package com.animasys.modules.inventory.importer.service;

import com.animasys.modules.inventory.importer.domain.DuplicateMatchType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class DuplicateMatch {
    private DuplicateMatchType matchType;
    private String productId;
    private String variantId;
}
