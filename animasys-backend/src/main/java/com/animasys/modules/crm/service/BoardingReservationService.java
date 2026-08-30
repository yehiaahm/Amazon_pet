package com.animasys.modules.crm.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.crm.domain.BoardingReservation;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.crm.domain.Pet;
import com.animasys.modules.crm.dto.BoardingReservationRequest;
import com.animasys.modules.crm.dto.BoardingReservationResponse;
import com.animasys.modules.crm.repository.BoardingReservationRepository;
import com.animasys.modules.crm.repository.PetRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class BoardingReservationService {

    private final BoardingReservationRepository reservationRepository;
    private final PetRepository petRepository;

    public BoardingReservationResponse createReservation(BoardingReservationRequest request) {
        String tenantId = SecurityUtils.requireTenantId();

        if (request.getPetId() == null || request.getPetId().isBlank()) {
            throw new BusinessRuleException("يجب اختيار الحيوان الأليف");
        }
        if (request.getCheckInDate() == null || request.getCheckOutDate() == null) {
            throw new BusinessRuleException("تاريخ الدخول والخروج مطلوبان");
        }
        if (!request.getCheckOutDate().isAfter(request.getCheckInDate())) {
            throw new BusinessRuleException("تاريخ الخروج يجب أن يكون بعد تاريخ الدخول");
        }

        String petId = request.getPetId().trim();
        Pet pet = petRepository.findByIdWithCustomer(petId)
                .orElseThrow(() -> new ResourceNotFoundException("الحيوان الأليف غير موجود: " + petId));

        requirePetTenant(pet, tenantId);

        if (pet.getCustomer() == null) {
            throw new BusinessRuleException("الحيوان الأليف غير مرتبط بعميل");
        }

        BoardingReservation reservation = new BoardingReservation();
        reservation.setId("brd-" + UUID.randomUUID().toString().substring(0, 8));
        reservation.setPet(pet);
        reservation.setCheckInDate(request.getCheckInDate());
        reservation.setCheckOutDate(request.getCheckOutDate());
        reservation.setRoomNumber(request.getRoomNumber());
        reservation.setNotes(request.getNotes());
        reservation.setStatus("ACTIVE");

        if (reservation.getPet() == null || reservation.getPet().getId() == null) {
            throw new BusinessRuleException("تعذر ربط الحجز بالحيوان الأليف");
        }

        BoardingReservation saved = reservationRepository.saveAndFlush(reservation);

        return reservationRepository.findByIdAndTenantIdWithPetAndCustomer(saved.getId(), tenantId)
                .map(this::toResponse)
                .orElseGet(() -> toResponse(saved));
    }

    @Transactional(readOnly = true)
    public List<BoardingReservationResponse> getAllReservations() {
        String tenantId = SecurityUtils.requireTenantId();
        return reservationRepository.findByTenantIdWithPetAndCustomer(tenantId).stream()
                .filter(r -> r.getPet() != null)
                .map(this::toResponse)
                .toList();
    }

    public BoardingReservationResponse updateReservationStatus(String id, String status) {
        String tenantId = SecurityUtils.requireTenantId();
        BoardingReservation reservation = reservationRepository.findByIdAndTenantIdWithPetAndCustomer(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("الحجز غير موجود"));
        if (reservation.getPet() == null) {
            throw new BusinessRuleException("الحجز غير مرتبط بحيوان أليف صالح — احذفه وأنشئ حجزاً جديداً");
        }
        reservation.setStatus(status);
        BoardingReservation saved = reservationRepository.saveAndFlush(reservation);
        return toResponse(saved);
    }

    public void deleteReservation(String id) {
        String tenantId = SecurityUtils.requireTenantId();
        BoardingReservation reservation = reservationRepository.findByIdAndTenantIdWithPetAndCustomer(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("الحجز غير موجود"));
        reservationRepository.delete(reservation);
    }

    private void requirePetTenant(Pet pet, String tenantId) {
        if (pet.getCustomer() == null
                || pet.getCustomer().getTenant() == null
                || !tenantId.equals(pet.getCustomer().getTenant().getId())) {
            throw new AccessDeniedException("Pet not accessible for this tenant");
        }
    }

    private BoardingReservationResponse toResponse(BoardingReservation reservation) {
        Pet pet = reservation.getPet();
        Customer customer = pet != null ? pet.getCustomer() : null;

        return BoardingReservationResponse.builder()
                .id(reservation.getId())
                .petId(pet != null ? pet.getId() : null)
                .petName(pet != null ? pet.getName() : "—")
                .customerName(customer != null ? customer.getName() : "—")
                .customerPhone(customer != null ? customer.getPhone() : null)
                .checkInDate(reservation.getCheckInDate())
                .checkOutDate(reservation.getCheckOutDate())
                .roomNumber(reservation.getRoomNumber())
                .notes(reservation.getNotes())
                .status(reservation.getStatus())
                .build();
    }
}
