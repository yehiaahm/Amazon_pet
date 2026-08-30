package com.animasys.modules.iam.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class RoleSummaryDto {
    private String id;
    private String code;
    private String name;
    private String description;
    private boolean systemRole;
    private long employeeCount;
    private int permissionCount;
}
