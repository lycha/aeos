# DoD Evaluation Rubric

Used at the final gate. The artifact under review is the conformance agent's
judgement of the acceptance criteria that no deterministic instrument answered.
The conformance report (`conformance.md`) and the pinned spec are in your context.
A person decides the release on these verdicts, so each one must stand on its own.
All criteria are **binary PASS/FAIL**.

---

## 1. Every verdict is justified by evidence

| Grade | Definition |
|-------|------------|
| **PASS** | Each agent verdict cites evidence that can be checked: a file and line in the Code Diff, or a named test. A `pass` shows where the criterion is implemented; a `fail` says what is missing. The cited evidence exists in the diff and supports the verdict. |
| **FAIL** | A verdict rests on an assertion ("this appears to work"), on an earlier artifact's claim, or on evidence that is not in the diff or does not say what the agent says it does. Any `pass` without checkable evidence is a BLOCKER. |

---

## 2. No deterministic fail is argued away

| Grade | Definition |
|-------|------------|
| **PASS** | The agent judged only the criteria listed under "To judge" in the conformance report. Criteria that a test or scenario failed are left as they are. |
| **FAIL** | The artifact argues that a criterion with a failed instrument "really" passes, calls a failing test flaky or wrong in order to discount it, or gives a verdict on a criterion it was not asked about. Each instance is a BLOCKER. |

---

## 3. The verdict matches the criterion as specified

| Grade | Definition |
|-------|------------|
| **PASS** | Each judgement quotes the criterion from the pinned spec and judges that wording, not a weaker or neighbouring behaviour. |
| **FAIL** | A criterion is paraphrased into something easier to satisfy, only part of it is judged, or the verdict in the prose disagrees with the line in the `AEOS-CONFORMANCE` block. |

---

## 4. Completeness

| Grade | Definition |
|-------|------------|
| **PASS** | Every criterion listed under "To judge" has one judgement and one line in the `AEOS-CONFORMANCE` block. |
| **FAIL** | A listed criterion has no judgement, or has two. |
