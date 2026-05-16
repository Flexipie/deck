# Decisions

Append-only log of meaningful architectural and product decisions for Deck.

Each entry: date · decision · rationale · alternatives rejected. Newest at top.

---

## 2026-05-17 · Phase 2.5 close-out: F4 review works end-to-end

**Decision:** Phase 2 is functionally complete. First successful end-to-end review run today against the `main`→`test` diff: claude returned a clean JSON object, parser extracted two `suggestion`-level annotations on real lines, both landed in the UI with Accept/Dismiss/Ask. Cost-per-run is $0.30–$0.50 on a Max subscription (informational; no per-call charge).

**What broke during the walk, and what fixed it:**

| Failure mode | Root cause | Fix |
|---|---|---|
| First run: prose narration in `result` field | `--json-schema` doesn't bind claude's final text when tools are available; claude treated the prompt as a task to perform and narrated what it "did" | Lenient parser cascade in `parseReviewResponse` (strict → fenced block → balanced-brace scan) + raw-response `<details>` panel for debugging |
| Second run: empty `result` (`""`) with 4884 output tokens spent | Claude ended on a tool call instead of a text message in agentic mode; `--output-format json` only captures final assistant text | `--append-system-prompt` with explicit rule: "After any tool use turn, the very next turn MUST be your final JSON message. Do not end on a tool call." |
| Palette commands silently no-op'd | (a) `useRegisterCommands` registered first-render closures with stale state; (b) user clicked palette before `repoIdentity()` finished loading | (a) Wrapped commands in a stable indirection that reads from `ref.current` at call time; (b) added a transient "Repo still loading…" notice banner so the failure is visible |

**Why we kept tools on for F4 instead of `--tools ""`:** the user's call. Tool access lets claude check call sites, type defs, and surrounding patterns — meaningfully better than reviewing from the diff alone. The system-prompt fix made tools-on viable.

**Engineering hygiene at close:**
- `pnpm test`: 31 passing (4 new parser-fallback cases).
- `cargo test`: 18 passing.
- `pnpm tsc`: clean.
- `pnpm build`: clean (same Shiki chunk-size warnings as before).

**Gate status:**
- ✅ F4 produces useful annotations on real branches (verified once today).
- ⏳ "Reach for Deck over GitHub ≥50% in a week of daily use" — still open; needs lived experience, not a one-off test.

**How to apply:** When adding new agent flows (F6 → eventually F8 multi-agent), keep three lessons load-bearing:
1. The output is the goal. Frame prompts around "produce X" not "review Y".
2. System prompt binds harder than user prompt for agentic loops. Use `--append-system-prompt` for invariants that must hold across all turns.
3. Always have a lenient parser. Schema flags don't always bind. Prose-with-embedded-JSON is a real failure mode worth handling.

**Rejected alternatives in this slice:**
- **Disabling tools (`--tools ""`):** would solve the binding problem but loses real value of context-gathering. Revisit only if cost or speed becomes prohibitive on a non-Max plan.
- **Queueing early-firing palette commands:** implicit behavior is hard to debug; visible notice + retry is more honest.
- **Per-command enable/disable in palette:** more invasive UX; revisit when Phase 3 introduces multiple worktrees.

**Phase 3 starts next session:** worktrees + terminals + worktree-first diff source (the rework of `get_diff` already documented in the 2026-05-16 entry below).

---

## 2026-05-16 · Worktrees as the primary diff source (Phase 3 direction)

**Decision:** From Phase 3 onward, the **worktree** is the primary frame for getting a diff in Deck, and the diff defaults to "what's different in this worktree" — combining committed history *and* uncommitted (index + working-tree) changes. Pull as much as possible from local git state; never require the user to commit just to see a diff.

**Today (Phase 2):** the diff is sourced from `get_diff(base, head)` over committed refs only. The head/base pickers are the primary lens.

