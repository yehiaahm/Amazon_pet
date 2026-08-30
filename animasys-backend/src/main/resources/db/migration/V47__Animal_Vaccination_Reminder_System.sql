-- Animal Vaccination & Reminder System: per-pet vaccination schedules with
-- auto-recurring next-due-dates, administration history, and general
-- (non-vaccination) reminders. Status (Upcoming/DueSoon/DueToday/Overdue) is
-- always computed on read from due dates — nothing here is cron-updated.

CREATE TABLE vaccination_records (
    id                      VARCHAR(36)  PRIMARY KEY,
    pet_id                  VARCHAR(36)  NOT NULL,
    vaccine_name            VARCHAR(200) NOT NULL,
    interval_months         INT          NULL,
    last_administered_date  DATE         NULL,
    next_due_date           DATE         NULL,
    notes                   VARCHAR(500),
    created_by              VARCHAR(36)  NULL,
    created_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    NULL,
    CONSTRAINT fk_vaccination_pet FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
    CONSTRAINT fk_vaccination_created_by FOREIGN KEY (created_by) REFERENCES employees(id)
);

CREATE INDEX idx_vaccination_pet ON vaccination_records(pet_id);
CREATE INDEX idx_vaccination_next_due ON vaccination_records(next_due_date);

CREATE TABLE vaccination_history (
    id                      VARCHAR(36)  PRIMARY KEY,
    vaccination_record_id  VARCHAR(36)  NOT NULL,
    pet_id                  VARCHAR(36)  NOT NULL,
    vaccine_name            VARCHAR(200) NOT NULL,
    administered_date       DATE         NOT NULL,
    administered_by         VARCHAR(36)  NULL,
    notes                   VARCHAR(500),
    created_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vh_record FOREIGN KEY (vaccination_record_id) REFERENCES vaccination_records(id) ON DELETE CASCADE,
    CONSTRAINT fk_vh_pet FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
    CONSTRAINT fk_vh_employee FOREIGN KEY (administered_by) REFERENCES employees(id)
);

CREATE INDEX idx_vh_record ON vaccination_history(vaccination_record_id);
CREATE INDEX idx_vh_pet ON vaccination_history(pet_id);

CREATE TABLE animal_reminders (
    id             VARCHAR(36)  PRIMARY KEY,
    pet_id         VARCHAR(36)  NOT NULL,
    title          VARCHAR(200) NOT NULL,
    description    VARCHAR(1000),
    due_date       DATE         NOT NULL,
    status         VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    created_by     VARCHAR(36)  NULL,
    completed_by   VARCHAR(36)  NULL,
    created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    completed_at   TIMESTAMP    NULL,
    CONSTRAINT fk_reminder_pet FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
    CONSTRAINT fk_reminder_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
    CONSTRAINT fk_reminder_completed_by FOREIGN KEY (completed_by) REFERENCES employees(id)
);

CREATE INDEX idx_reminder_pet ON animal_reminders(pet_id);
CREATE INDEX idx_reminder_due_date ON animal_reminders(due_date);
CREATE INDEX idx_reminder_status ON animal_reminders(status);

CREATE TABLE animal_follow_up_settings (
    tenant_id                VARCHAR(36) PRIMARY KEY,
    due_soon_threshold_days  INT         NOT NULL DEFAULT 30,
    CONSTRAINT fk_afu_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- ─── Permission catalog ─────────────────────────────────────────────────────

INSERT INTO permissions (id, code, name, module) VALUES
('perm-vaccinations-view',      'vaccinations.view',       'View Vaccinations',       'Vaccinations'),
('perm-vaccinations-manage',    'vaccinations.manage',     'Manage Vaccinations',     'Vaccinations'),
('perm-animal-reminders-view',  'animal_reminders.view',   'View Animal Reminders',   'Vaccinations'),
('perm-animal-reminders-manage','animal_reminders.manage', 'Manage Animal Reminders', 'Vaccinations');

-- OWNER, MANAGER, GROOMER: full access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'vaccinations.view','vaccinations.manage',
    'animal_reminders.view','animal_reminders.manage'
)
WHERE r.code IN ('OWNER', 'MANAGER', 'GROOMER');

-- CASHIER: view-only, mirrors how pets.view (not pets.add/edit) was granted to CASHIER
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('vaccinations.view', 'animal_reminders.view')
WHERE r.code = 'CASHIER';
