ALTER TABLE annotations ADD COLUMN accepted_at DATETIME;

CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worktree_id TEXT NOT NULL,
    base TEXT NOT NULL,
    head TEXT NOT NULL,
    claude_session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chats_worktree ON chats(worktree_id);