**Phase 3+ shape:**
- Worktree selection drives the diff. Branch picker becomes a *comparison* affordance, not the primary lens.
- New Rust surface: `get_worktree_diff(worktree_id, mode)` where mode is one of `working` (everything vs. merge-base, including uncommitted), `committed` (HEAD vs. merge-base), or `compare(base, head)` (current Phase 2 behavior, kept for explicit comparisons).
- F4/F5/F6 follow: reviewing a worktree should review in-progress work by default. The current "commit before you can review" friction goes away.
- Implementation already available via `git2-rs`: `diff_tree_to_index`, `diff_index_to_workdir`, `diff_tree_to_workdir_with_index`.

**Why:** Deck's thesis is per-worktree workflow. The current ref-pair UI inherits GitHub's mental model (PRs = pushed commits), which contradicts the local-first goal. Reviewing what's on disk — including the half-finished hunk you just typed — is the *actual* developer task most of the time.

**How to apply:** When Phase 3 work starts, the F1 worktree panel and the diff-source rework are linked, not separate features. Build `get_worktree_diff` first; let F1 drive `<DiffPanel>` via worktree selection; keep the explicit base/head picker as a secondary affordance for comparing across worktrees or against arbitrary refs.

**Rejected alternatives:**
- **Add an "include uncommitted" toggle to the existing Phase 2 ref-pair flow.** Cheaper, but cements the wrong primary mental model and makes worktrees a second-class concept.
- **Wait until F4/F5/F6 prove themselves on committed-only diffs first (i.e. defer the redesign).** That's what we're doing for Phase 2; the deferral has a date — when F1 lands in Phase 3.

---

## 2026-05-15 · Phase 2 (AI loop) machine-gates green; H7/H8/H9 manual walkthrough pending

**Decision:** Phase 2 (F4/F5/F6) is code-complete and machine-verified. Manual H7/H8/H9 walkthrough against a real branch is pending — gate verdict is conditionally green pending that walk.

**What landed (against the plan in this session):**

| Step | Status | Evidence |
|---|---|---|
| 1 — Migration 0002 (`accepted_at` + `chats` stub) | ✅ | 5 in-memory SQLite tests in `lib::migration_tests`. Existing-row survival verified. |
| 2 — `merge_base` Rust command | ✅ | 3 tests in `git::tests` (success, self-self, RefNotFound). |
| 3 — `run_claude` Tauri command via `tauri-plugin-shell` | ✅ | Pure `parse_envelope` extracted; 6 envelope-parsing tests in `agent::tests`. Subprocess plumbing took ~1h of the 3h budget. |
| 4 — `claude.ts` adapter + prompt template + Vitest | ✅ | 11 tests covering `parseReviewResponse`, `REVIEW_PROMPT`, `REVIEW_SCHEMA`, `CHAT_PROMPT`. |
| 5 — F4 review wired into DiffPanel | ✅ | `aiReview.ts` orchestrator + 9 tests; `useAnnotations` hook; `AnnotationCard` with severity stripe + Accept/Dismiss/Ask. |
| 6 — F6 self-review palette | ✅ | `selfReviewRefs` helper with merge-base fallback + 2 tests. |
| 7 — F5 chat sidebar | ✅ | `ChatSidebar` with session-resume, in-memory history, selection pill. |
| 8 — Loading/error polish | ✅ | Live elapsed counter while reviewing, inline thinking spinner in chat, error banners, 80k-char cap empty state. |
| 9 — Write-up | ✅ (this entry) | |

**Machine gate totals:**
- `cargo test`: 18 passing.
- `pnpm test`: 28 passing across 4 vitest files.
- `pnpm build`: clean (TS errors zero; same Shiki chunk size warnings as Phase 1).
- `cargo build`: clean.

**Manual H7/H8/H9 (pending walkthrough):** the gate questions ("annotations land on the right line", "chat session resume works", "self-review computes the right base") can only be verified by triggering ⌘K → Review on a real branch and reading the output. That walk is the next session.

**Rationale for shipping it without the manual walk done:**
- The plan called for "review at Step 9", and Step 9's manual checklist depends on a running app + claude CLI. Code is verified to the line numbers it can be verified to without a real claude call.
- The risky parts (subprocess envelope parsing, annotation validation against the diff, merge-base computation, schema-constrained output parsing) are unit-tested. What's left to verify manually is "is claude's signal/noise good enough to reach for Deck over GitHub" — a judgement call, not a logic bug.

