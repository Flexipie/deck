import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { FileTree } from "@pierre/trees/react";
import { FileTree as FileTreeModel, themeToTreeStyles } from "@pierre/trees";
import { listBranches, getDiff } from "../lib/git";
import { useWorktree } from "../contexts/Worktree";
import { BranchPicker, type BranchPickerHandle } from "../components/BranchPicker";
import { usePanelCommands } from "../hooks/usePanelCommands";
import { useTheme } from "../contexts/Theme";
import {
  useAnnotations,
  type LineAnnotation,
  type AnnotationMeta,
} from "../hooks/useAnnotations";
import { AnnotationCard } from "../components/AnnotationCard";
import { ChatSidebar } from "../components/ChatSidebar";
import { REVIEW_DIFF_CHAR_CAP, buildReviewDiffString } from "../lib/aiReview";
import { selfReviewRefs } from "../lib/selfReview";
import type { ChatSelection, ChatTurn } from "../lib/promptTemplates";

export interface DiffPanelHandle {
  reload: () => void;
  openBasePicker: () => void;
  openHeadPicker: () => void;
  setRefsAndReview: (base: string, head: string) => Promise<void>;
}

interface Props {
  handleRef?: React.MutableRefObject<DiffPanelHandle | null>;
}

export function DiffPanel({ handleRef }: Props) {
  const { identity, worktreeId, loading: worktreeLoading, error: worktreeError } = useWorktree();
  const { mode: themeMode, resolved: themeResolved } = useTheme();
  const [branches, setBranches] = useState<string[]>([]);
  const [base, setBase] = useState<string>("");
  const [head, setHead] = useState<string>("");
  const [files, setFiles] = useState<FileDiffMetadata[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSelection, setChatSelection] = useState<ChatSelection | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [reviewElapsed, setReviewElapsed] = useState<number | null>(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const flashNotice = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(
      () => setNotice((current) => (current === msg ? null : current)),
      3000,
    );
  }, []);

  const basePickerRef = useRef<BranchPickerHandle | null>(null);
  const headPickerRef = useRef<BranchPickerHandle | null>(null);
  const fileRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const filesRef = useRef<FileDiffMetadata[]>([]);

  const annotations = useAnnotations(worktreeId);

  useEffect(() => {
    listBranches()
      .then(setBranches)
      .catch((e) => setDiffError(String(e)));
  }, []);

  useEffect(() => {
    if (!identity || base || head) return;
    setBase(identity.default_branch);
    setHead(identity.head_branch ?? identity.default_branch);
  }, [identity, base, head]);

  useEffect(() => {
    if (!base || !head) return;
    let cancelled = false;
    setDiffLoading(true);
    setDiffError(null);
    getDiff(base, head)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setFiles([]);
          filesRef.current = [];
          return;
        }
        const parsed = parsePatchFiles(raw);
        const flat = parsed.flatMap((p) => p.files);
        setFiles(flat);
        filesRef.current = flat;
      })
      .catch((e) => {
        if (!cancelled) setDiffError(String(e));
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [base, head, reloadToken]);

  useEffect(() => {
    if (annotations.reviewElapsedMs == null) return;
    setReviewElapsed(annotations.reviewElapsedMs);
  }, [annotations.reviewElapsedMs]);

  useEffect(() => {
    if (!annotations.reviewing) {
      setLiveElapsed(0);
      return;
    }
    const started = Date.now();
    const t = setInterval(() => setLiveElapsed(Date.now() - started), 250);
    return () => clearInterval(t);
  }, [annotations.reviewing]);

  const treeModel = useMemo(() => {
    const paths = files.map((f) => f.name);
    const model = new FileTreeModel({
      paths,
      initialExpansion: "open",
      onSelectionChange: (selected) => {
        const pick = selected[0];
        if (!pick) return;
        const el = fileRefs.current.get(pick);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      },
    });
    return model;
  }, [files]);
  useEffect(() => () => treeModel.unmount(), [treeModel]);

  const treeStyles = useMemo(
    () => themeToTreeStyles({ type: themeResolved }) as CSSProperties,
    [themeResolved],
  );

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const triggerReview = useCallback(async () => {
    const current = filesRef.current;
    console.log("[diffPanel] triggerReview", {
      base,
      head,
      fileCount: current.length,
      fileNames: current.map((f) => f.name),
    });
    if (worktreeId === "pending") {
      console.warn("[diffPanel] triggerReview aborted — repo identity not ready");
      flashNotice("Repo still loading — try again in a moment.");
      return;
    }
    if (current.length === 0) {
      console.warn("[diffPanel] triggerReview aborted — no files in diff");
      if (diffLoading) {
        flashNotice("Diff hasn't loaded yet — try again in a moment.");
      }
      return;
    }
    const diffStr = buildReviewDiffString(current);
    console.log("[diffPanel] built diff for review", {
      chars: diffStr.length,
      cap: REVIEW_DIFF_CHAR_CAP,
    });
    if (diffStr.length > REVIEW_DIFF_CHAR_CAP) {
      console.warn("[diffPanel] diff over cap", { chars: diffStr.length });
      setDiffError(
        `Diff too large for review (${diffStr.length} chars, cap ${REVIEW_DIFF_CHAR_CAP}). Review piecemeal.`,
      );
      return;
    }
    await annotations.runReview(current);
  }, [annotations, base, head, worktreeId, diffLoading, flashNotice]);

  const handleAsk = useCallback(
    ({
      meta,
      side,
      lineNumber,
    }: {
      meta: AnnotationMeta;
      side: "additions" | "deletions";
      lineNumber: number;
    }) => {
      setChatSelection({
        file: meta.filePath,
        side,
        line: lineNumber,
        snippet: meta.title,
      });
      setChatOpen(true);
    },
    [],
  );

  const setRefsAndReview = useCallback(
    async (nextBase: string, nextHead: string) => {
      setBase(nextBase);
      setHead(nextHead);
      // Wait for the next diff load — the effect above sets diffLoading.
      // We rerun review on the *next* file-population via an effect below.
      setPendingReviewAfterLoad(true);
    },
    [],
  );

  const [pendingReviewAfterLoad, setPendingReviewAfterLoad] = useState(false);
  useEffect(() => {
    if (!pendingReviewAfterLoad) return;
    if (diffLoading) return;
    setPendingReviewAfterLoad(false);
    console.log("[diffPanel] post-self-review load finished", {
      fileCount: files.length,
      fileNames: files.map((f) => f.name),
    });
    if (files.length === 0) {
      console.warn("[diffPanel] self-review: nothing to review (empty diff)");
      flashNotice("Nothing to review on this branch (HEAD matches the default branch).");
      return;
    }
    triggerReview().catch(() => {});
  }, [pendingReviewAfterLoad, diffLoading, files, triggerReview, flashNotice]);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      reload,
      openBasePicker: () => basePickerRef.current?.open(),
      openHeadPicker: () => headPickerRef.current?.open(),
      setRefsAndReview,
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, reload, setRefsAndReview]);

  const trace = useCallback(
    <Args extends unknown[], R>(
      id: string,
      fn: (...args: Args) => R,
    ): ((...args: Args) => R) => {
      return (...args: Args) => {
        console.log("[palette] execute", id);
        return fn(...args);
      };
    },
    [],
  );

  usePanelCommands("diff", [
    { id: "diff.reload", label: "Reload diff", execute: trace("diff.reload", reload) },
    {
      id: "diff.switchBase",
      label: "Switch base branch",
      execute: trace("diff.switchBase", () => basePickerRef.current?.open()),
    },
    {
      id: "diff.switchHead",
      label: "Switch head branch",
      execute: trace("diff.switchHead", () => headPickerRef.current?.open()),
    },
    {
      id: "diff.review",
      label: "Review this diff",
      execute: trace("diff.review", triggerReview),
    },
    {
      id: "diff.chat",
      label: chatOpen ? "Close chat" : "Open chat",
      execute: trace("diff.chat", () => setChatOpen((v) => !v)),
    },
    {
      id: "app.selfReview",
      label: "Self-review my branch",
      execute: trace("app.selfReview", async () => {
        if (!identity) {
          console.warn("[palette] app.selfReview: no identity yet");
          flashNotice("Repo still loading — try again in a moment.");
          return;
        }
        const refs = await selfReviewRefs(identity);
        console.log("[palette] app.selfReview refs", refs);
        await setRefsAndReview(refs.base, refs.head);
      }),
    },
  ]);

  const baseDiffOptions = useMemo(
    () => ({
      theme: { dark: "pierre-dark", light: "pierre-light" },
      themeType: themeMode,
      enableLineSelection: true,
    }) as const,
    [themeMode],
  );

  const renderAnnotation = useCallback(
    (annotation: LineAnnotation) => {
      const meta = annotation.metadata;
      if (!meta) return null;
      return (
        <AnnotationCard
          meta={meta}
          side={annotation.side}
          lineNumber={annotation.lineNumber}
          onAccept={(id) => void annotations.accept(id)}
          onDismiss={(id) => void annotations.dismiss(id)}
          onAsk={handleAsk}
        />
      );
    },
    [annotations, handleAsk],
  );

  if (worktreeLoading) {
    return <div className="deck-empty">Loading repo identity…</div>;
  }
  if (worktreeError) {
    return <div className="deck-error">Failed to load repo: {worktreeError}</div>;
  }

  return (
    <div className="deck-diff">
      <header className="deck-diff-toolbar">
        <BranchPicker
          ref={basePickerRef}
          label="base"
          value={base}
          options={branches}
          onChange={setBase}
        />
        <span className="deck-diff-arrow" aria-hidden="true">→</span>
        <BranchPicker
          ref={headPickerRef}
          label="head"
          value={head}
          options={branches}
          onChange={setHead}
        />
        <button
          type="button"
          className="deck-diff-action"
          onClick={triggerReview}
          disabled={annotations.reviewing || files.length === 0}
        >
          {annotations.reviewing ? "Reviewing…" : "Review"}
        </button>
        <button
          type="button"
          className="deck-diff-action"
          onClick={() => setChatOpen((v) => !v)}
          aria-pressed={chatOpen}
        >
          {chatOpen ? "Hide chat" : "Chat"}
        </button>
        <button type="button" className="deck-diff-reload" onClick={reload}>
          Reload
        </button>
        {diffLoading && <span className="deck-diff-status">Loading…</span>}
      </header>

      {notice && (
        <div className="deck-info-banner" role="status">
          {notice}
        </div>
      )}
      {annotations.reviewing && (
        <div className="deck-progress-banner" role="status">
          <span className="deck-spinner" aria-hidden="true" />
          <span>Reviewing diff… ({Math.floor(liveElapsed / 1000)}s)</span>
        </div>
      )}
      {annotations.reviewError && (
        <div className="deck-error-banner" role="alert">
          <div>Review error: {annotations.reviewError}</div>
          {annotations.lastRawResponse && (
            <details className="deck-raw-response">
              <summary>View raw claude response ({annotations.lastRawResponse.length} chars)</summary>
              <pre>{annotations.lastRawResponse}</pre>
            </details>
          )}
        </div>
      )}
      {!annotations.reviewing && reviewElapsed != null && !annotations.reviewError && (
        <div className="deck-info-banner">
          Review complete ({Math.round(reviewElapsed / 100) / 10}s).
          {annotations.lastSkipped > 0 && (
            <>
              {" "}Skipped {annotations.lastSkipped} invalid annotation
              {annotations.lastSkipped === 1 ? "" : "s"} — see console.
            </>
          )}
        </div>
      )}
      {diffError && (
        <div className="deck-error-banner" role="alert">
          {diffError}
        </div>
      )}

      <div className="deck-diff-body">
        <aside className="deck-diff-tree">
          <FileTree model={treeModel} style={treeStyles} />
        </aside>
        <main className="deck-diff-main">
          {diffLoading && files.length === 0 && (
            <div className="deck-empty">
              <span className="deck-spinner" aria-hidden="true" />
              <span>Loading diff…</span>
            </div>
          )}
          {!diffLoading && files.length === 0 && !diffError && (
            <div className="deck-empty">
              No changes between {base || "—"} and {head || "—"}.
            </div>
          )}
          {files.map((file) => {
            const fileAnnotations = annotations.byFile[file.name] ?? [];
            const perFileOptions = {
              ...baseDiffOptions,
              onLineSelected: (
                range: { start: number; end: number; side?: "additions" | "deletions" } | null,
              ) => {
                if (!range) {
                  setChatSelection(null);
                  return;
                }
                setChatSelection({
                  file: file.name,
                  side: range.side ?? "additions",
                  line: range.start,
                });
              },
            } as any;
            return (
              <div
                key={file.name}
                ref={(el) => {
                  fileRefs.current.set(file.name, el);
                }}
                className="deck-diff-file"
              >
                <FileDiff<AnnotationMeta>
                  fileDiff={file}
                  options={perFileOptions}
                  lineAnnotations={fileAnnotations}
                  renderAnnotation={renderAnnotation}
                />
              </div>
            );
          })}
        </main>
        <ChatSidebar
          open={chatOpen}
          files={files}
          selection={chatSelection}
          onClearSelection={() => setChatSelection(null)}
          onClose={() => setChatOpen(false)}
          sessionId={chatSessionId}
          onSessionId={setChatSessionId}
          history={chatHistory}
          onHistoryChange={setChatHistory}
          cwd={identity?.path ?? null}
        />
      </div>
    </div>
  );
}
