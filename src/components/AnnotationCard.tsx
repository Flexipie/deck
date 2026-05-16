import { useState } from "react";
import type { AnnotationMeta } from "../hooks/useAnnotations";

interface Props {
  meta: AnnotationMeta;
  side: "additions" | "deletions";
  lineNumber: number;
  onAccept: (id: number) => void;
  onDismiss: (id: number) => void;
  onAsk: (args: { meta: AnnotationMeta; side: "additions" | "deletions"; lineNumber: number }) => void;
}

const SEVERITY_LABEL: Record<AnnotationMeta["severity"], string> = {
  blocker: "Blocker",
  suggestion: "Suggestion",
  nit: "Nit",
};

export function AnnotationCard({ meta, side, lineNumber, onAccept, onDismiss, onAsk }: Props) {
  const [expanded, setExpanded] = useState(meta.severity === "blocker");

  return (
    <div className={`deck-annotation deck-annotation-${meta.severity}`}>
      <button
        type="button"
        className="deck-annotation-summary"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="deck-annotation-stripe" aria-hidden="true" />
        <span className="deck-annotation-sev">{SEVERITY_LABEL[meta.severity]}</span>
        <span className="deck-annotation-title">{meta.title}</span>
        <span className="deck-annotation-toggle" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="deck-annotation-body">
          {meta.detail && <p className="deck-annotation-detail">{meta.detail}</p>}
          {meta.suggestion && (
            <pre className="deck-annotation-suggestion">
              <code>{meta.suggestion}</code>
            </pre>
          )}
          <div className="deck-annotation-actions">
            <button
              type="button"
              className="deck-annotation-btn deck-annotation-accept"
              onClick={() => onAccept(meta.id)}
            >
              Accept
            </button>
            <button
              type="button"
              className="deck-annotation-btn deck-annotation-dismiss"
              onClick={() => onDismiss(meta.id)}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="deck-annotation-btn deck-annotation-ask"
              onClick={() => onAsk({ meta, side, lineNumber })}
            >
              Ask
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
