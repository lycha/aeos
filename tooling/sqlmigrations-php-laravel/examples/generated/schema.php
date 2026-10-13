<?php

// This file was generated from the SQL migrations by scripts/generate-db-types.php.
// Do not edit it by hand. Regenerate with `composer generate-db`.

namespace App\Generated;

/**
 * @phpstan-type AccountBalances array{
 *   account_id: string,
 *   balance_minor: int,
 *   currency: string,
 *   updated_at: string,
 * }
 * @phpstan-type Accounts array{
 *   id: string,
 *   external_ref: string|null,
 *   created_at: string,
 * }
 * @phpstan-type LedgerEntries array{
 *   id: string,
 *   account_id: string,
 *   entry_type: string,
 *   amount_minor: int,
 *   currency: string,
 *   payment_id: string|null,
 *   metadata: array|null,
 *   created_at: string,
 * }
 * @phpstan-type Payments array{
 *   id: string,
 *   account_id: string,
 *   amount_minor: int,
 *   currency: string,
 *   operator_reference: string|null,
 *   idempotency_key: string,
 *   status: string,
 *   created_at: string,
 * }
 * @phpstan-type DB array{
 *   account_balances: AccountBalances,
 *   accounts: Accounts,
 *   ledger_entries: LedgerEntries,
 *   payments: Payments,
 * }
 */
final class DbSchema {}
