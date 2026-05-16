use git2::{BranchType, DiffFormat, DiffOptions, Repository};
use serde::Serialize;
use std::path::Path;

const PHASE1_REPO_PATH: &str = "/Users/flexipie/Desktop/Code/Projects/deck/Deck";

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("git error: {0}")]
    Git(#[from] git2::Error),
    #[error("ref not found: {0}")]
    RefNotFound(String),
    #[error("invalid utf-8 in diff output")]
    InvalidUtf8,
}

impl Serialize for GitError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

type Result<T> = std::result::Result<T, GitError>;

#[derive(Debug, Serialize)]
pub struct RepoIdentity {
    pub path: String,
    pub head_branch: Option<String>,
    pub default_branch: String,
}

fn open_repo() -> Result<Repository> {
    Ok(Repository::open(Path::new(PHASE1_REPO_PATH))?)
}

fn resolve_default_branch(repo: &Repository) -> String {
    if let Ok(reference) = repo.find_reference("refs/remotes/origin/HEAD") {
        if let Some(target) = reference.symbolic_target() {
            if let Some(name) = target.strip_prefix("refs/remotes/origin/") {
                return name.to_string();
            }
        }
    }
    for candidate in ["main", "master"] {
        if repo
            .find_branch(candidate, BranchType::Local)
            .is_ok()
        {
            return candidate.to_string();
        }
    }
    "main".to_string()
}

#[tauri::command]
pub fn repo_identity() -> Result<RepoIdentity> {
    let repo = open_repo()?;
    let head_branch = repo.head().ok().and_then(|h| {
        h.shorthand().map(|s| s.to_string())
    });
    let default_branch = resolve_default_branch(&repo);
    Ok(RepoIdentity {
        path: PHASE1_REPO_PATH.to_string(),
        head_branch,
        default_branch,
    })
}

#[tauri::command]
pub fn list_branches() -> Result<Vec<String>> {
    let repo = open_repo()?;
    let mut out = Vec::new();
    for branch in repo.branches(Some(BranchType::Local))? {
        let (b, _) = branch?;
        if let Some(name) = b.name()? {
            out.push(name.to_string());
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
pub fn list_worktrees() -> Result<Vec<String>> {
    let repo = open_repo()?;
    let names = repo.worktrees()?;
    let mut out: Vec<String> = names
        .iter()
        .filter_map(|n| n.map(|s| s.to_string()))
        .collect();
    if out.is_empty() {
        out.push("(main)".to_string());
    }
    Ok(out)
}

fn resolve_tree<'r>(repo: &'r Repository, refname: &str) -> Result<git2::Tree<'r>> {
    let obj = repo
        .revparse_single(refname)
        .map_err(|_| GitError::RefNotFound(refname.to_string()))?;
    let commit = obj
        .peel_to_commit()
        .map_err(|_| GitError::RefNotFound(refname.to_string()))?;
    Ok(commit.tree()?)
}

#[tauri::command]
pub fn merge_base(a: String, b: String) -> Result<String> {
    let repo = open_repo()?;
    let oid_a = repo
        .revparse_single(&a)
        .map_err(|_| GitError::RefNotFound(a.clone()))?
        .peel_to_commit()
        .map_err(|_| GitError::RefNotFound(a.clone()))?
        .id();
    let oid_b = repo
        .revparse_single(&b)
        .map_err(|_| GitError::RefNotFound(b.clone()))?
        .peel_to_commit()
        .map_err(|_| GitError::RefNotFound(b.clone()))?
        .id();
    let base = repo.merge_base(oid_a, oid_b)?;
    Ok(base.to_string())
}

#[tauri::command]
pub fn get_diff(base: String, head: String) -> Result<String> {
    let repo = open_repo()?;
    let tree_a = resolve_tree(&repo, &base)?;
    let tree_b = resolve_tree(&repo, &head)?;

    let mut opts = DiffOptions::new();
    opts.context_lines(3);

    let diff = repo.diff_tree_to_tree(Some(&tree_a), Some(&tree_b), Some(&mut opts))?;

    let mut buf: Vec<u8> = Vec::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        match line.origin() {
            'F' | 'H' => {}
            '+' | '-' | ' ' | '=' | '>' | '<' => buf.push(line.origin() as u8),
            _ => {}
        }
        buf.extend_from_slice(line.content());
        true
    })?;

    String::from_utf8(buf).map_err(|_| GitError::InvalidUtf8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diff_self_is_empty() {
        let result = get_diff("HEAD".to_string(), "HEAD".to_string()).unwrap();
        assert_eq!(result, "");
    }

    #[test]
    fn diff_has_unified_format_headers() {
        let result =
            get_diff("58e06eb".to_string(), "b07d69f".to_string()).expect("get_diff failed");
        assert!(result.contains("diff --git "), "missing diff --git header");
        assert!(result.contains("@@ "), "missing hunk header");
        assert!(
            result.contains("--- a/") || result.contains("--- /dev/null"),
            "missing minus header",
        );
        assert!(
            result.contains("+++ b/") || result.contains("+++ /dev/null"),
            "missing plus header",
        );
    }

    #[test]
    fn list_branches_returns_main() {
        let branches = list_branches().expect("list_branches failed");
        assert!(branches.contains(&"main".to_string()));
    }

    #[test]
    fn repo_identity_resolves_default_branch() {
        let id = repo_identity().expect("repo_identity failed");
        assert!(!id.default_branch.is_empty());
    }

    #[test]
    fn merge_base_main_head_returns_sha() {
        let sha = merge_base("main".to_string(), "HEAD".to_string()).expect("merge_base failed");
        assert_eq!(sha.len(), 40, "expected full 40-char sha, got {}", sha);
        assert!(sha.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn merge_base_head_with_self_returns_head() {
        let sha = merge_base("HEAD".to_string(), "HEAD".to_string()).expect("merge_base failed");
        let repo = open_repo().unwrap();
        let head_oid = repo.head().unwrap().peel_to_commit().unwrap().id();
        assert_eq!(sha, head_oid.to_string());
    }

    #[test]
    fn merge_base_unknown_ref_returns_ref_not_found() {
        let err = merge_base("nonexistent-zzz".to_string(), "HEAD".to_string())
            .expect_err("expected error");
        match err {
            GitError::RefNotFound(name) => assert_eq!(name, "nonexistent-zzz"),
            other => panic!("expected RefNotFound, got {:?}", other),
        }
    }
}
