import { useCallback, useMemo, useRef } from "react";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { diffText } from "./fixtures";
import "./styles.css";

function App() {
  const files = useMemo<FileDiffMetadata[]>(() => {
    const patches = parsePatchFiles(diffText);
    return patches.flatMap((p) => p.files);
  }, []);

  const paths = useMemo(() => files.map((f) => f.name), [files]);

  const gitStatus = useMemo(
    () => paths.map((path) => ({ path, status: "added" as const })),
    [paths],
  );

  const fileRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const handleSelectionChange = useCallback(
    (selected: readonly string[]) => {
      const path = selected[0];
      if (!path) return;
      const node = fileRefs.current.get(path);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [],
  );

  const { model } = useFileTree({
    paths,
    search: true,
    gitStatus,
    onSelectionChange: handleSelectionChange,
  });

  return (
    <div className="deck-spike">
      <header className="spike-header">
        <h1>Deck Spike</h1>
        <span className="spike-meta">
          PR #847 · Naiss-Ride/mobile-app · {files.length} files
        </span>
      </header>
      <div className="spike-body">
        <aside className="spike-sidebar">
          <FileTree model={model} />
        </aside>
        <main className="spike-main">
          {files.map((fileDiff) => (
            <div
              key={fileDiff.name}
              className="spike-file"
              ref={(el) => {
                fileRefs.current.set(fileDiff.name, el);
              }}
            >
              <FileDiff fileDiff={fileDiff} />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}

export default App;
