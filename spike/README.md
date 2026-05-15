# Deck — Phase 0 Validation Spike

A throwaway Tauri 2 + React + TS + Vite app that renders PR #847 from `Naiss-Ride/mobile-app` via `@pierre/diffs`, with three hardcoded AI annotations (one of each severity) and a `@pierre/trees` sidebar.

This directory is intentionally deleted before Phase 1 starts. The gate checklist below decides whether the stack (Tauri 2 + Pierre + xterm.js + tmux) survives.

Full plan: `/Users/flexipie/.claude/plans/vivid-imagining-crane.md`. Product context: `../docs/PRD.md`.

## Running it

Prereqs:
- macOS, Xcode Command Line Tools (`xcode-select -p` to confirm)
- pnpm
- Rust toolchain (via rustup)

```bash
# install once
pnpm install

# JS-only browser preview (no Rust needed)
pnpm dev   # serves at http://localhost:1420

# Full Tauri desktop app
pnpm tauri dev

# Release build (for size measurement)
pnpm tauri build
```

If the built `.app` won't open on first launch (Gatekeeper quarantine):
```bash
xattr -dr com.apple.quarantine src-tauri/target/release/bundle/macos/deck-spike.app
```

## Gate checklist

Walk this manually at the end. Each item is **yes / no / yellow** with one-line evidence. Outcome goes to `../docs/DECISIONS.md`.

### H1 — `@pierre/diffs` renders real content well and integrates cleanly
- [ ] App opens with `pnpm tauri dev` and the diff is visible.
- [ ] All 13 files appear in the diff and parse without manual pre-processing of `gh pr diff` output.
- [ ] The 545-line SQL file (`20260512130100_core_1994_validation_functions.sql`) scrolls smoothly with syntax intact.
- [ ] File tree shows all 13 paths with "added" badges.
- [ ] No console errors during normal scroll, click, expand.

### H2 — Annotation API supports the AI-overlay UX without forking
- [x] **Three annotations render on the correct files and lines** *(structurally validated — visual confirmation pending)*
- [x] **Severities are visually distinguishable** *(red/amber/blue tokens via CSS, structurally validated)*
- [ ] Click → expand → Accept/Dismiss/Ask buttons visible → collapse works without adjacent-line layout shift.
- [x] **Annotation rendering uses Pierre's documented API surface** (`lineAnnotations` + `renderAnnotation` props on `FileDiff`) — no DOM injection, no CSS overlay hack.
- [x] **No need to fork or patch Pierre internals** — types are clean, public API was sufficient.

### H3 — Tauri shell feels like a real desktop app
- [ ] Cold start time recorded (median of 3 runs from Finder open → first paint).
  - Run 1: __ s
  - Run 2: __ s
  - Run 3: __ s
  - Median: __ s
- [ ] Release-build `.app` size recorded via `du -sh src-tauri/target/release/bundle/macos/*.app`.
  - Size: __ MB
- [ ] Window chrome looks native — proper traffic lights, no "browser window" tells.
- [ ] No visible flash of unstyled content on launch.

### Stack outcome (filled at end)

| Hypothesis | Result | Notes |
|---|---|---|
| H1 — Pierre renders well | __ | |
| H2 — Annotation API fits | __ | |
| H3 — Tauri feels real | __ | |

### Decision tree

- **All H1+H2+H3 green** → delete `spike/`, scaffold Phase 1 at repo root next session.
- **H1 yellow/red** → pivot to Monaco or fork Pierre.
- **H2 yellow** → ship Phase 1 with overlay-based annotations, file an upstream Pierre issue.
- **H2 red** → significant pivot: build annotations as a separate layer outside Pierre.
- **H3 yellow/red** → consider Electron fallback.

## What's hardcoded in the spike

Three annotations, defined in `src/annotations.ts`:

| Severity | File | Line (additions side) | Title |
|---|---|---|---|
| blocker | `20260512140100_core_1995_cae_eligibility_rls.sql` | 54 | PII isolation hinges on a single equality check |
| suggestion | `packages/supabase/src/types/db.ts` | 835 | Consider exporting a row-type alias |
| nit | `packages/supabase/src/queries/notification/index.ts` | 19 | Long single-line column list |

These are written to look like plausible AI flags so the visual stress test is realistic, not so they reflect actual code issues.

## Findings to capture before deleting the spike

When you delete this directory after Phase 1 starts, copy any of these out first:

- Pierre's Shiki language bundles balloon the JS bundle to ~900kB+ even in our minimal app. Phase 1 needs lazy/selective language loading.
- `@pierre/trees` is `1.0.0-beta.3` — pin exact and watch for breaking changes.
- `parsePatchFiles()` from `@pierre/diffs` accepts raw `gh pr diff` output directly; no pre-processing needed.
- The annotation rendering contract (`lineAnnotations` + `renderAnnotation`) is generic on a custom metadata type — exactly what we need for the adapter pattern in Phase 2.

Pierre is **Apache 2.0**, not MIT as the PRD originally stated. Correction queued for `docs/DECISIONS.md` post-gate.
