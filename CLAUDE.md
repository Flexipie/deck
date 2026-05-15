# Deck — Claude Code Instructions

Deck is a personal, single-user AI development environment. See `docs/PRD.md` for full product context.

## Stack

- **Shell:** Tauri 2.x (Rust core + web frontend)
- **Frontend:** React + TypeScript + Vite
- **UI primitives:** `@pierre/diffs` (diff rendering), `@pierre/trees` (file tree), Shiki (syntax highlighting)
- **Terminals:** xterm.js (renderer) + tmux (multiplexer/persistence), one tmux session per worktree
- **Storage:** SQLite (structured), filesystem (unstructured), macOS Keychain (secrets)
- **Git:** `git2-rs` from the Rust core where possible; shell out only when needed
- **Agents:** invoked as CLI subprocesses; one adapter file per supported agent

## Load-bearing rules

1. **One file per panel.** A panel's UI starts in one `.tsx` file. Split into a folder only when forced (~400 lines, or genuine need for separate hooks/types/tests). The rule serves *cost of adding a feature*, not purity of structure.
2. **Worktree is the unit of state.** Sessions, annotations, spec docs, chat history — all scoped per-worktree. Every feature must answer "how does this scope per-worktree?"
3. **Agent-agnostic via adapters.** No agent-specific code outside `adapters/<agent>.ts`. Claude Code is the primary target for Phase 0–2; codex/opencode/aider/gemini come later as one-file adapters.
4. **Local-first.** No cloud sync, no telemetry, no accounts. API keys live in macOS Keychain.
5. **Phased rollout.** See `docs/ROADMAP.md`. Each phase has a gate; if a gate fails, the project pauses rather than escalates.
6. **Pin Pierre exact.** No `^`/`~` on `@pierre/*`. Check upstream weekly during active development; test before bumping. Fork into the repo if upstream goes quiet.

## Working conventions

- **Plan before implementing.** Read files before modifying them. List unresolved questions at the end of a plan.
- **Tests first for new features.** Write the test cases the work must satisfy, then implement against them.
- **Decisions get logged.** If we make a meaningful architectural or product choice, append it to `docs/DECISIONS.md` (date, decision, rationale, alternatives rejected).
- **PRD is product truth. ROADMAP is build truth. CLAUDE.md is what must stay top-of-mind.**
- **No commits/pushes without explicit ask.** Commit messages stay simple and concise — describe what was done, no "authored by Claude" footers.
- **GitHub interactions go through `gh`.**

## What this project is not

- Not multi-user, not distributed, not for sale.
- Not a replacement for the IDE — editing happens in the agent or in another editor.
- Not generalized. Every feature is built for Felix's workflow first.

## Repo layout

- **`src/`** — React frontend.
  - `panels/` — one file per panel (`DiffPanel.tsx`). New panel = new file here.
  - `components/` — reusable bits: `PanelRail`, `BranchPicker`, `CommandPalette`.
  - `contexts/` — providers: `ActivePanel`, `Worktree`, `Theme`, `CommandRegistry`.
  - `hooks/` — `usePanelCommands` for panel command registration.
  - `lib/` — boundary to platform: `highlighter` (Shiki preload), `db` (SQLite wrapper), `git` (Tauri command shims).
- **`src-tauri/`** — Rust core.
  - `src/git.rs` — `git2-rs` commands (`repo_identity`, `list_branches`, `list_worktrees`, `get_diff`). Repo path hardcoded for Phase 1 (`const PHASE1_REPO_PATH`).
  - `src/lib.rs` — Tauri builder, plugin wiring, command registration.
  - `migrations/0001_initial.sql` — annotations table (schema mirrors Pierre's `DiffLineAnnotation<T>`; unused until Phase 2).
- **`docs/`** — `PRD.md`, `DECISIONS.md`, `ROADMAP.md`.

## References

- Product context: `docs/PRD.md`
- Decision log: `docs/DECISIONS.md`
- Phased plan: `docs/ROADMAP.md`
