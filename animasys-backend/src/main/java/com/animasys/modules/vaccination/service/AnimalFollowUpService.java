package com.animasys.modules.vaccination.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.core.util.BusinessTimeZone;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.crm.domain.Pet;
import com.animasys.modules.crm.repository.PetRepository;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.vaccination.domain.AnimalFollowUpSettings;
import com.animasys.modules.vaccination.domain.AnimalReminder;
import com.animasys.modules.vaccination.domain.VaccinationHistory;
import com.animasys.modules.vaccination.domain.VaccinationRecord;
import com.animasys.modules.vaccination.dto.*;
import com.animasys.modules.vaccination.repository.AnimalFollowUpSettingsRepository;
import com.animasys.modules.vaccination.repository.AnimalReminderRepository;
import com.animasys.modules.vaccination.repository.VaccinationHistoryRepository;
import com.animasys.modules.vaccination.repository.VaccinationRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class AnimalFollowUpService {

    private final VaccinationRecordRepository vaccinationRecordRepository;
    private final VaccinationHistoryRepository vaccinationHistoryRepository;
    private final AnimalReminderRepository animalReminderRepository;
    private final AnimalFollowUpSettingsRepository settingsRepository;
    private final PetRepository petRepository;
    private final TenantRepository tenantRepository;

    // ─── Vaccinations ───────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<VaccinationRecordResponse> getVaccinations(String tenantId, String petId) {
        int threshold = getThresholdDays(tenantId);
        List<VaccinationRecord> records;
        if (petId != null && !petId.isBlank()) {
            requirePetForTenant(tenantId, petId);
            records = vaccinationRecordRepository.findByPetId(petId);
        } else {
            records = vaccinationRecordRepository.findByPetCustomerTenantId(tenantId);
        }
        return records.stream().map(v -> toResponse(v, threshold)).toList();
    }

    public VaccinationRecordResponse createVaccination(String tenantId, Employee actor, VaccinationRequest req) {
        if (req.getPetId() == null || req.getPetId().isBlank()) {
            throw new BusinessRuleException("الحيوان مطلوب");
        }
        if (req.getVaccineName() == null || req.getVaccineName().isBlank()) {
            throw new BusinessRuleException("اسم التطعيم مطلوب");
        }
        Pet pet = requirePetForTenant(tenantId, req.getPetId());

        LocalDate nextDueDate = req.getNextDueDate();
        if (nextDueDate == null && req.getLastAdministeredDate() != null && req.getIntervalMonths() != null) {
            nextDueDate = req.getLastAdministeredDate().plusMonths(req.getIntervalMonths());
        }

        VaccinationRecord record = VaccinationRecord.builder()
                .id(UUID.randomUUID().toString())
                .pet(pet)
                .vaccineName(req.getVaccineName().trim())
                .intervalMonths(req.getIntervalMonths())
                .lastAdministeredDate(req.getLastAdministeredDate())
                .nextDueDate(nextDueDate)
                .notes(req.getNotes())
                .createdBy(actor)
                .build();
        record = vaccinationRecordRepository.save(record);
        return toResponse(record, getThresholdDays(tenantId));
    }

    public VaccinationRecordResponse updateVaccination(String tenantId, String id, VaccinationRequest req) {
        VaccinationRecord record = requireVaccinationForTenant(tenantId, id);
        if (req.getVaccineName() == null || req.getVaccineName().isBlank()) {
            throw new BusinessRuleException("اسم التطعيم مطلوب");
        }
        record.setVaccineName(req.getVaccineName().trim());
        record.setIntervalMonths(req.getIntervalMonths());
        record.setLastAdministeredDate(req.getLastAdministeredDate());
        record.setNextDueDate(req.getNextDueDate());
        record.setNotes(req.getNotes());
        record = vaccinationRecordRepository.save(record);
        return toResponse(record, getThresholdDays(tenantId));
    }

    public void deleteVaccination(String tenantId, String id) {
        requireVaccinationForTenant(tenantId, id);
        vaccinationRecordRepository.deleteById(id);
    }

    public VaccinationRecordResponse administerVaccination(String tenantId, Employee actor, String id, AdministerVaccinationRequest req) {
        VaccinationRecord record = requireVaccinationForTenant(tenantId, id);
        LocalDate administeredDate = req.getAdministeredDate() != null
                ? req.getAdministeredDate()
                : LocalDate.now(BusinessTimeZone.ZONE);

        VaccinationHistory history = VaccinationHistory.builder()
                .id(UUID.randomUUID().toString())
                .vaccinationRecord(record)
                .pet(record.getPet())
                .vaccineName(record.getVaccineName())
                .administeredDate(administeredDate)
                .administeredBy(actor)
                .notes(req.getNotes())
                .build();
        vaccinationHistoryRepository.save(history);

        record.setLastAdministeredDate(administeredDate);
        record.setNextDueDate(record.getIntervalMonths() != null
                ? administeredDate.plusMonths(record.getIntervalMonths())
                : null);
        record = vaccinationRecordRepository.save(record);

        return toResponse(record, getThresholdDays(tenantId));
    }

    @Transactional(readOnly = true)
    public List<VaccinationHistoryResponse> getVaccinationHistory(String tenantId, String id) {
        requireVaccinationForTenant(tenantId, id);
        return vaccinationHistoryRepository.findByVaccinationRecordIdOrderByAdministeredDateDesc(id).stream()
                .map(this::toResponse)
                .toList();
    }

    // ─── General reminders ──────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<AnimalReminderResponse> getReminders(String tenantId, String petId) {
        int threshold = getThresholdDays(tenantId);
        List<AnimalReminder> reminders;
        if (petId != null && !petId.isBlank()) {
            requirePetForTenant(tenantId, petId);
            reminders = animalReminderRepository.findByPetId(petId);
        } else {
            reminders = animalReminderRepository.findByPetCustomerTenantId(tenantId);
        }
        return reminders.stream().map(r -> toResponse(r, threshold)).toList();
    }

    public AnimalReminderResponse createReminder(String tenantId, Employee actor, AnimalReminderRequest req) {
        if (req.getPetId() == null || req.getPetId().isBlank()) {
            throw new BusinessRuleException("الحيوان مطلوب");
        }
        if (req.getTitle() == null || req.getTitle().isBlank()) {
            throw new BusinessRuleException("عنوان التذكير مطلوب");
        }
        if (req.getDueDate() == null) {
            throw new BusinessRuleException("تاريخ الاستحقاق مطلوب");
        }
        Pet pet = requirePetForTenant(tenantId, req.getPetId());
        AnimalReminder reminder = AnimalReminder.builder()
                .id(UUID.randomUUID().toString())
                .pet(pet)
                .title(req.getTitle().trim())
                .description(req.getDescription())
                .dueDate(req.getDueDate())
                .status("OPEN")
                .createdBy(actor)
                .build();
        reminder = animalReminderRepository.save(reminder);
        return toResponse(reminder, getThresholdDays(tenantId));
    }

    public AnimalReminderResponse updateReminder(String tenantId, String id, AnimalReminderRequest req) {
        AnimalReminder reminder = requireReminderForTenant(tenantId, id);
        if (req.getTitle() == null || req.getTitle().isBlank()) {
            throw new BusinessRuleException("عنوان التذكير مطلوب");
        }
        if (req.getDueDate() == null) {
            throw new BusinessRuleException("تاريخ الاستحقاق مطلوب");
        }
        reminder.setTitle(req.getTitle().trim());
        reminder.setDescription(req.getDescription());
        reminder.setDueDate(req.getDueDate());
        reminder = animalReminderRepository.save(reminder);
        return toResponse(reminder, getThresholdDays(tenantId));
    }

    public void deleteReminder(String tenantId, String id) {
        requireReminderForTenant(tenantId, id);
        animalReminderRepository.deleteById(id);
    }

    public AnimalReminderResponse completeReminder(String tenantId, Employee actor, String id) {
        AnimalReminder reminder = requireReminderForTenant(tenantId, id);
        if ("COMPLETED".equals(reminder.getStatus())) {
            throw new BusinessRuleException("هذا التذكير مكتمل بالفعل");
        }
        reminder.setStatus("COMPLETED");
        reminder.setCompletedBy(actor);
        reminder.setCompletedAt(Instant.now());
        reminder = animalReminderRepository.save(reminder);
        return toResponse(reminder, getThresholdDays(tenantId));
    }

    // ─── Settings ────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public AnimalFollowUpSettings getSettings(String tenantId) {
        return settingsRepository.findById(tenantId).orElseGet(() -> createDefaultSettings(tenantId));
    }

    public AnimalFollowUpSettings updateSettings(String tenantId, int dueSoonThresholdDays) {
        if (dueSoonThresholdDays < 1 || dueSoonThresholdDays > 180) {
            throw new BusinessRuleException("عدد أيام التنبيه يجب أن يكون بين 1 و 180");
        }
        AnimalFollowUpSettings settings = settingsRepository.findById(tenantId)
                .orElseGet(() -> createDefaultSettings(tenantId));
        settings.setDueSoonThresholdDays(dueSoonThresholdDays);
        return settingsRepository.save(settings);
    }

    // ─── Aggregate views ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public AnimalFollowUpDashboard getDashboard(String tenantId) {
        int threshold = getThresholdDays(tenantId);

        List<VaccinationRecordResponse> allVaccinations = vaccinationRecordRepository.findByPetCustomerTenantId(tenantId).stream()
                .map(v -> toResponse(v, threshold))
                .toList();
        List<VaccinationRecordResponse> vaccinationsOverdue = allVaccinations.stream()
                .filter(v -> "OVERDUE".equals(v.getStatus()))
                .sorted(Comparator.comparing(VaccinationRecordResponse::getNextDueDate))
                .toList();
        List<VaccinationRecordResponse> vaccinationsDueSoon = allVaccinations.stream()
                .filter(v -> "DUE_SOON".equals(v.getStatus()) || "DUE_TODAY".equals(v.getStatus()))
                .sorted(Comparator.comparing(VaccinationRecordResponse::getNextDueDate))
                .toList();

        List<AnimalReminderResponse> openReminders = animalReminderRepository.findByPetCustomerTenantId(tenantId).stream()
                .map(r -> toResponse(r, threshold))
                .filter(r -> !"COMPLETED".equals(r.getStatus()))
                .toList();
        List<AnimalReminderResponse> remindersOverdue = openReminders.stream()
                .filter(r -> "OVERDUE".equals(r.getStatus()))
                .sorted(Comparator.comparing(AnimalReminderResponse::getDueDate))
                .toList();
        List<AnimalReminderResponse> remindersDueToday = openReminders.stream()
                .filter(r -> "DUE_TODAY".equals(r.getStatus()))
                .toList();
        List<AnimalReminderResponse> remindersDueThisWeek = openReminders.stream()
                .filter(r -> r.getDaysUntilDue() != null && r.getDaysUntilDue() >= 0 && r.getDaysUntilDue() <= 7)
                .sorted(Comparator.comparing(AnimalReminderResponse::getDueDate))
                .toList();

        return AnimalFollowUpDashboard.builder()
                .dueSoonThresholdDays(threshold)
                .vaccinationsDueSoon(vaccinationsDueSoon)
                .vaccinationsOverdue(vaccinationsOverdue)
                .remindersOverdue(remindersOverdue)
                .remindersDueToday(remindersDueToday)
                .remindersDueThisWeek(remindersDueThisWeek)
                .vaccinationsDueSoonCount(vaccinationsDueSoon.size())
                .vaccinationsOverdueCount(vaccinationsOverdue.size())
                .remindersOverdueCount(remindersOverdue.size())
                .remindersDueTodayCount(remindersDueToday.size())
                .remindersDueThisWeekCount(remindersDueThisWeek.size())
                .build();
    }

    @Transactional(readOnly = true)
    public PetFollowUpView getPetFollowUp(String tenantId, String petId) {
        Pet pet = requirePetForTenant(tenantId, petId);
        int threshold = getThresholdDays(tenantId);

        List<VaccinationRecordResponse> vaccinations = vaccinationRecordRepository.findByPetId(petId).stream()
                .map(v -> toResponse(v, threshold))
                .sorted(Comparator.comparing(v -> v.getNextDueDate() != null ? v.getNextDueDate() : LocalDate.MAX))
                .toList();
        List<AnimalReminderResponse> reminders = animalReminderRepository.findByPetId(petId).stream()
                .map(r -> toResponse(r, threshold))
                .sorted(Comparator.comparing(AnimalReminderResponse::getDueDate))
                .toList();

        Customer owner = pet.getCustomer();
        PetOwnerSummary ownerSummary = owner != null
                ? PetOwnerSummary.builder().id(owner.getId()).name(owner.getName()).phone(owner.getPhone()).build()
                : null;

        return PetFollowUpView.builder()
                .petId(pet.getId())
                .petName(pet.getName())
                .owner(ownerSummary)
                .vaccinations(vaccinations)
                .reminders(reminders)
                .build();
    }

    @Transactional(readOnly = true)
    public Map<String, PetFollowUpSummary> getFollowUpSummary(String tenantId) {
        int threshold = getThresholdDays(tenantId);

        Map<String, List<VaccinationRecordResponse>> vaccinationsByPet = vaccinationRecordRepository
                .findByPetCustomerTenantId(tenantId).stream()
                .map(v -> toResponse(v, threshold))
                .collect(Collectors.groupingBy(VaccinationRecordResponse::getPetId));
        Map<String, List<AnimalReminderResponse>> remindersByPet = animalReminderRepository
                .findByPetCustomerTenantId(tenantId).stream()
                .map(r -> toResponse(r, threshold))
                .collect(Collectors.groupingBy(AnimalReminderResponse::getPetId));

        Set<String> petIds = new HashSet<>();
        petIds.addAll(vaccinationsByPet.keySet());
        petIds.addAll(remindersByPet.keySet());

        Map<String, PetFollowUpSummary> summary = new HashMap<>();
        for (String petId : petIds) {
            List<VaccinationRecordResponse> vaccinations = vaccinationsByPet.getOrDefault(petId, List.of());
            List<AnimalReminderResponse> reminders = remindersByPet.getOrDefault(petId, List.of());

            int overdueCount = (int) vaccinations.stream().filter(v -> "OVERDUE".equals(v.getStatus())).count()
                    + (int) reminders.stream().filter(r -> "OVERDUE".equals(r.getStatus())).count();
            int dueSoonCount = (int) vaccinations.stream()
                    .filter(v -> "DUE_SOON".equals(v.getStatus()) || "DUE_TODAY".equals(v.getStatus())).count()
                    + (int) reminders.stream()
                    .filter(r -> "DUE_SOON".equals(r.getStatus()) || "DUE_TODAY".equals(r.getStatus())).count();

            LocalDate nextDueDate = null;
            String nextItemTitle = null;
            for (VaccinationRecordResponse v : vaccinations) {
                if (v.getNextDueDate() != null && (nextDueDate == null || v.getNextDueDate().isBefore(nextDueDate))) {
                    nextDueDate = v.getNextDueDate();
                    nextItemTitle = v.getVaccineName();
                }
            }
            for (AnimalReminderResponse r : reminders) {
                if (!"COMPLETED".equals(r.getStatus()) && (nextDueDate == null || r.getDueDate().isBefore(nextDueDate))) {
                    nextDueDate = r.getDueDate();
                    nextItemTitle = r.getTitle();
                }
            }

            summary.put(petId, PetFollowUpSummary.builder()
                    .petId(petId)
                    .overdueCount(overdueCount)
                    .dueSoonCount(dueSoonCount)
                    .nextDueDate(nextDueDate)
                    .nextItemTitle(nextItemTitle)
                    .build());
        }
        return summary;
    }

    // ─── Internal helpers ───────────────────────────────────────────────────

    private VaccinationRecordResponse toResponse(VaccinationRecord v, int thresholdDays) {
        Pet pet = v.getPet();
        Customer owner = pet.getCustomer();
        return VaccinationRecordResponse.builder()
                .id(v.getId())
                .petId(pet.getId())
                .petName(pet.getName())
                .ownerId(owner != null ? owner.getId() : null)
                .ownerName(owner != null ? owner.getName() : null)
                .ownerPhone(owner != null ? owner.getPhone() : null)
                .vaccineName(v.getVaccineName())
                .intervalMonths(v.getIntervalMonths())
                .lastAdministeredDate(v.getLastAdministeredDate())
                .nextDueDate(v.getNextDueDate())
                .notes(v.getNotes())
                .status(computeStatus(v.getNextDueDate(), thresholdDays))
                .daysUntilDue(daysUntilDueOrNull(v.getNextDueDate()))
                .createdByName(v.getCreatedBy() != null ? v.getCreatedBy().getFullName() : null)
                .createdAt(v.getCreatedAt())
                .build();
    }

    private VaccinationHistoryResponse toResponse(VaccinationHistory h) {
        return VaccinationHistoryResponse.builder()
                .id(h.getId())
                .vaccinationRecordId(h.getVaccinationRecord().getId())
                .petId(h.getPet().getId())
                .vaccineName(h.getVaccineName())
                .administeredDate(h.getAdministeredDate())
                .administeredByName(h.getAdministeredBy() != null ? h.getAdministeredBy().getFullName() : null)
                .notes(h.getNotes())
                .createdAt(h.getCreatedAt())
                .build();
    }

    private AnimalReminderResponse toResponse(AnimalReminder r, int thresholdDays) {
        Pet pet = r.getPet();
        Customer owner = pet.getCustomer();
        boolean completed = "COMPLETED".equals(r.getStatus());
        return AnimalReminderResponse.builder()
                .id(r.getId())
                .petId(pet.getId())
                .petName(pet.getName())
                .ownerId(owner != null ? owner.getId() : null)
                .ownerName(owner != null ? owner.getName() : null)
                .ownerPhone(owner != null ? owner.getPhone() : null)
                .title(r.getTitle())
                .description(r.getDescription())
                .dueDate(r.getDueDate())
                .status(completed ? "COMPLETED" : computeStatus(r.getDueDate(), thresholdDays))
                .daysUntilDue(completed ? null : daysUntilDue(r.getDueDate()))
                .createdByName(r.getCreatedBy() != null ? r.getCreatedBy().getFullName() : null)
                .completedByName(r.getCompletedBy() != null ? r.getCompletedBy().getFullName() : null)
                .createdAt(r.getCreatedAt())
                .completedAt(r.getCompletedAt())
                .build();
    }

    private String computeStatus(LocalDate dueDate, int thresholdDays) {
        if (dueDate == null) return "COMPLETED";
        int days = daysUntilDue(dueDate);
        if (days < 0) return "OVERDUE";
        if (days == 0) return "DUE_TODAY";
        if (days <= thresholdDays) return "DUE_SOON";
        return "UPCOMING";
    }

    private int daysUntilDue(LocalDate dueDate) {
        return (int) ChronoUnit.DAYS.between(LocalDate.now(BusinessTimeZone.ZONE), dueDate);
    }

    private Integer daysUntilDueOrNull(LocalDate dueDate) {
        return dueDate == null ? null : daysUntilDue(dueDate);
    }

    private int getThresholdDays(String tenantId) {
        return settingsRepository.findById(tenantId)
                .map(AnimalFollowUpSettings::getDueSoonThresholdDays)
                .orElse(30);
    }

    private AnimalFollowUpSettings createDefaultSettings(String tenantId) {
        AnimalFollowUpSettings settings = AnimalFollowUpSettings.builder()
                .tenantId(tenantId)
                .dueSoonThresholdDays(30)
                .build();
        tenantRepository.findById(tenantId).ifPresent(settings::setTenant);
        return settingsRepository.save(settings);
    }

    private Pet requirePetForTenant(String tenantId, String petId) {
        Pet pet = petRepository.findByIdWithCustomer(petId)
                .orElseThrow(() -> new ResourceNotFoundException("الحيوان غير موجود"));
        requireOwnedByTenant(pet, tenantId, "الحيوان غير موجود");
        return pet;
    }

    private VaccinationRecord requireVaccinationForTenant(String tenantId, String id) {
        VaccinationRecord record = vaccinationRecordRepository.findByIdWithPetAndCustomer(id)
                .orElseThrow(() -> new ResourceNotFoundException("سجل التطعيم غير موجود"));
        requireOwnedByTenant(record.getPet(), tenantId, "سجل التطعيم غير موجود");
        return record;
    }

    private AnimalReminder requireReminderForTenant(String tenantId, String id) {
        AnimalReminder reminder = animalReminderRepository.findByIdWithPetAndCustomer(id)
                .orElseThrow(() -> new ResourceNotFoundException("التذكير غير موجود"));
        requireOwnedByTenant(reminder.getPet(), tenantId, "التذكير غير موجود");
        return reminder;
    }

    private void requireOwnedByTenant(Pet pet, String tenantId, String notFoundMessage) {
        if (pet == null || pet.getCustomer() == null || pet.getCustomer().getTenant() == null
                || !tenantId.equals(pet.getCustomer().getTenant().getId())) {
            throw new ResourceNotFoundException(notFoundMessage);
        }
    }
}
