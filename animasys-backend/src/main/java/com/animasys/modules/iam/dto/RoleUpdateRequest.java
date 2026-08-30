package com.animasys.modules.iam.dto;

import lombok.Data;

@Data
public class RoleUpdateRequest {
    private String name;
    private String description;
}
