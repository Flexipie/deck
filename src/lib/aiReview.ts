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
import { REVIEW_PROMPT, REVIEW_SCHEMA } from "./promptTemplates";
import { insertAnnotation, type AnnotationRow } from "./db";

export const REVIEW_DIFF_CHAR_CAP = 80_000;

export class DiffTooLargeError extends Error {
  constructor(public readonly chars: number) {
    super(`diff too large for review: ${chars} chars (cap ${REVIEW_DIFF_CHAR_CAP})`);
    this.name = "DiffTooLargeError";
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

  const diff = buildReviewDiffString(files);
  if (diff.length > REVIEW_DIFF_CHAR_CAP) {
    throw new DiffTooLargeError(diff.length);
  }

  const response = await invokeFn({
    prompt: REVIEW_PROMPT(diff),
    jsonSchema: REVIEW_SCHEMA,
  });

  if (!response.ok) {
    throw new Error(response.error ?? "claude returned an error");
  }
  const raw = response.result ?? "";
  const parsed = parseReviewResponse(raw);
  const index = buildFileLineIndex(files);

  const inserted: AnnotationRow[] = [];
  let skipped = 0;
  for (const ann of parsed) {
    if (!validateAnnotation(ann, index)) {
      skipped++;
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
  return {
    inserted,
    skipped,
    durationMs: response.duration_ms,
    costUsd: response.total_cost_usd,
    rawResult: raw,
  };
}
