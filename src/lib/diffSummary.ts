import type { FileDiffMetadata } from "@pierre/diffs";

type AnnotationSeverity = "blocker" | "suggestion" | "nit";

interface AnnotationLike {
  metadata?: {
    severity?: AnnotationSeverity;
  } | null;
}

export interface DiffFileSummary {
  path: string;
  added: number;
  deleted: number;
  total: number;
}

export interface DiffSummary {
  filesChanged: number;
  hunksChanged: number;
  addedLines: number;
  deletedLines: number;
  netLines: number;
  largestFiles: DiffFileSummary[];
  annotations: {
    total: number;
    blockers: number;
    suggestions: number;
    nits: number;
    filesWithAnnotations: number;
  };
}

export function summarizeDiff(
  files: FileDiffMetadata[],
  annotationsByFile: Record<string, AnnotationLike[]>,
): DiffSummary {
  let hunksChanged = 0;
  let addedLines = 0;
  let deletedLines = 0;

  const fileSummaries = files.map((file) => {
    const fileCounts = countFileChurn(file);
    hunksChanged += file.hunks.length;
    addedLines += fileCounts.added;
    deletedLines += fileCounts.deleted;
    return {
      path: file.name,
      added: fileCounts.added,
      deleted: fileCounts.deleted,
      total: fileCounts.added + fileCounts.deleted,
    };
  });

  const annotations = countAnnotations(annotationsByFile);

  return {
    filesChanged: files.length,
    hunksChanged,
    addedLines,
    deletedLines,
    netLines: addedLines - deletedLines,
    largestFiles: fileSummaries
      .filter((file) => file.total > 0)
      .sort((a, b) => b.total - a.total || a.path.localeCompare(b.path))
      .slice(0, 3),
    annotations,
  };
}

function countFileChurn(file: FileDiffMetadata): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const hunk of file.hunks) {
    for (const block of hunk.hunkContent) {
      if (block.type !== "change") continue;
      added += block.additions;
      deleted += block.deletions;
    }
  }
  return { added, deleted };
}

function countAnnotations(annotationsByFile: Record<string, AnnotationLike[]>): DiffSummary["annotations"] {
  let total = 0;
  let blockers = 0;
  let suggestions = 0;
  let nits = 0;
  let filesWithAnnotations = 0;

  for (const annotations of Object.values(annotationsByFile)) {
    if (annotations.length > 0) filesWithAnnotations++;
    for (const annotation of annotations) {
      total++;
      switch (annotation.metadata?.severity) {
        case "blocker":
          blockers++;
          break;
        case "suggestion":
          suggestions++;
          break;
        case "nit":
          nits++;
          break;
      }
    }
  }

  return { total, blockers, suggestions, nits, filesWithAnnotations };
}
