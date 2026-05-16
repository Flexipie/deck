import { useCallback, useEffect, useMemo, useState } from "react";
import type { DiffLineAnnotation } from "@pierre/diffs";
import {
  acceptAnnotation,
  dismissAnnotation,
  listAnnotations,
  type AnnotationRow,
} from "../lib/db";
import { runReview as runReviewOrchestrator, ReviewParseError } from "../lib/aiReview";
import type { FileDiffMetadata } from "@pierre/diffs";

export interface AnnotationMeta {
  id: number;
  severity: AnnotationRow["severity"];
  title: string;
  detail: string;
  suggestion: string | null;
  filePath: string;
}

export type LineAnnotation = DiffLineAnnotation<AnnotationMeta>;

function rowToAnnotation(row: AnnotationRow): LineAnnotation {
  return {
    side: row.side,
    lineNumber: row.line_number,
    metadata: {
      id: row.id,
      severity: row.severity,
      title: row.title,
      detail: row.detail,
      suggestion: row.suggestion,
      filePath: row.file_path,
    },
  };
}

export interface AnnotationsByFile {
  [filePath: string]: LineAnnotation[];
}

export interface UseAnnotationsResult {
  byFile: AnnotationsByFile;
  reviewing: boolean;
  reviewError: string | null;
  /** Raw claude response, set when the parser couldn't extract annotations. */
  lastRawResponse: string | null;
  reviewElapsedMs: number | null;
  lastSkipped: number;
  runReview: (files: FileDiffMetadata[]) => Promise<void>;
  accept: (id: number) => Promise<void>;
  dismiss: (id: number) => Promise<void>;
  reload: () => Promise<void>;
}

export function useAnnotations(worktreeId: string): UseAnnotationsResult {
  const [rows, setRows] = useState<AnnotationRow[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [lastRawResponse, setLastRawResponse] = useState<string | null>(null);
  const [reviewElapsedMs, setReviewElapsedMs] = useState<number | null>(null);
  const [lastSkipped, setLastSkipped] = useState(0);

  const reload = useCallback(async () => {
    if (!worktreeId || worktreeId === "pending") return;
    const list = await listAnnotations(worktreeId);
    setRows(list);
  }, [worktreeId]);

  useEffect(() => {
    reload().catch((e) => setReviewError(String(e)));
  }, [reload]);

  const runReview = useCallback(
    async (files: FileDiffMetadata[]) => {
      if (!worktreeId || worktreeId === "pending") {
        console.warn("[useAnnotations] runReview skipped — no worktreeId");
        return;
      }
      console.log("[useAnnotations] runReview begin", {
        worktreeId,
        fileCount: files.length,
      });
      setReviewing(true);
      setReviewError(null);
      setLastRawResponse(null);
      setReviewElapsedMs(null);
      const started = performance.now();
      try {
        const result = await runReviewOrchestrator({ files, worktreeId });
        console.log("[useAnnotations] runReview result", {
          inserted: result.inserted.length,
          skipped: result.skipped,
          durationMs: result.durationMs,
        });
        setRows((prev) => [...prev, ...result.inserted]);
        setLastSkipped(result.skipped);
        setReviewElapsedMs(result.durationMs ?? Math.round(performance.now() - started));
      } catch (e) {
        console.error("[useAnnotations] runReview threw", e);
        setReviewError(e instanceof Error ? e.message : String(e));
        if (e instanceof ReviewParseError) {
          setLastRawResponse(e.raw);
        }
      } finally {
        setReviewing(false);
      }
    },
    [worktreeId],
  );

  const accept = useCallback(async (id: number) => {
    await acceptAnnotation(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const dismiss = useCallback(async (id: number) => {
    await dismissAnnotation(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const byFile = useMemo<AnnotationsByFile>(() => {
    const out: AnnotationsByFile = {};
    for (const row of rows) {
      (out[row.file_path] ??= []).push(rowToAnnotation(row));
    }
    return out;
  }, [rows]);

  return {
    byFile,
    reviewing,
    reviewError,
    lastRawResponse,
    reviewElapsedMs,
    lastSkipped,
    runReview,
    accept,
    dismiss,
    reload,
  };
}
