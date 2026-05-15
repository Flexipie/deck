import { invoke } from "@tauri-apps/api/core";

export interface RepoIdentity {
  path: string;
  head_branch: string | null;
  default_branch: string;
}

export const repoIdentity = () => invoke<RepoIdentity>("repo_identity");
export const listBranches = () => invoke<string[]>("list_branches");
export const listWorktrees = () => invoke<string[]>("list_worktrees");
export const getDiff = (base: string, head: string) =>
  invoke<string>("get_diff", { base, head });
