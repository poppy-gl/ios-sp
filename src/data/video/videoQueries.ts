import { clearLocalCrawlerProviderState } from '@/data/providers/localCrawlerProvider';
import { usePlayHistoryStore } from '@/store/playHistoryStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { VideoCategory, VideoItem } from '@/types/video';

import {
  buildStats,
  clearVideoCache,
  getCachedItems,
  getCurrentCache,
  hydrateFromPersistedCache,
  setCachedResult,
} from './videoCache';
import { fetchVideoDetail, searchProviderVideos, dedupeVideos } from './videoRepository';
import {
  comparePlayableVideos,
  compareUnsupportedVideos,
  getEngagementScore,
  getRecencyScore,
  getSearchRelevanceScore,
  rankRecommendedVideos,
  sortDefaultVideos,
  sortSearchResults,
  toTimestamp,
} from './videoRanking';
import {
  abortBackgroundDeepCrawl,
  refreshVideos,
  resetRefreshCoordinator,
  revalidateInBackground,
} from './videoRefreshCoordinator';
import type { VideoPipelineResult, VideoServiceContext } from './videoTypes';
import { VideoServiceError } from './videoTypes';
import { mapCategoryToAppCategory } from '@/services/categoryService';

const shouldThrowResult = (result: VideoPipelineResult) =>
  result.items.length === 0 &&
  (result.status === 'crawl_failed' || result.status === 'parse_failed');

const toServiceError = (result: VideoPipelineResult) => {
  const code = result.status === 'parse_failed' ? 'PARSE_FAILED' : 'CRAWL_FAILED';
  const message =
    result.status === 'parse_failed'
      ? 'All crawled video sources failed to parse.'
      : 'Authorized page crawl failed and no cached videos are available.';

  return new VideoServiceError(code, message, result);
};

export const getAllVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const now = Date.now();
  let currentCache = getCurrentCache();

  if (!context?.bypassCache && !currentCache) {
    const hydratedItems = await hydrateFromPersistedCache();

    if (hydratedItems && hydratedItems.length > 0) {
      currentCache = getCurrentCache();
    }
  }

  if (!context?.bypassCache && currentCache) {
    if (currentCache.expiresAt <= now) {
      revalidateInBackground();
    }

    return currentCache.items;
  }

  const result = await refreshVideos(context);
  const cacheAfterRefresh = getCurrentCache();

  if (result.source === 'backend' && result.status === 'empty' && cacheAfterRefresh) {
    return cacheAfterRefresh.items;
  }

  if (shouldThrowResult(result)) {
    if (cacheAfterRefresh && !context?.bypassCache) {
      return cacheAfterRefresh.items;
    }

    if (!context?.bypassCache) {
      return [];
    }

    throw toServiceError(result);
  }

  return result.items;
};

export const getVideoById = async (
  id: string,
  context?: VideoServiceContext,
): Promise<VideoItem | undefined> => {
  const cachedItem = getCachedItems().find((video) => video.id === id);

  if (cachedItem && !context?.bypassCache) {
    return cachedItem;
  }

  const providerItem = await fetchVideoDetail(id, context);

  if (providerItem) {
    const cache = getCurrentCache();

    if (cache) {
      const hasItem = cache.items.some((video) => video.id === providerItem.id);
      const nextItems = hasItem
        ? cache.items.map((video) => (video.id === providerItem.id ? providerItem : video))
        : [providerItem, ...cache.items];
      const sortedItems = sortDefaultVideos(dedupeVideos(nextItems));

      setCachedResult(
        {
          errors: cache.errors,
          items: sortedItems,
          source: cache.source,
          stats: buildStats(
            sortedItems,
            cache.stats.durationMs,
            cache.stats.rawTotal,
            cache.errors,
          ),
          status: cache.status,
        },
        { preserveEpisodeProgress: false },
      );
    }

    return providerItem;
  }

  if (cachedItem) {
    return cachedItem;
  }

  const videos = await getAllVideos(context);

  return videos.find((video) => video.id === id);
};

export const getVideosByCategory = async (
  category: VideoCategory | string,
  context?: VideoServiceContext,
): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);
  const appCategory = mapCategoryToAppCategory(category);

  if (appCategory === '推荐') {
    return getRecommendedVideos(context);
  }

  return sortDefaultVideos(videos.filter((video) => video.category === appCategory));
};

type RecommendationPreference = {
  categories: Map<string, number>;
  favoriteIds: Set<string>;
  historyIds: Map<string, number>;
  latestHistoryAt: number;
};

const normalizeCategoryKey = (category?: string) =>
  mapCategoryToAppCategory(category).toLowerCase();

const addCategoryPreference = (
  categories: Map<string, number>,
  category: string | undefined,
  weight: number,
) => {
  if (!category) {
    return;
  }

  const key = normalizeCategoryKey(category);
  categories.set(key, (categories.get(key) ?? 0) + weight);
};

