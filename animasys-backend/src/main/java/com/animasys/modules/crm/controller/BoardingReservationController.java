package com.animasys.modules.crm.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.modules.crm.dto.BoardingReservationRequest;
import com.animasys.modules.crm.dto.BoardingReservationResponse;
import com.animasys.modules.crm.service.BoardingReservationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/boarding-reservations")
@RequiredArgsConstructor
public class BoardingReservationController {

    private final BoardingReservationService boardingReservationService;

    @PostMapping
    @PreAuthorize("@authz.has('boarding.create_reservation')")
    public ResponseEntity<ApiResponseWrapper<BoardingReservationResponse>> createReservation(
            @Valid @RequestBody BoardingReservationRequest request) {
        BoardingReservationResponse created = boardingReservationService.createReservation(request);
        return ResponseEntity.ok(ApiResponseWrapper.success(created, "تم تسجيل حجز الإقامة بنجاح"));
    }

    @GetMapping
    @PreAuthorize("@authz.has('boarding.view_reservations')")
    public ResponseEntity<ApiResponseWrapper<List<BoardingReservationResponse>>> getAllReservations() {
        List<BoardingReservationResponse> list = boardingReservationService.getAllReservations();
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع قائمة حجوزات الإقامة بنجاح"));
    }

    @PutMapping("/{id}/status")
    @PreAuthorize("@authz.has('boarding.edit_reservation')")
    public ResponseEntity<ApiResponseWrapper<BoardingReservationResponse>> updateStatus(
            @PathVariable String id,
            @RequestParam String status) {
        BoardingReservationResponse updated = boardingReservationService.updateReservationStatus(id, status);
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم تحديث حالة الحجز بنجاح"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('boarding.cancel_reservation')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteReservation(@PathVariable String id) {
        boardingReservationService.deleteReservation(id);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم إلغاء وحذف حجز الإقامة"));
    }
}
