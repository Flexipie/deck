import { useCallback, useMemo, useRef, useState } from "react";
import {
  parsePatchFiles,
  type DiffLineAnnotation,
  type FileDiffMetadata,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { diffText } from "./fixtures";
import { ANNOTATIONS, type AnnotationMeta } from "./annotations";
import "./styles.css";

const SEVERITY_GLYPHS: Record<AnnotationMeta["severity"], string> = {
  blocker: "●",
  suggestion: "◆",
  nit: "·",
};

function AnnotationCard({
  annotation,
}: {
  annotation: DiffLineAnnotation<AnnotationMeta>;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = annotation.metadata;
  const toggle = () => setExpanded((v) => !v);
  return (
    <div
      className={`annotation annotation--${meta.severity}${expanded ? " is-expanded" : ""}`}
      data-annotation-id={meta.id}
    >
      <button
        type="button"
        className="annotation__row annotation__toggle"
        aria-expanded={expanded}
        onClick={toggle}
      >
        <span className="annotation__glyph" aria-hidden="true">
          {SEVERITY_GLYPHS[meta.severity]}
        </span>
        <span className="annotation__severity">{meta.severity}</span>
        <span className="annotation__title">{meta.title}</span>
        <span className="annotation__chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="annotation__body">
          <p className="annotation__detail">{meta.detail}</p>
          {meta.suggestion && (
            <pre className="annotation__suggestion">
              <code>{meta.suggestion}</code>
            </pre>
          )}
          <div className="annotation__actions">
            <button type="button" className="annotation__action annotation__action--primary">
              Accept
            </button>
            <button type="button" className="annotation__action">
              Dismiss
            </button>
            <button type="button" className="annotation__action">
              Ask
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderAnnotation(
  annotation: DiffLineAnnotation<AnnotationMeta>,
) {
  return <AnnotationCard annotation={annotation} />;
}

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
              <FileDiff<AnnotationMeta>
                fileDiff={fileDiff}
                lineAnnotations={ANNOTATIONS[fileDiff.name] ?? []}
                renderAnnotation={renderAnnotation}
              />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}

export default App;
