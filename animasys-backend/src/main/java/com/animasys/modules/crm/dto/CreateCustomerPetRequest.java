package com.animasys.modules.crm.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateCustomerPetRequest {

    @NotBlank
    private String name;

    private String species = "OTHER";
    private String breed;
    private Integer age;
}
