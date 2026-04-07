import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FsConfigStore } from './fs-config.adapter.js';
import type { GlobalConfig } from '../../domain/ports/driven/config-store.port.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from 'node:child_process';

// We test against a real temp directory
let tmpDir: string;
let originalHome: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-test-'));
  originalHome = process.env['HOME'] ?? os.homedir();
  // Override HOME so aeosHome() resolves to our temp dir
  process.env['HOME'] = tmpDir;
  vi.mocked(execFileSync).mockReset();
});

afterEach(() => {
  process.env['HOME'] = originalHome;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('FsConfigStore', () => {
  let store: FsConfigStore;

  beforeEach(() => {
    store = new FsConfigStore();
  });

  describe('ensureHomeDir', () => {
    it('should create ~/.aeos/ directory', () => {
      store.ensureHomeDir();
      const aeosDir = path.join(tmpDir, '.aeos');
      expect(fs.existsSync(aeosDir)).toBe(true);
      expect(fs.statSync(aeosDir).isDirectory()).toBe(true);
    });

    it('should be idempotent', () => {
      store.ensureHomeDir();
      store.ensureHomeDir();
      const aeosDir = path.join(tmpDir, '.aeos');
      expect(fs.existsSync(aeosDir)).toBe(true);
    });
  });

  describe('writeConfigIfNotExists / readConfig', () => {
    const config: GlobalConfig = {
      model: 'claude-opus-4-6',
      currency: 'USD',
      advanceMode: 'manual',
    };

    it('should write config.json when it does not exist', () => {
      store.ensureHomeDir();
      store.writeConfigIfNotExists(config);
      const configPath = path.join(tmpDir, '.aeos', 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(parsed).toEqual(config);
    });

    it('should not overwrite existing config.json', () => {
      store.ensureHomeDir();
      store.writeConfigIfNotExists(config);

      // Try writing different config
      store.writeConfigIfNotExists({
        model: 'gpt-4',
        currency: 'EUR',
        advanceMode: 'auto',
      });

      const result = store.readConfig();
      expect(result).toEqual(config); // Original preserved
    });

    it('should return null when config does not exist', () => {
      store.ensureHomeDir();
      expect(store.readConfig()).toBeNull();
    });
  });

  describe('writeRegistry / readRegistry', () => {
    it('should write registry.json with empty projects array', () => {
      store.ensureHomeDir();
      store.writeRegistry([]);
      const registryPath = path.join(tmpDir, '.aeos', 'registry.json');
      expect(fs.existsSync(registryPath)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      expect(parsed).toEqual({ projects: [] });
    });

    it('should not overwrite existing registry.json', () => {
      store.ensureHomeDir();
      store.writeRegistry([]);

      // Write file with data manually
      const registryPath = path.join(tmpDir, '.aeos', 'registry.json');
      // writeRegistry should not overwrite
      store.writeRegistry([{ key: 'k', name: 'n', path: '/p', registeredAt: '2024-01-01' }]);

      const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      expect(parsed.projects).toEqual([]);
    });

    it('should return empty array when registry does not exist', () => {
      store.ensureHomeDir();
      expect(store.readRegistry()).toEqual([]);
    });
  });

  describe('ensureGlobalGitignore', () => {
    it('should use existing core.excludesfile path and append pattern', () => {
      const gitignorePath = path.join(tmpDir, '.my_custom_gitignore');
      fs.writeFileSync(gitignorePath, '# my gitignore\n', 'utf-8');

      vi.mocked(execFileSync).mockReturnValue(gitignorePath + '\n');

      store.ensureGlobalGitignore('.aeos/');

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('.aeos/');
      // Should have been called once to read, not to set
      expect(execFileSync).toHaveBeenCalledTimes(1);
    });

    it('should set core.excludesfile when not configured', () => {
      vi.mocked(execFileSync).mockImplementation((_cmd: string, args?: readonly string[]) => {
        // The read call has 3 args: ['config', '--global', 'core.excludesfile']
        // The write call has 4 args: ['config', '--global', 'core.excludesfile', '<path>']
        if (args && args.length === 3) {
          throw new Error('no value');
        }
        return Buffer.from('');
      });

      store.ensureGlobalGitignore('.aeos/');

      // Should have called execFileSync twice: once to read (throws), once to set
      expect(execFileSync).toHaveBeenCalledTimes(2);
      const gitignorePath = path.join(tmpDir, '.gitignore_global');
      expect(fs.existsSync(gitignorePath)).toBe(true);
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('.aeos/');
    });

    it('should not duplicate pattern when already present', () => {
      const gitignorePath = path.join(tmpDir, '.gitignore_global');
      fs.writeFileSync(gitignorePath, '.aeos/\n', 'utf-8');

      vi.mocked(execFileSync).mockReturnValue(gitignorePath + '\n');

      store.ensureGlobalGitignore('.aeos/');

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const matches = content.split('\n').filter((l) => l.trim() === '.aeos/');
      expect(matches).toHaveLength(1);
    });

    it('should respect existing custom core.excludesfile path', () => {
      const customPath = path.join(tmpDir, 'custom', 'gitignore');
      fs.mkdirSync(path.dirname(customPath), { recursive: true });
      fs.writeFileSync(customPath, '', 'utf-8');

      vi.mocked(execFileSync).mockReturnValue(customPath + '\n');

      store.ensureGlobalGitignore('.aeos/');

      const content = fs.readFileSync(customPath, 'utf-8');
      expect(content).toContain('.aeos/');
    });
  });
});
