// `npm run verify:contract` — lints the contract and verifies the built CLI
// against it. Exits non-zero on any finding or mismatch.

import * as path from 'node:path';

import { buildProgram } from '../index.js';
import { lintContract } from './lint-contract.js';
import { loadContract, packageRoot } from './load-contract.js';
import { envVariablesRead, verifyContract } from './verify-contract.js';

const contract = loadContract();
const findings = lintContract(contract);
const report = verifyContract(
  contract,
  buildProgram(),
  envVariablesRead(path.join(packageRoot(), 'src')),
);

const section = (title: string, lines: readonly string[], mark: string): void => {
  if (lines.length === 0) return;
  process.stdout.write(
    `\n${title} (${lines.length})\n${lines.map((line) => `  ${mark} ${line}`).join('\n')}\n`,
  );
};
section('Pending: proposed in the contract, not built yet', report.pending, '·');
section('Landed: built; the contract still marks it proposed or pending', report.landed, '✓');
section('Contract lint', findings, '✗');
section('Mismatches between the CLI and the contract', report.mismatches, '✗');

const failures = findings.length + report.mismatches.length;
process.stdout.write(
  failures === 0
    ? '\nThe CLI matches cli-contract.yaml.\n'
    : `\n${failures} problem(s): the CLI and cli-contract.yaml disagree.\n`,
  // Once it is written: exiting before the pipe drains would cut the report short.
  () => process.exit(failures === 0 ? 0 : 1),
);
