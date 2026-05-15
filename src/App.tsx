import { ActivePanelProvider, useActivePanel } from "./contexts/ActivePanel";
import { WorktreeProvider } from "./contexts/Worktree";
import { PanelRail } from "./components/PanelRail";
import "./styles.css";

function PanelArea() {
  const { activePanel } = useActivePanel();
  return (
    <section className="deck-panel-area">
      {activePanel === "diff" ? (
        <div className="deck-empty">Diff panel — wired in Step 6</div>
      ) : null}
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
