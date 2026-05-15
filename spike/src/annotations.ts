import type { DiffLineAnnotation } from "@pierre/diffs";

export type AnnotationSeverity = "blocker" | "suggestion" | "nit";

export interface AnnotationMeta {
  id: string;
  severity: AnnotationSeverity;
  title: string;
  detail: string;
  suggestion?: string;
}

export const ANNOTATIONS: Record<string, DiffLineAnnotation<AnnotationMeta>[]> = {
  "packages/supabase/supabase/migrations/20260512140100_core_1995_cae_eligibility_rls.sql": [
    {
      side: "additions",
      lineNumber: 54,
      metadata: {
        id: "ann_001",
        severity: "blocker",
        title: "PII isolation hinges on a single equality check",
        detail:
          "This policy uses `user_id = auth.uid()` as the sole guard. If `user_id` ever becomes NULL (e.g. after GDPR erasure leaves a frozen audit row), this expression evaluates to NULL and the row is silently filtered out — confirm that's the desired fail-closed behavior, and document it next to the policy so future refactors don't widen access by accident.",
        suggestion:
          'USING ("user_id" IS NOT NULL AND "user_id" = (SELECT auth.uid()))',
      },
    },
  ],
  "packages/supabase/src/types/db.ts": [
    {
      side: "additions",
      lineNumber: 835,
      metadata: {
        id: "ann_002",
        severity: "suggestion",
        title: "Consider exporting a row-type alias",
        detail:
          "This table type is referenced from at least three call sites (queries, notifications, SDK adapters per the PR description). A short top-level alias would clean those up and survive future renames.",
        suggestion:
          "export type CAEEligibilityRow = Database['public']['Tables']['JourneyCAEEligibility']['Row'];",
      },
    },
  ],
  "packages/supabase/src/queries/notification/index.ts": [
    {
      side: "additions",
      lineNumber: 19,
      metadata: {
        id: "ann_003",
        severity: "nit",
        title: "Long single-line column list",
        detail:
          'As columns accrete, this string becomes a "diff worst case" — every new column changes one giant line. Consider a `["id", "date", ...].join(", ")` form so additions become single-line diffs.',
      },
    },
  ],
};
