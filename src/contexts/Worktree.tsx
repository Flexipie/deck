import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { repoIdentity, type RepoIdentity } from "../lib/git";

interface WorktreeContextValue {
  worktreeId: string;
  repoPath: string | null;
  identity: RepoIdentity | null;
  loading: boolean;
  error: string | null;
}

const WorktreeContext = createContext<WorktreeContextValue | null>(null);

export function WorktreeProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<RepoIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    repoIdentity()
      .then((id) => {
        if (!cancelled) setIdentity(id);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const worktreeId = identity?.path ?? "pending";
  const repoPath = identity?.path ?? null;

  return (
    <WorktreeContext.Provider value={{ worktreeId, repoPath, identity, loading, error }}>
      {children}
    </WorktreeContext.Provider>
  );
}

export function useWorktree(): WorktreeContextValue {
  const ctx = useContext(WorktreeContext);
  if (!ctx) throw new Error("useWorktree must be inside <WorktreeProvider>");
  return ctx;
}
