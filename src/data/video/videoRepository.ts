import {
  getProviderSelectionLog,
  type ProviderSelection,
  selectBackgroundCrawlerProvider,
  selectDetailProvider,
  selectSearchProvider,
  selectVideoProviders,
} from '@/data/providers/providerRegistry';
import type {
  ProviderCrawlerSourceOverrides,
  ProviderIssue,
  ProviderKind,
} from '@/data/providers/providerTypes';
import { mapVideoItemsToAppCategories } from '@/services/categoryMappingService';
import { APP_VIDEO_CATEGORIES, inferVideoCategory } from '@/services/categoryService';
import { normalizeVideoFormatSource } from '@/services/videoFormatService';
import type { RawVideoSource, VideoItem } from '@/types/video';

import {
  buildStats,
  computeCacheQuality,
  emitVideos,
  getCurrentCache,
  setCachedResult,
} from './videoCache';
import { sortDefaultVideos, sortSearchResults } from './videoRanking';
import type {
  VideoPipelineIssue,
  VideoPipelineResult,
  VideoServiceContext,
  VideoServiceStatus,
} from './videoTypes';

const VIDEO_PIPELINE_TIMEOUT_MS = 90_000;
const VIDEO_PIPELINE_INITIAL_MAX_VIDEOS = 200;
const PROGRESS_EMIT_INTERVAL_MS = 1_500;
const PROGRESS_EMIT_MIN_INCREMENT = 16;
const EARLY_COMMIT_THRESHOLD = 4;
const CATEGORY_MAPPING_BATCH_SIZE = 24;
const ingestionSource = 'crawler-pipeline' as const;
const legacyStaticSourcePattern =
  /demoVideos|videoSources|USER_VIDEO_SOURCES|USER_REMOTE_API_ENDPOINTS|USER_CUSTOM_VIDEO_SOURCES|legacy-/i;

let lastProviderSelectionLogKey = '';

const logProviderSelection = (scope: string, selection: ProviderSelection) => {
  const snapshot = getProviderSelectionLog(selection);
  const key = JSON.stringify({ scope, snapshot });

  if (key === lastProviderSelectionLogKey) {
    return;
  }

  lastProviderSelectionLogKey = key;
  console.info('[videoRepository] provider selection', scope, snapshot);
};

const createLinkedTimeoutSignal = (
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { cleanup: () => void; signal: AbortSignal } => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromParent = () => controller.abort();

  parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  return {
    cleanup: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
    signal: controller.signal,
  };
};

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 16));

export const normalizeVideoSource = (raw: RawVideoSource): VideoItem =>
  normalizeVideoFormatSource(raw);

