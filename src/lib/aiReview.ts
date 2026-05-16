import type {
  ChangeContent,
  ContextContent,
  FileDiffMetadata,
  Hunk,
} from "@pierre/diffs";
import {
  parseReviewResponse,
  runClaude,
  type ReviewAnnotation,
} from "../adapters/claude";
import { REVIEW_PROMPT, REVIEW_SCHEMA, REVIEW_SYSTEM_PROMPT } from "./promptTemplates";
import { insertAnnotation, type AnnotationRow } from "./db";

export const REVIEW_DIFF_CHAR_CAP = 80_000;

export class DiffTooLargeError extends Error {
  constructor(public readonly chars: number) {
    super(`diff too large for review: ${chars} chars (cap ${REVIEW_DIFF_CHAR_CAP})`);
    this.name = "DiffTooLargeError";
  }
}

/**
 * Thrown when claude returned a response but we couldn't extract annotations
 * from it. Carries the raw text so the UI can show it without forcing the
 * user to open DevTools.
 */
export class ReviewParseError extends Error {
  constructor(public readonly raw: string, cause: unknown) {
    super(
      cause instanceof Error
        ? `couldn't extract annotations: ${cause.message}`
        : "couldn't extract annotations from claude response",
    );
    this.name = "ReviewParseError";
  }
}

export interface RunReviewResult {
  inserted: AnnotationRow[];
  skipped: number;
  durationMs: number | null;
  costUsd: number | null;
  rawResult: string | null;
}

export function buildReviewDiffString(files: FileDiffMetadata[]): string {
  return files.map(formatFileDiff).join("\n");
}

function formatFileDiff(file: FileDiffMetadata): string {
  const lines: string[] = [];
  lines.push(`diff --git a/${file.name} b/${file.name}`);
  lines.push(`--- a/${file.name}`);
  lines.push(`+++ b/${file.name}`);
  for (const hunk of file.hunks) {
    lines.push(
      `@@ -${hunk.deletionStart},${hunk.deletionCount} +${hunk.additionStart},${hunk.additionCount} @@`,
    );
    for (const block of hunk.hunkContent) {
      if (block.type === "context") {
        appendContext(lines, file, block);
      } else {
        appendChange(lines, file, block);
      }
    }
  }
  return lines.join("\n");
}

function appendContext(out: string[], file: FileDiffMetadata, block: ContextContent) {
  for (let i = 0; i < block.lines; i++) {
    const text = file.additionLines[block.additionLineIndex + i] ?? "";
    out.push(` ${text}`);
  }
}

function appendChange(out: string[], file: FileDiffMetadata, block: ChangeContent) {
  for (let i = 0; i < block.deletions; i++) {
    const text = file.deletionLines[block.deletionLineIndex + i] ?? "";
    out.push(`-${text}`);
  }
  for (let i = 0; i < block.additions; i++) {
    const text = file.additionLines[block.additionLineIndex + i] ?? "";
    out.push(`+${text}`);
  }
}

interface FileLineIndex {
  additions: Set<number>;
  deletions: Set<number>;
}

export function buildFileLineIndex(files: FileDiffMetadata[]): Map<string, FileLineIndex> {
  const index = new Map<string, FileLineIndex>();
  for (const file of files) {
    const entry: FileLineIndex = { additions: new Set(), deletions: new Set() };
    for (const hunk of file.hunks) {
      walkHunkLines(hunk, entry);
    }
    index.set(file.name, entry);
  }
  return index;
}

function walkHunkLines(hunk: Hunk, entry: FileLineIndex) {
  let newLine = hunk.additionStart;
  let oldLine = hunk.deletionStart;
  for (const block of hunk.hunkContent) {
    if (block.type === "context") {
      newLine += block.lines;
      oldLine += block.lines;
    } else {
      for (let i = 0; i < block.deletions; i++) {
        entry.deletions.add(oldLine);
        oldLine++;
      }
      for (let i = 0; i < block.additions; i++) {
        entry.additions.add(newLine);
        newLine++;
      }
    }
  }
}

export function validateAnnotation(
  annotation: ReviewAnnotation,
  index: Map<string, FileLineIndex>,
): boolean {
  const entry = index.get(annotation.file);
  if (!entry) return false;
  const set = annotation.side === "additions" ? entry.additions : entry.deletions;
  return set.has(annotation.line);
}

