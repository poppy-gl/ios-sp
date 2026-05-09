import { DB_SCHEMA_VERSION } from './schema';

export type DbMigration = {
  version: number;
  description: string;
  statements: string[];
};

export const DB_MIGRATIONS: DbMigration[] = [
  {
    version: 1,
    description:
      'Reserve initial local database tables for favorites, play history, search history, and cache metadata.',
    statements: [
      `CREATE TABLE IF NOT EXISTS favorites (
  video_id TEXT PRIMARY KEY NOT NULL,
  video_snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
      'CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites (created_at);',
      `CREATE TABLE IF NOT EXISTS play_history (
  video_id TEXT PRIMARY KEY NOT NULL,
  progress_ms INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  last_played_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
      'CREATE INDEX IF NOT EXISTS idx_play_history_last_played_at ON play_history (last_played_at);',
      `CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY NOT NULL,
  query TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_search_history_query ON search_history (query);',
      'CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history (created_at);',
      `CREATE TABLE IF NOT EXISTS cache_meta (
  cache_key TEXT PRIMARY KEY NOT NULL,
  cache_type TEXT NOT NULL,
  payload_json TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
      'CREATE INDEX IF NOT EXISTS idx_cache_meta_cache_type ON cache_meta (cache_type);',
      'CREATE INDEX IF NOT EXISTS idx_cache_meta_expires_at ON cache_meta (expires_at);',
    ],
  },
];

export const getPendingMigrations = (currentVersion: number) =>
  DB_MIGRATIONS.filter((migration) => migration.version > currentVersion).sort(
    (first, second) => first.version - second.version,
  );

export const getLatestMigrationVersion = () => DB_SCHEMA_VERSION;
