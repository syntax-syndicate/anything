use once_cell::sync::OnceCell;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
    SqlitePool,
};

use crate::{config::AnythingEventsConfig, errors::EventsResult};

static DB: OnceCell<sqlx::sqlite::SqlitePool> = OnceCell::new();

pub async fn create_sqlite_pool(config: &AnythingEventsConfig) -> EventsResult<SqlitePool> {
    let root_dir = config.root_dir.clone();
    let db_dir = root_dir.join("database");

    let database_file = db_dir.join("eventurous.db");
    // let database_uri = format!("sqlite://{}", database_file.to_str().unwrap());

    let options = SqliteConnectOptions::new()
        .filename(database_file)
        .create_if_missing(true);

    let mut pool = SqlitePoolOptions::new();
    if let Some(max_connections) = config.database.max_connections {
        pool = pool.max_connections(max_connections as u32);
    }

    let pool = pool
        .connect_with(options)
        .await
        .expect("failed to connect to sqlite db");

    sqlx::query(include_str!("../sql/schema.sql"))
        .execute(&pool)
        .await
        .expect("unable to bootstrap sqlite database");

    // DB.set(pool).expect("unable to set pool");
    Ok(pool)
}

#[inline]
pub fn get_pool() -> &'static SqlitePool {
    // For convenience
    unsafe { DB.get_unchecked() }
}
