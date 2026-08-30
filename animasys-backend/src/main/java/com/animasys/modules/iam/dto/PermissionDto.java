package com.animasys.modules.iam.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class PermissionDto {
    private String id;
    private String code;
    private String name;
    private String module;
    private String description;
}
