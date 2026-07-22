import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { scaffoldSkill } from './skill-source.js';

describe('scaffoldSkill', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-skill-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a canonical skill and links it into each executor skills dir', () => {
    const created = scaffoldSkill(tmpDir);

    const canonical = path.join(tmpDir, '.aeos', 'skills', 'aeos', 'SKILL.md');
    expect(fs.existsSync(canonical)).toBe(true);
    expect(fs.readFileSync(canonical, 'utf-8')).toContain('aeos ticket create');

    // Each executor's skills dir resolves to the same SKILL.md.
    for (const dir of ['.claude/skills', '.augment/skills']) {
      const linked = path.join(tmpDir, dir, 'aeos', 'SKILL.md');
      expect(fs.existsSync(linked), `${dir} not linked`).toBe(true);
      expect(fs.readFileSync(linked, 'utf-8')).toContain('aeos ticket create');
    }

    expect(created).toContain('.aeos/skills/aeos');
    expect(created).toContain('.claude/skills/aeos');
    expect(created).toContain('.augment/skills/aeos');
  });

  it('resolves the executor link to the canonical copy, not a separate file', () => {
    scaffoldSkill(tmpDir);

    const canonical = path.join(tmpDir, '.aeos', 'skills', 'aeos', 'SKILL.md');
    // Editing the canonical copy is reflected through the link — one source of
    // truth, which is the point of linking rather than copying.
    fs.appendFileSync(canonical, '\nEDITED\n');

    const linked = path.join(tmpDir, '.claude', 'skills', 'aeos', 'SKILL.md');
    if (fs.lstatSync(path.join(tmpDir, '.claude', 'skills', 'aeos')).isSymbolicLink()) {
      expect(fs.readFileSync(linked, 'utf-8')).toContain('EDITED');
    }
  });

  it('is idempotent — a second call creates nothing', () => {
    scaffoldSkill(tmpDir);
    const second = scaffoldSkill(tmpDir);

    expect(second).toEqual([]);
  });

  it('creates the executor links as relative symlinks where supported', () => {
    scaffoldSkill(tmpDir);

    const link = path.join(tmpDir, '.claude', 'skills', 'aeos');
    const stat = fs.lstatSync(link);
    if (stat.isSymbolicLink()) {
      // Relative, so the project stays portable if moved.
      expect(fs.readlinkSync(link)).toBe(path.join('..', '..', '.aeos', 'skills', 'aeos'));
    }
  });

  it('does not overwrite a canonical skill the user has edited', () => {
    scaffoldSkill(tmpDir);
    const canonical = path.join(tmpDir, '.aeos', 'skills', 'aeos', 'SKILL.md');
    fs.writeFileSync(canonical, 'my own skill\n', 'utf-8');

    scaffoldSkill(tmpDir);

    expect(fs.readFileSync(canonical, 'utf-8')).toBe('my own skill\n');
  });
});
