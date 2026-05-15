import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { FileTree } from "@pierre/trees/react";
import { FileTree as FileTreeModel } from "@pierre/trees";
import { listBranches, getDiff } from "../lib/git";
import { useWorktree } from "../contexts/Worktree";
import { BranchPicker, type BranchPickerHandle } from "../components/BranchPicker";
import { usePanelCommands } from "../hooks/usePanelCommands";

const DIFF_OPTIONS = {
  theme: { dark: "pierre-dark", light: "pierre-light" },
  themeType: "system",
} as const;

export interface DiffPanelHandle {
  reload: () => void;
  openBasePicker: () => void;
  openHeadPicker: () => void;
}

interface Props {
  handleRef?: React.MutableRefObject<DiffPanelHandle | null>;
}

export function DiffPanel({ handleRef }: Props) {
  const { identity, loading: worktreeLoading, error: worktreeError } = useWorktree();
  const [branches, setBranches] = useState<string[]>([]);
  const [base, setBase] = useState<string>("");
  const [head, setHead] = useState<string>("");
  const [files, setFiles] = useState<FileDiffMetadata[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const basePickerRef = useRef<BranchPickerHandle | null>(null);
  const headPickerRef = useRef<BranchPickerHandle | null>(null);
  const fileRefs = useRef<Map<string, HTMLElement | null>>(new Map());

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
          return;
        }
        const parsed = parsePatchFiles(raw);
        const flat = parsed.flatMap((p) => p.files);
        setFiles(flat);
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

  const treeModel = useMemo(() => {
    const paths = files.map((f) => f.name);
    const model = new FileTreeModel({
      paths,
      initialExpansion: "open",
      onSelectionChange: (selected) => {
        const pick = selected[0];
        if (!pick) return;
        const el = fileRefs.current.get(pick);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      },
    });
    return model;
  }, [files]);

  useEffect(() => {
    return () => treeModel.unmount();
  }, [treeModel]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      reload,
      openBasePicker: () => basePickerRef.current?.open(),
      openHeadPicker: () => headPickerRef.current?.open(),
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, reload]);

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
  ]);

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
        <button type="button" className="deck-diff-reload" onClick={reload}>
          Reload
        </button>
        {diffLoading && <span className="deck-diff-status">Loading…</span>}
      </header>

      {diffError && (
        <div className="deck-error-banner" role="alert">
          {diffError}
        </div>
      )}

      <div className="deck-diff-body">
        <aside className="deck-diff-tree">
          <FileTree model={treeModel} />
        </aside>
        <main className="deck-diff-main">
          {!diffLoading && files.length === 0 && !diffError && (
            <div className="deck-empty">
              No changes between {base || "—"} and {head || "—"}.
            </div>
          )}
          {files.map((file) => (
            <div
              key={file.name}
              ref={(el) => {
                fileRefs.current.set(file.name, el);
              }}
              className="deck-diff-file"
            >
              <FileDiff fileDiff={file} options={DIFF_OPTIONS} />
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}
