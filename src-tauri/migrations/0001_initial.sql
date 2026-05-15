CREATE TABLE IF NOT EXISTS annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worktree_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('additions', 'deletions')),
    line_number INTEGER NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('blocker', 'suggestion', 'nit')),
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    suggestion TEXT,
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dismissed_at DATETIME
);

CREATE INDEX idx_annotations_worktree ON annotations(worktree_id);
CREATE INDEX idx_annotations_worktree_file ON annotations(worktree_id, file_path);
