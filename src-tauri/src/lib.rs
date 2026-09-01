mod public_source;
mod secure_remote;
mod external_link;

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
        Migration {
            version: 5,
            description: "add_practice_annotations_and_timing",
            sql: include_str!("../migrations/0005_practice_sessions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_public_question_sources",
            sql: include_str!("../migrations/0006_public_question_sources.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "link_public_exam_sources_to_multiple_questions",
            sql: include_str!("../migrations/0007_public_source_question_links.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add_anchored_practice_ink_strokes",
            sql: include_str!("../migrations/0008_practice_ink_strokes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_question_library_performance_indexes",
            sql: include_str!("../migrations/0009_performance_indexes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add_exam_paper_metadata",
            sql: include_str!("../migrations/0010_exam_paper_metadata.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            secure_remote::store_provider_secret,
            secure_remote::delete_provider_secret,
            secure_remote::secure_post_json,
            public_source::fetch_public_source_text,
            external_link::open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running Shenlun AI Trainer");
}
