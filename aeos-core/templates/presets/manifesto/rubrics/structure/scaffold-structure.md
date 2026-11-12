# Scaffold Review Structure Rubric

Applied by the reviewer in **SCAFFOLD** to grade the scaffold review: the findings
an agent wrote about a deterministically generated scaffold (DTOs, interfaces,
repositories, end-to-end suite). It checks the review, not the scaffold. The
pinned spec, the API contract, the schema and the generated diff are in context.

The reviewer applies each criterion independently. Any **FAIL** blocks
advancement; **WARN** must be flagged but does not block.

---

## 1. Every Finding Cites a Source and a Generated Artefact

| Grade | Definition |
|-------|------------|
| **PASS** | Every finding cites the contract operation or schema object it derives from and the generated artefact it concerns. |
| **WARN** | One finding cites the source loosely but the generated artefact is still identifiable. |
| **FAIL** | A finding cites no source or no generated artefact, so the person cannot trace it. |

---

## 2. Fixes Point at Inputs, Not Output

| Grade | Definition |
|-------|------------|
| **PASS** | The review treats the scaffold as generated: no finding proposes hand-editing the output, and determinism concerns name the input (contract, schema or generator) at fault. |
| **WARN** | A finding is ambiguous about whether the fix belongs in the input or the output. |
| **FAIL** | A finding proposes editing the generated output directly, which the next regeneration would overwrite. |

---

## 3. Severities Are Justified

| Grade | Definition |
|-------|------------|
| **PASS** | Every finding has a severity (BLOCKER, WARNING or INFO) and a stated consequence that matches it: a BLOCKER names what downstream code or test would be built on a wrong scaffold. |
| **WARN** | Severities are present but one justification is thin. |
| **FAIL** | Findings carry no severity, or severities are asserted with no consequence. |

---

## 4. The Four Sections Are Present

| Grade | Definition |
|-------|------------|
| **PASS** | The review has the sections **Completeness**, **Fidelity**, **Determinism** and **Test surface**, each with findings or an explicit statement that none were found. |
| **WARN** | All four are present but a finding sits in the wrong section. |
| **FAIL** | A section is missing, so it is unknown whether that kind of defect was looked for. |
