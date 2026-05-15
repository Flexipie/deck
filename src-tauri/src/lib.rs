mod git;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create annotations table",
        sql: include_str!("../migrations/0001_initial.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
