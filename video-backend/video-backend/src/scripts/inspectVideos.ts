import { prisma } from '../db/prisma.js';

type SqlParam = string | number | boolean | null;

type CountRow = {
  count: number | bigint | string | null;
};

type DateRow = {
  value: Date | string | null;
};

type CategoryRow = {
  category: string | null;
  count: number | bigint | string | null;
};

type SubCategoryRow = {
  category: string | null;
  subCategory: string | null;
  count: number | bigint | string | null;
};

type SourceTypeRow = {
  sourceType: string | null;
  count: number | bigint | string | null;
};

type ReachableRow = {
  reachable: boolean | number | null;
  count: number | bigint | string | null;
};

type SampleRow = {
  id: string;
  title: string;
  category: string;
  subCategory: string | null;
  sourceType: string;
  updatedAt: Date | string | null;
};

const getArgValue = (name: string) => {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));

  return matched?.slice(prefix.length).trim();
};

const parseLimit = () => {
  const value = Number(getArgValue('limit') ?? 10);

  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 100) : 10;
};

const toNumber = (value: number | bigint | string | null | undefined) => {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  return value ?? 0;
};

const formatDate = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : '';

const formatNullable = (value: string | boolean | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '(empty)' : String(value);

const sortByCountDesc = <T extends { count: number }>(items: T[]) =>
  [...items].sort((first, second) => second.count - first.count);

const isMissingTableError = (error: unknown) =>
  error instanceof Error && /no such table/i.test(error.message);

const queryRows = async <T>(sql: string, params: SqlParam[] = []) =>
  prisma.$queryRawUnsafe<T[]>(sql, ...params);

const queryRowsIfTableExists = async <T>(sql: string, params: SqlParam[] = []) => {
  try {
    return await queryRows<T>(sql, params);
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }

    throw error;
  }
};

const queryCount = async (sql: string, params: SqlParam[] = []) => {
  const [row] = await queryRows<CountRow>(sql, params);

  return toNumber(row?.count);
};

const queryCountIfTableExists = async (sql: string, params: SqlParam[] = []) => {
  const [row] = await queryRowsIfTableExists<CountRow>(sql, params);

  return toNumber(row?.count);
};

const queryDateValue = async (sql: string, params: SqlParam[] = []) => {
  const [row] = await queryRows<DateRow>(sql, params);

  return formatDate(row?.value);
};

const queryDateValueIfTableExists = async (sql: string, params: SqlParam[] = []) => {
  const [row] = await queryRowsIfTableExists<DateRow>(sql, params);

  return formatDate(row?.value);
};

export async function inspectVideos() {
  const category = getArgValue('category');
  const limit = parseLimit();
  const whereSql = category ? 'WHERE category = ? OR subCategory = ?' : '';
  const whereParams = category ? [category, category] : [];

  const [
    total,
    filteredTotal,
    resolvedEpisodeTotal,
    resolvedMediaTotal,
    failedResolveTotal,
    latestVideoUpdatedAt,
    latestEpisodeResolvedAt,
    categoryGroups,
    subCategoryGroups,
    sourceTypeGroups,
    reachableGroups,
    samples,
  ] = await Promise.all([
    queryCount('SELECT COUNT(*) AS count FROM Video'),
    category
      ? queryCount('SELECT COUNT(*) AS count FROM Video WHERE category = ? OR subCategory = ?', [
          category,
          category,
        ])
      : Promise.resolve(null),
    queryCountIfTableExists('SELECT COUNT(*) AS count FROM ResolvedEpisode'),
    queryCountIfTableExists(
      'SELECT COUNT(*) AS count FROM ResolvedEpisode WHERE mediaUrl IS NOT NULL',
    ),
    queryCountIfTableExists(
      "SELECT COUNT(*) AS count FROM ResolvedEpisode WHERE failureReason IS NOT NULL AND failureReason != ''",
    ),
    queryDateValue('SELECT MAX(updatedAt) AS value FROM Video'),
    queryDateValueIfTableExists('SELECT MAX(resolvedAt) AS value FROM ResolvedEpisode'),
    queryRows<CategoryRow>('SELECT category, COUNT(*) AS count FROM Video GROUP BY category'),
    queryRows<SubCategoryRow>(
      'SELECT category, subCategory, COUNT(*) AS count FROM Video GROUP BY category, subCategory',
    ),
    queryRows<SourceTypeRow>('SELECT sourceType, COUNT(*) AS count FROM Video GROUP BY sourceType'),
    queryRowsIfTableExists<ReachableRow>(
      'SELECT reachable, COUNT(*) AS count FROM ResolvedEpisode GROUP BY reachable',
    ),
    queryRows<SampleRow>(
      `SELECT id, title, category, subCategory, sourceType, updatedAt FROM Video ${whereSql} ORDER BY updatedAt DESC LIMIT ?`,
      [...whereParams, limit],
    ),
  ]);

  console.log('[summary]');
  console.log(`videos=${total}`);
  if (category) {
    console.log(`videosMatchedByCategory=${filteredTotal ?? 0}`);
  }
  console.log(`resolvedEpisodes=${resolvedEpisodeTotal}`);
  console.log(`resolvedEpisodesWithMedia=${resolvedMediaTotal}`);
  console.log(`resolvedEpisodesFailed=${failedResolveTotal}`);
  console.log(`latestVideoUpdatedAt=${latestVideoUpdatedAt}`);
  console.log(`latestEpisodeResolvedAt=${latestEpisodeResolvedAt}`);

  console.log('\n[category]');
  console.table(
    sortByCountDesc(
      categoryGroups.map((item) => ({
        category: formatNullable(item.category),
        count: toNumber(item.count),
      })),
    ),
  );

  console.log('\n[subCategory]');
  console.table(
    sortByCountDesc(
      subCategoryGroups.map((item) => ({
        category: formatNullable(item.category),
        subCategory: formatNullable(item.subCategory),
        count: toNumber(item.count),
      })),
    ),
  );

  console.log('\n[sourceType]');
  console.table(
    sortByCountDesc(
      sourceTypeGroups.map((item) => ({
        sourceType: formatNullable(item.sourceType),
        count: toNumber(item.count),
      })),
    ),
  );

  console.log('\n[resolvedEpisodeReachable]');
  console.table(
    sortByCountDesc(
      reachableGroups.map((item) => ({
        reachable: formatNullable(item.reachable),
        count: toNumber(item.count),
      })),
    ),
  );

  console.log(category ? `\n[samples category=${category}]` : '\n[samples]');
  console.table(
    samples.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      subCategory: item.subCategory ?? '',
      sourceType: item.sourceType,
      updatedAt: formatDate(item.updatedAt),
    })),
  );
}

inspectVideos()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
