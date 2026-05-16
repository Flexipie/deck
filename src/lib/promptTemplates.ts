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

export function REVIEW_PROMPT(diff: string): string {
  return `You are reviewing a git diff. Return findings as JSON matching the provided schema.

Severity rubric:
- "blocker": definite bug, security issue, data loss, breaking change, or invariant violation. The diff should not land as-is.
- "suggestion": meaningful improvement — correctness risk, missing edge case, unclear naming, or a cleaner approach.
- "nit": minor style or polish. Use sparingly.

Rules:
- Only annotate lines that are actually part of the diff. Use \`side: "additions"\` for added (+) lines and \`side: "deletions"\` for removed (-) lines. The \`line\` is the new-side line number for additions and the old-side line number for deletions.
- \`file\` must match a path that appears in the diff exactly (no leading "a/" or "b/").
- Skip noise. If a hunk looks fine, don't fabricate a nit.
- Keep \`title\` short (under 80 chars). Put reasoning in \`detail\`. Include a concrete \`suggestion\` only when you can name the replacement.

Diff:

\`\`\`diff
${diff}
\`\`\``;
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
