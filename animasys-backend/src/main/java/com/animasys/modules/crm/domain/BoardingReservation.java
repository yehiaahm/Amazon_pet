package com.animasys.modules.crm.domain;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Entity
@Table(name = "boarding_reservations")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BoardingReservation {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "pet_id", nullable = false)
    private Pet pet;

    @Column(name = "check_in_date", nullable = false)
    private Instant checkInDate;

    @Column(name = "check_out_date", nullable = false)
    private Instant checkOutDate;

    @Column(name = "room_number")
    private String roomNumber;

    private String notes;

    @Column(nullable = false)
    private String status; // ACTIVE, COMPLETED, CANCELLED
}
