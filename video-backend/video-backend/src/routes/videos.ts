import type { FastifyInstance } from 'fastify';
import { type AppVideoItem, toAppVideoItem } from '../contracts/appVideoContract.js';
import { prisma } from '../db/prisma.js';
import { normalizeVideoCategoryFields } from '../services/categoryClassifier.js';
import {
  crawlSearchVideos,
  getVideoIdFromDetailUrl,
  type CrawledVideo,
} from '../services/crawler.js';
import { resolveEpisode } from '../services/resolveEpisode.js';
import { createTtlCache } from '../services/ttlCache.js';

type StoredVideoRow = {
  id: string;
  title: string;
  description: string | null;
  cover: string | null;
  source: string;
  sourceType: string;
  category: string;
  subCategory: string | null;
  provider: string | null;
  seriesId: string | null;
  rawJson: string;
  updatedAt: Date | string;
};

type StoredVideoListRow = Omit<StoredVideoRow, 'rawJson'>;

type AppVideoListItem = Omit<AppVideoItem, 'playLines'> & {
  episodeCount?: number;
  lineCount?: number;
  playPageUrl?: string;
};

type FeedCursor = {
  id: string;
  rank: number;
  updatedAt: string;
};

type ListPayload = {
  hasMore: boolean;
  items: AppVideoListItem[];
  nextCursor?: string;
  page: number;
  pageSize: number;
};
type SearchPayload = { items: AppVideoListItem[] };

const videoListSelect = {
  category: true,
  cover: true,
  description: true,
  id: true,
  provider: true,
  seriesId: true,
  source: true,
  sourceType: true,
  subCategory: true,
  title: true,
  updatedAt: true,
} as const;

const APP_PROVIDER_LABEL = '聚合线路';
const INTERNAL_PROVIDER_PATTERNS = ['完美看看', 'wanmeikk'];
const TOP_LEVEL_CATEGORIES = ['电视剧', '电影', '综艺', '动漫'] as const;
const VIDEO_LIST_CACHE_TTL_MS = Number(process.env.VIDEO_LIST_CACHE_TTL_MS ?? 45_000);
const VIDEO_SEARCH_CACHE_TTL_MS = Number(process.env.VIDEO_SEARCH_CACHE_TTL_MS ?? 120_000);
const VIDEO_DETAIL_CACHE_TTL_MS = Number(process.env.VIDEO_DETAIL_CACHE_TTL_MS ?? 300_000);
const SEARCH_CRAWL_ATTEMPT_CACHE_TTL_MS = Number(
  process.env.SEARCH_CRAWL_ATTEMPT_CACHE_TTL_MS ?? 30 * 60 * 1000,
);
const SEARCH_ON_DEMAND_CRAWL_ENABLED = process.env.SEARCH_ON_DEMAND_CRAWL_ENABLED !== 'false';
const SEARCH_ON_DEMAND_MIN_KEYWORD_LENGTH = Number(
  process.env.SEARCH_ON_DEMAND_MIN_KEYWORD_LENGTH ?? 2,
);
const SEARCH_ON_DEMAND_LOCAL_HIT_TARGET = Number(
  process.env.SEARCH_ON_DEMAND_LOCAL_HIT_TARGET ?? 1,
);
const SEARCH_ON_DEMAND_MAX_VIDEOS = Number(process.env.SEARCH_ON_DEMAND_MAX_VIDEOS ?? 1);

type DetailPayload = { item: AppVideoItem | AppVideoListItem };

const listCache = createTtlCache<ListPayload>({ maxEntries: 180, ttlMs: VIDEO_LIST_CACHE_TTL_MS });
const searchCache = createTtlCache<SearchPayload>({
  maxEntries: 240,
  ttlMs: VIDEO_SEARCH_CACHE_TTL_MS,
});
const detailCache = createTtlCache<DetailPayload>({
  maxEntries: 300,
  ttlMs: VIDEO_DETAIL_CACHE_TTL_MS,
});
const searchCrawlAttemptCache = createTtlCache<{ at: number }>({
  maxEntries: 500,
  ttlMs: SEARCH_CRAWL_ATTEMPT_CACHE_TTL_MS,
});

