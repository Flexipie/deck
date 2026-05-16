export const REVIEW_SCHEMA = {
  type: "object",
  required: ["annotations"],
  additionalProperties: false,
  properties: {
    annotations: {
      type: "array",
      items: {
        type: "object",
        required: ["file", "line", "side", "severity", "title", "detail"],
        additionalProperties: false,
        properties: {
          file: { type: "string" },
          line: { type: "integer", minimum: 1 },
          side: { type: "string", enum: ["additions", "deletions"] },
          severity: {
            type: "string",
            enum: ["blocker", "suggestion", "nit"],
          },
          title: { type: "string", maxLength: 120 },
          detail: { type: "string" },
          suggestion: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Appended to claude's default system prompt. System-prompt instructions
 * are stickier than user-prompt ones — claude treats them as standing rules
 * across all turns, including the final one after tool use.
 */
export const REVIEW_SYSTEM_PROMPT = `You are operating as a code-review agent for a diff viewer called Deck.

You MAY use tools (Read, Grep, Glob, etc.) to gather context if it helps you understand the change — caller intent, surrounding patterns, related call sites, type definitions.

Your task is to PRODUCE A JSON REPORT, not to fix anything or take other actions. The output is the goal, not a side effect.

Hard rules about your FINAL assistant message:
- It MUST contain exactly one JSON object matching the schema the user provides.
- It MUST contain nothing else — no prose, no "I reviewed the diff", no markdown fences, no tool calls.
- If you have nothing to flag, your final message is still a JSON object: \`{"annotations": []}\`.
- After any tool use turn, the very next turn MUST be your final JSON message. Do not end on a tool call.

Severity rubric:
- "blocker": definite bug, security issue, data loss, breaking change, or invariant violation.
- "suggestion": meaningful improvement — correctness risk, missing edge case, unclear naming.
- "nit": minor style or polish. Use sparingly.

Line-numbering rules:
- "additions" side uses the new-file line number (the line as it appears in the diff with a \`+\` prefix).
- "deletions" side uses the old-file line number (\`-\` prefix).
- Only annotate lines that appear with \`+\` or \`-\` in the diff. Do not annotate context lines.
- The \`file\` field must match the file path in the diff exactly, without any \`a/\` or \`b/\` prefix.`;

export function REVIEW_PROMPT(diff: string): string {
  return `Output a single JSON object and nothing else. No prose. No narration. No "I found N findings". No markdown code fences. No leading or trailing text. The JSON object is your entire response.

Required shape:
{"annotations": [
  {
    "file": "<path matching the diff, no a/ or b/ prefix>",
    "line": <integer line number>,
    "side": "additions" | "deletions",
    "severity": "blocker" | "suggestion" | "nit",
    "title": "<short, under 80 chars>",
    "detail": "<reasoning>",
    "suggestion": "<optional concrete replacement>"
  }
]}

Severity rubric:
- "blocker": definite bug, security issue, data loss, breaking change, or invariant violation. The diff should not land as-is.
- "suggestion": meaningful improvement — correctness risk, missing edge case, unclear naming, or a cleaner approach.
- "nit": minor style or polish. Use sparingly.

Line-numbering rules:
- "additions" lines (prefixed \`+\` in the diff) use the new-file line number.
- "deletions" lines (prefixed \`-\` in the diff) use the old-file line number.
- Only annotate lines that are actually present in the diff. Do not annotate context lines.
- Skip noise. If a hunk looks fine, do not fabricate a nit — return an empty annotations array.

Example response for a small clean diff:
{"annotations": []}

Example response with findings:
{"annotations": [{"file": "src/x.ts", "line": 12, "side": "additions", "severity": "suggestion", "title": "unwrap() on possibly-empty input", "detail": "If the caller passes an empty slice this panics. Phase-2 paths exercise this on user input.", "suggestion": "use .ok_or(...)? to propagate"}]}

Diff to review:

\`\`\`diff
${diff}
\`\`\`

Reminder: begin your response with \`{\` and end with \`}\`. Nothing before, nothing after.`;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSelection {
  file: string;
  side: "additions" | "deletions";
  line: number;
  snippet?: string;
}

export function CHAT_PROMPT(args: {
  diff: string;
  selection: ChatSelection | null;
  history: ChatTurn[];
  userMessage: string;
}): string {
  const { diff, selection, history, userMessage } = args;
  const parts: string[] = [];
  parts.push(
    "You are helping the user understand a git diff currently open in their reviewer. Be concrete and short — reference specific files and lines.",
  );
  if (diff) {
    parts.push(`Current diff:\n\n\`\`\`diff\n${diff}\n\`\`\``);
  }
  if (selection) {
    const snippet = selection.snippet ? `\nLine content: \`${selection.snippet}\`` : "";
    parts.push(
      `Selected: ${selection.file} line ${selection.line} (${selection.side}).${snippet}`,
    );
  }
  if (history.length > 0) {
    const transcript = history
      .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
      .join("\n\n");
    parts.push(`Conversation so far:\n\n${transcript}`);
  }
  parts.push(`User: ${userMessage}`);
  return parts.join("\n\n");
}
