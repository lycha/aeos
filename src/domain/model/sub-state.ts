// Value Object — SubState enum (6 sub-states)

export const SubState = {
  BLOCKED: 'BLOCKED',
  WORKING: 'WORKING',
  INTERRUPTED: 'INTERRUPTED',
  FAILED: 'FAILED',
  IN_REVIEW: 'IN_REVIEW',
  SIGNED_OFF: 'SIGNED_OFF',
} as const;

export type SubState = (typeof SubState)[keyof typeof SubState];

/** Sub-state value as stored in the DB — null for BACKLOG tickets. */
export type SubStateOrNull = SubState | null;

const SUB_STATE_VALUES: ReadonlySet<string> = new Set(Object.values(SubState));

/** Type guard — narrows an arbitrary string to `SubState`. */
export function isValidSubState(value: string): value is SubState {
  return SUB_STATE_VALUES.has(value);
}