export const clearVideoApiCaches = () => {
  listCache.clear();
  searchCache.clear();
  detailCache.clear();
};

const sanitizeProvider = (provider?: string | null) => {
  const normalized = provider?.trim();

  if (
    !normalized ||
    INTERNAL_PROVIDER_PATTERNS.some((pattern) => normalized.toLowerCase().includes(pattern))
  ) {
    return APP_PROVIDER_LABEL;
  }

  return normalized;
};

const sanitizeAppVideoProvider = <T extends AppVideoItem>(video: T): T => ({
  ...video,
  provider: sanitizeProvider(video.provider),
});

const normalizeAppVideoForApi = <T extends AppVideoItem>(video: T): T =>
  sanitizeAppVideoProvider(normalizeVideoCategoryFields(video) as T);

const matchesRequestedCategory = (video: AppVideoListItem, category?: string) =>
  !category || video.category === category || video.subCategory === category;

const isTopLevelCategory = (value?: string): value is (typeof TOP_LEVEL_CATEGORIES)[number] =>
  TOP_LEVEL_CATEGORIES.some((category) => category === value);

const getFeedRank = (row: Pick<StoredVideoListRow, 'category' | 'subCategory'>) => {
  if (row.subCategory === '国产剧') return 0;
  if (row.subCategory === '韩剧') return 1;
  if (row.category === '电视剧') return 2;

  return 3;
};

const normalizeDateCursorValue = (value: Date | string) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const encodeCursor = (row: StoredVideoListRow) =>
  encodeURIComponent(
    JSON.stringify({
      id: row.id,
      rank: getFeedRank(row),
      updatedAt: normalizeDateCursorValue(row.updatedAt),
    } satisfies FeedCursor),
  );

const parseCursorJson = (value: string): FeedCursor | undefined => {
  const parsed = JSON.parse(value) as Partial<FeedCursor>;

  if (
    typeof parsed.id !== 'string' ||
    typeof parsed.rank !== 'number' ||
    typeof parsed.updatedAt !== 'string'
  ) {
    return undefined;
  }

  return {
    id: parsed.id,
    rank: parsed.rank,
    updatedAt: parsed.updatedAt,
  };
};

const decodeCursor = (value?: string): FeedCursor | undefined => {
  if (!value) {
    return undefined;
  }

  let cursorText = value.trim();

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return parseCursorJson(cursorText);
      } catch {
        const decoded = decodeURIComponent(cursorText);

        if (decoded === cursorText) {
          return undefined;
        }

        cursorText = decoded;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
};

const trimDescription = (value?: string) => {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized;
};

const getFirstEpisode = (video: AppVideoItem) =>
  video.playLines
    ?.flatMap((line) => line.episodes)
    .find((episode) => episode.mediaUrl || episode.playPageUrl);

const compactVideoForList = (video: AppVideoItem): AppVideoListItem => {
  const { description, playLines: _playLines, ...baseVideo } = video;
  const firstEpisode = getFirstEpisode(video);
  const playPageUrl = firstEpisode?.playPageUrl ?? video.webViewUrl;
  const mediaUrl = firstEpisode?.mediaUrl;
  const episodeCount =
    video.playLines?.reduce((total, line) => total + line.episodes.length, 0) ?? 0;
  const compactVideo: AppVideoListItem = {
    ...baseVideo,
    source: mediaUrl ?? video.source,
    sourceType: mediaUrl ? (firstEpisode?.sourceType ?? video.sourceType) : video.sourceType,
    ...(trimDescription(description) ? { description: trimDescription(description) } : {}),
    ...(episodeCount > 0 ? { episodeCount } : {}),
    ...(playPageUrl ? { playPageUrl, webViewUrl: video.webViewUrl ?? playPageUrl } : {}),
    ...(video.playLines?.length ? { lineCount: video.playLines.length } : {}),
  };

  return compactVideo;
};