const createEmptyPreference = (): RecommendationPreference => ({
  categories: new Map<string, number>(),
  favoriteIds: new Set<string>(),
  historyIds: new Map<string, number>(),
  latestHistoryAt: 0,
});

const getHistoryPreference = (videos: VideoItem[]) => {
  try {
    return usePlayHistoryStore.getState().history.reduce((preference, item, index) => {
      const video = videos.find((candidate) => candidate.id === item.videoId);
      const recencyWeight = Math.max(1, 12 - index);

      preference.historyIds.set(item.videoId, recencyWeight);
      preference.latestHistoryAt = Math.max(
        preference.latestHistoryAt,
        toTimestamp(item.updatedAt),
      );
      addCategoryPreference(preference.categories, String(video?.category ?? ''), recencyWeight);

      return preference;
    }, createEmptyPreference());
  } catch {
    return createEmptyPreference();
  }
};

const getRecommendationPreference = (
  videos: VideoItem[],
  context?: VideoServiceContext,
): RecommendationPreference => {
  const preference = getHistoryPreference(videos);

  for (const id of context?.favoriteVideoIds ?? []) {
    preference.favoriteIds.add(id);
    const video = videos.find((item) => item.id === id);
    addCategoryPreference(preference.categories, String(video?.category ?? ''), 16);
  }

  for (const category of context?.favoriteCategories ?? []) {
    addCategoryPreference(preference.categories, String(category), 14);
  }

  for (const category of context?.preferredCategories ?? []) {
    addCategoryPreference(preference.categories, String(category), 10);
  }

  try {
    const defaultSort = useSettingsStore.getState().defaultSort;

    if (defaultSort === 'latest') {
      preference.categories.set('__latest__', 1);
    }

    if (defaultSort === 'mostPlayed') {
      preference.categories.set('__mostPlayed__', 1);
    }
  } catch {
    // Settings are optional for recommendation; content ranking remains deterministic.
  }

  return preference;
};

const getRecommendationScore = (video: VideoItem, preference: RecommendationPreference) => {
  const categoryWeight =
    preference.categories.get(normalizeCategoryKey(String(video.category))) ?? 0;
  const favoriteBoost = preference.favoriteIds.has(video.id) ? 180 : 0;
  const historyBoost = preference.historyIds.get(video.id) ?? 0;
  const playableBoost = video.playableInApp ? 320 : 0;
  const recentScore = getRecencyScore(video.createdAt);
  const engagementScore = Math.min(getEngagementScore(video) / 1_000, 90);
  const latestSettingBoost = preference.categories.has('__latest__') ? recentScore * 0.7 : 0;
  const mostPlayedSettingBoost = preference.categories.has('__mostPlayed__')
    ? engagementScore * 0.7
    : 0;

  return (
    playableBoost +
    favoriteBoost +
    historyBoost * 9 +
    categoryWeight * 12 +
    recentScore +
    engagementScore +
    latestSettingBoost +
    mostPlayedSettingBoost
  );
};

export const searchVideos = async (
  keyword: string,
  context?: VideoServiceContext,
): Promise<VideoItem[]> => {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const providerResults = await searchProviderVideos(keyword, context);

  if (providerResults) {
    return providerResults;
  }

  const videos = await getAllVideos(context);

  if (!normalizedKeyword) {
    return videos;
  }

  return sortSearchResults(
    videos
      .map((video) => ({
        score: getSearchRelevanceScore(video, normalizedKeyword),
        video,
      }))
      .filter((item) => item.score > 0)
      .map((item) => item.video),
    normalizedKeyword,
  );
};

export const getRecommendedVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);
  const preference = getRecommendationPreference(videos, context);

  return rankRecommendedVideos(videos, (video) => getRecommendationScore(video, preference));
};

export const getPlayableVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);

  return [...videos].filter((video) => video.playableInApp).sort(comparePlayableVideos);
};

export const getUnsupportedVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);

  return [...videos].filter((video) => !video.playableInApp).sort(compareUnsupportedVideos);
};

export const removeVideosByIds = (videoIds: string[]): number => {
  const cache = getCurrentCache();

  if (!cache || videoIds.length === 0) {
    return 0;
  }

  const removeSet = new Set(videoIds);
  const previousCount = cache.items.length;
  const remaining = cache.items.filter((video) => !removeSet.has(video.id));
  const removedCount = previousCount - remaining.length;

  if (removedCount === 0) {
    return 0;
  }

  setCachedResult(
    {
      errors: cache.errors,
      items: remaining,
      source: cache.source,
      stats: buildStats(remaining, cache.stats.durationMs, cache.stats.rawTotal, []),
      status: cache.status,
    },
    { preserveEpisodeProgress: false },
  );

  return removedCount;
};

export const clearVideoServiceCache = () => {
  abortBackgroundDeepCrawl();
  resetRefreshCoordinator();
  clearVideoCache();
  void clearLocalCrawlerProviderState();
};
