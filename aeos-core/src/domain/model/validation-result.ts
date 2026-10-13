// Value Object — ValidationResult (outcome of rule-based structural checks)

export interface ValidationResult {
  readonly passed: boolean;
  readonly violations: readonly string[];
}
