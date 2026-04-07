import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { aeosHome, aeosHomePath, aeosConfigPath, aeosRegistryPath, aeosDbPath } from './config.js';

/**
 * Saves and restores `AEOS_HOME` around each test.
 * Pass a string to set a specific value, or omit / pass `undefined` to delete
 * the variable before each test.
 */
function withAeosHomeEnv(value?: string): void {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env['AEOS_HOME'];
    if (value !== undefined) {
      process.env['AEOS_HOME'] = value;
    } else {
      delete process.env['AEOS_HOME'];
    }
  });

  afterEach(() => {
    if (original !== undefined) {
      process.env['AEOS_HOME'] = original;
    } else {
      delete process.env['AEOS_HOME'];
    }
  });
}

describe('aeosHome()', () => {
  withAeosHomeEnv();

  it('should return an absolute path ending with .aeos when AEOS_HOME is not set', () => {
    const result = aeosHome();
    expect(path.isAbsolute(result)).toBe(true);
    expect(result).toMatch(/\.aeos$/);
  });

  it('should default to <homedir>/.aeos when AEOS_HOME is not set', () => {
    const result = aeosHome();
    expect(result).toBe(path.join(os.homedir(), '.aeos'));
  });

  it('should return AEOS_HOME when the env var is set', () => {
    process.env['AEOS_HOME'] = '/tmp/test-aeos';
    const result = aeosHome();
    expect(result).toBe('/tmp/test-aeos');
  });

  it('should not append .aeos when AEOS_HOME is set', () => {
    process.env['AEOS_HOME'] = '/tmp/custom-dir';
    const result = aeosHome();
    expect(result).not.toContain('.aeos');
    expect(result).toBe('/tmp/custom-dir');
  });
});

describe('aeosHomePath()', () => {
  withAeosHomeEnv('/tmp/test-aeos');

  it('should return path inside aeos home for a single segment', () => {
    const result = aeosHomePath('config.json');
    expect(result).toBe(path.join('/tmp/test-aeos', 'config.json'));
  });

  it('should handle multiple path segments', () => {
    const result = aeosHomePath('sub', 'dir', 'file.txt');
    expect(result).toBe(path.join('/tmp/test-aeos', 'sub', 'dir', 'file.txt'));
  });

  it('should return aeos home when called with no segments', () => {
    const result = aeosHomePath();
    expect(result).toBe('/tmp/test-aeos');
  });
});

describe('convenience wrappers', () => {
  withAeosHomeEnv('/tmp/test-aeos');

  it('aeosConfigPath() should equal aeosHomePath("config.json")', () => {
    expect(aeosConfigPath()).toBe(aeosHomePath('config.json'));
  });

  it('aeosRegistryPath() should equal aeosHomePath("registry.json")', () => {
    expect(aeosRegistryPath()).toBe(aeosHomePath('registry.json'));
  });

  it('aeosDbPath() should equal aeosHomePath("state.db")', () => {
    expect(aeosDbPath()).toBe(aeosHomePath('state.db'));
  });

  it('aeosConfigPath() should return correct absolute path', () => {
    expect(aeosConfigPath()).toBe(path.join('/tmp/test-aeos', 'config.json'));
  });

  it('aeosRegistryPath() should return correct absolute path', () => {
    expect(aeosRegistryPath()).toBe(path.join('/tmp/test-aeos', 'registry.json'));
  });

  it('aeosDbPath() should return correct absolute path', () => {
    expect(aeosDbPath()).toBe(path.join('/tmp/test-aeos', 'state.db'));
  });
});
