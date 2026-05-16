import { mergeBase } from "./git";

export interface SelfReviewRefs {
  base: string;
  head: string;
}

export async function selfReviewRefs(
  identity: { default_branch: string },
  computeMergeBase: (a: string, b: string) => Promise<string> = mergeBase,
): Promise<SelfReviewRefs> {
  try {
    const sha = await computeMergeBase(identity.default_branch, "HEAD");
    return { base: sha, head: "HEAD" };
  } catch {
    return { base: identity.default_branch, head: "HEAD" };
  }
}
