import {
  clearDiscoveredWebPages,
  crawlConfiguredAuthorizedWebPages,
  fetchEpisodeMediaUrl,
  probeMediaUrlReachable,
} from '@/services/webCrawlerService';
import type { VideoProvider } from '@/data/providers/providerTypes';

declare const __DEV__: boolean;

const ENABLE_LOCAL_CRAWLER_ENV = 'EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER';
const LEGACY_ENABLE_LOCAL_CRAWLER_ENV = 'EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER_FALLBACK';
const truthyEnvValues = new Set(['1', 'true', 'yes', 'on']);
const falsyEnvValues = new Set(['0', 'false', 'no', 'off']);
const LOCAL_RESOLVE_PROBE_TIMEOUT_MS = 12_000;

const getPublicEnv = (key: string) => {
  if (typeof process === 'undefined') {
    return undefined;
  }

  return process.env?.[key]?.trim().toLowerCase();
};

const getLocalCrawlerEnablement = () => {
  const configured =
    getPublicEnv(ENABLE_LOCAL_CRAWLER_ENV) ?? getPublicEnv(LEGACY_ENABLE_LOCAL_CRAWLER_ENV);

  if (configured && truthyEnvValues.has(configured)) {
    return {
      enabled: true,
      explicit: true,
      reason: `${ENABLE_LOCAL_CRAWLER_ENV}=true enables local crawler fallback.`,
    };
  }

  if (configured && falsyEnvValues.has(configured)) {
    return {
      enabled: false,
      explicit: true,
      reason: `${ENABLE_LOCAL_CRAWLER_ENV}=false disables local crawler fallback.`,
    };
  }

  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

  return {
    enabled: isDev,
    explicit: false,
    reason: isDev
      ? 'Development build enables local crawler fallback by default.'
      : `Production build requires ${ENABLE_LOCAL_CRAWLER_ENV}=true before local crawling.`,
  };
};

// Local crawling is intentionally a fallback provider. It is only for authorized
// sources, development diagnostics, or temporary recovery when the backend API is unavailable.
export const localCrawlerProvider: VideoProvider = {
  capabilities: ['fetch-videos', 'resolve-episode', 'local-fallback'],
  fetchVideos: async (options) => {
    const result = await crawlConfiguredAuthorizedWebPages(undefined, {
      maxTotalVideos: options?.maxTotalVideos,
      onProgress: options?.onRawProgress,
      signal: options?.signal,
      sourceOverrides: options?.sourceOverrides,
    });

    return {
      errors: result.errors.map((error) => ({
        code: 'CRAWL_FAILED' as const,
        message: error.reason ? `${error.message} (${error.reason})` : error.message,
        status: error.status,
        url: error.url,
      })),
      kind: 'local-crawler',
      providerId: localCrawlerProvider.id,
      rawSources: result.videos,
    };
  },
  getHealth: () => {
    const enablement = getLocalCrawlerEnablement();

    return {
      configured: true,
      enabled: enablement.enabled,
      message: enablement.reason,
      status: enablement.enabled ? 'available' : 'disabled',
    };
  },
  id: 'local-authorized-crawler',
  isConfigured: () => true,
  isEnabled: () => getLocalCrawlerEnablement().enabled,
  kind: 'local-crawler',
  label: 'Local Authorized Crawler',
  priority: {
    order: 100,
    reason: 'Fallback only; backend API should be preferred for production.',
  },
  resolveEpisode: async (payload, options) => {
    if (!payload.playPageUrl) {
      throw new Error('Local crawler resolve requires playPageUrl.');
    }

    const result = await fetchEpisodeMediaUrl(payload.playPageUrl, {
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    });

    if (!result.mediaUrl) {
      throw new Error('Episode media URL is empty.');
    }

    const probe = await probeMediaUrlReachable(result.mediaUrl, {
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? LOCAL_RESOLVE_PROBE_TIMEOUT_MS,
    });

    if (!probe.reachable) {
      throw new Error('Episode media URL is not reachable.');
    }

    return {
      format: result.format,
      mediaUrl: result.mediaUrl,
      sourceType: result.sourceType,
    };
  },
};

export const clearLocalCrawlerProviderState = () => clearDiscoveredWebPages();
