# Roadmap

Phased build plan for Deck. Each phase has a gate; if a gate fails, the project pauses or pivots rather than escalates.

Feature IDs (F1–F18) map to `docs/PRD.md` §6.

---

## Phase 0 — Validation spike (1 weekend)

**Goal:** Prove the substrate works before sinking real time into it.

**Build:**
- Throwaway Tauri 2.x + React + Vite shell.
- Render one real diff from an actual repo using `@pierre/diffs`.
- Three hardcoded fake annotations via Pierre's annotation API.
- Pierre Shiki theme applied to both diff and tree.

**Gate (all must pass):**
- Tauri cold start feels acceptable (subjective; target <2s).
- `@pierre/diffs` render quality matches Pierre's own demos in the browser.
- Annotation API ergonomics feel right — no obvious "we'd have to fork this to make it work" moments.
- No blocker bugs in Pierre libs.

If gate fails → rethink stack before going further. Electron fallback is the most likely pivot.

---

## Phase 1 — Substrate (2–3 weekends)

**Goal:** A working diff review app, no AI yet.

**Build:**
- **F3** — Diff viewer (Pierre-backed, branch picker, file tree via `@pierre/trees`).
- **F7** — Command palette (`cmdk`, panel-scoped command registration).
- Tauri scaffolding for git operations (read worktrees, list branches, get diff via `git2-rs`).
- SQLite setup with a first migration file (annotations table, even if unused yet).
- Left rail with panel switcher.

**Gate:** Can I review a real branch diff in Deck end-to-end (open app → pick refs → see diff → close), and does it feel as good or better than GitHub's diff view?

---

## Phase 2 — AI loop (2–3 weekends)

**Goal:** The reason Deck exists.

**Build:**
- **F4** — AI-annotated diffs. Claude Code adapter (`adapters/claude.ts`). Structured JSON output parsed into Pierre's annotation format and overlaid on the diff. Annotations persisted to SQLite.
- **F5** — Talk to the diff (chat panel with current diff as context).
- **F6** — Pre-PR self-review (same engine, pointed at uncommitted/branch diff).

**Forward-compat constraint:** Agent invocation lives only in `adapters/claude.ts`. The rest of the AI code is agent-agnostic.

**Gate:** Reaching for Deck instead of GitHub for ≥50% of reviews after one week of daily use.

---

## Phase 3 — Terminals (3–4 weekends)

**Goal:** Single-window thesis becomes real.

**Build:**
- **F2** — Embedded terminals: xterm.js + tmux. One tmux server per Deck install, one tmux session per worktree, splits inside.
- **F1** — Worktree management panel (status, create, delete, switch-context).
- Per-worktree state scoping (sessions, annotations, spec, chat history). Worktree ID is the key everywhere.

**Gate:** Do I prefer Deck's terminals to Ghostty for Claude Code sessions? If no, keep using cmux/Ghostty externally and reconsider whether F2 is worth the maintenance cost.

---

## Phase 4 — Power features (2–4 weekends, one feature at a time)

Built in order of personal pain. Likely order:

1. **F9 — Spec/plan docs per worktree** (markdown editor scoped to worktree; agents read it as context).
2. **F11 — AI commit messages and PR descriptions.**
3. **F10 — Snapshot/restore for AI sessions** (`git stash` + `git tag` wrapper, with UI).
4. **F8 — Multi-agent parallel runs** (same prompt to Claude + Codex in parallel worktrees, side-by-side diff comparison).
5. **F12 — Context curation panel** (file/glob presets per task).

**Per-feature gate:** Used at least weekly after one week of availability. If not, revert/delete rather than maintain.

---

## Phase 5 — Future / P2 (build only when needed)

Tracked here for forward-compat awareness, not committed:

- **F13** — PR review queue / inbox (GitHub PRs awaiting your review).
- **F14** — Notification feed (GitHub + Linear + CI + Slack).
- **F15** — MCP server toggle per worktree.
- **F16** — Agent hooks UI (wraps Claude Code's hook system).
- **F17** — Cost / token tracking.
- **F18** — Stacked diffs support (post-Graphite/`jj` adoption).

---

## Forward-compatibility constraints

Things every phase must respect so future phases stay cheap. **Cross-reference when reviewing any PR.**

1. **Adapter pattern from Phase 2 onward.** No agent-specific code outside `adapters/<agent>.ts`. Adding a new agent = adding one file. (Supports F8, F4-for-other-agents, F16.)
2. **Per-worktree scoping from Phase 1.** Annotations, sessions, specs, chat — all keyed by worktree ID. No global app state where worktree state belongs. (Supports F1, F2, F8, F9.)
3. **Panel registry from Phase 1.** Panels self-register their command-palette entries declaratively. Adding a panel never requires editing a central switch statement. (Supports F1, F9, F12–F14.)
4. **Pierre annotation format as the canonical schema.** AI output is converted *to* Pierre's format at the adapter layer. The rest of Deck speaks one schema. (Supports F4, F8.)
5. **SQLite schema migrations from day one.** Even Phase 1's empty annotations table gets a migration file. Avoids "rebuild the DB" later. (Supports everything that persists state.)
6. **No agent-specific tmux/xterm hacks in Phase 3.** Anything we do for Claude Code's TUI must work for other TUI agents (codex, aider, gemini) without per-agent terminal config. (Supports F2, F8.)
7. **Keychain for any secret from day one.** No `.env` for API keys. (Supports F4, F11, future GitHub/Linear panels.)
8. **macOS-first, but never macOS-only in code.** Use cross-platform Rust crates and web APIs where the choice is free. Linux/Windows aren't on the roadmap but shouldn't require rewrites if they ever are.

---

## Time estimate

- Phase 0 + 1 + 2: **5–7 weekends to first daily-useful state.**
- Through Phase 4: **15–20 weekends to feature-complete v1.**
- Wall time: **5–7 months** including life.

---

## Power-tool benchmarks

The bar Deck has to clear to justify its existence. These aren't goals to *match*; they're floors to *exceed*:

- **vs. cmux** — Deck must do everything cmux does for terminals (session persistence, parallel agents, worktree affinity) *plus* diff review *plus* AI annotations. Phase 3 closes this comparison.
- **vs. Cursor 2.0** — Deck must support multi-agent ensemble (F8) and per-worktree context curation (F12) at least as well, without locking into one model or one editor.
- **vs. Superset** — Deck must support parallel worktree-based agent flows without a subscription, without prescribed workflow, and with better terminal quality (xterm.js + tmux, not whatever Superset embeds).
- **vs. GitHub** — Deck must make diff review feel better than github.com — Pierre's render quality + AI annotations + chat is the angle.

If after Phase 2 Deck doesn't clear the GitHub bar for review, kill it. If after Phase 3 it doesn't clear the cmux bar for terminals, keep using cmux externally and treat Deck as "review only."