**Known imperfections accepted into Phase 2:**
- `app.selfReview` is registered under panel scope `"diff"` not `"global"`. Since DiffPanel is the only panel present, it's globally reachable in practice. When Phase 3 adds a second panel, lift to global scope.
- `DiffPanel.tsx` is 402 lines — 2 over the CLAUDE.md "~400 line" guideline. Splitting into a hook would split selection + chat plumbing across two files for no behavioral win right now; keep it as one file until F1 (worktree mgmt) or terminals bring more state.
- Chat history is in-memory only (`chats` table created, not yet written to). The plan called this out: persistence wires in Phase 2.5 if we feel pain.
- `claude` binary resolved via `PATH`. If the spawned Tauri subprocess doesn't see the right `PATH`, override via `PHASE2_CLAUDE_BIN` env var (already supported in `agent.rs`).
- Annotation validation drops claude outputs whose `line`/`side` don't match the parsed diff. The orchestrator surfaces `skipped` count to the UI so we can tell if claude is hallucinating line numbers.

**Rejected alternatives:**
- **Streaming annotation arrival (`--output-format stream-json`).** Buffered is one code path; we'll feel pain on huge diffs and revisit then.
- **Direct Anthropic API for chat.** Two code paths for one feature. Keychain stays out of Phase 2.
- **Multi-line annotations (`end_line_number`).** Pierre supports range selection but `DiffLineAnnotation` is per-line. Adding range support is real prompt-engineering work; punt.

**How to apply:** When kicking off Phase 3, run the H7/H8/H9 walkthrough first. If it's green, mark Phase 2 PASSED in ROADMAP. If H7 noise is bad, iterate on `REVIEW_PROMPT` in `src/lib/promptTemplates.ts` — that's the dial that matters.

---

## 2026-05-15 · Theme toggle: drive Pierre's tree + diff via their own APIs, not just CSS vars

**Decision:** App theme state (`'system' | 'light' | 'dark'`) lives in `ThemeProvider`, which writes `data-theme` on `<html>` and exposes both `mode` (raw choice) and `resolved` (concrete `light`/`dark`, watching `matchMedia` when mode is `system`). Three places consume it:

1. **App chrome** — `styles.css` uses `:root[data-theme="dark"]` for the explicit override and `:root:not([data-theme="light"])` inside `@media (prefers-color-scheme: dark)` for system mode.
2. **Pierre's `<FileDiff>`** — receives `options.themeType: mode` directly (`'system'` defers to Pierre's own matchMedia, `'light'`/`'dark'` force).
3. **Pierre's `<FileTree>`** — needs `themeToTreeStyles({ type: resolved })` applied as inline `style` on the tree, because trees don't have a `themeType: 'system'` indirection and read `--trees-theme-*` CSS variables instead.

**Why:** First-pass theme toggle just set `data-theme` + `colorScheme` and assumed `@media (prefers-color-scheme: dark)` would respond. It doesn't — `color-scheme` only affects native form controls and scrollbars, not media queries. Pierre's tree also has its own theme variables that no amount of CSS hackery on `:root` reaches.

**How to apply:** Any third-party UI lib we add later — assume it has its own theming surface. Read its docs before wiring it to `data-theme`. CSS variables on `:root` only solve our chrome.

---

## 2026-05-15 · Phase 1 substrate: PASSED

**Outcome:**
- `.app` size **14 MB** (target <25 MB). ✓
- Main JS bundle **264 kB gzipped** (target <500 kB). ✓ Shiki 16-lang allowlist via `preloadHighlighter`; remaining language grammars are code-split chunks that never load at runtime.
- Migration `0001_initial.sql` applies on first launch via `tauri-plugin-sql`; schema mirrors `DiffLineAnnotation<AnnotationMeta>` exactly so Phase 2 writes pass straight through.
- `git2::Diff::print(DiffFormat::Patch)` output is byte-equivalent to `gh pr diff` shape (verified via Rust unit tests). Risk ladder resolved at (a) — no shell fallback, no postprocessing. Pierre's `parsePatchFiles()` accepts directly.
- All 4 `git.rs` unit tests pass.
- Manual walkthrough: diff renders on real branches, click-to-scroll works, ⌘K opens palette with panel-scoped commands. One yellow finding (theme toggle didn't actually flip Pierre's tree) — fixed and logged separately above.

