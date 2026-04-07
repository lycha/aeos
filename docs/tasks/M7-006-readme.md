# Task: Write README (Install → First Ticket → Approve → Done)

**Milestone:** M7 — Polish & Distribution
**Agent:** —
**Method:** Manual

## Context
The public-facing README must enable a developer with no prior AEOS knowledge to install it, create a project, run their first ticket through the full pipeline, and reach DONE — with no setup beyond `aeos install`. It is the first impression and the primary onboarding document.

## What needs to be done
Write `README.md` at the repo root covering:

**Sections (in order):**
1. **What is AEOS** — 2–3 sentences: AI-assisted pipeline that takes a ticket from idea to code review using LLM agents. Dogfoods itself.
2. **Install** — download binary from GitHub Releases, run `aeos install`
3. **Quick Start** (5-step flow):
   ```bash
   aeos project init --name "My Project" --key MYPRJ
   aeos ticket create "Add user authentication"
   # Edit .aeos/MYPRJ-1-ticket.md with the ticket description
   aeos ticket run MYPRJ-1
   aeos ticket approve MYPRJ-1  # repeat for each column
   aeos ticket dod-approve MYPRJ-1
   ```
4. **How it works** — brief pipeline diagram: BACKLOG → PRODUCT_SCOPING → ... → DONE; agents + reviewer per column
5. **Commands reference** — table of all commands with one-line descriptions
6. **Cost tracking** — `aeos costs` overview, 1 paragraph
7. **Requirements** — `claude` CLI on PATH, Node 20+ (if building from source), macOS/Linux

## Acceptance Criteria
- [ ] Given a developer reading only the README, when following Quick Start, then they can reach DONE on a test ticket without referring to any other doc
- [ ] Given the commands reference table, when counting rows, then all CLI commands implemented in M1–M7 are listed
- [ ] Given README, when reading "Install" section, then it references GitHub Releases and the binary download path
- [ ] Given README, when reading "Requirements", then `claude` CLI prerequisite is stated clearly with a link to installation instructions
- [ ] Given README length, when reading, then it fits on a single scroll on a laptop screen for the Quick Start section

## Out of Scope
- Full API or architecture documentation (a separate `docs/` topic)
- Contributing guide (post-v1)
- Changelog (separate file)

## Dependencies
- M7-001 through M7-005 complete (README should reflect final command set)
- At least one successful full pipeline run (to verify Quick Start is accurate)

## Definition of Done
- [ ] `README.md` committed at repo root
- [ ] Quick Start walkthrough manually verified on a clean machine
- [ ] Commands reference table is complete and accurate
- [ ] Reviewed by at least one other person for clarity
