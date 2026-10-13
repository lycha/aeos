#!/usr/bin/env node
/* eslint-disable no-console */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import { OpenCodeCliExecutor } from './opencode-cli-executor.adapter.js';
import { Column } from '../../domain/model/column.js';
import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';

const TIMEOUT_MS = 120_000;

async function main(): Promise<void> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aeos-opencode-smoke-'));
  try {
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'smoke@test.local'], {
      cwd: tmpDir,
      stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'Smoke Test'], { cwd: tmpDir, stdio: 'ignore' });
    const targetFile = path.join(tmpDir, 'target.txt');
    await fs.promises.writeFile(targetFile, 'OLD\n', 'utf8');
    execFileSync('git', ['add', 'target.txt'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir, stdio: 'ignore' });

    const executor = new OpenCodeCliExecutor({
      model: process.env.OPENCODE_SMOKE_MODEL,
      timeoutMs: 90_000,
      maxSteps: 8,
    });
    const invocation: ExecutorInvocation = {
      prompt:
        'Edit target.txt in the workspace root by replacing the exact text OLD with NEW. Do not change any other file. Then provide a short summary of what you changed.',
      outputPath: path.join(tmpDir, 'opencode-summary.md'),
      ticketId: 'SMOKE-OPENCODE-1',
      column: Column.IMPLEMENTATION,
      mode: 'agentic',
      workingDirectory: tmpDir,
    };

    const result = await executor.run(invocation);
    if (!result.ok) {
      console.error(`✗ OpenCodeCliExecutor failed: ${result.reason}`);
      process.exit(1);
    }
    if (!(await fs.promises.readFile(targetFile, 'utf8')).includes('NEW')) {
      console.error('✗ target.txt was not modified as expected');
      process.exit(1);
    }
    console.log('✓ target.txt was modified by agentic OpenCode run');
    const summary = await fs.promises.readFile(invocation.outputPath, 'utf8');
    if (summary.trim().length === 0) {
      console.error('✗ Summary artifact is empty');
      process.exit(1);
    }
    console.log('✓ Summary artifact was written');
    const diff = execFileSync('git', ['diff', '--name-only'], {
      cwd: tmpDir,
      encoding: 'utf8',
    }).trim();
    if (!diff.includes('target.txt')) {
      console.error('✗ git diff did not include target.txt');
      process.exit(1);
    }
    console.log('✓ git diff detected repository changes');
    console.log('OpenCode smoke test passed.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const timer = setTimeout(() => {
  console.error('✗ OpenCode smoke test timed out after 120s');
  process.exit(1);
}, TIMEOUT_MS);
main()
  .then(() => {
    clearTimeout(timer);
    process.exit(0);
  })
  .catch((err: unknown) => {
    clearTimeout(timer);
    console.error('✗ OpenCode smoke test failed with unexpected error:', err);
    process.exit(1);
  });