**Decisions worth keeping (made during build):**
- **`tauri-plugin-sql` 2.4 (not 2.3).** Plan called for 2.3 but JS package is at 2.4.0. Cargo pinned to `"2.4"` for matching minor. Cleaner than mismatching JS/Rust.
- **Cargo.lock committed.** Standard for shipping binaries; ensures reproducible builds.
- **Drop `tauri-plugin-opener`.** Scaffolded by `create-tauri-app` but unused.
- **Hardcode repo path in `git.rs`.** Open-repository dialog is Phase 3 (F1) work. The path lives as a single `const PHASE1_REPO_PATH` so the upgrade later is one-line.
- **`BranchPicker` is hand-rolled (no Radix).** ~110 lines. Search input + keyboard nav. Radix is a Phase 2/3 polish call.
- **Command registry uses immutable Map snapshots.** `useSyncExternalStore` requires a new reference on each notify; cloning the Map per mutation is cheap given the small command count and avoids subtle "store changed but React didn't re-render" bugs.
- **`list_branches` returns local only.** `BranchType::Local` filter. Add `Remote` if we want to diff against `origin/*`.

---

## 2026-05-15 · Phase 0 gate: PASSED. Stack survives.

**Outcome:** All three hypotheses (H1 Pierre rendering, H2 annotation API, H3 Tauri shell) cleared the gate green. Phase 1 starts on the same stack — no pivots.

**Numbers:**
- Release-build `.app` size: **10 MB** (target was <15 MB; Electron baseline ~150 MB).
- Cold start: window almost instant, diff fully painted at **~2 s** (PRD target <2.5 s).
- Type-check + Vite build both clean. Tauri release build compiled in 60 s on first run.

**What worked:**
- `parsePatchFiles()` accepts raw `gh pr diff` output directly; no preprocessing.
- Pierre's annotation contract (`lineAnnotations: DiffLineAnnotation<T>[]` + `renderAnnotation(a) => ReactNode`, generic on a custom metadata type) is exactly what the Phase 2 adapter pattern needs — Claude → JSON → typed metadata → Pierre annotation, no fanning out.
- `pierre-dark` / `pierre-light` themes are bundled inside `@pierre/diffs`, no separate install required for our needs.
- The whole spike (Tauri 2 + React 19 + Pierre + tree sidebar + interactive annotations) sits at 10 MB.

**What we learned for Phase 1:**
- Pierre bundles 80+ Shiki language grammars by default. Our JS bundle ballooned to ~900 kB / ~260 kB gzipped. Phase 1 must scope language loading to languages we'll actually see (TS, JS, SQL, Rust, MD, JSON, TOML — done; Wolfram, Emacs Lisp, etc — no).
- `@pierre/trees` is still on `1.0.0-beta.3` and uses Preact internally with a React API wrapper. Phase 1 needs to test refs/context interop in our real layout, not just a flat sidebar.
- The `gh pr diff` flow generated a fixture with the actual repo path (`packages/supabase/supabase/migrations/...`) — Phase 1's git integration must use the same path basis or the annotation file matching breaks.

**Phase 1 next steps:**
- Delete `spike/` before scaffolding (we carry lessons, not files — per the load-bearing rule).
- Scaffold Phase 1 at repo root using Tauri 2 + React 19 + TS + Vite + pnpm.
- Build F3 (Diff viewer) and F7 (Command palette) first per ROADMAP.md.

---

## 2026-05-15 · Pierre libraries are Apache 2.0, not MIT

