-- Append-only ledger. Corrections are new reversing entries, never updates/deletes.
CREATE TABLE ledger_entries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id   UUID NOT NULL REFERENCES accounts (id),
    entry_type   TEXT NOT NULL CHECK (entry_type IN ('CHARGE', 'PAYMENT', 'REFUND', 'ADJUSTMENT')),
    amount_minor BIGINT NOT NULL,
    currency     TEXT NOT NULL,
    payment_id   UUID REFERENCES payments (id),
    metadata     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_account_id_idx ON ledger_entries (account_id, created_at);

-- Materialized balance; maintained in the same transaction as each entry.
CREATE TABLE account_balances (
    account_id    UUID PRIMARY KEY REFERENCES accounts (id),
    balance_minor BIGINT NOT NULL DEFAULT 0,
    currency      TEXT NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
