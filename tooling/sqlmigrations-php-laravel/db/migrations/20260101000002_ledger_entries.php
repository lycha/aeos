<?php

use Phinx\Migration\AbstractMigration;

final class LedgerEntries extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
            -- Append-only ledger. Corrections are new reversing entries, never updates/deletes.
            CREATE TABLE ledger_entries (
              id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              account_id   uuid NOT NULL REFERENCES accounts (id),
              entry_type   text NOT NULL CHECK (entry_type IN (
                             'CHARGE', 'PAYMENT', 'REFUND', 'ADJUSTMENT')),
              amount_minor bigint NOT NULL, -- signed; PAYMENT is positive (credits the balance)
              currency     text NOT NULL,
              payment_id   uuid REFERENCES payments (id),
              metadata     jsonb,
              created_at   timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX ledger_entries_account_id_idx ON ledger_entries (account_id, created_at);

            -- Materialized balance; maintained in the same transaction as each entry.
            CREATE TABLE account_balances (
              account_id    uuid PRIMARY KEY REFERENCES accounts (id),
              balance_minor bigint NOT NULL DEFAULT 0,
              currency      text NOT NULL,
              updated_at    timestamptz NOT NULL DEFAULT now()
            );
            SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE account_balances; DROP TABLE ledger_entries;');
    }
}
