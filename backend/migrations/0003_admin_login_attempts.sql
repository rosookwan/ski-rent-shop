CREATE TABLE admin_login_attempts (
    scope TEXT NOT NULL CHECK (scope IN ('account', 'ip')),
    subject_hash TEXT NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    window_started_at TEXT NOT NULL,
    blocked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (scope, subject_hash)
);

CREATE INDEX idx_admin_login_attempts_blocked
    ON admin_login_attempts (blocked_until);
