mod agent;
mod git;

use tauri_plugin_sql::{Migration, MigrationKind};

pub const MIGRATION_0001: &str = include_str!("../migrations/0001_initial.sql");
pub const MIGRATION_0002: &str = include_str!("../migrations/0002_review_state.sql");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create annotations table",
            sql: MIGRATION_0001,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "review state: accepted_at + chats table",
            sql: MIGRATION_0002,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:deck.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            git::repo_identity,
            git::list_branches,
            git::list_worktrees,
            git::get_diff,
            git::merge_base,
            agent::run_claude,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod migration_tests {
    use super::{MIGRATION_0001, MIGRATION_0002};
    use rusqlite::Connection;

    fn apply_migrations() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(MIGRATION_0001).expect("apply 0001");
        conn.execute_batch(MIGRATION_0002).expect("apply 0002");
        conn
    }

    fn column_names(conn: &Connection, table: &str) -> Vec<String> {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({})", table))
            .expect("pragma");
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query");
        rows.map(|r| r.unwrap()).collect()
    }

    #[test]
    fn migrations_apply_cleanly() {
        let _conn = apply_migrations();
    }

    #[test]
    fn annotations_has_accepted_at_column() {
        let conn = apply_migrations();
        let cols = column_names(&conn, "annotations");
        assert!(cols.iter().any(|c| c == "accepted_at"), "cols: {:?}", cols);
        assert!(cols.iter().any(|c| c == "dismissed_at"), "still has dismissed_at");
    }

    #[test]
    fn chats_table_exists_with_expected_columns() {
        let conn = apply_migrations();
        let cols = column_names(&conn, "chats");
        for expected in [
            "id",
            "worktree_id",
            "base",
            "head",
            "claude_session_id",
            "created_at",
        ] {
            assert!(cols.iter().any(|c| c == expected), "missing {} in {:?}", expected, cols);
        }
    }

    #[test]
    fn chats_worktree_index_exists() {
        let conn = apply_migrations();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_chats_worktree'",
                [],
                |r| r.get(0),
            )
            .expect("query index");
        assert_eq!(count, 1);
    }

    #[test]
    fn existing_annotation_rows_survive_alter() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(MIGRATION_0001).unwrap();
        conn.execute(
            "INSERT INTO annotations (worktree_id, file_path, side, line_number, severity, title, detail)
             VALUES ('w1', 'foo.rs', 'additions', 1, 'nit', 't', 'd')",
            [],
        )
        .unwrap();
        conn.execute_batch(MIGRATION_0002).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM annotations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 1);
        let accepted: Option<String> = conn
            .query_row("SELECT accepted_at FROM annotations LIMIT 1", [], |r| r.get(0))
            .unwrap();
        assert!(accepted.is_none());
    }
}