export interface RunReviewArgs {
  files: FileDiffMetadata[];
  worktreeId: string;
  invoke?: typeof runClaude;
  insert?: typeof insertAnnotation;
}

export async function runReview(args: RunReviewArgs): Promise<RunReviewResult> {
  const { files, worktreeId } = args;
  const invokeFn = args.invoke ?? runClaude;
  const insertFn = args.insert ?? insertAnnotation;

  console.log("[review] start", {
    worktreeId,
    fileCount: files.length,
    fileNames: files.map((f) => f.name),
  });

  const diff = buildReviewDiffString(files);
  console.log("[review] diff built", {
    chars: diff.length,
    cap: REVIEW_DIFF_CHAR_CAP,
    preview: diff.slice(0, 400),
  });
  if (diff.length > REVIEW_DIFF_CHAR_CAP) {
    console.warn("[review] diff over cap, aborting");
    throw new DiffTooLargeError(diff.length);
  }

  console.log("[review] invoking claude…");
  const response = await invokeFn({
    prompt: REVIEW_PROMPT(diff),
    jsonSchema: REVIEW_SCHEMA,
    appendSystemPrompt: REVIEW_SYSTEM_PROMPT,
  });
  console.log("[review] claude response", {
    ok: response.ok,
    error: response.error,
    durationMs: response.duration_ms,
    costUsd: response.total_cost_usd,
    sessionId: response.session_id,
    resultPreview: response.result ? response.result.slice(0, 800) : null,
    resultLength: response.result?.length ?? 0,
    rawPreview: response.raw ? response.raw.slice(0, 800) : "",
  });

  if (!response.ok) {
    console.error("[review] claude returned error envelope", response.error);
    throw new Error(response.error ?? "claude returned an error");
  }
  const raw = response.result ?? "";

  let parsed: ReviewAnnotation[];
  try {
    parsed = parseReviewResponse(raw);
  } catch (e) {
    console.error("[review] parseReviewResponse threw", e, { raw });
    throw new ReviewParseError(raw, e);
  }
  console.log("[review] parsed annotations", {
    count: parsed.length,
    items: parsed.map((a) => ({ file: a.file, line: a.line, side: a.side, severity: a.severity, title: a.title })),
  });

  const index = buildFileLineIndex(files);
  console.log(
    "[review] file/line index",
    [...index.entries()].map(([file, entry]) => ({
      file,
      additions: [...entry.additions].sort((a, b) => a - b),
      deletions: [...entry.deletions].sort((a, b) => a - b),
    })),
  );

  const inserted: AnnotationRow[] = [];
  let skipped = 0;
  for (const ann of parsed) {
    const entry = index.get(ann.file);
    if (!entry) {
      skipped++;
      console.warn("[review] skip: file not in diff index", {
        file: ann.file,
        knownFiles: [...index.keys()],
      });
      continue;
    }
    const set = ann.side === "additions" ? entry.additions : entry.deletions;
    if (!set.has(ann.line)) {
      skipped++;
      console.warn("[review] skip: line not in diff", {
        file: ann.file,
        line: ann.line,
        side: ann.side,
        availableLines: [...set].sort((a, b) => a - b),
      });
      continue;
    }
    const id = await insertFn({
      worktreeId,
      filePath: ann.file,
      side: ann.side,
      lineNumber: ann.line,
      severity: ann.severity,
      title: ann.title,
      detail: ann.detail,
      suggestion: ann.suggestion ?? null,
    });
    console.log("[review] inserted annotation", { id, file: ann.file, line: ann.line, severity: ann.severity });
    inserted.push({
      id,
      worktree_id: worktreeId,
      file_path: ann.file,
      side: ann.side,
      line_number: ann.line,
      severity: ann.severity,
      title: ann.title,
      detail: ann.detail,
      suggestion: ann.suggestion ?? null,
      metadata_json: null,
      created_at: new Date().toISOString(),
      dismissed_at: null,
      accepted_at: null,
    });
  }
  console.log("[review] done", {
    inserted: inserted.length,
    skipped,
    durationMs: response.duration_ms,
  });
  return {
    inserted,
    skipped,
    durationMs: response.duration_ms,
    costUsd: response.total_cost_usd,
    rawResult: raw,
  };
}
