export { DB_MIGRATIONS, getLatestMigrationVersion, getPendingMigrations } from './migrations';
export { DB_SCHEMA, DB_SCHEMA_VERSION, DB_TABLE_NAMES } from './schema';
export type {
  DbColumnSchema,
  DbColumnType,
  DbIndexSchema,
  DbTableName,
  DbTableSchema,
} from './schema';

export const SQLITE_RESERVED_ONLY = true;

export const DB_RESERVATION_NOTE =
  'SQLite is reserved for a future migration. Runtime persistence remains on Zustand and AsyncStorage for now.';
