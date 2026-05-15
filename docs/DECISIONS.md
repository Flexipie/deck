# Decisions

Append-only log of meaningful architectural and product decisions for Deck.

Each entry: date · decision · rationale · alternatives rejected. Newest at top.

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
