CREATE TABLE notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT NOT NULL DEFAULT '공지',
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    display_until TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notices_public_order
    ON notices (pinned DESC, published_at DESC, id DESC);

CREATE TABLE notice_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    stored_name TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notice_files_notice_id ON notice_files (notice_id);

CREATE TABLE inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    name TEXT NOT NULL,
    contact TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    secret INTEGER NOT NULL DEFAULT 1 CHECK (secret IN (0, 1)),
    password_hash TEXT,
    status TEXT NOT NULL DEFAULT '답변대기' CHECK (status IN ('답변대기', '답변완료')),
    answer TEXT NOT NULL DEFAULT '',
    estimate_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    answered_at TEXT
);

CREATE INDEX idx_inquiries_status_created
    ON inquiries (status, created_at DESC, id DESC);

CREATE TABLE catalog_items (
    category TEXT NOT NULL CHECK (category IN ('lift', 'equipment', 'clothing', 'safety')),
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
    discount_general INTEGER NOT NULL DEFAULT 0 CHECK (discount_general >= 0),
    discount_affiliate INTEGER NOT NULL DEFAULT 0 CHECK (discount_affiliate >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (category, item_id)
);

CREATE INDEX idx_catalog_items_display
    ON catalog_items (category, hidden, sort_order, item_id);

CREATE TABLE discount_config (
    discount_group TEXT PRIMARY KEY CHECK (discount_group IN ('general', 'affiliate')),
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
    value INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
    keywords_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login_id TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admin_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX idx_admin_sessions_expiry ON admin_sessions (expires_at);