const getPolicyRejectionReason = (rawSource: RawVideoSource): string | undefined => {
  const searchableText = [
    rawSource.id,
    rawSource.title,
    rawSource.source,
    rawSource.provider,
    rawSource.webViewUrl,
    rawSource.videoUrl,
    ...(rawSource.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ');

  if (legacyStaticSourcePattern.test(searchableText)) {
    return 'Rejected legacy static/demo video source fallback.';
  }

  return undefined;
};

const markCrawlerIngestion = (video: VideoItem): VideoItem => ({
  ...video,
  ingestionSource,
});

const getDedupeKeys = (video: VideoItem) =>
  [video.id, video.source].map((value) => value.trim().toLowerCase()).filter(Boolean);

export const dedupeVideos = (videos: VideoItem[]): VideoItem[] => {
  const seen = new Set<string>();
  const uniqueVideos: VideoItem[] = [];

  for (const video of videos) {
    const keys = getDedupeKeys(video);
    const hasSeenKey = keys.some((key) => seen.has(key));

    if (hasSeenKey) {
      continue;
    }

    for (const key of keys) {
      seen.add(key);
    }

    uniqueVideos.push(video);
  }

  return uniqueVideos;
};

const getResultStatus = (items: VideoItem[], errors: VideoPipelineIssue[]): VideoServiceStatus => {
  if (items.length > 0 && errors.length > 0) {
    return 'partial';
  }

  if (items.length > 0) {
    return 'ok';
  }

  if (errors.some((error) => error.code === 'PARSE_FAILED')) {
    return 'parse_failed';
  }

  if (errors.some((error) => error.code === 'CRAWL_FAILED')) {
    return 'crawl_failed';
  }

  return 'empty';
};

export const createEmptyResult = (source?: ProviderKind, message?: string): VideoPipelineResult => {
  const errors: VideoPipelineIssue[] = [
    {
      code: 'EMPTY_RESULT',
      message: message ?? 'Authorized provider completed but returned no videos.',
    },
  ];

  return {
    errors,
    items: [],
    source,
    stats: buildStats([], 0, 0, errors),
    status: 'empty',
  };
};

const buildLightweightItem = (raw: RawVideoSource): VideoItem | undefined => {
  try {
    const normalized = markCrawlerIngestion(normalizeVideoSource(raw));
    const inferredCategory = inferVideoCategory({
      category: normalized.category,
      rawCategory: normalized.rawCategory,
      title: normalized.title,
      description: normalized.description,
      tags: normalized.tags,
    });

    return {
      ...normalized,
      category: inferredCategory,
    };
  } catch {
    return undefined;
  }
};

const buildProgressItems = (rawSources: RawVideoSource[]) => {
  const partialItems: VideoItem[] = [];

  for (const rawSource of rawSources) {
    if (getPolicyRejectionReason(rawSource)) {
      continue;
    }

    const item = buildLightweightItem(rawSource);

    if (item) {
      partialItems.push(item);
    }
  }

  return sortDefaultVideos(dedupeVideos(partialItems));
};

const mapVideoItemsToAppCategoriesInBatches = async (videos: VideoItem[]) => {
  const mappedVideos: VideoItem[] = [];

  for (let index = 0; index < videos.length; index += CATEGORY_MAPPING_BATCH_SIZE) {
    mappedVideos.push(
      ...mapVideoItemsToAppCategories(videos.slice(index, index + CATEGORY_MAPPING_BATCH_SIZE)),
    );

    if (index + CATEGORY_MAPPING_BATCH_SIZE < videos.length) {
      await yieldToEventLoop();
    }
  }

  return mappedVideos;
};

export const mapProviderIssuesToPipelineIssues = (
  issues: ProviderIssue[] = [],
): VideoPipelineIssue[] =>
  issues.map((issue) => ({
    code: issue.code ?? ('CRAWL_FAILED' as const),
    message: issue.message,
    sourceId: issue.sourceId,
    status: issue.status,
    url: issue.url,
  }));

const getAllowedCategorySet = () =>
  new Set<string>(APP_VIDEO_CATEGORIES.filter((category) => category !== '推荐'));

const isDisplayCategoryAllowed = (video: VideoItem) =>
  getAllowedCategorySet().has(String(video.category));

const filterDisplayableLocalVideos = (videos: VideoItem[]) =>
  videos.filter(isDisplayCategoryAllowed);

const keepBackendVideo = (video: VideoItem) => {
  if (isDisplayCategoryAllowed(video)) {
    return true;
  }

  if (String(video.category) === '纪录片') {
    return false;
  }

  console.info('[videoRepository] keeping backend video with non-tab category', {
    category: video.category,
    id: video.id,
    rawCategory: video.rawCategory,
    title: video.title,
  });

  return true;
};

const filterDisplayableBackendVideos = (videos: VideoItem[]) => videos.filter(keepBackendVideo);

export const normalizeRawSourcesToResult = async (
  rawSources: RawVideoSource[],
  initialErrors: VideoPipelineIssue[],
  startedAt: number,
  source: ProviderKind = 'local-crawler',
): Promise<VideoPipelineResult> => {
  const errors = [...initialErrors];
  const normalizedVideos: VideoItem[] = [];

  for (let index = 0; index < rawSources.length; index += 1) {
    const rawSource = rawSources[index];

    if (!rawSource) {
      continue;
    }

    const rejectionReason = getPolicyRejectionReason(rawSource);

    if (rejectionReason) {
      errors.push({
        code: 'POLICY_REJECTED',
        message: rejectionReason,
        sourceId: rawSource.id,
        url: rawSource.source,
      });
      continue;
    }

    try {
      normalizedVideos.push(markCrawlerIngestion(normalizeVideoSource(rawSource)));
    } catch (error) {
      errors.push({
        code: 'PARSE_FAILED',
        message: error instanceof Error ? error.message : 'Video source parse failed.',
        sourceId: rawSource.id,
        url: rawSource.source,
      });
    }

    if ((index + 1) % 24 === 0) {
      await yieldToEventLoop();
    }
  }

  const mappedVideos = await mapVideoItemsToAppCategoriesInBatches(dedupeVideos(normalizedVideos));
  const filteredVideos = filterDisplayableLocalVideos(mappedVideos);
  const sortedVideos = sortDefaultVideos(filteredVideos);

  if (sortedVideos.length === 0 && errors.length === 0) {
    return createEmptyResult(source);
  }

  const stats = buildStats(sortedVideos, Date.now() - startedAt, rawSources.length, errors);

  return {
    errors,
    items: sortedVideos,
    source,
    stats,
    status: getResultStatus(sortedVideos, errors),
  };
};

const buildBackendResult = (
  items: VideoItem[],
  initialErrors: VideoPipelineIssue[],
  startedAt: number,
): VideoPipelineResult => {
  const mappedVideos = mapVideoItemsToAppCategories(dedupeVideos(items));
  const filteredVideos = filterDisplayableBackendVideos(mappedVideos);
  const sortedVideos = sortDefaultVideos(filteredVideos);

  if (sortedVideos.length === 0 && initialErrors.length === 0) {
    const errors: VideoPipelineIssue[] = [
      {
        code: 'EMPTY_RESULT',
        message: 'Backend API returned no videos.',
      },
    ];

    return {
      errors,
      items: [],
      source: 'backend',
      stats: buildStats([], Date.now() - startedAt, items.length, errors),
      status: 'empty',
    };
  }

  return {
    errors: initialErrors,
    items: sortedVideos,
    source: 'backend',
    stats: buildStats(sortedVideos, Date.now() - startedAt, items.length, initialErrors),
    status: getResultStatus(sortedVideos, initialErrors),
  };
};

export const fetchAndNormalizeVideos = async (
  context?: VideoServiceContext,
): Promise<VideoPipelineResult> => {
  const startedAt = Date.now();
  const errors: VideoPipelineIssue[] = [];
  const selection = selectVideoProviders();
  logProviderSelection('refresh', selection);

  if (!selection.primary?.fetchVideos) {
    return createEmptyResult(undefined, selection.reason);
  }

  const timeout = createLinkedTimeoutSignal(VIDEO_PIPELINE_TIMEOUT_MS, context?.signal);
  const signal = timeout.signal;
  let scheduledProgressTimer: ReturnType<typeof setTimeout> | undefined;
  let lastEmittedCount = 0;
  let earlyCommitted = false;

  const flushProgress = (partial: RawVideoSource[]) => {
    scheduledProgressTimer = undefined;
    const partialItems = buildProgressItems(partial);

    if (partialItems.length === 0) {
      return;
    }

    const currentItems = getCurrentCache()?.items ?? [];
    const hasBetterCache =
      currentItems.length > 0 &&
      computeCacheQuality(currentItems).score >= computeCacheQuality(partialItems).score;

    if (!hasBetterCache) {
      emitVideos(partialItems);
    }

    lastEmittedCount = partialItems.length;

    if (!earlyCommitted && partialItems.length >= EARLY_COMMIT_THRESHOLD) {
      earlyCommitted = true;

      if (!hasBetterCache) {
        const earlyResult: VideoPipelineResult = {
          errors: [],
          items: partialItems,
          source: 'local-crawler',
          stats: buildStats(partialItems, Date.now() - startedAt, partial.length, []),
          status: 'partial',
        };
        setCachedResult(earlyResult, { isRefreshing: true });
      }
    }
  };

  const scheduleProgress = (partial: RawVideoSource[]) => {
    if (selection.primary?.kind !== 'local-crawler') {
      return;
    }

    if (scheduledProgressTimer) {
      return;
    }

    const incrementSinceLast = partial.length - lastEmittedCount;
    const shouldEmitImmediately =
      incrementSinceLast >= PROGRESS_EMIT_MIN_INCREMENT ||
      (!earlyCommitted && partial.length >= EARLY_COMMIT_THRESHOLD);

    scheduledProgressTimer = setTimeout(
      () => flushProgress(partial),
      shouldEmitImmediately ? 0 : PROGRESS_EMIT_INTERVAL_MS,
    );
  };

  try {
    const providers = [selection.primary, ...selection.fallbacks].filter((provider) =>
      Boolean(provider.fetchVideos),
    );

    for (const provider of providers) {
      try {
        const providerResult = await provider.fetchVideos?.({
          maxTotalVideos: VIDEO_PIPELINE_INITIAL_MAX_VIDEOS,
          onRawProgress: scheduleProgress,
          signal,
        });

        if (!providerResult) {
          continue;
        }

        const providerIssues = mapProviderIssuesToPipelineIssues(providerResult.errors);

        if (providerResult.kind === 'backend') {
          const backendResult = buildBackendResult(
            providerResult.items ?? [],
            providerIssues,
            startedAt,
          );

          if (backendResult.items.length > 0) {
            return backendResult;
          }

          errors.push(...backendResult.errors);
          continue;
        }

        return normalizeRawSourcesToResult(
          providerResult.rawSources ?? [],
          [...errors, ...providerIssues],
          startedAt,
          providerResult.kind,
        );
      } catch (error) {
        errors.push({
          code: 'CRAWL_FAILED',
          message: error instanceof Error ? error.message : `${provider.label} failed.`,
        });
      }
    }
  } finally {
    if (scheduledProgressTimer) {
      clearTimeout(scheduledProgressTimer);
    }

    timeout.cleanup();
  }

  if (errors.length === 0) {
    return createEmptyResult(selection.primary.kind, selection.reason);
  }

  return {
    errors,
    items: [],
    source: selection.primary.kind,
    stats: buildStats([], Date.now() - startedAt, 0, errors),
    status: getResultStatus([], errors),
  };
};

export const fetchBackgroundVideos = async (options: {
  maxTotalVideos: number;
  signal: AbortSignal;
  sourceOverrides: ProviderCrawlerSourceOverrides;
}): Promise<VideoPipelineResult | undefined> => {
  const localProvider = selectBackgroundCrawlerProvider();

  if (!localProvider?.fetchVideos) {
    return undefined;
  }

  const startedAt = Date.now();
  const providerResult = await localProvider.fetchVideos(options);

  return normalizeRawSourcesToResult(
    providerResult.rawSources ?? [],
    mapProviderIssuesToPipelineIssues(providerResult.errors),
    startedAt,
    providerResult.kind,
  );
};

export const fetchVideoDetail = async (
  id: string,
  context?: VideoServiceContext,
): Promise<VideoItem | undefined> => {
  const detailProvider = selectDetailProvider();

  if (!detailProvider?.getVideoById) {
    return undefined;
  }

  try {
    return await detailProvider.getVideoById(id, { signal: context?.signal });
  } catch (error) {
    console.warn(
      `[videoRepository] ${detailProvider.label} detail failed, falling back to cached/list lookup`,
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
};

export const searchProviderVideos = async (
  keyword: string,
  context?: VideoServiceContext,
): Promise<VideoItem[] | undefined> => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const searchProvider = normalizedKeyword ? selectSearchProvider() : undefined;

  if (!searchProvider?.searchVideos) {
    return undefined;
  }

  try {
    const providerResults = await searchProvider.searchVideos(keyword, {
      signal: context?.signal,
    });
    return sortSearchResults(
      dedupeVideos(filterDisplayableBackendVideos(providerResults)),
      normalizedKeyword,
    );
  } catch (error) {
    console.warn(
      `[videoRepository] ${searchProvider.label} search failed, falling back to local search`,
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
};
