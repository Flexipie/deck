import { describe, expect, it } from "vitest";
import {
  buildFileLineIndex,
  buildReviewDiffString,
  DiffTooLargeError,
  REVIEW_DIFF_CHAR_CAP,
  runReview,
  validateAnnotation,
} from "./aiReview";

/**
 * Hand-built Pierre FileDiffMetadata fixture.
 *
 * Diff layout for file `src/x.ts`:
 *   line 10:   ctx
 *   line 11:  -old
 *   line 11:  +new1
 *   line 12:  +new2
 */
function makeFile(name: string): any {
  return {
    name,
    type: "modify",
    isPartial: true,
    splitLineCount: 0,
    unifiedLineCount: 0,
    additionLines: ["ctx", "new1", "new2"],
    deletionLines: ["ctx", "old"],
    hunks: [
      {
        collapsedBefore: 0,
        additionStart: 10,
        additionCount: 3,
        additionLines: 2,
        additionLineIndex: 0,
        deletionStart: 10,
        deletionCount: 2,
        deletionLines: 1,
        deletionLineIndex: 0,
        splitLineStart: 0,
        splitLineCount: 0,
        unifiedLineStart: 0,
        unifiedLineCount: 0,
        noEOFCRDeletions: false,
        noEOFCRAdditions: false,
        hunkContent: [
          {
            type: "context",
            lines: 1,
            additionLineIndex: 0,
            deletionLineIndex: 0,
          },
          {
            type: "change",
            deletions: 1,
            deletionLineIndex: 1,
            additions: 2,
            additionLineIndex: 1,
          },
        ],
      },
    ],
  };
}

describe("buildFileLineIndex", () => {
  it("captures the correct add and del line numbers", () => {
    const idx = buildFileLineIndex([makeFile("src/x.ts")]);
    const entry = idx.get("src/x.ts")!;
    expect([...entry.additions].sort((a, b) => a - b)).toEqual([11, 12]);
    expect([...entry.deletions].sort((a, b) => a - b)).toEqual([11]);
  });
});

describe("validateAnnotation", () => {
  const idx = buildFileLineIndex([makeFile("src/x.ts")]);

  it("accepts a valid added line annotation", () => {
    expect(
      validateAnnotation(
        {
          file: "src/x.ts",
          line: 11,
          side: "additions",
          severity: "nit",
          title: "t",
          detail: "",
        },
        idx,
      ),
    ).toBe(true);
  });

  it("accepts a valid deleted line annotation", () => {
    expect(
      validateAnnotation(
        {
          file: "src/x.ts",
          line: 11,
          side: "deletions",
          severity: "nit",
          title: "t",
          detail: "",
        },
        idx,
      ),
    ).toBe(true);
  });

  it("rejects an unknown file", () => {
    expect(
      validateAnnotation(
        {
          file: "src/missing.ts",
          line: 11,
          side: "additions",
          severity: "nit",
          title: "t",
          detail: "",
        },
        idx,
      ),
    ).toBe(false);
  });

  it("rejects a line not present in the diff", () => {
    expect(
      validateAnnotation(
        {
          file: "src/x.ts",
          line: 99,
          side: "additions",
          severity: "nit",
          title: "t",
          detail: "",
        },
        idx,
      ),
    ).toBe(false);
  });
});

describe("buildReviewDiffString", () => {
  it("produces a unified-diff-shaped string", () => {
    const out = buildReviewDiffString([makeFile("src/x.ts")]);
    expect(out).toContain("diff --git a/src/x.ts b/src/x.ts");
    expect(out).toContain("@@ -10,2 +10,3 @@");
    expect(out).toContain(" ctx");
    expect(out).toContain("-old");
    expect(out).toContain("+new1");
    expect(out).toContain("+new2");
  });
});

describe("runReview", () => {
  const files = [makeFile("src/x.ts")];

  it("throws DiffTooLargeError above the cap", async () => {
    const huge: any = makeFile("src/huge.ts");
    huge.additionLines = ["x".repeat(REVIEW_DIFF_CHAR_CAP + 100)];
    await expect(
      runReview({
        files: [huge],
        worktreeId: "w1",
        invoke: async () => {
          throw new Error("should not be called");
        },
        insert: async () => 0,
      }),
    ).rejects.toBeInstanceOf(DiffTooLargeError);
  });

  it("inserts valid annotations and skips invalid ones", async () => {
    const inserts: any[] = [];
    const result = await runReview({
      files,
      worktreeId: "w1",
      invoke: async () => ({
        ok: true,
        result: JSON.stringify({
          annotations: [
            {
              file: "src/x.ts",
              line: 11,
              side: "additions",
              severity: "blocker",
              title: "ok",
              detail: "d",
            },
            {
              file: "src/x.ts",
              line: 999,
              side: "additions",
              severity: "nit",
              title: "bad line",
              detail: "",
            },
            {
              file: "src/other.ts",
              line: 11,
              side: "additions",
              severity: "nit",
              title: "wrong file",
              detail: "",
            },
          ],
        }),
        session_id: "s1",
        duration_ms: 100,
        total_cost_usd: 0,
        error: null,
        raw: "",
      }),
      insert: async (a) => {
        inserts.push(a);
        return inserts.length;
      },
    });
    expect(result.inserted).toHaveLength(1);
    expect(result.skipped).toBe(2);
    expect(inserts[0].filePath).toBe("src/x.ts");
    expect(inserts[0].lineNumber).toBe(11);
  });

  it("surfaces an error envelope as a thrown error", async () => {
    await expect(
      runReview({
        files,
        worktreeId: "w1",
        invoke: async () => ({
          ok: false,
          result: null,
          session_id: null,
          duration_ms: null,
          total_cost_usd: null,
          error: "boom",
          raw: "",
        }),
        insert: async () => 0,
      }),
    ).rejects.toThrow(/boom/);
  });
});
