import { describe, expect, it, vi } from 'vitest';
import type { Check } from '../../domain/model/check.js';
import type { ChecksRunner } from '../../domain/ports/driven/checks-runner.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import { CheckRegistry } from './check-registry.js';

function registryWith(checks: unknown, runner: ChecksRunner): CheckRegistry {
  return new CheckRegistry(
    { readExecutorConfig: () => (checks ? { checks } : null) } as unknown as ProjectRepository,
    runner,
  );
}

const runnerReturning = (result: Awaited<ReturnType<ChecksRunner['run']>>): ChecksRunner => ({
  run: vi.fn().mockResolvedValue(result),
});

describe('CheckRegistry', () => {
  it('turns each project.json entry into a post-worker check, in order', () => {
    const registry = registryWith(
      [
        { name: 'lint', command: 'npm run lint', timeoutSeconds: 120 },
        { name: 'test', command: 'npm test', timeoutSeconds: 600 },
      ],
      runnerReturning({ exitCode: 0, durationMs: 1, timedOut: false, outputTail: '' }),
    );

    const checks = registry.checksFor('/project');

    expect(checks.map((check) => check.name)).toEqual(['lint', 'test']);
    expect(checks.every((check) => check.phase === 'post-worker')).toBe(true);
  });

  it('has no checks when the project configures none', () => {
    const runner = runnerReturning({ exitCode: 0, durationMs: 1, timedOut: false, outputTail: '' });

    expect(registryWith(null, runner).checksFor('/project')).toEqual([]);
  });

  it('runs a registered check after the configured ones', () => {
    const inProcess: Check = { name: 'in-process', phase: 'post-worker', run: vi.fn() };
    const registry = registryWith(
      [{ name: 'lint', command: 'npm run lint', timeoutSeconds: 120 }],
      runnerReturning({ exitCode: 0, durationMs: 1, timedOut: false, outputTail: '' }),
    );

    registry.register(inProcess);

    expect(registry.checksFor('/project').map((check) => check.name)).toEqual([
      'lint',
      'in-process',
    ]);
  });

  describe('a shell check', () => {
    const entry = { name: 'test', command: 'npm test', timeoutSeconds: 600 };

    it('passes on exit code 0, running its command in the project root', async () => {
      const runner = runnerReturning({
        exitCode: 0,
        durationMs: 42,
        timedOut: false,
        outputTail: 'ok',
      });
      const [check] = registryWith([entry], runner).checksFor('/project');

      const result = await check!.run({ projectPath: '/project' });

      expect(runner.run).toHaveBeenCalledWith(
        { command: 'npm test', timeoutSeconds: 600 },
        '/project',
      );
      expect(result).toEqual({
        name: 'test',
        passed: true,
        durationMs: 42,
        timedOut: false,
        outputTail: 'ok',
      });
    });

    it('fails on a non-zero exit code', async () => {
      const runner = runnerReturning({
        exitCode: 1,
        durationMs: 5,
        timedOut: false,
        outputTail: 'boom',
      });
      const [check] = registryWith([entry], runner).checksFor('/project');

      expect(await check!.run({ projectPath: '/project' })).toMatchObject({
        passed: false,
        timedOut: false,
        outputTail: 'boom',
      });
    });

    it('fails with timedOut when the runner killed it', async () => {
      const runner = runnerReturning({
        exitCode: null,
        durationMs: 600_000,
        timedOut: true,
        outputTail: '',
      });
      const [check] = registryWith([entry], runner).checksFor('/project');

      expect(await check!.run({ projectPath: '/project' })).toMatchObject({
        passed: false,
        timedOut: true,
      });
    });
  });
});
