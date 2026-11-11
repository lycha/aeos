import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { GhPullRequestGateway } from './gh-pull-request.adapter.js';

// No test here starts a process: the adapter is given a fake runner.
type Call = { command: string; args: string[]; cwd: string };

function gatewayWith(respond: (call: Call) => string): {
  gateway: GhPullRequestGateway;
  calls: Call[];
} {
  const calls: Call[] = [];
  const gateway = new GhPullRequestGateway((command, args, cwd) => {
    const call = { command, args, cwd };
    calls.push(call);
    return respond(call);
  });
  return { gateway, calls };
}

const fail = (): never => {
  throw new Error('exit 1');
};

describe('GhPullRequestGateway.isAvailable', () => {
  it('is available when gh runs, is authenticated and the repository has a remote', () => {
    const { gateway } = gatewayWith(({ command }) => (command === 'git' ? 'origin\n' : ''));

    expect(gateway.isAvailable('/repo')).toEqual({ ok: true });
  });

  it('names gh and the fix when gh is not on PATH', () => {
    const { gateway } = gatewayWith(({ command }) => (command === 'gh' ? fail() : 'origin\n'));

    const result = gateway.isAvailable('/repo');

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/`gh`.*not on PATH/);
    expect(result.reason).toContain('gh auth login');
  });

  it('says when gh is not authenticated', () => {
    const { gateway } = gatewayWith(({ command, args }) =>
      command === 'gh' && args[0] === 'auth' ? fail() : 'origin\n',
    );

    expect(gateway.isAvailable('/repo').reason).toMatch(/not authenticated.*gh auth login/);
  });

  it('says when the repository has no remote', () => {
    const { gateway } = gatewayWith(() => '');

    expect(gateway.isAvailable('/repo').reason).toMatch(/no remote.*git remote add/);
  });
});

describe('GhPullRequestGateway.create', () => {
  const request = { cwd: '/repo', base: 'main', head: 'aeos/AEOS-1', title: 'T', body: 'the body' };

  it('runs gh pr create with the body in a file and returns the printed URL', () => {
    let bodySeen = '';
    const { gateway, calls } = gatewayWith(({ args }) => {
      if (args[1] === 'view') return fail();
      bodySeen = fs.readFileSync(args[args.indexOf('--body-file') + 1]!, 'utf-8');
      return 'Creating pull request\nhttps://github.com/o/r/pull/7\n';
    });

    expect(gateway.create(request)).toEqual({ url: 'https://github.com/o/r/pull/7' });
    const create = calls.find((call) => call.args[1] === 'create')!;
    expect(create.command).toBe('gh');
    expect(create.cwd).toBe('/repo');
    expect(create.args.slice(0, 8)).toEqual([
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'aeos/AEOS-1',
      '--title',
      'T',
    ]);
    expect(bodySeen).toBe('the body');
    // The temporary body file does not outlive the call.
    expect(fs.existsSync(create.args[create.args.indexOf('--body-file') + 1]!)).toBe(false);
  });

  it('returns the URL of a pull request already open for the head branch', () => {
    const { gateway, calls } = gatewayWith(({ args }) =>
      args[1] === 'view'
        ? JSON.stringify({ url: 'https://github.com/o/r/pull/3', state: 'OPEN' })
        : fail(),
    );

    expect(gateway.create(request)).toEqual({ url: 'https://github.com/o/r/pull/3' });
    expect(calls.some((call) => call.args[1] === 'create')).toBe(false);
  });

  it('opens a new one when the earlier pull request for the branch is closed', () => {
    const { gateway } = gatewayWith(({ args }) =>
      args[1] === 'view'
        ? JSON.stringify({ url: 'https://github.com/o/r/pull/3', state: 'MERGED' })
        : 'https://github.com/o/r/pull/9\n',
    );

    expect(gateway.create(request)).toEqual({ url: 'https://github.com/o/r/pull/9' });
  });
});

describe('GhPullRequestGateway.updateBody', () => {
  it('reads the body of the pull request for the head branch and writes the updated one back', () => {
    let written = '';
    const { gateway, calls } = gatewayWith(({ args }) => {
      if (args[1] === 'view') return JSON.stringify({ body: 'old body' });
      written = fs.readFileSync(args[args.indexOf('--body-file') + 1]!, 'utf-8');
      return '';
    });

    gateway.updateBody({ cwd: '/repo', head: 'aeos/AEOS-1', update: (body) => `${body}, updated` });

    expect(calls.map((call) => call.args.slice(0, 3))).toEqual([
      ['pr', 'view', 'aeos/AEOS-1'],
      ['pr', 'edit', 'aeos/AEOS-1'],
    ]);
    expect(written).toBe('old body, updated');
  });
});
