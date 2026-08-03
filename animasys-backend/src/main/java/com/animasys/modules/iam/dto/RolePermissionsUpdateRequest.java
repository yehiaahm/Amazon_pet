package com.animasys.modules.iam.dto;

import lombok.Data;

import java.util.List;

@Data
public class RolePermissionsUpdateRequest {
    private List<String> permissionCodes;
}
