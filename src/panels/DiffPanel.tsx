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
import { DiffOverviewHeader, DiffOverviewSidebar } from "../components/DiffOverview";
import { REVIEW_DIFF_CHAR_CAP, buildReviewDiffString } from "../lib/aiReview";
import { summarizeDiff } from "../lib/diffSummary";
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

  const diffSummary = useMemo(
    () => summarizeDiff(files, annotations.byFile),
    [files, annotations.byFile],
  );

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const triggerReview = useCallback(async () => {
    const current = filesRef.current;
    if (current.length === 0) return;
    const diffStr = buildReviewDiffString(current);
    if (diffStr.length > REVIEW_DIFF_CHAR_CAP) {
      setDiffError(
        `Diff too large for review (${diffStr.length} chars, cap ${REVIEW_DIFF_CHAR_CAP}). Review piecemeal.`,
      );
      return;
    }
    await annotations.runReview(current);
  }, [annotations]);

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
    if (files.length === 0) return;
    triggerReview().catch(() => {});
  }, [pendingReviewAfterLoad, diffLoading, files, triggerReview]);

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

  usePanelCommands("diff", [
    { id: "diff.reload", label: "Reload diff", execute: reload },
    {
      id: "diff.switchBase",
      label: "Switch base branch",
      execute: () => basePickerRef.current?.open(),
    },
    {
      id: "diff.switchHead",
      label: "Switch head branch",
      execute: () => headPickerRef.current?.open(),
    },
    { id: "diff.review", label: "Review this diff", execute: triggerReview },
    {
      id: "diff.chat",
      label: chatOpen ? "Close chat" : "Open chat",
      execute: () => setChatOpen((v) => !v),
    },
    {
      id: "app.selfReview",
      label: "Self-review my branch",
      execute: async () => {
        if (!identity) return;
        const refs = await selfReviewRefs(identity);
        await setRefsAndReview(refs.base, refs.head);
      },
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
        <DiffOverviewHeader
          summary={diffSummary}
          base={base}
          head={head}
          reviewing={annotations.reviewing}
          reviewElapsedMs={reviewElapsed}
          skippedAnnotations={annotations.lastSkipped}
        />
        <div className="deck-diff-controls">
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
            className="deck-diff-action deck-diff-action-primary"
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
        </div>
      </header>

      {annotations.reviewing && (
        <div className="deck-progress-banner" role="status">
          <span className="deck-spinner" aria-hidden="true" />
          <span>Reviewing diff… ({Math.floor(liveElapsed / 1000)}s)</span>
        </div>
      )}
      {annotations.reviewError && (
        <div className="deck-error-banner" role="alert">
          Review error: {annotations.reviewError}
        </div>
      )}
      {!annotations.reviewing && reviewElapsed != null && annotations.lastSkipped > 0 && !annotations.reviewError && (
        <div className="deck-info-banner">
          Skipped {annotations.lastSkipped} invalid annotation
          {annotations.lastSkipped === 1 ? "" : "s"} ({Math.round(reviewElapsed / 100) / 10}s).
        </div>
      )}
      {diffError && (
        <div className="deck-error-banner" role="alert">
          {diffError}
        </div>
      )}

      <div className="deck-diff-body">
        <aside className="deck-diff-tree">
          <DiffOverviewSidebar
            summary={diffSummary}
            base={base}
            head={head}
            reviewing={annotations.reviewing}
            reviewElapsedMs={reviewElapsed}
            skippedAnnotations={annotations.lastSkipped}
          />
          <div className="deck-diff-tree-list">
            <FileTree model={treeModel} style={treeStyles} />
          </div>
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
        />
      </div>
    </div>
  );
}
