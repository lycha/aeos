// Domain service — Output validation: rule-based structural checks on artifacts

import { ValidationResult } from '../model/validation-result.js';
import { ColumnSpec } from '../model/column-spec.js';

/** A single validation rule applied to executor output. */
export interface ValidationRule {
  name: string;
  /** Validates content against the column spec. Returns violations if any. */
  check(content: string, spec: ColumnSpec): ValidationResult;
}

// ---------------------------------------------------------------------------
// Built-in rules
// ---------------------------------------------------------------------------

const DEFAULT_MIN_WORD_COUNT = 50;

const nonEmptyRule: ValidationRule = {
  name: 'non-empty',
  check(content: string): ValidationResult {
    if (content.length === 0) {
      return { passed: false, violations: ['Output is empty'] };
    }
    return { passed: true, violations: [] };
  },
};

const minimumWordCountRule: ValidationRule = {
  name: 'minimum-word-count',
  check(content: string, spec: ColumnSpec): ValidationResult {
    if (spec.executorMode === 'agentic') {
      return { passed: true, violations: [] };
    }

    const required = spec.minWordCount ?? DEFAULT_MIN_WORD_COUNT;
    const words = content.split(/\s+/).filter((w) => w.length > 0);
    if (words.length < required) {
      return {
        passed: false,
        violations: [`Output below minimum word count: ${words.length} < ${required}`],
      };
    }
    return { passed: true, violations: [] };
  },
};

const requiredSectionsRule: ValidationRule = {
  name: 'required-sections',
  check(content: string, spec: ColumnSpec): ValidationResult {
    const sections = spec.requiredSections ?? [];
    const violations: string[] = [];
    for (const section of sections) {
      // Match markdown headings: # Section or ## Section (case-sensitive)
      const pattern = new RegExp(`^#{1,2}\\s+${escapeRegExp(section)}\\s*$`, 'm');
      if (!pattern.test(content)) {
        violations.push(`Missing required section: ${section}`);
      }
    }
    return { passed: violations.length === 0, violations };
  },
};

const noUnfilledPlaceholdersRule: ValidationRule = {
  name: 'no-unfilled-placeholders',
  check(content: string): ValidationResult {
    const pattern = /\[PLACEHOLDER\]|<PLACEHOLDER>|<!-- TODO/;
    if (pattern.test(content)) {
      return {
        passed: false,
        violations: ['Unfilled template placeholder found'],
      };
    }
    return { passed: true, violations: [] };
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escapes special regex characters in a string. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const BUILT_IN_RULES: readonly ValidationRule[] = [
  nonEmptyRule,
  minimumWordCountRule,
  requiredSectionsRule,
  noUnfilledPlaceholdersRule,
];

/**
 * Runs all built-in validation rules against the given content and column spec.
 * Returns a single aggregated {@link ValidationResult}.
 */
export function validateOutput(content: string, columnSpec: ColumnSpec): ValidationResult {
  const allViolations: string[] = [];
  for (const rule of BUILT_IN_RULES) {
    const result = rule.check(content, columnSpec);
    allViolations.push(...result.violations);
  }
  return {
    passed: allViolations.length === 0,
    violations: allViolations,
  };
}

/**
 * Drops what an agent says before its artefact ("Tests pass. Done."): everything
 * ahead of the first Markdown heading. Text with no heading is returned as it is.
 * The full output stays in the run record's log.
 */
export function stripPreamble(content: string): string {
  // shortcut: a `# ` line inside a code fence in the preamble counts as the heading; track fences if that shows up.
  const start = content.search(/^#{1,6} /m);
  return start > 0 ? content.slice(start) : content;
}
