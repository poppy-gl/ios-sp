import Constants from 'expo-constants';

import type { VideoFormat, VideoItem, VideoSourceType } from '@/types/video';

type BackendApiConfig = {
  baseUrl?: string;
  configured: boolean;
  timeoutMs: number;
  token?: string;
};

type BackendApiOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type BackendRequestOptions = BackendApiOptions & {
  body?: unknown;
  method?: 'GET' | 'POST';
};

export type BackendEpisodeResolution = {
  format?: VideoFormat;
  mediaUrl: string;
  reachable?: boolean;
  sourceType?: VideoSourceType;
};

type BackendEpisodeResolutionPayload = {
  episode: number;
  line: number;
  playPageUrl?: string;
  videoId: string;
};

export class BackendApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'BackendApiError';
    this.status = status;
  }
}

const DEFAULT_API_TIMEOUT_MS = 15_000;

const getEnv = (key: string): string | undefined => {
  if (typeof process === 'undefined') {
    return undefined;
  }

  return process.env?.[key];
};

const getExtra = (key: string): string | undefined => {
  const value = Constants.expoConfig?.extra?.[key];

  return typeof value === 'string' ? value : undefined;
};

const normalizeOptionalString = (value?: string) => {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
};

const normalizeBaseUrl = (value?: string) => {
  const normalized = normalizeOptionalString(value);

  return normalized?.replace(/\/+$/, '');
};

export const getBackendApiConfig = (): BackendApiConfig => {
  const baseUrl = normalizeBaseUrl(
    getEnv('EXPO_PUBLIC_VIDEO_API_BASE_URL') ?? getEnv('API_BASE_URL') ?? getExtra('apiBaseUrl'),
  );
  const token = normalizeOptionalString(
    getEnv('EXPO_PUBLIC_VIDEO_API_TOKEN') ?? getEnv('API_TOKEN') ?? getExtra('apiToken'),
  );

  return {
    baseUrl,
    configured: !!baseUrl,
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
    token,
  };
};

export const isBackendApiConfigured = () => getBackendApiConfig().configured;

const createRequestController = (options?: BackendApiOptions) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS,
  );

  const abortFromParent = () => controller.abort();

  if (options?.signal?.aborted) {
    controller.abort();
  } else {
    options?.signal?.addEventListener('abort', abortFromParent);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      options?.signal?.removeEventListener('abort', abortFromParent);
    },
  };
};

const buildUrl = (path: string, query?: Record<string, string | number | undefined>) => {
  const config = getBackendApiConfig();

  if (!config.baseUrl) {
    throw new BackendApiError('Backend API is not configured.');
  }

  const pathname = path.startsWith('/') ? path : `/${path}`;
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });

  const queryText = params.toString();

  return `${config.baseUrl}${pathname}${queryText ? `?${queryText}` : ''}`;
};

const requestBackend = async <T>(
  path: string,
  options?: BackendRequestOptions & { query?: Record<string, string | number | undefined> },
): Promise<T> => {
  const config = getBackendApiConfig();
  const controller = createRequestController({
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? config.timeoutMs,
  });

  try {
    const response = await fetch(buildUrl(path, options?.query), {
      body: options?.body ? JSON.stringify(options.body) : undefined,
      headers: {
        Accept: 'application/json',
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      method: options?.method ?? 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new BackendApiError(
        `Backend API request failed with ${response.status}.`,
        response.status,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } finally {
    controller.cleanup();
  }
};

const extractItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const items = record.items ?? record.videos ?? record.data;

  return Array.isArray(items) ? items : [];
};

const isVideoItemLike = (item: unknown): item is VideoItem => {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const record = item as Partial<VideoItem>;

  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.source === 'string'
  );
};

const parseVideoItems = (payload: unknown): VideoItem[] =>
  extractItems(payload)
    .filter(isVideoItemLike)
    .map((item) => ({
      ...item,
      playableInApp: Boolean(item.playableInApp),
    }));

const parseVideoItem = (payload: unknown): VideoItem | undefined => {
  const value =
    payload && typeof payload === 'object' && 'item' in payload
      ? (payload as { item?: unknown }).item
      : payload;

  return isVideoItemLike(value)
    ? { ...value, playableInApp: Boolean(value.playableInApp) }
    : undefined;
};

export const fetchBackendVideos = async (
  options?: BackendApiOptions & {
    category?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
  },
): Promise<VideoItem[]> => {
  const payload = await requestBackend<unknown>('/api/videos', {
    query: {
      category: options?.category,
      page: options?.page,
      pageSize: options?.pageSize,
      sort: options?.sort,
    },
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });

  return parseVideoItems(payload);
};

export const fetchBackendVideoById = async (
  id: string,
  options?: BackendApiOptions,
): Promise<VideoItem | undefined> => {
  const payload = await requestBackend<unknown>(`/api/videos/${encodeURIComponent(id)}`, options);

  return parseVideoItem(payload);
};

export const searchBackendVideos = async (
  keyword: string,
  options?: BackendApiOptions,
): Promise<VideoItem[]> => {
  const payload = await requestBackend<unknown>('/api/search', {
    query: { q: keyword },
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });

  return parseVideoItems(payload);
};

export const resolveBackendEpisodeMedia = async (
  payload: BackendEpisodeResolutionPayload,
  options?: BackendApiOptions,
): Promise<BackendEpisodeResolution> => {
  const result = await requestBackend<unknown>('/api/resolve', {
    body: payload,
    method: 'POST',
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });

  if (!result || typeof result !== 'object') {
    throw new BackendApiError('Backend resolve response is empty.');
  }

  const record = result as Partial<BackendEpisodeResolution>;

  if (typeof record.mediaUrl !== 'string' || record.mediaUrl.trim().length === 0) {
    throw new BackendApiError('Backend resolve response does not include mediaUrl.');
  }

  return {
    format: record.format,
    mediaUrl: record.mediaUrl,
    reachable: record.reachable,
    sourceType: record.sourceType,
  };
};
