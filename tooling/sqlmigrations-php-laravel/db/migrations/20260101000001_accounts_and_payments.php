<?php

use Phinx\Migration\AbstractMigration;

/**
 * Human-owned schema. Raw SQL on purpose: the migration is the source of truth, and the PHP types are
 * generated FROM the migrated schema (never hand-written). Phinx runs this with `phinx migrate`.
 */
final class AccountsAndPayments extends AbstractMigration
{
    public function up(): void
    {
        $this->execute(<<<'SQL'
            CREATE EXTENSION IF NOT EXISTS "pgcrypto";

            CREATE TABLE accounts (
              id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              external_ref text UNIQUE,
              created_at   timestamptz NOT NULL DEFAULT now()
            );

            CREATE TABLE payments (
              id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              account_id         uuid NOT NULL REFERENCES accounts (id),
              amount_minor       bigint NOT NULL CHECK (amount_minor > 0),
              currency           text NOT NULL,
              operator_reference text,
              idempotency_key    text NOT NULL,
              status             text NOT NULL DEFAULT 'RECORDED',
              created_at         timestamptz NOT NULL DEFAULT now(),
              CONSTRAINT payments_idempotency_key_uniq UNIQUE (idempotency_key)
            );
            CREATE INDEX payments_account_id_idx ON payments (account_id);
            SQL);
    }

    public function down(): void
    {
        $this->execute('DROP TABLE payments; DROP TABLE accounts;');
    }
}
