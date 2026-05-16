import { describe, expect, it } from "vitest";
import { CHAT_PROMPT, REVIEW_PROMPT, REVIEW_SCHEMA } from "./promptTemplates";

describe("REVIEW_PROMPT", () => {
  it("embeds the diff in a fenced code block", () => {
    const out = REVIEW_PROMPT("diff --git a/x b/x\n@@ -1 +1 @@\n-old\n+new\n");
    expect(out).toContain("```diff");
    expect(out).toContain("+new");
  });

  it("mentions all three severities", () => {
    const out = REVIEW_PROMPT("d");
    expect(out).toContain("blocker");
    expect(out).toContain("suggestion");
    expect(out).toContain("nit");
  });

  it("instructs use of additions/deletions for side", () => {
    const out = REVIEW_PROMPT("d");
    expect(out).toMatch(/additions/);
    expect(out).toMatch(/deletions/);
  });
});

describe("REVIEW_SCHEMA", () => {
  it("requires the annotations array", () => {
    expect((REVIEW_SCHEMA as any).required).toContain("annotations");
  });

  it("constrains severity to the three values", () => {
    const sevEnum = (REVIEW_SCHEMA as any).properties.annotations.items.properties.severity.enum;
    expect(sevEnum).toEqual(["blocker", "suggestion", "nit"]);
  });

  it("constrains side to additions|deletions", () => {
    const sideEnum = (REVIEW_SCHEMA as any).properties.annotations.items.properties.side.enum;
    expect(sideEnum).toEqual(["additions", "deletions"]);
  });
});

describe("CHAT_PROMPT", () => {
  const baseDiff = "diff --git a/a b/a\n+hello\n";

  it("includes the diff", () => {
    const out = CHAT_PROMPT({
      diff: baseDiff,
      selection: null,
      history: [],
      userMessage: "what is this?",
    });
    expect(out).toContain("```diff");
    expect(out).toContain("+hello");
    expect(out).toContain("what is this?");
  });

  it("includes selected-line snippet when selection is set", () => {
    const out = CHAT_PROMPT({
      diff: baseDiff,
      selection: {
        file: "src/a.ts",
        side: "additions",
        line: 42,
        snippet: "const x = unwrap();",
      },
      history: [],
      userMessage: "explain",
    });
    expect(out).toContain("src/a.ts");
    expect(out).toContain("line 42");
    expect(out).toContain("const x = unwrap();");
  });

  it("includes prior chat history", () => {
    const out = CHAT_PROMPT({
      diff: baseDiff,
      selection: null,
      history: [
        { role: "user", content: "is this safe?" },
        { role: "assistant", content: "mostly, but..." },
      ],
      userMessage: "what about the edge case",
    });
    expect(out).toContain("is this safe?");
    expect(out).toContain("mostly, but...");
    expect(out).toContain("what about the edge case");
  });

  it("returns a single string", () => {
    const out = CHAT_PROMPT({
      diff: baseDiff,
      selection: null,
      history: [],
      userMessage: "hi",
    });
    expect(typeof out).toBe("string");
  });
});
