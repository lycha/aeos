# AEOS — AI-Engineered Operating System

An AI-assisted development pipeline that takes a ticket from idea to code review using specialised LLM agents. Each pipeline column has a dedicated agent, a reviewer with rubrics, and a human approval gate. AEOS dogfoods itself — it was built using its own pipeline.

## Requirements

- **Node.js 22+** (LTS)
- **`claude` CLI** on `$PATH` — [install](https://docs.anthropic.com/en/docs/claude-code/getting-started)
- macOS or Linux

## Install

```bash
# From source
git clone https://github.com/lycha/aeos.git
cd aeos
npm install
npm run build
npm link

# First-time setup
aeos install
```

## Quick Start

```bash
# 1. Initialise a project
aeos project init --name "My Project" --key MYPRJ

# 2. Create a ticket
aeos ticket create "Add user authentication"

# 3. Edit the ticket description
$EDITOR .aeos/MYPRJ-1-ticket.md

# 4. Run the current column (agent produces artifact → reviewer evaluates)
aeos ticket run MYPRJ-1

# 5. Approve to advance to the next column
aeos ticket approve MYPRJ-1

# 6. Repeat steps 4–5 for each column, then final approval
aeos ticket dod-approve MYPRJ-1
```

## How It Works

```
BACKLOG → PRODUCT_SCOPING → ARCH_SPIKE → TECH_SPEC → IMPLEMENTATION → CODE_REVIEW → QA → DOD_GATE → DONE
           PM Agent          Architect    Architect    Engineer         Engineer       QA     Human
           ↓                 ↓            ↓            ↓                ↓              ↓      ↓
           PRD               Spike        Tech Spec    Impl Notes       Code Review    Report  ✓
           ↓                 ↓            ↓            ↓                ↓              ↓
           Reviewer          Reviewer     Reviewer     Reviewer         Reviewer       Reviewer
```

Each column follows the same cycle:
1. **Pre-flight** — model checks for blocking questions; if found, ticket is blocked until answered
2. **Agent run** — specialised agent produces a markdown artifact
3. **Validation** — rule-based structural checks (non-empty, required sections, word count)
4. **Review** — reviewer agent evaluates against column-specific rubrics
5. **Human gate** — operator approves to advance (`aeos ticket approve`)

## Commands

| Command | Description |
|---------|-------------|
| `aeos install` | One-time global setup (`~/.aeos/`, global gitignore) |
| `aeos project init [--name] [--key]` | Initialise `.aeos/` in the current directory |
| `aeos ticket create <title>` | Create a new ticket in BACKLOG |
| `aeos ticket list [--column]` | List tickets, optionally filtered by column |
| `aeos ticket show <id>` | Show ticket details, column, sub-state, and artifacts |
| `aeos ticket run <id>` | Run the current column: pre-flight → agent → validate → review |
| `aeos ticket approve <id>` | Advance a SIGNED_OFF ticket to the next column |
| `aeos ticket answer <id>` | Unblock a ticket after answering pre-flight questions |
| `aeos ticket dod-approve <id>` | Final human gate — mark ticket as DONE |
| `aeos dashboard` | Cross-project Kanban summary |
| `aeos costs [--project] [--ticket] [--since]` | LLM spend report |

## Architecture

```
src/
├── domain/          # Pure domain — entities, value objects, ports (no I/O)
├── application/     # Use cases — orchestrate domain via ports
├── infrastructure/  # Adapters — SQLite, filesystem, git, executor
├── cli/             # Driving adapter — Commander.js commands
└── shared/          # Cross-cutting — errors, types, config
```

Dependency rule: `cli/ → application/ → domain/ ← infrastructure/`

Domain is pure. Infrastructure implements domain ports. CLI wires everything via the composition root (`container.ts`).

## Cost Tracking

Every executor invocation records token usage and cost to a local SQLite database. View aggregated spend:

```bash
aeos costs                          # all projects, all time
aeos costs --project MYPRJ          # single project
aeos costs --since 2026-01-01       # date filter
```

## Development

```bash
npm run build          # Compile TypeScript
npm run dev            # Watch mode
npm test               # Run tests (Vitest)
npm run test:coverage  # With coverage
npm run lint           # ESLint + Prettier check
npm run lint:fix       # Auto-fix
npm run typecheck      # tsc --noEmit
```

## License

ISC
