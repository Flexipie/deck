import { useMemo } from "react";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { diffText } from "./fixtures";
import "./styles.css";

function App() {
  const files = useMemo<FileDiffMetadata[]>(() => {
    const patches = parsePatchFiles(diffText);
    return patches.flatMap((p) => p.files);
  }, []);

  return (
    <div className="deck-spike">
      <header className="spike-header">
        <h1>Deck Spike</h1>
        <span className="spike-meta">
          PR #847 · Naiss-Ride/mobile-app · {files.length} files
        </span>
      </header>
      <main className="spike-main">
        {files.map((fileDiff, i) => (
          <FileDiff key={i} fileDiff={fileDiff} />
        ))}
      </main>
    </div>
  );
}

export default App;
