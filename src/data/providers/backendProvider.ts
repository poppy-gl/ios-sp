import {
  fetchBackendVideoById,
  fetchBackendVideos,
  getBackendApiConfig,
  isBackendApiConfigured,
  resolveBackendEpisodeMedia,
  searchBackendVideos,
} from '@/services/backendApiService';
import type { VideoProvider } from '@/data/providers/providerTypes';

export const backendProvider: VideoProvider = {
  capabilities: ['fetch-videos', 'search-videos', 'get-video-detail', 'resolve-episode'],
  fetchVideos: async (options) => ({
    errors: [],
    items: await fetchBackendVideos({
      category: options?.category,
      page: options?.page,
      pageSize: options?.pageSize,
      signal: options?.signal,
      sort: options?.sort,
      timeoutMs: options?.timeoutMs,
    }),
    kind: 'backend',
    providerId: backendProvider.id,
  }),
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
