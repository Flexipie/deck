import { useRef } from "react";
import { ActivePanelProvider, useActivePanel } from "./contexts/ActivePanel";
import { WorktreeProvider } from "./contexts/Worktree";
import {
  CommandRegistryProvider,
  useRegisterCommands,
} from "./contexts/CommandRegistry";
import { PanelRail } from "./components/PanelRail";
import { CommandPalette } from "./components/CommandPalette";
import { DiffPanel, type DiffPanelHandle } from "./panels/DiffPanel";
import "./styles.css";

function PanelArea() {
  const { activePanel } = useActivePanel();
  const diffHandle = useRef<DiffPanelHandle | null>(null);
  return (
    <section className="deck-panel-area">
      {activePanel === "diff" ? <DiffPanel handleRef={diffHandle} /> : null}
    </section>
  );
}

function GlobalCommands() {
  useRegisterCommands("global", [
    {
      id: "palette.open",
      label: "Open command palette",
      hint: "⌘K",
      scope: "global",
      execute: () => {
        // No-op; the palette opens by keyboard. Listed here as proof-of-concept.
      },
    },
    {
      id: "app.toggleTheme",
      label: "Toggle theme (light/dark/system)",
      scope: "global",
      execute: () => {
        const root = document.documentElement;
        const current = root.dataset.theme ?? "system";
        const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
        root.dataset.theme = next;
        if (next === "light") root.style.colorScheme = "light";
        else if (next === "dark") root.style.colorScheme = "dark";
        else root.style.colorScheme = "light dark";
      },
    },
  ]);
  return null;
}

function App() {
  return (
    <WorktreeProvider>
      <ActivePanelProvider>
        <CommandRegistryProvider>
          <GlobalCommands />
          <main className="deck-shell">
            <PanelRail />
            <PanelArea />
          </main>
          <CommandPalette />
        </CommandRegistryProvider>
      </ActivePanelProvider>
    </WorktreeProvider>
  );
}

export default App;
