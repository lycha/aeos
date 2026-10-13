-- gen_random_uuid() is built into PostgreSQL 13+; no pgcrypto extension needed.
CREATE TABLE accounts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref TEXT UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id         UUID NOT NULL REFERENCES accounts (id),
    amount_minor       BIGINT NOT NULL CHECK (amount_minor > 0),
    currency           TEXT NOT NULL,
    operator_reference TEXT,
    idempotency_key    TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'RECORDED',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payments_idempotency_key_uniq UNIQUE (idempotency_key)
);
CREATE INDEX payments_account_id_idx ON payments (account_id);
