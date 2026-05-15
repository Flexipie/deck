import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:deck.db";

let cached: Promise<Database> | null = null;

export function openDeckDb(): Promise<Database> {
  cached ??= Database.load(DB_URL);
  return cached;
}

export type AnnotationSide = "additions" | "deletions";
export type AnnotationSeverity = "blocker" | "suggestion" | "nit";

export interface AnnotationRow {
  id: number;
  worktree_id: string;
  file_path: string;
  side: AnnotationSide;
  line_number: number;
  severity: AnnotationSeverity;
  title: string;
  detail: string;
  suggestion: string | null;
  metadata_json: string | null;
  created_at: string;
  dismissed_at: string | null;
}

export interface NewAnnotation {
  worktreeId: string;
  filePath: string;
  side: AnnotationSide;
  lineNumber: number;
  severity: AnnotationSeverity;
  title: string;
  detail: string;
  suggestion?: string | null;
  metadataJson?: string | null;
}

export async function listAnnotations(
  worktreeId: string,
  filePath?: string,
): Promise<AnnotationRow[]> {
  const db = await openDeckDb();
  if (filePath) {
    return db.select<AnnotationRow[]>(
      "SELECT * FROM annotations WHERE worktree_id = $1 AND file_path = $2 AND dismissed_at IS NULL ORDER BY id",
      [worktreeId, filePath],
    );
  }
  return db.select<AnnotationRow[]>(
    "SELECT * FROM annotations WHERE worktree_id = $1 AND dismissed_at IS NULL ORDER BY id",
    [worktreeId],
  );
}

export async function insertAnnotation(a: NewAnnotation): Promise<number> {
  const db = await openDeckDb();
  const result = await db.execute(
    `INSERT INTO annotations
      (worktree_id, file_path, side, line_number, severity, title, detail, suggestion, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      a.worktreeId,
      a.filePath,
      a.side,
      a.lineNumber,
      a.severity,
      a.title,
      a.detail,
      a.suggestion ?? null,
      a.metadataJson ?? null,
    ],
  );
  return result.lastInsertId ?? 0;
}

export async function dismissAnnotation(id: number): Promise<void> {
  const db = await openDeckDb();
  await db.execute(
    "UPDATE annotations SET dismissed_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id],
  );
}
