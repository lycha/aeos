# Task: The Conformance Report Builder

**Milestone:** I1-M4 — Prove
**Plan package:** 4.2 (part 1 of 2)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** ⛔ `plugins/artefact-tree-pipeline/schemas/conformance.schema.json` (draft in `proposals/`)

## Context
"The pipeline closes on a conformance report, so *it shipped* and *it was specified* become the same claim. For every criterion, the conformance report records the result and the instrument that produced it." Today the QA column produces a prose `qa-report.md` and the definition-of-done rubric is prose. There is no verdict per criterion.

This task builds the report from deterministic sources. I1-M4-002b brings in the QA agent for what is left and puts the report in front of the person at the gate.

## What needs to be done
1. **Model** `conformance-report.ts` mirroring the approved schema.
2. **Test results.** Add configuration in `project.json`:
   ```json
   "criteria": { "testReport": { "command": "npx vitest run --reporter=json --outputFile=.aeos/tmp/test-report.json", "path": ".aeos/tmp/test-report.json", "format": "vitest-json" } }
   ```
   A port `test-report-reader.port.ts` with one adapter for `vitest-json`. It returns `Array<{ name, file, status: 'pass' | 'fail' | 'skipped' }>`. Design the port so a `junit` adapter can be added without touching callers; do not write it.
3. **Pure builder** `src/domain/services/conformance-builder.ts`:
   - input: criteria and non-goals (from I1-M4-001's parser), the trace (claims and instrument names), test results, the pin, the code commit and base
   - for each criterion, attach every tagged test as an instrument `{ kind: 'test', name, result }` and every tagged scenario as `{ kind: 'scenario', … }` when a result for it exists
   - verdict rule, exactly as the schema describes: any instrument failed → `fail`; at least one passed and none failed → `pass`; no instrument → `unverified`
   - a skipped test is not an instrument
4. **Serialise** to YAML and to a Markdown table (id, verdict, instruments, claimed by).
5. **Validate** the output against the approved schema in tests.
6. Expose it as `buildConformance(projectPath, epicId)` in an application service. Nothing calls it from a command yet.

## Acceptance Criteria
- [ ] Given AC-1 tagged on a passing test, when built, then AC-1 is `pass` with that test named as its instrument
- [ ] Given AC-2 tagged on one passing and one failing test, when built, then AC-2 is `fail` and both instruments are listed
- [ ] Given AC-3 with no tagged test or scenario result, when built, then AC-3 is `unverified` with no instruments
- [ ] Given a tagged test that was skipped, when built, then it is not counted as an instrument
- [ ] Given any report the builder produces, when validated against the approved schema, then it passes
- [ ] Given the summary, when read, then `pass + fail + unverified = total`
- [ ] Given a Vitest JSON report, when read by the adapter, then test names, files and statuses are returned

## Out of Scope
- The QA agent, human verdicts and the gate (I1-M4-002b)
- Running Gherkin scenarios. A scenario becomes an instrument only if the project's own test run reports a result for it.
- JUnit and other report formats

## Technical Notes / Hints
- Run the test-report command through the checks runner port from I1-M2-001 so timeouts and output capture are shared.
- `.aeos/tmp/` should be ignored by the `.aeos` repository. Add a `.gitignore` there in `project init` if one is not present.

## Layer Mapping
```
Model:       src/domain/model/conformance-report.ts
Domain svc:  src/domain/services/conformance-builder.ts
Port:        src/domain/ports/driven/test-report-reader.port.ts
Adapter:     src/infrastructure/test-report/vitest-json-reader.adapter.ts
Application: src/application/services/conformance.service.ts
```

## Dependencies
- I1-M4-001
- ⛔ approved `conformance.schema.json`

## Definition of Done
- [ ] Common Definition of Done in `README.md`
