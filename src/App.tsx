import { useRef } from "react";
import { ActivePanelProvider, useActivePanel } from "./contexts/ActivePanel";
import { WorktreeProvider } from "./contexts/Worktree";
import { ThemeProvider, useTheme } from "./contexts/Theme";
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
  const { mode, setMode, cycle } = useTheme();
  useRegisterCommands("global", [
    {
      id: "palette.open",
      label: "Open command palette",
      hint: "⌘K",
      scope: "global",
      execute: () => {},
    },
    {
      id: "app.toggleTheme",
      label: `Toggle theme (current: ${mode})`,
      scope: "global",
      execute: cycle,
    },
    { id: "app.theme.light", label: "Theme: light", scope: "global", execute: () => setMode("light") },
    { id: "app.theme.dark", label: "Theme: dark", scope: "global", execute: () => setMode("dark") },
    { id: "app.theme.system", label: "Theme: system", scope: "global", execute: () => setMode("system") },
  ]);
  return null;
}

function App() {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}

export default App;
