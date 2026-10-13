#!/usr/bin/env node
// Smoke test — validates ClaudeCodeCliExecutor end-to-end with a real claude CLI call.
// Run via: npm run smoke-test
// NOT included in Vitest — this is a standalone script.

/* eslint-disable no-console */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import { ClaudeCodeCliExecutor } from './claude-cli-executor.adapter.js';
import { SimpleGitGateway } from '../git/simple-git-gateway.adapter.js';
import type { Column } from '../../domain/model/column.js';
import type { ExecutorInvocation } from '../../domain/model/executor-invocation.js';

const TIMEOUT_MS = 60_000;

async function main(): Promise<void> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aeos-smoke-'));

  try {
    // --- 1. Run the executor ---
    const executor = new ClaudeCodeCliExecutor();
    const invocation: ExecutorInvocation = {
      prompt: 'Write one sentence about software engineering.',
      outputPath: path.join(tmpDir, 'smoke-test-output.md'),
      ticketId: 'SMOKE-1',
      column: 'SMOKE_TEST' as unknown as Column, // not a real column — smoke test only
    };

    const result = await executor.run(invocation);

    // --- 2. Check: claude CLI not found ---
    if (!result.ok) {
      console.error(`✗ ClaudeCodeCliExecutor failed: ${result.reason}`);
      process.exit(1);
    }

    // --- 3. Artifact written ---
    const artifactExists = await fs.promises.access(result.artifactPath).then(
      () => true,
      () => false,
    );
    if (!artifactExists) {
      console.error(`✗ Artifact file does not exist at ${result.artifactPath}`);
      process.exit(1);
    }
    if (result.artifactPath !== invocation.outputPath) {
      console.error(
        `✗ artifactPath mismatch: expected ${invocation.outputPath}, got ${result.artifactPath}`,
      );
      process.exit(1);
    }

    const content = await fs.promises.readFile(result.artifactPath, 'utf8');
    const byteLength = Buffer.byteLength(content, 'utf8');
    console.log(`✓ ClaudeCodeCliExecutor: artifact written (${byteLength} bytes)`);

    // --- 4. Non-empty valid text ---
    if (content.length === 0) {
      console.error('✗ Artifact content is empty');
      process.exit(1);
    }
    if (content.startsWith('ERROR:')) {
      console.error(`✗ Artifact starts with ERROR: ${content.slice(0, 200)}`);
      process.exit(1);
    }
    console.log('✓ ClaudeCodeCliExecutor: output is non-empty valid text');

    // --- 5. Structured git commit ---
    const git = new SimpleGitGateway();
    git.init(tmpDir);
    // Configure git user for the temp repo
    execFileSync('git', ['config', 'user.email', 'smoke@test.local'], {
      cwd: tmpDir,
      stdio: 'ignore',
    });
    execFileSync('git', ['config', 'user.name', 'Smoke Test'], {
      cwd: tmpDir,
      stdio: 'ignore',
    });
    git.commitFiles(tmpDir, [result.artifactPath], '[SMOKE-1] smoke test artifact');
    const log = execFileSync('git', ['log', '--oneline'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });
    const commitCount = log
      .trim()
      .split('\n')
      .filter((l) => l.length > 0).length;
    if (commitCount !== 1) {
      console.error(`✗ Expected exactly 1 commit, got ${commitCount}`);
      process.exit(1);
    }
    console.log('✓ SimpleGitGateway.commitFiles: commit produced in artifact repo');

    console.log('All smoke tests passed.');
  } finally {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Script-level timeout
const timer = setTimeout(() => {
  console.error('✗ Smoke test timed out after 60s');
  process.exit(1);
}, TIMEOUT_MS);

main()
  .then(() => {
    clearTimeout(timer);
    process.exit(0);
  })
  .catch((err: unknown) => {
    clearTimeout(timer);
    console.error('✗ Smoke test failed with unexpected error:', err);
    process.exit(1);
  });