**Correction:** Initial `DECISIONS.md` and `PRD.md` entries listed `@pierre/diffs` and `@pierre/trees` as MIT. Both libraries publish under **Apache 2.0** (confirmed in `node_modules/@pierre/diffs/package.json` and the [pierrecomputer/pierre](https://github.com/pierrecomputer/pierre) repo).

**Impact:** None on our use — Apache 2.0 is equally permissive for our local-first, single-user, non-distributed tool. Forking is still permitted. Noting it here so future-me doesn't get surprised by an MIT assumption.

---

## 2026-05-15 · Working name is "Deck"

**Decision:** Use "Deck" throughout code, docs, and commits until a real name is picked.

**Rationale:** Committing to a placeholder beats vague naming. Find/replace is cheap when the real name lands.

---

## 2026-05-15 · Docs live in `docs/`, CLAUDE.md stays at root

**Decision:** `PRD.md`, `DECISIONS.md`, `ROADMAP.md` go in `docs/`. `CLAUDE.md` stays at the repo root.

**Rationale:** Claude Code auto-loads `CLAUDE.md` from the repo root by convention. Other docs are foundational but don't need root visibility.

---

## 2026-05-15 · Claude Code is the primary agent for Phase 0–2

**Decision:** Build and test Phase 0–2 against `claude` (Claude Code) only. Adapters for codex/opencode/aider/gemini come in Phase 4.

**Rationale:** Claude Code is the daily-driver. Its TUI stresses the terminal pipeline hardest (richest UI of any CLI agent), so validating against it first means other agents are downhill.

**Forward-compat constraint:** Even though only Claude Code is tested, the adapter pattern must exist from F4 onward. No Claude-specific code outside `adapters/claude.ts`.

---

## 2026-05-15 · Pierre libraries pinned exact, tracked weekly

**Decision:** `@pierre/diffs` and `@pierre/trees` pinned to exact versions (no `^`/`~`). Manually check for upstream updates weekly during active development; test before bumping. Track the changelog/repo, not just npm version.

**Rationale:** Pierre libraries are young (v1.x). Avoid surprise breakage from drift. Manual check is cheap for a personal repo; renovate/dependabot is overkill.

**Fallback:** If Pierre goes quiet for >6 months, fork into the repo (`vendor/pierre-*`) and maintain locally.

---

## 2026-05-15 · One-file-per-panel as a coding discipline

**Decision:** Each panel's UI starts as a single `.tsx` file in `src/panels/`. Split into a folder only when the file passes ~400 lines or genuinely needs separate hooks/types/tests.

**Rationale:** Keeps "add a panel" a weekend-sized task. Prevents architecture creep across many small files. The rule serves *cost of new feature*, not *purity of structure*.

**Not the same as:** project structure. We can still have `src-tauri/`, `src/`, `src/adapters/`, etc. The rule is local to the panel layer.

---

## 2026-05-15 · No monorepo at v0

**Decision:** Single Tauri project. `src-tauri/` for Rust, `src/` for frontend. No workspace/packages split.

**Rationale:** Everything is consumed by one app. Multi-package overhead (workspaces, cross-package types, build orchestration) doesn't pay off yet.

**Revisit when:** we want to publish agent adapters or fork Pierre as our own package.

---

## 2026-05-15 · React for the frontend (not Svelte)

**Decision:** React + TypeScript + Vite.

**Rationale:**
- `@pierre/diffs` ships first-class React bindings; Svelte would require writing and maintaining an adapter.
- Established libraries for the UX we want (e.g. `cmdk` for the command palette) reduce glue code.
- Tradeoff: larger framework runtime than Svelte (~40KB gzipped), well within budget.

**Rejected:**
- **Svelte:** smaller, simpler, but Pierre adapter cost wipes the win.

---

## 2026-05-15 · Tauri 2.x as the app shell

**Decision:** Tauri 2.x (not Electron, not pure native).

**Rationale:**
- Bundle ~15MB vs Electron ~150MB. Matters for the "feels like a real product" goal.
- Memory footprint significantly lower at idle.
- Rust core fits the system-level work Deck needs natively (`git2-rs`, pty, fs).
- Tauri 2 is stable, has a clean plugin model, surfaces native macOS APIs well.
- `@pierre/diffs` and `@pierre/trees` are React/TS — must have a web frontend layer either way.

**Rejected:**
- **Electron:** more numerous pty/xterm.js examples, but bundle and memory cost contradict the aesthetic goal.
- **SwiftUI/native:** would require reimplementing Pierre's libs in Swift — months of detour.

**Tradeoff accepted:** smaller community for pty/xterm.js in Tauri-land. Mitigation: `portable-pty` Rust crate is mature, IPC patterns are documented.
