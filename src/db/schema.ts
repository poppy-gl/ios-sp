export type DbColumnType = 'integer' | 'real' | 'text';

export type DbColumnSchema = {
  name: string;
  type: DbColumnType;
  notNull?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string;
  references?: {
    table: string;
    column: string;
  };
};

export type DbTableSchema = {
  name: string;
  columns: DbColumnSchema[];
  indexes: DbIndexSchema[];
};

export type DbIndexSchema = {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
};

export const DB_SCHEMA_VERSION = 1;

export const DB_TABLE_NAMES = {
  favorites: 'favorites',
  playHistory: 'play_history',
  searchHistory: 'search_history',
  cacheMeta: 'cache_meta',
} as const;

export type DbTableName = (typeof DB_TABLE_NAMES)[keyof typeof DB_TABLE_NAMES];

export const DB_SCHEMA: Record<DbTableName, DbTableSchema> = {
  favorites: {
    name: DB_TABLE_NAMES.favorites,
    columns: [
      { name: 'video_id', type: 'text', primaryKey: true, notNull: true },
      { name: 'video_snapshot_json', type: 'text', notNull: true },
      { name: 'created_at', type: 'text', notNull: true },
      { name: 'updated_at', type: 'text', notNull: true },
    ],
    indexes: [
      {
        name: 'idx_favorites_created_at',
        table: DB_TABLE_NAMES.favorites,
        columns: ['created_at'],
      },
    ],
  },
  play_history: {
    name: DB_TABLE_NAMES.playHistory,
    columns: [
      { name: 'video_id', type: 'text', primaryKey: true, notNull: true },
      { name: 'progress_ms', type: 'integer', notNull: true, defaultValue: '0' },
      { name: 'duration_ms', type: 'integer', notNull: true, defaultValue: '0' },
      { name: 'last_played_at', type: 'text', notNull: true },
      { name: 'updated_at', type: 'text', notNull: true },
    ],
    indexes: [
      {
        name: 'idx_play_history_last_played_at',
        table: DB_TABLE_NAMES.playHistory,
        columns: ['last_played_at'],
      },
    ],
  },
  search_history: {
    name: DB_TABLE_NAMES.searchHistory,
    columns: [
      { name: 'id', type: 'text', primaryKey: true, notNull: true },
      { name: 'query', type: 'text', notNull: true },
      { name: 'created_at', type: 'text', notNull: true },
      { name: 'updated_at', type: 'text', notNull: true },
    ],
    indexes: [
      {
        name: 'idx_search_history_query',
        table: DB_TABLE_NAMES.searchHistory,
        columns: ['query'],
        unique: true,
      },
      {
        name: 'idx_search_history_created_at',
        table: DB_TABLE_NAMES.searchHistory,
        columns: ['created_at'],
      },
    ],
  },
  cache_meta: {
    name: DB_TABLE_NAMES.cacheMeta,
    columns: [
      { name: 'cache_key', type: 'text', primaryKey: true, notNull: true },
      { name: 'cache_type', type: 'text', notNull: true },
      { name: 'payload_json', type: 'text' },
      { name: 'expires_at', type: 'text' },
      { name: 'created_at', type: 'text', notNull: true },
      { name: 'updated_at', type: 'text', notNull: true },
    ],
    indexes: [
      {
        name: 'idx_cache_meta_cache_type',
        table: DB_TABLE_NAMES.cacheMeta,
        columns: ['cache_type'],
      },
      {
        name: 'idx_cache_meta_expires_at',
        table: DB_TABLE_NAMES.cacheMeta,
        columns: ['expires_at'],
      },
    ],
  },
};
