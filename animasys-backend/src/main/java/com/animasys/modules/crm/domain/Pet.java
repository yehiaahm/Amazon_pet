package com.animasys.modules.crm.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "pets")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Pet {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id", nullable = false)
    @JsonIgnore
    private Customer customer;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String species; // DOG, CAT, BIRD, OTHER

    private String breed;
    private Integer age;

    // Virtual field for responses — populated from customer association
    @com.fasterxml.jackson.annotation.JsonProperty("customerId")
    @Transient
    public String getCustomerId() {
        return customer != null ? customer.getId() : null;
    }
}
