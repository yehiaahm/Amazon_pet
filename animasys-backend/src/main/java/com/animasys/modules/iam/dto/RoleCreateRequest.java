package com.animasys.modules.iam.dto;

import lombok.Data;

@Data
public class RoleCreateRequest {
    private String code;
    private String name;
    private String description;
}
