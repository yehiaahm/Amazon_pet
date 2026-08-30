package com.animasys.modules.iam.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class RoleDetailDto {
    private String id;
    private String code;
    private String name;
    private String description;
    private boolean systemRole;
    private long employeeCount;
    private List<String> permissionCodes;
}
