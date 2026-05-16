import { invoke } from "@tauri-apps/api/core";

export type ReviewSeverity = "blocker" | "suggestion" | "nit";
export type ReviewSide = "additions" | "deletions";

export interface ReviewAnnotation {
  file: string;
  line: number;
  side: ReviewSide;
  severity: ReviewSeverity;
  title: string;
  detail: string;
  suggestion?: string;
}

export interface AgentResponse {
  ok: boolean;
  result: string | null;
  session_id: string | null;
  duration_ms: number | null;
  total_cost_usd: number | null;
  error: string | null;
  raw: string;
}

export interface RunClaudeArgs {
  prompt: string;
  jsonSchema?: unknown;
  resumeSession?: string;
  cwd?: string;
}

export function runClaude(args: RunClaudeArgs): Promise<AgentResponse> {
  return invoke<AgentResponse>("run_claude", {
    prompt: args.prompt,
    jsonSchema: args.jsonSchema ?? null,
    resumeSession: args.resumeSession ?? null,
    cwd: args.cwd ?? null,
  });
}

const VALID_SIDES: ReviewSide[] = ["additions", "deletions"];
const VALID_SEVERITIES: ReviewSeverity[] = ["blocker", "suggestion", "nit"];

function coerceSeverity(raw: unknown): ReviewSeverity {
  if (typeof raw !== "string") return "nit";
  const lower = raw.toLowerCase();
  return (VALID_SEVERITIES as string[]).includes(lower)
    ? (lower as ReviewSeverity)
    : "nit";
}

/**
 * Parse the `--json-schema`-constrained payload Claude returns inside the
 * envelope's `result` field. Skips entries with missing required fields.
 */
export function parseReviewResponse(raw: string): ReviewAnnotation[] {
  if (!raw || !raw.trim()) return [];
  const parsed: unknown = JSON.parse(raw);
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { annotations?: unknown })?.annotations)
      ? (parsed as { annotations: unknown[] }).annotations
      : null;
  if (!list) {
    throw new Error("review payload missing `annotations` array");
  }
  const out: ReviewAnnotation[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const file = typeof e.file === "string" ? e.file : null;
    const line = typeof e.line === "number" ? e.line : null;
    const sideRaw = typeof e.side === "string" ? e.side : null;
    const title = typeof e.title === "string" ? e.title : null;
    if (!file || line == null || !sideRaw || !title) continue;
    const side = (VALID_SIDES as string[]).includes(sideRaw)
      ? (sideRaw as ReviewSide)
      : null;
    if (!side) continue;
    out.push({
      file,
      line,
      side,
      severity: coerceSeverity(e.severity),
      title,
      detail: typeof e.detail === "string" ? e.detail : "",
      suggestion: typeof e.suggestion === "string" ? e.suggestion : undefined,
    });
  }
  return out;
}
