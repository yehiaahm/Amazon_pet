package com.animasys.modules.iam.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class PermissionModuleDto {
    private String module;
    private List<PermissionDto> permissions;
}
