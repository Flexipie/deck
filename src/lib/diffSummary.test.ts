import { describe, expect, it } from "vitest";
import { summarizeDiff } from "./diffSummary";

function makeFile(
  name: string,
  changes: Array<{ additions: number; deletions: number }>,
): any {
  return {
    name,
    type: "modify",
    isPartial: true,
    splitLineCount: 0,
    unifiedLineCount: 0,
    additionLines: [],
    deletionLines: [],
    hunks: [
      {
        collapsedBefore: 0,
        additionStart: 1,
        additionCount: 0,
        additionLines: changes.reduce((sum, c) => sum + c.additions, 0),
        additionLineIndex: 0,
        deletionStart: 1,
        deletionCount: 0,
        deletionLines: changes.reduce((sum, c) => sum + c.deletions, 0),
        deletionLineIndex: 0,
        splitLineStart: 0,
        splitLineCount: 0,
        unifiedLineStart: 0,
        unifiedLineCount: 0,
        noEOFCRDeletions: false,
        noEOFCRAdditions: false,
        hunkContent: changes.map((change) => ({
          type: "change",
          deletionLineIndex: 0,
          additionLineIndex: 0,
          deletions: change.deletions,
          additions: change.additions,
        })),
      },
    ],
  };
}

describe("summarizeDiff", () => {
  it("counts files, hunks, and line churn from Pierre file metadata", () => {
    const summary = summarizeDiff(
      [
        makeFile("src/App.tsx", [
          { additions: 3, deletions: 1 },
          { additions: 2, deletions: 0 },
        ]),
        makeFile("src/styles.css", [{ additions: 10, deletions: 4 }]),
      ],
      {},
    );

    expect(summary.filesChanged).toBe(2);
    expect(summary.hunksChanged).toBe(2);
    expect(summary.addedLines).toBe(15);
    expect(summary.deletedLines).toBe(5);
    expect(summary.netLines).toBe(10);
    expect(summary.largestFiles.map((f) => f.path)).toEqual([
      "src/styles.css",
      "src/App.tsx",
    ]);
  });

  it("summarizes active annotations by severity and annotated file", () => {
    const summary = summarizeDiff(
      [makeFile("src/App.tsx", [{ additions: 1, deletions: 0 }])],
      {
        "src/App.tsx": [
          { metadata: { severity: "blocker" } },
          { metadata: { severity: "suggestion" } },
          { metadata: { severity: "nit" } },
        ],
      },
    );

    expect(summary.annotations.total).toBe(3);
    expect(summary.annotations.blockers).toBe(1);
    expect(summary.annotations.suggestions).toBe(1);
    expect(summary.annotations.nits).toBe(1);
    expect(summary.annotations.filesWithAnnotations).toBe(1);
  });
});
