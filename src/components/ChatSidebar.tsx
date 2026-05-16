import { useEffect, useRef, useState } from "react";
import type { FileDiffMetadata } from "@pierre/diffs";
import ReactMarkdown from "react-markdown";
import { runClaude } from "../adapters/claude";
import { CHAT_PROMPT, type ChatSelection, type ChatTurn } from "../lib/promptTemplates";
import { buildReviewDiffString } from "../lib/aiReview";

interface Props {
  open: boolean;
  files: FileDiffMetadata[];
  selection: ChatSelection | null;
  onClearSelection: () => void;
  onClose: () => void;
  sessionId: string | null;
  onSessionId: (id: string) => void;
  history: ChatTurn[];
  onHistoryChange: (history: ChatTurn[]) => void;
  /** Working directory passed to `claude -p` so its tools resolve to the repo. */
  cwd?: string | null;
}

export function ChatSidebar({
  open,
  files,
  selection,
  onClearSelection,
  onClose,
  sessionId,
  onSessionId,
  history,
  onHistoryChange,
  cwd,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [history, pending]);

  if (!open) return null;

  const send = async () => {
    const message = draft.trim();
    if (!message || pending) return;
    setDraft("");
    setError(null);
    const nextHistory: ChatTurn[] = [...history, { role: "user", content: message }];
    onHistoryChange(nextHistory);
    setPending(true);
    const diffString = buildReviewDiffString(files);
    console.log("[chat] send", {
      fileCount: files.length,
      diffChars: diffString.length,
      hasSession: !!sessionId,
      selection,
      historyLength: history.length,
      userMessage: message,
      cwd: cwd ?? null,
    });
    try {
      const prompt = sessionId
        ? message
        : CHAT_PROMPT({
            diff: diffString,
            selection,
            history,
            userMessage: message,
          });
      console.log("[chat] prompt built", {
        chars: prompt.length,
        preview: prompt.slice(0, 400),
      });
      const response = await runClaude({
        prompt,
        resumeSession: sessionId ?? undefined,
        cwd: cwd ?? undefined,
      });
      console.log("[chat] response", {
        ok: response.ok,
        sessionId: response.session_id,
        resultChars: response.result?.length ?? 0,
        resultPreview: response.result?.slice(0, 400) ?? null,
        error: response.error,
      });
      if (!response.ok) {
        throw new Error(response.error ?? "claude returned an error");
      }
      if (response.session_id && !sessionId) {
        onSessionId(response.session_id);
      }
      const assistantText = response.result ?? "(no response)";
      onHistoryChange([...nextHistory, { role: "assistant", content: assistantText }]);
    } catch (e) {
      console.error("[chat] send threw", e);
      setError(e instanceof Error ? e.message : String(e));
      onHistoryChange(nextHistory);
    } finally {
      setPending(false);
    }
  };

  return (
    <aside className="deck-chat-sidebar" aria-label="Chat">
      <header className="deck-chat-header">
        <span className="deck-chat-title">Ask</span>
        <button
          type="button"
          className="deck-chat-close"
          onClick={onClose}
          aria-label="Close chat"
        >
          ×
        </button>
      </header>
      {selection && (
        <div className="deck-chat-selection">
          <span>
            Selection: {selection.file} L{selection.line} ({selection.side})
          </span>
          <button
            type="button"
            className="deck-chat-clear"
            onClick={onClearSelection}
            aria-label="Clear selection"
          >
            ×
          </button>
        </div>
      )}
      <div ref={listRef} className="deck-chat-list">
        {history.length === 0 && !pending && (
          <div className="deck-chat-empty">
            Ask anything about the diff. {selection ? "The selected line is included as context." : "Select lines for line-specific context."}
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className={`deck-chat-msg deck-chat-${m.role}`}>
            <div className="deck-chat-role">{m.role === "user" ? "You" : "Claude"}</div>
            {m.role === "assistant" ? (
              <div className="deck-chat-content deck-chat-markdown">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              <div className="deck-chat-content">{m.content}</div>
            )}
          </div>
        ))}
        {pending && (
          <div className="deck-chat-msg deck-chat-assistant deck-chat-pending">
            <div className="deck-chat-role">Claude</div>
            <div className="deck-chat-content">
              <span className="deck-spinner" aria-hidden="true" /> Thinking…
            </div>
          </div>
        )}
      </div>
      {error && <div className="deck-error-banner" role="alert">{error}</div>}
      <form
        className="deck-chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          className="deck-chat-input"
          rows={2}
          placeholder="Ask Claude about this diff…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="submit"
          className="deck-chat-send"
          disabled={pending || draft.trim().length === 0}
        >
          Send
        </button>
      </form>
    </aside>
  );
}
