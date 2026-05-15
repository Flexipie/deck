import diffText from "../fixtures/pr-847.diff?raw";

export { diffText };

export const ANNOTATED_FILES = {
  blocker: "packages/supabase/supabase/migrations/20260512140100_core_1995_cae_eligibility_rls.sql",
  suggestion: "packages/supabase/src/types/db.ts",
  nit: "packages/supabase/src/queries/notification/index.ts",
} as const;
