# Task: Run AEOS-20 — DoD Gate Human Approval CLI Flow

**Milestone:** M6 — QA Agent + DoD Gate
**Agent:** typescript-pro (for implementation sub-task after pipeline run)
**Method:** Dogfood — run through AEOS pipeline; then implement

## Context
The final pipeline gate. AEOS-20 specifies AND implements the `aeos ticket dod-approve <id>` command — the human approval step that transitions a ticket to DONE. The pipeline run produces the spec; the implementation follows from that spec.

## What needs to be done

**Pipeline run (dogfood):**
1. Create ticket: `aeos ticket create "DoD Gate human approval CLI flow"` → AEOS-20
2. Fill in `.aeos/AEOS-20-ticket.md`:
   - Goal: specify the `aeos ticket dod-approve <id>` CLI command behaviour in detail
   - The command must: display a DoD checklist from `dod-evaluation.md`, show all artifact paths, prompt the operator with Y/N confirmation, transition to DONE on Y
   - On DONE: print a completion summary with all artifact paths and total cost (from `cost_records`)
3. Run: `aeos ticket run AEOS-20`; review; approve AEOS-20

**Implementation (code task, tracked as sub-task):**
4. Implement `src/commands/ticket-dod-approve.ts` per the approved spec:
   - Load DoD rubric from `dod-evaluation.md`, display as checklist
   - Prompt: `All DoD criteria above must be met. Approve ticket <id> as DONE? [y/N]`
   - On Y: `transition(db, id, 'DONE')`, `setSubState(db, id, 'SIGNED_OFF')`, print completion summary
   - On N: exit 0 with message `DoD approval cancelled.`

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-20`, when complete, then spec artifact and review exist
- [ ] Given implementation, when running `aeos ticket dod-approve AEOS-1` on a QA-passed ticket, then DoD checklist is displayed and Y/N prompt appears
- [ ] Given operator enters Y, when command completes, then ticket column is DONE and completion summary is printed
- [ ] Given operator enters N, when command completes, then ticket remains in DOD_GATE and exit code is 0
- [ ] Given a ticket not in DOD_GATE, when running `aeos ticket dod-approve`, then error and exit 1

## Dependencies
- M6-005: AEOS-19 complete (`dod-evaluation.md` rubric exists)
- M2-012: `aeos ticket approve` pattern (reuse for transition logic)

## Definition of Done
- [ ] AEOS-20 pipeline ticket reaches DONE
- [ ] `aeos ticket dod-approve` implemented and unit tested
- [ ] End-to-end exit criteria for M6: a real ticket moves BACKLOG → DONE with human-approved DoD gate
- [ ] Reviewer conclusion: APPROVED or APPROVED_WITH_WARNINGS
