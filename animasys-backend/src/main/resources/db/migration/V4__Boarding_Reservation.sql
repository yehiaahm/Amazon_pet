CREATE TABLE boarding_reservations (
    id VARCHAR(36) PRIMARY KEY,
    pet_id VARCHAR(36) NOT NULL,
    check_in_date TIMESTAMP NOT NULL,
    check_out_date TIMESTAMP NOT NULL,
    room_number VARCHAR(50),
    notes VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, CANCELLED
    FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
);
