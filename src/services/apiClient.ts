import { API_ENDPOINTS, API_TIMEOUT_MS, getApiBaseUrl } from '@/config/api';
import { normalizeVideoSource } from '@/services/videoService';
import type { RawVideoSource, VideoCategory, VideoItem } from '@/types/video';

export type ApiRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

type ApiCollectionPayload<T> = {
  data?: T[];
  items?: T[];
  videos?: T[];
  categories?: T[];
  recommendations?: T[];
};

type ApiCollectionResponse<T> = T[] | ApiCollectionPayload<T>;

type ApiDetailResponse<T> =
  | T
  | {
      data?: T;
      item?: T;
      video?: T;
    };

export class ApiClientError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

const createTimeoutSignal = (timeoutMs: number): { signal: AbortSignal; cleanup: () => void } => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
};

const mergeSignals = (signals: AbortSignal[]): AbortSignal => {
  const controller = new AbortController();
  const abort = () => controller.abort();

  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      break;
    }

    signal.addEventListener('abort', abort, { once: true });
  }

  return controller.signal;
};

const buildApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${getApiBaseUrl()}${normalizedPath}`;
};

const requestJson = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  const timeout = createTimeoutSignal(options.timeoutMs ?? API_TIMEOUT_MS);
  const signal = options.signal ? mergeSignals([options.signal, timeout.signal]) : timeout.signal;

  try {
    const response = await fetch(buildApiUrl(path), {
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      throw new ApiClientError(
        `API request failed with status ${response.status}.`,
        response.status,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError('API request timed out or was cancelled.');
    }

    throw new ApiClientError(error instanceof Error ? error.message : 'API request failed.');
  } finally {
    timeout.cleanup();
  }
};

const normalizeCollectionResponse = <T>(
  payload: ApiCollectionResponse<T>,
  key: keyof ApiCollectionPayload<T>,
): T[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  return payload[key] ?? payload.items ?? payload.data ?? [];
};

const normalizeDetailResponse = <T>(payload: ApiDetailResponse<T>): T | undefined => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const wrappedPayload = payload as { data?: T; item?: T; video?: T };

    return wrappedPayload.video ?? wrappedPayload.item ?? wrappedPayload.data ?? (payload as T);
  }

  return payload;
};

const normalizeVideos = (rawVideos: RawVideoSource[]): VideoItem[] =>
  rawVideos.map((rawVideo) => normalizeVideoSource(rawVideo));

export const fetchVideos = async (options?: ApiRequestOptions): Promise<VideoItem[]> => {
  const payload = await requestJson<ApiCollectionResponse<RawVideoSource>>(
    API_ENDPOINTS.videos,
    options,
  );

  return normalizeVideos(normalizeCollectionResponse(payload, 'videos'));
};

export const fetchVideoDetail = async (
  id: string,
  options?: ApiRequestOptions,
): Promise<VideoItem | undefined> => {
  const payload = await requestJson<ApiDetailResponse<RawVideoSource>>(
    API_ENDPOINTS.videoDetail(id),
    options,
  );
  const rawVideo = normalizeDetailResponse(payload);

  return rawVideo ? normalizeVideoSource(rawVideo) : undefined;
};

export const fetchRecommendations = async (options?: ApiRequestOptions): Promise<VideoItem[]> => {
  const payload = await requestJson<ApiCollectionResponse<RawVideoSource>>(
    API_ENDPOINTS.recommendations,
    options,
  );

  return normalizeVideos(normalizeCollectionResponse(payload, 'recommendations'));
};

export const fetchCategories = async (options?: ApiRequestOptions): Promise<VideoCategory[]> => {
  const payload = await requestJson<ApiCollectionResponse<VideoCategory>>(
    API_ENDPOINTS.categories,
    options,
  );

  return normalizeCollectionResponse(payload, 'categories');
};
