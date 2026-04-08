import { describe, it, expect } from 'vitest';
import { validateOutput } from './output-validation.js';
import type { ColumnSpec } from '../model/column-spec.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate content with the given number of words. */
function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
}

function specWith(overrides: Partial<ColumnSpec> = {}): ColumnSpec {
  return { minWordCount: 50, requiredSections: [], ...overrides };
}

// ---------------------------------------------------------------------------
// Rule 1 — Non-empty
// ---------------------------------------------------------------------------

describe('non-empty rule', () => {
  it('fails when content is empty', () => {
    const result = validateOutput('', specWith());
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('Output is empty');
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — Minimum word count
// ---------------------------------------------------------------------------

describe('minimum word count rule', () => {
  it('fails when content has fewer words than minWordCount', () => {
    const result = validateOutput(words(10), specWith({ minWordCount: 50 }));
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('Output below minimum word count: 10 < 50');
  });

  it('uses default 50 when minWordCount is unset', () => {
    const result = validateOutput(words(10), specWith({ minWordCount: undefined }));
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('Output below minimum word count: 10 < 50');
  });

  it('passes when word count meets minimum', () => {
    const result = validateOutput(words(50), specWith({ minWordCount: 50 }));
    expect(result.violations).not.toContainEqual(expect.stringContaining('minimum word count'));
  });
});

// ---------------------------------------------------------------------------
// Rule 3 — Required sections
// ---------------------------------------------------------------------------

describe('required sections rule', () => {
  it('fails when a required section is missing', () => {
    const content = words(60);
    const result = validateOutput(content, specWith({ requiredSections: ['Introduction'] }));
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('Missing required section: Introduction');
  });

  it('passes when section present as # heading', () => {
    const content = `# Introduction\n\n${words(60)}`;
    const result = validateOutput(content, specWith({ requiredSections: ['Introduction'] }));
    expect(result.violations).not.toContain('Missing required section: Introduction');
  });

  it('passes when section present as ## heading', () => {
    const content = `## Introduction\n\n${words(60)}`;
    const result = validateOutput(content, specWith({ requiredSections: ['Introduction'] }));
    expect(result.violations).not.toContain('Missing required section: Introduction');
  });

  it('reports each missing section individually', () => {
    const content = `# Intro\n\n${words(60)}`;
    const result = validateOutput(content, specWith({ requiredSections: ['Overview', 'Details'] }));
    expect(result.violations).toContain('Missing required section: Overview');
    expect(result.violations).toContain('Missing required section: Details');
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — No unfilled placeholders
// ---------------------------------------------------------------------------

describe('no unfilled placeholders rule', () => {
  it('fails when content contains [PLACEHOLDER]', () => {
    const content = `# Intro\n\n${words(60)}\n[PLACEHOLDER]`;
    const result = validateOutput(content, specWith());
    expect(result.passed).toBe(false);
    expect(result.violations).toContain('Unfilled template placeholder found');
  });

  it('fails when content contains <PLACEHOLDER>', () => {
    const content = `# Intro\n\n${words(60)}\n<PLACEHOLDER>`;
    const result = validateOutput(content, specWith());
    expect(result.violations).toContain('Unfilled template placeholder found');
  });

  it('fails when content contains <!-- TODO', () => {
    const content = `# Intro\n\n${words(60)}\n<!-- TODO fix this -->`;
    const result = validateOutput(content, specWith());
    expect(result.violations).toContain('Unfilled template placeholder found');
  });
});

// ---------------------------------------------------------------------------
// Fully valid content
// ---------------------------------------------------------------------------

describe('fully valid content', () => {
  it('passes with no violations when all rules are satisfied', () => {
    const content = `# Overview\n\n## Details\n\n${words(60)}`;
    const result = validateOutput(
      content,
      specWith({ minWordCount: 10, requiredSections: ['Overview', 'Details'] }),
    );
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

describe('violation aggregation', () => {
  it('aggregates violations from multiple failing rules', () => {
    const result = validateOutput('', specWith({ requiredSections: ['Intro'] }));
    expect(result.passed).toBe(false);
    // Should at least have non-empty and word count violations
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    expect(result.violations).toContain('Output is empty');
  });
});
