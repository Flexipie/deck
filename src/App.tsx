import { useRef } from "react";
import { ActivePanelProvider, useActivePanel } from "./contexts/ActivePanel";
import { WorktreeProvider } from "./contexts/Worktree";
import { PanelRail } from "./components/PanelRail";
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

function App() {
  return (
    <WorktreeProvider>
      <ActivePanelProvider>
        <main className="deck-shell">
          <PanelRail />
          <PanelArea />
        </main>
      </ActivePanelProvider>
    </WorktreeProvider>
  );
}

export default App;
