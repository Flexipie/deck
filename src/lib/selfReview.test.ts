import { describe, expect, it } from "vitest";
import { selfReviewRefs } from "./selfReview";

describe("selfReviewRefs", () => {
  it("returns merge-base sha and HEAD on success", async () => {
    const refs = await selfReviewRefs(
      { default_branch: "main" },
      async () => "abc123",
    );
    expect(refs).toEqual({ base: "abc123", head: "HEAD" });
  });

  it("falls back to default branch when merge_base fails", async () => {
    const refs = await selfReviewRefs(
      { default_branch: "main" },
      async () => {
        throw new Error("oops");
      },
    );
    expect(refs).toEqual({ base: "main", head: "HEAD" });
  });
});
