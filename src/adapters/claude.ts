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
  /** Appended to claude's default system prompt via `--append-system-prompt`. */
  appendSystemPrompt?: string;
}

export async function runClaude(args: RunClaudeArgs): Promise<AgentResponse> {
  const promptPreview = args.prompt.slice(0, 300);
  console.log("[claude] invoke", {
    promptChars: args.prompt.length,
    promptPreview,
    hasSchema: args.jsonSchema != null,
    resumeSession: args.resumeSession ?? null,
    cwd: args.cwd ?? null,
    appendSystemPromptChars: args.appendSystemPrompt?.length ?? 0,
  });
  const t0 = performance.now();
  try {
    const response = await invoke<AgentResponse>("run_claude", {
      prompt: args.prompt,
      jsonSchema: args.jsonSchema ?? null,
      resumeSession: args.resumeSession ?? null,
      cwd: args.cwd ?? null,
      appendSystemPrompt: args.appendSystemPrompt ?? null,
    });
    console.log("[claude] response", {
      elapsedMs: Math.round(performance.now() - t0),
      ok: response.ok,
      hasResult: response.result != null,
      resultChars: response.result?.length ?? 0,
      sessionId: response.session_id,
      durationMs: response.duration_ms,
      costUsd: response.total_cost_usd,
      error: response.error,
    });
    return response;
  } catch (e) {
    console.error("[claude] invoke threw", e);
    throw e;
  }
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

export class NoJsonInResponseError extends Error {
  constructor(public readonly raw: string) {
    super("no JSON object found in claude response");
    this.name = "NoJsonInResponseError";
  }
}

/**
 * Try strict parse first, then strip ```json fences, then scan for a balanced
 * `{ ... }` block embedded in prose. Throws `NoJsonInResponseError` when none
 * of the strategies surface a parseable object.
 *
 * Lives here (not in promptTemplates) because it's tied to the agent's output
 * shape. The cascade exists because `--json-schema` doesn't constrain claude's
 * final assistant text when tools are available — claude narrates anyway.
 */
function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new NoJsonInResponseError(raw);

  // Strategy 1: strict parse of the whole string.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  // Strategy 2: strip markdown fences ```json … ``` or ``` … ```.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      /* fall through */
    }
  }

  // Strategy 3: balanced-brace scan. Walk the string, find every balanced
  // `{ ... }` block, JSON.parse each. Return the first that *looks like a
  // review payload* (has an `annotations` array). This avoids the case where
  // prose contains a small `{ "nested": "..." }` example before the real
  // payload. Respects string literals so braces inside JSON strings don't
  // confuse the count.
  let firstParsed: unknown = undefined;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = i; j < trimmed.length; j++) {
      const ch = trimmed[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = trimmed.slice(i, j + 1);
          try {
            const obj = JSON.parse(candidate);
            if (
              obj &&
              typeof obj === "object" &&
              Array.isArray((obj as { annotations?: unknown }).annotations)
            ) {
              return obj;
            }
            if (firstParsed === undefined) firstParsed = obj;
          } catch {
            /* not valid JSON — keep scanning */
          }
          break; // move past this `{` to look for the next one
        }
      }
    }
  }

  if (firstParsed !== undefined) return firstParsed;
  throw new NoJsonInResponseError(raw);
}

/**
 * Parse the `--json-schema`-constrained payload Claude returns inside the
 * envelope's `result` field. Skips entries with missing required fields.
 * Empty strings return `[]`. Pure prose throws `NoJsonInResponseError`.
 */
export function parseReviewResponse(raw: string): ReviewAnnotation[] {
  if (!raw || !raw.trim()) return [];
  const parsed = extractJsonObject(raw);
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
