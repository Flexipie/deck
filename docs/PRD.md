# Deck — Personal AI Dev Environment

**Product Requirements Document, v0.1**
**Author:** Felix
**Status:** Draft
**Working name:** Deck (placeholder — final name TBD)

---

## 1. Summary

Deck is a single-window, AI-native development environment for one developer (me). It combines embedded terminals running any CLI coding agent, a high-quality diff viewer with inline AI annotations, git worktree management, and a command palette for everything else — into one cohesive surface.

The thesis is that the current state of AI-assisted coding is fragmented across cmux/Superset (terminals & sessions), GitHub (review), Cursor (editor), and various chat apps (Claude, ChatGPT). Each tool is good at its piece, but the workflow lives in the seams between them. Deck collapses the seams.

It is explicitly a personal tool, optimized for power and craft, not for users-other-than-me. It is not a startup, not for distribution, and not for sale. Those constraints are features: they let me make every decision based purely on what makes the workflow better, with no compromise toward generality.

### Key architectural choices at a glance

| Decision | Choice | Why |
|---|---|---|
| Architecture | Single window, embedded terminals | Eliminates alt-tab tax; everything compounds |
| Frontend stack | Tauri + React/Svelte | Pierre libraries are React/TS; fast iteration; small bundle |
| Terminal backend | xterm.js + tmux (one server, session per worktree) | Battle-tested; free session persistence; supports any CLI tool |
| Agent integration | CLI-agnostic; run any agent in any terminal | Future-proof; no vendor lock-in |
| Diff / file tree | `@pierre/diffs` + `@pierre/trees` | Best-in-class; annotation API built for AI overlays |
| Navigation | Command palette (Cmd+K) | Scales with feature count; keyboard-first |
| Primary unit of work | Git worktree | Maps naturally to parallel AI sessions |
| Data model | Local-first, single-user, no auth | Personal tool; no service to maintain |

---

## 2. Why this exists

### The problem in concrete terms

A normal AI-assisted workflow today, for me:

1. Open Ghostty, run Claude Code in one pane.
2. Open another Ghostty pane for a dev server.
3. Switch to a browser to read the PR I'm reviewing on GitHub.
4. Switch to t3 chat or Claude.ai to ask a question that isn't worth giving Claude Code full repo access.
5. Switch to Linear to find which ticket I'm working on.
6. Switch back to terminal to commit and push.
7. Switch back to GitHub to write the PR description.
8. Switch back to terminal when CI fails.

Each switch is small but the cumulative tax is real, and worse, **context doesn't travel between surfaces**. Claude Code doesn't know what Linear ticket I'm on. GitHub doesn't know what Claude Code already noticed. The diff in my IDE doesn't carry the conversation I had with Claude about that diff.

Existing tools each fix one slice:

- **cmux / Superset / Conductor** fix parallel agent management but ignore review and tickets.
- **Cursor** fixes the IDE but ignores parallel CLI agents and isn't terminal-native.
- **GitHub** fixes review but ignores everything pre-PR.
- **Pierre.co** fixed review beautifully but is being wound down.
- **T3 chat** fixes multi-model chat but is divorced from code.

No existing tool tries to be the *whole loop*, optimized for one developer who runs many CLI agents and wants beautiful tooling around them.

### Why now

Three things converged in 2026 that make this build-able where it wasn't a year ago:

1. **CLI agents are good enough to be the primary interface.** Claude Code, Codex, OpenCode, Gemini CLI, Aider, Amp — all viable, all interoperable in any terminal.
2. **Pierre Computer Co. open-sourced `@pierre/diffs` and `@pierre/trees`**, removing the hardest 30% of the build (rendering beautiful diffs and file trees).
3. **The "orchestration layer" is now a recognized product category** (Cursor 2.0, Superset, Conductor, Claude Code Agent Teams, Sculptor, Nimbalyst). The patterns are settling. Building a personal version is significantly cheaper than it would have been in mid-2025.

### Why not just use one of those

