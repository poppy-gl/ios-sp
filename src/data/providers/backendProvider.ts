import {
  fetchBackendVideoById,
  fetchBackendVideoPage as fetchBackendApiVideoPage,
  fetchBackendHealth,
  fetchBackendVideos,
  getBackendApiConfig,
  isBackendApiConfigured,
  resolveBackendEpisodeMedia,
  searchBackendVideos,
} from '@/data/api/backendApiService';
import type { VideoProvider } from '@/data/providers/providerTypes';

const BACKEND_MAX_PAGE_SIZE = 200;
const BACKEND_DEFAULT_MAX_VIDEOS = 200;

const clampPositiveInteger = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

const fetchBackendVideoPages: NonNullable<VideoProvider['fetchVideos']> = async (options) => {
  if (options?.page || options?.cursor) {
    const page = await fetchBackendApiVideoPage({
      category: options.category,
      cursor: options.cursor,
      page: options.page,
      pageSize: Math.min(
        clampPositiveInteger(
          options.pageSize ?? options.maxTotalVideos ?? BACKEND_MAX_PAGE_SIZE,
          BACKEND_MAX_PAGE_SIZE,
        ),
        BACKEND_MAX_PAGE_SIZE,
      ),
      signal: options.signal,
      sort: options.sort,
      timeoutMs: options.timeoutMs,
    });

    return {
      errors: [],
      hasMore: page.hasMore,
      items: page.items,
      kind: 'backend',
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      providerId: backendProvider.id,
    };
  }

  const maxVideos = clampPositiveInteger(
    options?.maxTotalVideos ?? options?.pageSize ?? BACKEND_DEFAULT_MAX_VIDEOS,
    BACKEND_DEFAULT_MAX_VIDEOS,
  );
  const pageSize = Math.min(
    clampPositiveInteger(options?.pageSize ?? maxVideos, BACKEND_MAX_PAGE_SIZE),
    BACKEND_MAX_PAGE_SIZE,
  );
  const items = [];

  for (let page = 1; items.length < maxVideos; page += 1) {
    const pageItems = await fetchBackendVideos({
      category: options?.category,
      page,
      pageSize,
      signal: options?.signal,
      sort: options?.sort,
      timeoutMs: options?.timeoutMs,
    });

    items.push(...pageItems);

    if (pageItems.length < pageSize) {
      break;
    }
  }

  return {
    errors: [],
    items: items.slice(0, maxVideos),
    kind: 'backend',
    providerId: backendProvider.id,
  };
};

export const backendProvider: VideoProvider = {
  capabilities: ['fetch-videos', 'search-videos', 'get-video-detail', 'resolve-episode'],
  fetchVideos: fetchBackendVideoPages,
  getHealth: () => {
    const config = getBackendApiConfig();

    return {
      configured: config.configured,
      enabled: config.configured,
      message: config.configured
        ? 'Backend API configured; App should prefer this provider.'
        : 'Set EXPO_PUBLIC_VIDEO_API_BASE_URL to enable backend API.',
      status: config.configured ? 'available' : 'disabled',
    };
  },
  getVideoById: fetchBackendVideoById,
  healthCheck: fetchBackendHealth,
  id: 'backend-api',
  isConfigured: isBackendApiConfigured,
  isEnabled: isBackendApiConfigured,
  kind: 'backend',
  label: 'Backend API',
  priority: {
    order: 1_000,
    reason: 'Configured backend API is the production data source.',
  },
  resolveEpisode: resolveBackendEpisodeMedia,
  searchVideos: searchBackendVideos,
};
