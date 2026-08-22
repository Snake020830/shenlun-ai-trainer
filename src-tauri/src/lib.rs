mod secure_remote;

use tauri_plugin_sql::{Migration, MigrationKind};

const DATABASE_URL: &str = "sqlite:shenlun-trainer.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_training_tables",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_optional_reference_answers",
            sql: include_str!("../migrations/0002_reference_answers.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_benchmark_draft_snapshots",
            sql: include_str!("../migrations/0003_benchmark_drafts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_benchmark_model_runs_and_alignments",
            sql: include_str!("../migrations/0004_benchmark_runs_alignments.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            secure_remote::store_provider_secret,
            secure_remote::delete_provider_secret,
            secure_remote::secure_post_json
        ])
        .run(tauri::generate_context!())
        .expect("error while running Shenlun AI Trainer");
}
