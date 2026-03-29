use sqlx::{Pool, Sqlite};

struct Migration {
    version: i64,
    description: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "Initial schema",
        sql: include_str!("sql/001_initial.sql"),
    },
    Migration {
        version: 2,
        description: "Performance indexes",
        sql: include_str!("sql/002_performance_indexes.sql"),
    },
];

pub async fn run_migrations(pool: &Pool<Sqlite>) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create migrations table: {e}"))?;

    let current: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM _migrations")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to get migration version: {e}"))?;

    for migration in MIGRATIONS {
        if migration.version > current {
            tracing::info!(
                version = migration.version,
                desc = migration.description,
                "Applying migration"
            );

            // Split SQL by semicolons and execute each statement
            for statement in migration.sql.split(';') {
                let stmt = statement.trim();
                if !stmt.is_empty() {
                    sqlx::query(stmt).execute(pool).await.map_err(|e| {
                        format!("Migration {} failed on statement: {e}", migration.version)
                    })?;
                }
            }

            sqlx::query("INSERT INTO _migrations (version, description) VALUES (?, ?)")
                .bind(migration.version)
                .bind(migration.description)
                .execute(pool)
                .await
                .map_err(|e| format!("Failed to record migration {}: {e}", migration.version))?;
        }
    }

    tracing::info!(
        version = MIGRATIONS.last().map(|m| m.version).unwrap_or(0),
        "Database up to date"
    );
    Ok(())
}
