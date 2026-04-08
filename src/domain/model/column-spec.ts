// Value Object — ColumnSpec (loaded from YAML: agent, output artifact, rubrics, preflight config)

/**
 * Stub interface for ColumnSpec — enough fields for output validation (M2-006).
 * Will be replaced by Zod-inferred type when M2-007 is implemented.
 */
export interface ColumnSpec {
  readonly minWordCount?: number;
  readonly requiredSections?: readonly string[];
}