const parseStoredVideoListItem = (row: StoredVideoListRow) =>
  compactVideoForList(
    normalizeAppVideoForApi(
      toAppVideoItem({
        id: row.id,
        title: row.title,
        description: row.description ?? undefined,
        cover: row.cover ?? undefined,
        rawCategory: row.subCategory ?? undefined,
        source: row.source,
        sourceType: row.sourceType,
        category: row.category,
        subCategory: row.subCategory ?? undefined,
        provider: sanitizeProvider(row.provider),
        seriesId: row.seriesId ?? undefined,
      }),
    ),
  );

const parseStoredVideo = (row: StoredVideoRow, options?: { compact?: boolean }) => {
  try {
    const video = normalizeAppVideoForApi(toAppVideoItem(JSON.parse(row.rawJson)));

    return options?.compact ? compactVideoForList(video) : video;
  } catch {
    const fallbackVideo = normalizeAppVideoForApi(
      toAppVideoItem({
        id: row.id,
        title: row.title,
        description: row.description ?? undefined,
        cover: row.cover ?? undefined,
        rawCategory: row.subCategory ?? undefined,
        source: row.source,
        sourceType: row.sourceType,
        category: row.category,
        subCategory: row.subCategory ?? undefined,
        provider: sanitizeProvider(row.provider),
        seriesId: row.seriesId ?? undefined,
      }),
    );

    return options?.compact ? compactVideoForList(fallbackVideo) : fallbackVideo;
  }
};

const toDbPayload = (video: CrawledVideo) => {
  const appVideo = normalizeAppVideoForApi(toAppVideoItem(video));

  return {
    category: appVideo.category,
    cover: appVideo.cover ?? null,
    description: appVideo.description ?? null,
    provider: appVideo.provider ?? null,
    rawJson: JSON.stringify(appVideo),
    seriesId: appVideo.seriesId ?? null,
    source: appVideo.source,
    sourceType: appVideo.sourceType,
    subCategory: appVideo.subCategory ?? null,
    title: appVideo.title,
  };
};

const saveCrawledVideos = async (videos: CrawledVideo[]) => {
  let saved = 0;

  for (const video of videos) {
    const payload = toDbPayload(video);

    await prisma.video.upsert({
      create: {
        id: video.id,
        ...payload,
      },
      update: payload,
      where: { id: video.id },
    });

    saved += 1;
  }

  if (saved > 0) {
    clearVideoApiCaches();
  }

  return saved;
};

const interleaveRows = <T>(groups: T[][], limit: number) => {
  const rows: T[] = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));

  for (let index = 0; index < maxLength && rows.length < limit; index += 1) {
    for (const group of groups) {
      const item = group[index];

      if (item) {
        rows.push(item);
      }

      if (rows.length >= limit) {
        break;
      }
    }
  }

  return rows;
};

const fetchMixedVideoListRows = async (input: { page: number; pageSize: number }) => {
  const take = input.pageSize + 1;
  const perCategoryTake = Math.ceil(take / TOP_LEVEL_CATEGORIES.length);
  const skip = (input.page - 1) * perCategoryTake;
  const groups = await Promise.all(
    TOP_LEVEL_CATEGORIES.map((category) =>
      prisma.video.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: videoListSelect,
        skip,
        take: perCategoryTake + 1,
        where: { category },
      }),
    ),
  );

  return interleaveRows(groups, take);
};

const fetchVideoListRows = async (input: {
  category: string | undefined;
  cursor: FeedCursor | undefined;
  page: number;
  pageSize: number;
}) => {
  const offset = (input.page - 1) * input.pageSize;
  const take = input.pageSize + 1;

  if (input.category) {
    const isTopCategory = isTopLevelCategory(input.category);

    if (input.cursor) {
      if (isTopCategory) {
        return prisma.$queryRaw<StoredVideoListRow[]>`
          SELECT
            "id",
            "title",
            "description",
            "cover",
            "source",
            "sourceType",
            "category",
            "subCategory",
            "provider",
            "seriesId",
            "updatedAt"
          FROM "Video"
          WHERE
            "category" = ${input.category}
            AND (
              "updatedAt" < ${input.cursor.updatedAt}
              OR ("updatedAt" = ${input.cursor.updatedAt} AND "id" < ${input.cursor.id})
            )
          ORDER BY "updatedAt" DESC, "id" DESC
          LIMIT ${take}
        `;
      }

      return prisma.$queryRaw<StoredVideoListRow[]>`
        SELECT
          "id",
          "title",
          "description",
          "cover",
          "source",
          "sourceType",
          "category",
          "subCategory",
          "provider",
          "seriesId",
          "updatedAt"
        FROM "Video"
        WHERE
          "subCategory" = ${input.category}
          AND (
            "updatedAt" < ${input.cursor.updatedAt}
            OR ("updatedAt" = ${input.cursor.updatedAt} AND "id" < ${input.cursor.id})
          )
        ORDER BY "updatedAt" DESC, "id" DESC
        LIMIT ${take}
      `;
    }

    return prisma.video.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: videoListSelect,
      skip: offset,
      take,
      where: isTopCategory ? { category: input.category } : { subCategory: input.category },
    });
  }

  return fetchMixedVideoListRows({ page: input.page, pageSize: input.pageSize });
};

