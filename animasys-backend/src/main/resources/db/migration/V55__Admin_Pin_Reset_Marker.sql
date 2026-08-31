-- Records which owner-PIN recovery requests have already been applied, so a
-- recovery variable left behind in the deployment environment can never
-- re-apply on the next restart and overwrite a PIN the owner changed since.
CREATE TABLE admin_pin_reset_marker (
    token_hash VARCHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL,
    PRIMARY KEY (token_hash)
);
