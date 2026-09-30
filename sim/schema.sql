-- Core Banking Simulation Schema
CREATE TABLE IF NOT EXISTS customers (
    customer_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    dob DATE NOT NULL,
    kyc_status VARCHAR(32) NOT NULL DEFAULT 'verified',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS accounts (
    account_id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL REFERENCES customers(customer_id),
    type VARCHAR(32) NOT NULL DEFAULT 'checking',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS transactions (
    txn_id BIGINT PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL REFERENCES accounts(account_id),
    txn_date TIMESTAMPTZ NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    channel VARCHAR(32) NOT NULL DEFAULT 'online',
    narrative TEXT NULL,
    metadata JSONB NULL
);

CREATE TABLE IF NOT EXISTS loans (
    loan_id VARCHAR(64) PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL REFERENCES accounts(account_id),
    principal NUMERIC(18, 2) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL
);

CREATE TABLE IF NOT EXISTS legal_holds (
    hold_id VARCHAR(64) PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL REFERENCES accounts(account_id),
    reason TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS kyc_documents (
    doc_id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL REFERENCES customers(customer_id),
    doc_type VARCHAR(64) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blob_sha256 VARCHAR(64) NOT NULL
);

-- Archive Schema Mirrors
CREATE TABLE IF NOT EXISTS transactions_archive (
    txn_id BIGINT PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL,
    txn_date TIMESTAMPTZ NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    narrative TEXT NULL,
    metadata JSONB NULL,
    archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archive_run_id VARCHAR(64) NOT NULL
);