const buildVideoListPayload = async (input: {
  category: string | undefined;
  cursor: string | undefined;
  page: number;
  pageSize: number;
}): Promise<ListPayload> => {
  const cursor = input.category ? decodeCursor(input.cursor) : undefined;
  const rows = await fetchVideoListRows({
    category: input.category,
    cursor,
    page: input.category && input.cursor ? 1 : input.page,
    pageSize: input.pageSize,
  });
  const pageRows = rows.slice(0, input.pageSize);
  const items = pageRows
    .map(parseStoredVideoListItem)
    .filter((video) => matchesRequestedCategory(video, input.category))
    .slice(0, input.pageSize);
  const hasMore = rows.length > input.pageSize;
  const nextCursor =
    input.category && hasMore && pageRows.length > 0 ? encodeCursor(pageRows.at(-1)!) : undefined;

  return {
    hasMore,
    items,
    ...(nextCursor ? { nextCursor } : {}),
    page: input.category && input.cursor ? 1 : input.page,
    pageSize: input.pageSize,
  };
};

const searchVideoListRows = async (keyword: string) => {
  const likeKeyword = `%${keyword}%`;
  const prefixKeyword = `${keyword}%`;

  return prisma.$queryRaw<StoredVideoListRow[]>`
    SELECT
      "id",
      "title",
      "description",
      "cover",
      "source",
      "sourceType",
      "category",
      "subCategory",
      "provider",
      "seriesId",
      "updatedAt"
    FROM "Video"
    WHERE
      "title" LIKE ${likeKeyword}
      OR "category" LIKE ${likeKeyword}
      OR "subCategory" LIKE ${likeKeyword}
    ORDER BY
      CASE
        WHEN "title" = ${keyword} THEN 0
        WHEN "title" LIKE ${prefixKeyword} THEN 1
        WHEN "title" LIKE ${likeKeyword} THEN 2
        ELSE 3
      END,
      CASE
        WHEN "subCategory" = '国产剧' THEN 0
        WHEN "subCategory" = '韩剧' THEN 1
        WHEN "category" = '电视剧' THEN 2
        ELSE 3
      END,
      "updatedAt" DESC,
      "id" DESC
    LIMIT 40
    `;
};

const shouldRunSearchCrawl = (keyword: string, localHitCount: number) =>
  SEARCH_ON_DEMAND_CRAWL_ENABLED &&
  keyword.length >= SEARCH_ON_DEMAND_MIN_KEYWORD_LENGTH &&
  localHitCount < SEARCH_ON_DEMAND_LOCAL_HIT_TARGET;