- **cmux** is a terminal primitive, not an environment. Brilliant for what it is. Doesn't do diff review, PR management, or any non-terminal feature, by design.
- **Superset** does parallel agents well but locks features behind a $20/mo subscription, embeds inferior terminals, and prescribes a workflow.
- **Cursor 2.0** is IDE-centric and locked to its own editor and Composer model. Different religion.
- **Conductor / Nimbalyst** are good Mac apps but solve someone else's workflow.

None of them treat "the whole loop" as one thing, and none let me shape the UI to my own taste.

---

## 3. Goals and non-goals

### Goals

- **G1.** Reduce context switches in my daily AI-coding workflow by ~80%. Everything I need lives in one window.
- **G2.** Make diff review (others' PRs and my own pre-PR) genuinely pleasant and AI-augmented.
- **G3.** Support any CLI coding agent without integration work. New agent ships next month? `command-name` in a terminal. Done.
- **G4.** Match or exceed the visual quality of Pierre, Linear, and Raycast. The tool feels like a real product.
- **G5.** Stay extensible enough that I can add a new panel (e.g., Linear, Sentry) in one weekend, one file.
- **G6.** Survive being a solo project — every feature should earn its weight; the architecture should not require maintenance to keep working.

### Non-goals

- **NG1.** Multi-user. No teams, no auth, no roles. I am the only user, forever.
- **NG2.** Distribution. Not on App Store, not a SaaS, not for sale. If someone else wants to use it, they fork it.
- **NG3.** Cross-platform on day one. macOS first. Linux/Windows only if I switch machines.
- **NG4.** Replacing my IDE for editing. Deck is for review, orchestration, terminals, and AI loops. Code editing stays in my editor of choice or in the agent.
- **NG5.** Replacing GitHub/Linear/etc. as backends. Deck integrates with them; it does not host data.
- **NG6.** Generality. Every feature is built for *my* workflow first. If it accidentally generalizes, fine.

### Explicit "we are not doing this even though it's tempting"

- Building our own terminal renderer. Use xterm.js. cmux's authors spent months on libghostty for a reason.
- Building a plugin marketplace. Plugins are folders in this codebase.
- Cloud sync. Local only. If I want sync, dotfiles in git.
- Mobile. Not a phone tool.
- Agent-to-agent communication infrastructure. Premature; revisit in 2027 if the space settles.

---

## 4. Target user and workflow

### Who

Me. One developer, mid-career, comfortable with Swift / TypeScript / Rust / shell. Already uses Ghostty, Oh My Zsh (migrating to Starship), Claude Code as primary agent. Wants to try Codex more. Runs 1–5 parallel agent sessions on a typical workday.

### A day in the life, with Deck

I open Deck in the morning. The Worktrees panel shows three active worktrees from yesterday. I click `auth-refactor` — its tmux session restores, Claude Code is right where I left it, and the Diff panel automatically loads the branch's diff against main with annotations from yesterday's AI review still visible.

I notice a teammate's PR notification in the Inbox panel. One keybind opens it in a new worktree, Claude reviews it in the background, annotations appear on the diff. I read through with the AI's flags as a guide, ask follow-up questions in the chat panel (which knows the diff context), leave my own comments, approve.

Back to my own work. I prompt Claude Code in the embedded terminal: "implement the role-validation logic discussed in CLAUDE.md." It works for a few minutes. When it finishes (notification badge on the worktree), I hit `Cmd+K → self-review`. Claude annotates its own diff with potential issues. I fix two it caught, hit `Cmd+K → AI commit message`, then `Cmd+K → push and open PR`.

Total alt-tabs: zero.

---

## 5. Architectural decisions, with rationale

This section is the "why" for each significant choice. Every decision has alternatives I rejected; I'm naming them.

### 5.1 Single-window unified environment

**Decision:** One application window containing terminals, panels, and chat.

**Rationale:** The whole thesis of this tool is that context-switching has cumulative cost. A two-app split (Deck + cmux, as initially considered) reintroduces exactly the friction we're trying to remove.

**Rejected alternative:** Companion app talking to cmux via socket API. Lower build cost but daily friction. The "build the companion alongside cmux" plan was clean architecturally and bad ergonomically. Killing it.

**Tradeoff accepted:** Bigger app, more state, must implement terminal embedding.

### 5.2 Frontend stack: Tauri + web tech (React or Svelte)

**Decision:** Tauri as the shell. Rust core for filesystem / git / process work. Web frontend (Svelte preferred for size and simplicity; React acceptable if ecosystem pulls us there) for UI.

**Rationale:**
- `@pierre/diffs` and `@pierre/trees` are TypeScript libraries with React bindings. Using them natively requires a web layer; reimplementing them in Swift would take weeks I don't want to spend.
- Tauri's bundle is ~10× smaller than Electron, has a faster startup, and Rust gives us fast git operations via `git2` without shelling out for every action.
- Web frontend means each new panel is one file, no native build step, no code signing per feature.

**Rejected alternatives:**
- **SwiftUI:** Would give the most native feel but rules out direct use of Pierre's libraries and forces me to write everything twice if I want cross-platform later. Diff rendering would have to live in a WKWebView anyway, defeating the purpose.
- **Electron:** Works fine, used by VS Code and Slack and most of the world. But bundle size and memory footprint are worse than Tauri, and "feels like a real product" suffers under a 200MB minimum bundle. Acceptable fallback if Tauri proves painful.
- **Pure native (no web):** Would have to build a diff viewer from scratch. Multi-month detour.

**Tradeoff accepted:** Not 100% macOS-native feel. Some platform integrations (services menu, drag-and-drop edge cases) need extra work. ~50MB bundle minimum.

### 5.3 Terminal backend: xterm.js + tmux

**Decision:** Each terminal pane in Deck is an xterm.js instance, connected via WebSocket to a pty hosting a tmux session. One tmux server per Deck install. One tmux session per worktree, with splits inside.

**Rationale:**
- xterm.js is what VS Code, Codespaces, Gitpod, Coder, and Warp Drive all use. Mature, supports 24-bit color, OSC sequences, ligatures (via addon), unicode, mouse — everything Claude Code or any other TUI needs.
- tmux gives session persistence for free: quit Deck, reopen, your Claude Code session is exactly where you left it. cmux just shipped this as a marquee feature; we get it from tmux without writing code.
- tmux is also the most reliable terminal multiplexer in existence. Used by everyone, well-understood, scriptable.
- Combined, this means **any CLI tool just works** — `claude`, `codex`, `opencode`, `aider`, `gemini`, dev servers, log tailing, vim — they all run in xterm.js → pty → tmux → shell.

**Rejected alternatives:**
- **libghostty bindings:** What cmux uses. Best performance, native quality. But requires Swift or low-level FFI work that doesn't compose with our web frontend.
- **Native terminal subprocess:** Would render in a separate window. Defeats the single-window goal.
- **No multiplexer, raw ptys:** Loses session persistence and pane splits. Reinventing tmux.

**Tradeoff accepted:** xterm.js renders ~5% slower than native libghostty on extreme log output. macOS-native terminal gestures must be re-bound or skipped. For my use case, neither matters.

### 5.4 Agent-agnostic CLI architecture

**Decision:** Deck does not integrate with any specific agent. Agents are invoked as CLI commands inside terminals. Hooks (Claude Code's hook system, similar mechanisms in OpenCode / Codex) feed agent state back to Deck via filesystem events or a local socket.

**Rationale:**
- The agent space moves too fast to bet on one. Six months ago Claude Code was the only viable terminal agent; today there are six.
- This is the user's explicit requirement: any AI CLI should work for any feature.
- Hooks are the standard mechanism agents already provide for external observation. Using them means we don't need vendor-specific APIs.

**Implementation note:** Deck ships with a small adapter library for each supported agent (Claude Code, Codex, OpenCode, Aider, Gemini). Each adapter is one file (~50 lines) that defines: how to invoke, how to pipe a prompt, how to capture structured output, which hook events to listen for. Adding a new agent = adding one file.

**Rejected alternative:** Build on Claude Code's API directly. Would give the deepest integration but lock everything in.

### 5.5 Pierre libraries for diff and file tree

**Decision:** Use `@pierre/diffs` for all diff rendering. Use `@pierre/trees` for all file tree UI. Use Pierre Shiki theme pack for syntax highlighting and visual cohesion.

**Rationale:**
- `@pierre/diffs` has a first-class annotation API designed for exactly the AI-overlay use case Deck is built around. Built-in support for inline accept/reject UI, line selection, token hover hooks.
- `@pierre/trees` has built-in git status badges, which saves a moderate amount of plumbing.
- Both use Shiki themes, ensuring the file tree and diff look like they belong together with no design work.
- The libraries are TypeScript / vanilla JS / React, ships on npm, MIT-licensed, free to use.
- Saves an estimated 4–6 weekends of work versus building diff rendering from scratch.

**Rejected alternatives:**
- **Monaco Diff Editor:** Strictly more powerful but overkill for view-only diff (we don't need a full editor), much larger bundle, and lacks Pierre's annotation API.
- **Build diff rendering from scratch:** Possible but expensive; would consume the project's "weekend budget" before reaching the AI features.
- **`react-diff-viewer`:** Older, less actively maintained, no annotation API.

**Tradeoff accepted:** Pierre libraries are young (`@pierre/diffs` is v1.0.2 as of writing). API may change. Smaller community than Monaco. The risk is acceptable because (a) the libraries are MIT and I can fork if needed, and (b) the design quality is worth the version-bump risk.

### 5.6 Command palette as primary navigation

**Decision:** `Cmd+K` opens a context-aware command palette. Every feature in Deck is invokable from the palette. The palette is the canonical, keyboard-first way to do anything that isn't immediately visible.

**Rationale:**
- Power-user efficiency: typing is faster than mousing for known commands.
- Scales with feature count: adding a new feature = adding a palette entry, not redesigning UI.
- Familiar pattern from Raycast, Linear, VS Code, Notion. Zero learning curve for me.
- Context-aware: in the Diff panel, `Cmd+K` shows diff-specific actions first ("AI review", "switch refs", "open in cmux"); globally it shows everything.

**Implementation note:** Powered by a fuzzy-search library (`fuse.js` or `cmdk` if React). Commands are registered by panels declaratively. ~100 lines for the palette infrastructure.

### 5.7 Panel-based UI with left rail

**Decision:** Left side: a thin icon rail with one icon per panel. Main area: the active panel. Optional bottom strip or right-side dock for terminals (toggleable).

**Rationale:**
- Familiar layout (VS Code, Linear), low cognitive load.
- The rail handles 4–20 panels comfortably; we won't outgrow it.
- Each panel is self-contained — its own folder, its own state, no shared global store.
- Adding a new panel is the unit of incremental work. One panel = one weekend = one new capability.

**Design rule (load-bearing):** Each panel is exactly one file (plus tests). If a panel needs more than one file, the panel is doing too much and should be split conceptually. This rule prevents architecture creep.

### 5.8 Git worktrees as the primary unit of work

**Decision:** Worktrees are first-class in Deck. App state, tmux sessions, AI conversations, diff views, and specs are all scoped per-worktree. Switching worktrees switches everything.

**Rationale:**
- Worktrees naturally isolate parallel work. Two agents working on different worktrees can't conflict.
- This is the model Superset, cmux, Conductor, Cursor 2.0, and Sculptor all converged on. It works.
- "Per-worktree state" gives a clean answer to questions like "where do I store this AI conversation" or "which tmux session is which." The worktree is the key.

**Implementation note:** Worktrees live in `<repo>/../wt/<repo-name>-<branch>` by convention. Deck reads `git worktree list --porcelain` for ground truth.

### 5.9 Local-first, single-user, no cloud

**Decision:** All Deck state lives on the local machine. SQLite for structured data (sessions, annotations history, palette state). Filesystem for unstructured (spec docs). No accounts, no auth, no cloud sync.

**Rationale:**
- Personal tool: no need for accounts.
- Privacy: nothing leaves my machine except explicit API calls (to AI providers, to GitHub, to Linear when those panels are added).
- Speed: local reads/writes are instant.
- No service to maintain: I don't have to keep a backend alive.
- If I ever want sync, dotfiles + iCloud Drive + symlinks solves it.

---

## 6. Feature set

Features are bucketed by priority. P0 is the v1 release. P1 adds the power-user multiplier features. P2 is "build only if I feel the pain."

### 6.1 Core features (P0)

#### F1. Worktree management

**What:** Panel that lists existing worktrees with status (clean / dirty / agent-running / awaiting-review). Create new worktree from a branch name + base. Delete (with confirmation). Click a worktree → switch all of Deck's context to it.

**User story:** "I want to start a new feature called `auth-refactor`. Two keystrokes later I'm in a clean worktree with Claude Code waiting."

**Why now:** Worktrees are the organizational unit. Without this panel, the worktree zsh function works but doesn't compose with the rest of Deck.

**Notes:** A worktree is just `git worktree add <path> -b <branch>` under the hood. The UI is the value.

#### F2. Embedded terminals (xterm.js + tmux)

**What:** A terminal dock (bottom strip by default, can be detached to right panel) with tabs per worktree. Each tab is a tmux session; splits supported. Terminals persist across Deck restarts via tmux server.

**User story:** "I want to run `claude` here, `npm run dev` next to it, and a scratch shell below. They all stay running if I quit Deck."

**Why now:** Without embedded terminals, this is just a diff viewer, and the user has to go to cmux/Ghostty for agents. The "single window" thesis dies.

**Notes:** Significant build complexity. Should be designed early but built second (after F3+F4 so we have something AI-flavored to show by weekend 2).

#### F3. Diff viewer

**What:** Panel powered by `@pierre/diffs` (split or unified, user toggle). Branch picker at top: pick two refs (defaults to HEAD vs main). File tree on the left via `@pierre/trees` showing changed files with git status badges. Click file → diff loads in main area.

**User story:** "Show me what changed on this branch since main, with proper syntax highlighting."

**Why now:** The substrate for every AI-augmented feature that follows. F4 through F6 all sit on this.

#### F4. AI-annotated diffs

**What:** Trigger an AI review of the current diff. Selected AI agent (Claude / Codex / Gemini / whatever is configured) is invoked with the diff and a structured prompt asking for annotations. Output is parsed into Pierre's annotation format and overlaid on the diff. Each annotation is interactive: click → expand → ask follow-up → accept / dismiss.

**User story:** "Before I commit this, I want Claude to flag anything obviously wrong, and I want those flags to live on the diff, not in a separate chat."

**Why now:** This is the centerpiece feature, the reason Deck exists rather than just using cmux. Should be built earliest after the substrate (F3) is in place.

**Implementation notes:**
- Prompt structure produces a JSON array: `[{ file, line, severity, message, suggestion }]`.
- Severity buckets: `blocker`, `suggestion`, `nit`.
- All AI agents support `-p` / piped prompts. Adapter normalizes invocation.
- Annotations are persisted to SQLite per worktree, survive restarts.

#### F5. Talk to the diff (context-aware chat)

**What:** Side chat panel (or modal) that has the current diff loaded as context. Asks like "why this change?" or "what would break if I removed this?" work without re-explaining context.

**User story:** "I don't understand line 47. Let me ask without leaving the diff."

**Why now:** Trivially cheap once F4 exists (same engine, different surface). High value.

#### F6. Pre-PR self-review

**What:** Keybind / palette command: "review my current diff." Same engine as F4 but pointed at uncommitted work on the current branch (`git diff $(git merge-base HEAD main)..HEAD`). Annotations appear in the same UI.

**User story:** "Before I push, let me have Claude look at this. If there are blockers, I fix them first."

**Why now:** Trivially cheap once F4 exists. Highest daily-use frequency of any AI feature.

#### F7. Command palette

**What:** `Cmd+K` opens a fuzzy-search palette. Every action in Deck is registered as a command. Context-aware: shows panel-specific commands first when a panel is focused.

**User story:** "I want to do anything in this app without ever taking my hands off the keyboard."

**Why now:** Foundation for power use. Should be built early so subsequent features register commands as they ship.

### 6.2 Secondary features (P1)

These build on the P0 substrate. Add in order of personal pain.

#### F8. Multi-agent parallel runs

**What:** Send the same prompt to two or more agents (Claude + Codex, e.g.) in parallel worktrees. When both finish, Deck shows their diffs side-by-side and lets you pick the better one, cherry-pick lines, or merge ideas.

**Why:** This is the ensemble trick Cursor 2.0 productized. Doing it better requires controlling the comparison UI, which we do.

**Rationale for P1 not P0:** Real value but only after you've used Deck enough to know which agents you actually want to run in parallel.

#### F9. Spec / plan docs per branch

**What:** Markdown editor panel scoped to the current worktree. Lives at `<worktree>/.deck/spec.md` (gitignored by default, optional commit). Agents read it as context automatically (or via a keybind).

**Why:** Augment Code's Intent showed that a living spec significantly improves multi-agent alignment. For solo use it's also just a better place to think than a sticky note.

#### F10. Snapshot / restore for AI sessions

**What:** Before letting an agent do a risky thing ("refactor this whole module"), one keybind tags the worktree state. After, one keybind restores. Implementation: `git stash` + `git tag` + a UI.

**Why:** Removes the fear of giving agents autonomy. Currently the failure mode for autonomous coding is "agent trashed something subtle and you can't tell what." Snapshots are the answer.

#### F11. AI commit messages and PR descriptions

**What:** `Cmd+K → commit message` reads the diff, drafts a semantic commit message (style configurable). Same for PR descriptions, with optional template.

**Why:** Saves 2–3 minutes per commit / PR. Daily use.

#### F12. Context curation panel

**What:** Pick which files / globs the agent sees for a task. Save as presets ("frontend task", "backend task", etc.). Apply per-session.

**Why:** Cursor's @-mention system is mediocre and Claude Code's CLAUDE.md is global. Per-session context tuning is high-leverage for hard tasks.

### 6.3 Future features (P2 — build only when needed)

These earn their existence only when their absence causes real, recurring pain. Listed for completeness, not for v1 commitment.

- **F13. PR review queue / inbox** — combined view of GitHub PRs awaiting your review. Only build when you forget to review someone's PR.
- **F14. Notification feed** — GitHub + Linear + CI + Slack mentions in one panel. Only build when you have >15 daily notifications across these.
- **F15. MCP server toggle per worktree** — turn MCP servers on/off per task to stay under the tool budget. Build when you hit "agent picked wrong tool" repeatedly.
- **F16. Agent hooks UI** — wraps Claude Code's hook system in a GUI. Build only if you find yourself writing many hooks by hand.
- **F17. Cost / token tracking** — per-task, per-day. Build when API bills become surprising.
- **F18. Stacked diffs support** — only after personally adopting Graphite (`gt`) or Jujutsu (`jj`) for at least a week.

---

## 7. Non-functional requirements

### Performance

- App cold start: under 2 seconds to interactive.
- Diff render: under 500ms for a 5,000-line diff (Pierre's CSS Grid + Shadow DOM design supports this).
- Palette open: under 50ms perceived latency.
- Terminal first character on keypress: under 16ms (one frame at 60fps).
- AI annotation overlay (assuming AI call returns): under 200ms from response to rendered annotations.

### Aesthetic

- Pierre-influenced. Monospace where appropriate (commit hashes, branches, file paths). Restrained color palette. Pierre's Shiki themes for diff and tree by default.
- Inspirations: Linear, Raycast, Pierre.co, Things 3, Notion (for spec docs).
- Anti-inspirations: Electron-default chrome, web-app-on-desktop feel, VS Code's busyness.
- Dark mode is the default; light mode supported and well-tested.
- All typography in one tasteful sans + one mono. No exceptions.

### Keyboard-first

- Every action accessible via keyboard.
- Default keybindings inspired by Raycast (`Cmd+K`) and Linear (single-letter navigation in panels).
- All keybindings customizable.

### Reliability

- Crashing must not lose terminal state (tmux persistence handles this).
- Crashing must not lose unsaved spec docs (autosave on every keystroke, throttled).
- Crashing must not lose pending AI annotations (persist to SQLite as soon as parsed).

### Privacy

- No telemetry. Ever. Personal tool.
- API keys stored in macOS Keychain, never in plain text.
- AI calls go only to the provider the user configured. No middleware, no proxies.

---

## 8. Risks and open questions

### Technical risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Pierre libraries break or are abandoned | Medium | MIT-licensed, can fork. Fall back to Monaco if needed (cost: 1–2 weekends). |
| xterm.js performance ceiling on heavy logs | Low | Acceptable for my workload; if it fails, escalate to native terminal pane via cmux subprocess. |
| Tauri Rust↔JS bridge latency on frequent calls | Low | Batch operations; keep frequent calls in JS-land. |
| Claude Code / Codex hook APIs change | Medium | Adapter pattern isolates the blast radius to one file per agent. |
| tmux quirks on macOS (especially with IDE control sequences from Claude Code TUI) | Medium | Test early with real Claude Code session. May need tmux config tuning. |

### Scope risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Building this becomes more time than it saves | High | Phased rollout; v1 must be useful daily within 4 weekends or kill it. |
| Feature creep: every weekend adds three features | High | "One panel per weekend, one file per panel" rule; P2 features are explicitly deferred. |
| Pierre Computer Co. pivots or shuts down | Low | Libraries are already open source; no dependency on Pierre as a company. |
| I stop using it after 2 weeks | Medium | Build the features I will *definitely* use first (F3–F7). If I'm not using v1 daily, kill the project. |

### Open questions

- **Q1.** React or Svelte? Both are fine. Decision deferred to Phase 0 prototype — whichever feels less friction during the spike, ship. *(Resolved 2026-05-15: React. See DECISIONS.md.)*
- **Q2.** Where does spec.md live: `<worktree>/.deck/spec.md` gitignored, or `<repo>/.deck/specs/<branch>.md` committed? Probably gitignored by default with opt-in commit. Defer to first real use.
- **Q3.** How does Deck know an agent is "done" or "awaiting input"? Claude Code's hook system provides events; OpenCode similar; Codex less clear. May need a polling fallback for some agents.
- **Q4.** Should the chat panel (F5) reuse the same agent CLI sessions, or call APIs directly? Probably APIs directly for cleaner state, falling back to CLI invocation if needed.
- **Q5.** What's the actual name? "Deck" is a placeholder. Decide before any visible launch — even just to friends.

---

## 9. Phased roadmap

Each phase is gated. If a phase fails its acceptance criteria, the project is paused or killed rather than escalated.

### Phase 0 — Validation spike (1 weekend)

**Build:** A throwaway Vite app that renders one real diff from one of my actual repos using `@pierre/diffs`, with three hardcoded fake annotations from Pierre's annotation API. Plus a Tauri shell wrapping it.

**Gate:** Do the libraries feel good? Does Tauri startup feel acceptable? Does it look like Pierre's demo? If no on any: rethink stack before going further.

### Phase 1 — Substrate (2–3 weekends)

**Build:** F3 (Diff viewer), F7 (Command palette), enough Tauri+frontend scaffolding to host them. No terminals yet.

**Gate:** Can I review a real branch diff in Deck end-to-end (open app → pick refs → see diff → close), and does it feel as good or better than GitHub's diff view?

### Phase 2 — AI loop (2–3 weekends)

**Build:** F4 (AI-annotated diffs), F5 (talk to the diff), F6 (pre-PR self-review).

**Gate:** Am I reaching for Deck instead of GitHub for at least 50% of my reviews after one week of having this available?

### Phase 3 — Terminals (3–4 weekends)

**Build:** F2 (xterm.js + tmux), F1 (worktree management panel).

**Gate:** Do I start preferring Deck's terminals to Ghostty's for AI sessions? If no, the embedding wasn't worth it and we keep using cmux/Ghostty externally.

### Phase 4 — Power features (2–4 weekends, one feature at a time)

Each feature ships independently. Build in priority order of personal pain. Likely order: F9 (specs), F11 (commit messages), F10 (snapshots), F8 (multi-agent), F12 (context curation).

**Gate:** After each, am I using it weekly?

### Phase 5 — Future / maybe

P2 features only as needed.

### Total time estimate

P0 + Phase 1 + Phase 2: **5–7 weekends to first useful state.**
Through Phase 4: **15–20 weekends to feature-complete v1.**
Real-world wall time: **5–7 months** including life happening.

---

## 10. Glossary and dependencies

### External dependencies

| Name | Role | License | Risk |
|---|---|---|---|
| Tauri | App shell | MIT/Apache-2.0 | Low |
| Svelte or React | UI framework | MIT | Very low |
| `@pierre/diffs` | Diff rendering | MIT | Medium (young) |
| `@pierre/trees` | File tree | MIT | Medium (young) |
| Shiki | Syntax highlighting (used by Pierre) | MIT | Very low |
| xterm.js | Terminal rendering | MIT | Very low |
| tmux | Terminal multiplexer / session persistence | ISC | Very low |
| `cmdk` or `fuse.js` | Command palette fuzzy search | MIT | Very low |
| SQLite (via Tauri plugin or `rusqlite`) | Local structured storage | Public domain | Very low |
| `git2-rs` | Git operations from Rust | MIT/Apache-2.0 | Very low |
| `@octokit/*` | GitHub API client (for review queue, eventually) | MIT | Very low |
| Claude Code, Codex, OpenCode, Aider, Gemini CLI | AI agents (invoked, not depended on) | Varies | Low (replaceable) |

### Internal vocabulary

- **Worktree:** A git worktree at `<repo>/../wt/<repo>-<branch>`. The primary unit of work in Deck.
- **Panel:** A view in the main area of the UI. Examples: Diff, Worktrees, Specs, Inbox.
- **Adapter:** One file per supported AI agent that defines how Deck invokes it and parses its output.
- **Annotation:** A structured comment from an AI (or me) attached to a specific file + line range in a diff. Persisted per-worktree.
- **Session:** A tmux session tied to a worktree. Survives Deck restarts.

---

## Appendix A — What this PRD explicitly does *not* commit to

So that future-me reading this knows:

- No multi-user features, no team features, no auth. Ever.
- No mobile.
- No App Store distribution.
- No support obligations to anyone else.
- No SLA. The tool can break for a week if I'm busy.
- No commitment to all P1/P2 features. They are options, not promises.

If at any point this PRD starts to feel like a commitment that's no longer fun, the right move is to revise this PRD, not abandon the tool. The PRD serves me; not the other way around.

---

## Appendix B — Inspirations and prior art (honest credits)

- **Pierre.co / Pierre Computer Company** — the aesthetic, the focus on craft, the open-source libraries we depend on. Direct inspiration.
- **cmux** — the "primitive, not solution" philosophy. The hooks-and-CLI approach to agent integration.
- **Superset** — proved parallel worktree-based agent flows. We're doing it locally, without the subscription.
- **Cursor 2.0** — proved the multi-agent ensemble and parallel-attempt-pick-best pattern. We can implement it more flexibly.
- **Augment Code (Intent)** — the "living spec" idea (F9).
- **Linear** — the keyboard-first feel, the visual restraint.
- **Raycast** — the command palette as primary interface model.
- **VS Code** — the panel + side rail layout, xterm.js choice.

---

*End of PRD v0.1. To be revised after Phase 0 spike.*
