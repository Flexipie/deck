import { describe, expect, it } from "vitest";
import { NoJsonInResponseError, parseReviewResponse } from "./claude";

describe("parseReviewResponse", () => {
  it("returns [] for empty string", () => {
    expect(parseReviewResponse("")).toEqual([]);
    expect(parseReviewResponse("   ")).toEqual([]);
  });

  it("throws NoJsonInResponseError on pure prose", () => {
    expect(() => parseReviewResponse("Returned two suggestion-level findings: foo and bar."))
      .toThrow(NoJsonInResponseError);
  });

  it("extracts JSON from a fenced ```json block", () => {
    const raw = [
      "Here are my findings:",
      "",
      "```json",
      JSON.stringify({
        annotations: [
          {
            file: "src/a.ts",
            line: 1,
            side: "additions",
            severity: "blocker",
            title: "fenced",
            detail: "",
          },
        ],
      }),
      "```",
      "Hope that helps!",
    ].join("\n");
    const out = parseReviewResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("fenced");
  });

  it("extracts JSON embedded in prose via balanced-brace scan", () => {
    const raw = `I reviewed the diff. Here is the result: ${JSON.stringify({
      annotations: [
        {
          file: "src/a.ts",
          line: 2,
          side: "additions",
          severity: "suggestion",
          title: "embedded",
          detail: "",
        },
      ],
    })} — let me know if you have questions.`;
    const out = parseReviewResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("embedded");
  });

  it("handles braces inside JSON string values without confusing the scanner", () => {
    const raw = `prose { "nested": "looks like a {" } actual: ${JSON.stringify({
      annotations: [
        {
          file: "src/a.ts",
          line: 3,
          side: "additions",
          severity: "nit",
          title: "scan-resilient",
          detail: "",
        },
      ],
    })}`;
    const out = parseReviewResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("scan-resilient");
  });

  it("throws when annotations array is missing", () => {
    expect(() => parseReviewResponse(JSON.stringify({ foo: "bar" }))).toThrow(
      /annotations/,
    );
  });

  it("accepts top-level array form too", () => {
    const raw = JSON.stringify([
      {
        file: "src/x.ts",
        line: 12,
        side: "additions",
        severity: "blocker",
        title: "t",
        detail: "d",
      },
    ]);
    const out = parseReviewResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0].file).toBe("src/x.ts");
  });

  it("skips entries with missing required fields", () => {
    const raw = JSON.stringify({
      annotations: [
        { line: 1, side: "additions", severity: "nit", title: "missing file" },
        { file: "a.ts", side: "additions", severity: "nit", title: "missing line" },
        { file: "a.ts", line: 1, severity: "nit", title: "missing side" },
        { file: "a.ts", line: 1, side: "additions", severity: "nit" /* no title */ },
        { file: "a.ts", line: 1, side: "bogus", severity: "nit", title: "bad side" },
        {
          file: "a.ts",
          line: 1,
          side: "additions",
          severity: "blocker",
          title: "good",
          detail: "ok",
        },
      ],
    });
    const out = parseReviewResponse(raw);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("good");
  });

  it("coerces unknown severity to nit", () => {
    const raw = JSON.stringify({
      annotations: [
        {
          file: "a.ts",
          line: 1,
          side: "additions",
          severity: "critical",
          title: "weird sev",
          detail: "",
        },
      ],
    });
    const out = parseReviewResponse(raw);
    expect(out[0].severity).toBe("nit");
  });

  it("accepts a fully-valid payload", () => {
    const raw = JSON.stringify({
      annotations: [
        {
          file: "src/a.ts",
          line: 14,
          side: "additions",
          severity: "blocker",
          title: "unwrap on user input",
          detail: "this panics if the input is empty",
          suggestion: "use .ok_or(...)",
        },
        {
          file: "src/a.ts",
          line: 22,
          side: "deletions",
          severity: "suggestion",
          title: "consider keeping the previous comment",
          detail: "context for next reader",
        },
      ],
    });
    const out = parseReviewResponse(raw);
    expect(out).toHaveLength(2);
    expect(out[0].suggestion).toBe("use .ok_or(...)");
    expect(out[1].side).toBe("deletions");
    expect(out[1].suggestion).toBeUndefined();
  });
});