const runSearchCrawlIfNeeded = async (keyword: string, localRows: StoredVideoListRow[]) => {
  const cacheKey = keyword.toLowerCase();

  if (!shouldRunSearchCrawl(keyword, localRows.length)) {
    return localRows;
  }

  if (searchCrawlAttemptCache.get(cacheKey)) {
    return localRows;
  }

  searchCrawlAttemptCache.set(cacheKey, { at: Date.now() });

  try {
    const freshCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const videos = await crawlSearchVideos(keyword, SEARCH_ON_DEMAND_MAX_VIDEOS, {
      shouldSkipDetail: async (entry) => {
        const videoId = getVideoIdFromDetailUrl(entry.url);

        if (!videoId) {
          return false;
        }

        const existing = await prisma.video.findUnique({
          select: { updatedAt: true },
          where: { id: videoId },
        });

        return Boolean(existing && existing.updatedAt >= freshCutoff);
      },
    });
    const saved = await saveCrawledVideos(videos);

    console.log(
      `[search-crawl] keyword="${keyword}" localHits=${localRows.length} target=${SEARCH_ON_DEMAND_LOCAL_HIT_TARGET} maxVideos=${SEARCH_ON_DEMAND_MAX_VIDEOS} saved=${saved}`,
    );

    return saved > 0 ? searchVideoListRows(keyword) : localRows;
  } catch (error) {
    console.warn('[search-crawl] failed', error instanceof Error ? error.message : String(error));

    return localRows;
  }
};

export async function registerVideoRoutes(app: FastifyInstance) {
  app.get('/api/videos', async (request, reply) => {
    const query = request.query as {
      category?: string;
      cursor?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 30), 1), 200);
    const category = query.category?.trim();
    const cursor = query.cursor?.trim();
    const cacheKey = JSON.stringify({
      category: category ?? '',
      cursor: cursor ?? '',
      page,
      pageSize,
    });
    const cached = listCache.get(cacheKey);

    if (cached) {
      reply.header('x-cache', 'HIT');
      return cached;
    }

    const payload = await buildVideoListPayload({ category, cursor, page, pageSize });

    listCache.set(cacheKey, payload);
    reply.header('x-cache', 'MISS');

    return payload;
  });

  app.get('/api/videos/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const cached = detailCache.get(id);

    if (cached) {
      reply.header('x-cache', 'HIT');
      return cached;
    }

    const row =
      (await prisma.video.findUnique({ where: { id } })) ??
      (await prisma.video.findFirst({
        where: {
          seriesId: id,
        },
      }));

    if (!row) {
      return reply.code(404).send({ message: 'Video not found' });
    }

    const payload = { item: parseStoredVideo(row as StoredVideoRow) };
    detailCache.set(id, payload);
    reply.header('x-cache', 'MISS');

    return payload;
  });

  app.get('/api/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    const keyword = (q ?? '').trim();
    const cacheKey = keyword.toLowerCase();

    if (!keyword) {
      return { items: [] };
    }

    const cached = searchCache.get(cacheKey);

    if (cached) {
      reply.header('x-cache', 'HIT');
      return cached;
    }

    const rows = await runSearchCrawlIfNeeded(keyword, await searchVideoListRows(keyword));
    const payload = { items: rows.map(parseStoredVideoListItem) };

    searchCache.set(cacheKey, payload);
    reply.header('x-cache', 'MISS');

    return payload;
  });

  app.post('/api/resolve', async (request, reply) => {
    try {
      return await resolveEpisode(
        request.body as {
          videoId: string;
          line: number;
          episode: number;
          playPageUrl?: string;
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = /playPageUrl is required/i.test(message)
        ? 400
        : /not found|not supported|mediaUrl/i.test(message)
          ? 422
          : 502;

      return reply.code(statusCode).send({ message });
    }
  });
}

export const warmVideoListCaches = async () => {
  const pageSize = Math.min(Math.max(Number(process.env.VIDEO_LIST_WARM_PAGE_SIZE ?? 48), 1), 120);
  const categories = [undefined];

  for (const category of categories) {
    const firstPage = await buildVideoListPayload({
      category,
      cursor: undefined,
      page: 1,
      pageSize,
    });
    const firstPageKey = JSON.stringify({
      category: category ?? '',
      cursor: '',
      page: 1,
      pageSize,
    });
    listCache.set(firstPageKey, firstPage);

    if (firstPage.nextCursor) {
      const secondPage = await buildVideoListPayload({
        category,
        cursor: firstPage.nextCursor,
        page: 1,
        pageSize,
      });
      const secondPageKey = JSON.stringify({
        category: category ?? '',
        cursor: firstPage.nextCursor,
        page: 1,
        pageSize,
      });
      listCache.set(secondPageKey, secondPage);
    }
  }
};
