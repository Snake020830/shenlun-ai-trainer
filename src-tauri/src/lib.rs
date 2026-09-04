mod public_source;
mod secure_remote;
mod external_link;

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

const DATABASE_URL: &str = "sqlite:shenlun-trainer.db";

/// Create a recoverable copy of the app-local SQLite database before an
/// in-place updater install. The frontend checkpoints the WAL first; copying
/// the sidecar files as well keeps an active database recoverable on Windows.
#[tauri::command]
fn backup_local_database(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录：{error}"))?;
    let source = app_data_dir.join("shenlun-trainer.db");
    if !source.exists() {
        return Ok(None);
    }

    let backup_dir = app_data_dir.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|error| format!("无法创建备份目录：{error}"))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("无法生成备份时间戳：{error}"))?
        .as_nanos();
    let destination = backup_dir.join(format!("shenlun-trainer-{timestamp}.db"));
    fs::copy(&source, &destination).map_err(|error| format!("无法备份本地数据库：{error}"))?;

    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{}", source.display(), suffix));
        if sidecar.exists() {
            let backup_sidecar = PathBuf::from(format!("{}{}", destination.display(), suffix));
            fs::copy(&sidecar, backup_sidecar)
                .map_err(|error| format!("无法备份数据库 sidecar 文件：{error}"))?;
        }
    }

    Ok(Some(destination.to_string_lossy().into_owned()))
}

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
            backup_local_database,
            secure_remote::store_provider_secret,
            secure_remote::delete_provider_secret,
            secure_remote::secure_post_json,
            public_source::fetch_public_source_text,
            external_link::open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running Shenlun AI Trainer");
}
