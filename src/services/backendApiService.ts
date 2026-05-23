import Constants from 'expo-constants';

import type {
  BackendEpisodeDTO,
  BackendPlayLineDTO,
  BackendResolveResponse,
  BackendVideoDTO,
} from '@/domain/video/backendTypes';
import { mapCategoryToAppCategory } from '@/services/categoryService';
import { detectVideoFormat } from '@/services/formatDetector';
import type {
  VideoFormat,
  VideoItem,
  VideoCodec,
  VideoPlaybackOption,
  VideoPlayLine,
  VideoSourceType,
} from '@/types/video';

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
const validSourceTypes = new Set<VideoSourceType>([
  'mp4',
  'm3u8',
  'hls',
  'dash',
  'mov',
  'm4v',
  'mkv',
  'webm',
  'avi',
  'flv',
  'ts',
  'mpeg',
  'mpg',
  '3gp',
  'rmvb',
  'mp3',
  'aac',
  'wav',
  'm4a',
  'unknown',
  'webview',
  'unsupported',
]);
const directSourceTypes = new Set<VideoSourceType>(['mp4', 'm3u8', 'hls', 'mov', 'm4v']);
const validFormats = new Set<VideoFormat>([
  'mp4',
  'm3u8',
  'hls',
  'dash',
  'mov',
  'm4v',
  'mkv',
  'webm',
  'avi',
  'flv',
  'ts',
  'mpeg',
  'mpg',
  '3gp',
  'rmvb',
  'mp3',
  'aac',
  'wav',
  'm4a',
  'unknown',
]);
const validCodecs = new Set<VideoCodec>([
  'h264',
  'h265',
  'hevc',
  'vp8',
  'vp9',
  'av1',
  'aac',
  'unknown',
]);

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

const hasPlayableBackendInfo = (record: Partial<BackendVideoDTO>) =>
  Boolean(
    normalizeOptionalString(record.source) ||
    normalizeOptionalString(record.webViewUrl) ||
    normalizeOptionalString(record.playPageUrl) ||
    (Array.isArray(record.playLines) && record.playLines.length > 0) ||
    (Array.isArray(record.playbackOptions) && record.playbackOptions.length > 0),
  );

const isBackendVideoDTOLike = (item: unknown): item is BackendVideoDTO => {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const record = item as Partial<BackendVideoDTO>;

  return typeof record.id === 'string' && typeof record.title === 'string';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const normalizeSourceType = (
  value: unknown,
  fallbackUri?: string,
  fallbackFormat?: VideoFormat,
): VideoSourceType => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (validSourceTypes.has(normalized as VideoSourceType)) {
      return normalized as VideoSourceType;
    }
  }

  const detected = detectVideoFormat({
    format: fallbackFormat,
    uri: fallbackUri,
  });

  if (detected.format !== 'unknown') {
    return detected.format === 'm3u8' ? 'm3u8' : detected.format;
  }

  return 'unsupported';
};

const normalizeFormat = (value: unknown, fallbackUri?: string): VideoFormat | undefined => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (validFormats.has(normalized as VideoFormat)) {
      return normalized as VideoFormat;
    }
  }

  const detected = detectVideoFormat({
    uri: fallbackUri,
  });

  return detected.format !== 'unknown' ? detected.format : undefined;
};

const normalizeCodec = (value: unknown): VideoCodec | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  return validCodecs.has(normalized as VideoCodec) ? (normalized as VideoCodec) : undefined;
};

const normalizePlaybackOptions = (value: unknown): VideoPlaybackOption[] =>
  Array.isArray(value)
    ? value.flatMap((option) => {
        if (!isRecord(option) || typeof option.uri !== 'string' || !option.uri.trim()) {
          return [];
        }

        const format = normalizeFormat(option.format, option.uri);
        const sourceType = normalizeSourceType(option.sourceType, option.uri, format);

        return [
          {
            codec: typeof option.codec === 'string' ? (option.codec as VideoCodec) : undefined,
            format,
            label: typeof option.label === 'string' ? option.label : undefined,
            mimeType: typeof option.mimeType === 'string' ? option.mimeType : undefined,
            playableInApp:
              typeof option.playableInApp === 'boolean'
                ? option.playableInApp
                : directSourceTypes.has(sourceType),
            sourceType,
            unsupportedReason:
              typeof option.unsupportedReason === 'string' ? option.unsupportedReason : undefined,
            uri: option.uri.trim(),
          },
        ];
      })
    : [];

const normalizePlayLines = (
  value: BackendPlayLineDTO[] | undefined,
): VideoPlayLine[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const lines = value.flatMap((line): VideoPlayLine[] => {
    if (!isRecord(line) || !Array.isArray(line.episodes)) {
      return [];
    }

    const lineNumber = Number(line.line);
    const episodes = line.episodes.flatMap((episode: BackendEpisodeDTO) => {
      if (!isRecord(episode)) {
        return [];
      }

      const episodeNumber = Number(episode.episode);
      const playPageUrl = typeof episode.playPageUrl === 'string' ? episode.playPageUrl.trim() : '';
      const mediaUrl = typeof episode.mediaUrl === 'string' ? episode.mediaUrl.trim() : undefined;
      const label = normalizeOptionalString(episode.episodeLabel ?? episode.label);

      if (!Number.isFinite(episodeNumber) || (!playPageUrl && !mediaUrl)) {
        return [];
      }

      const format = normalizeFormat(episode.format, mediaUrl ?? playPageUrl);

      return [
        {
          episode: episodeNumber,
          episodeLabel: label,
          format,
          mediaUrl,
          playPageUrl: playPageUrl || mediaUrl || '',
          sourceType: normalizeSourceType(episode.sourceType, mediaUrl ?? playPageUrl, format),
        },
      ];
    });

    if (!Number.isFinite(lineNumber) || episodes.length === 0) {
      return [];
    }

    return [
      {
        episodes,
        label: typeof line.label === 'string' ? line.label : `线路 ${lineNumber}`,
        line: lineNumber,
      },
    ];
  });

  return lines.length > 0 ? lines : undefined;
};

const buildLazyPlayLines = (record: BackendVideoDTO): VideoPlayLine[] | undefined => {
  const lazyPlayPageUrl =
    normalizeOptionalString(record.playPageUrl) ||
    normalizeOptionalString(record.webViewUrl) ||
    normalizeOptionalString(record.source);

  if (!lazyPlayPageUrl) {
    return undefined;
  }

  const format = normalizeFormat(record.format, lazyPlayPageUrl);
  const mediaUrl = directSourceTypes.has(
    normalizeSourceType(record.sourceType, lazyPlayPageUrl, format),
  )
    ? lazyPlayPageUrl
    : undefined;

  return [
    {
      episodes: [
        {
          episode: 1,
          episodeLabel: '第 1 集',
          format,
          mediaUrl,
          playPageUrl: lazyPlayPageUrl,
          sourceType: normalizeSourceType(record.sourceType, mediaUrl ?? lazyPlayPageUrl, format),
        },
      ],
      label: '默认线路',
      line: 1,
    },
  ];
};

const inferPlayableInApp = (
  item: Partial<VideoItem>,
  sourceType: VideoSourceType,
  playLines?: VideoPlayLine[],
  playbackOptions?: VideoPlaybackOption[],
) => {
  if (playbackOptions?.some((option) => option.playableInApp)) {
    return true;
  }

  if (playLines?.some((line) => line.episodes.some((episode) => Boolean(episode.mediaUrl)))) {
    return true;
  }

  if (directSourceTypes.has(sourceType)) {
    return item.playableInApp !== false;
  }

  return false;
};

const findFirstEpisodeSource = (playLines?: VideoPlayLine[]) =>
  playLines
    ?.flatMap((line) => line.episodes)
    .find((episode) => episode.mediaUrl || episode.playPageUrl);

const findFirstPlaybackOptionSource = (playbackOptions: VideoPlaybackOption[]) =>
  playbackOptions.find((option) => option.uri.trim());

const getInitialSource = (
  record: BackendVideoDTO,
  playLines?: VideoPlayLine[],
  playbackOptions: VideoPlaybackOption[] = [],
) => {
  const source = normalizeOptionalString(record.source);

  if (source) {
    return source;
  }

  const episode = findFirstEpisodeSource(playLines);

  return (
    episode?.mediaUrl ||
    episode?.playPageUrl ||
    findFirstPlaybackOptionSource(playbackOptions)?.uri ||
    normalizeOptionalString(record.webViewUrl) ||
    normalizeOptionalString(record.playPageUrl) ||
    `backend-lazy://${record.id}`
  );
};

export const normalizeBackendVideoDTO = (item: unknown): VideoItem | undefined => {
  if (!isBackendVideoDTOLike(item)) {
    return undefined;
  }

  const record = item;
  const playbackOptions = normalizePlaybackOptions(record.playbackOptions);
  const playLines = normalizePlayLines(record.playLines) ?? buildLazyPlayLines(record);
  const source = getInitialSource(record, playLines, playbackOptions);
  const format = normalizeFormat(record.format, source);
  const sourceType = normalizeSourceType(record.sourceType, source, format);
  const hasPlaybackInfo = hasPlayableBackendInfo(record);
  const hasLazyResolveInfo = Boolean(
    normalizeOptionalString(record.playPageUrl) ||
    normalizeOptionalString(record.webViewUrl) ||
    playLines?.some((line) => line.episodes.some((episode) => episode.playPageUrl)),
  );
  const playableInApp = inferPlayableInApp(
    {
      source,
    },
    sourceType,
    playLines,
    playbackOptions,
  );
  const incomingCategory = String(record.category ?? record.rawCategory ?? '');
  const category = mapCategoryToAppCategory(incomingCategory);
  const rawCategory =
    record.rawCategory ??
    (incomingCategory && incomingCategory !== String(category) ? incomingCategory : undefined);
  const subCategory =
    typeof record.subCategory === 'string' && record.subCategory.trim()
      ? record.subCategory.trim()
      : rawCategory && rawCategory !== String(category)
        ? rawCategory
        : undefined;
  const unsupportedReason =
    record.unsupportedReason ??
    (hasPlaybackInfo
      ? hasLazyResolveInfo
        ? '需要通过后端 /api/resolve 懒解析播放地址'
        : '当前来源暂无可直接播放的媒体地址'
      : 'missing-playback-info');

  if (!hasPlaybackInfo) {
    console.warn('[backendApiService] backend video missing playback info', {
      id: record.id,
      title: record.title,
    });
  }

  return {
    ...record,
    codec: normalizeCodec(record.codec),
    id: record.id,
    title: record.title,
    source,
    category,
    rawCategory,
    subCategory,
    format,
    playableInApp,
    playback: playableInApp
      ? record.playback?.type === 'direct'
        ? record.playback
        : {
            type: 'direct',
            uri:
              findFirstPlaybackOptionSource(playbackOptions)?.uri ??
              findFirstEpisodeSource(playLines)?.mediaUrl ??
              source,
            format,
          }
      : {
          type: 'unplayable',
          reason: unsupportedReason,
        },
    playbackOptions: playbackOptions.length > 0 ? playbackOptions : undefined,
    playLines,
    sourceType,
    unsupportedReason: playableInApp ? undefined : unsupportedReason,
  };
};

const parseVideoItems = (payload: unknown): VideoItem[] =>
  extractItems(payload)
    .map(normalizeBackendVideoDTO)
    .filter((item): item is VideoItem => Boolean(item));

const parseVideoItem = (payload: unknown): VideoItem | undefined => {
  const value =
    payload && typeof payload === 'object' && 'item' in payload
      ? (payload as { item?: unknown }).item
      : payload;

  return normalizeBackendVideoDTO(value);
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

  const record = result as BackendResolveResponse;

  if (typeof record.mediaUrl !== 'string' || record.mediaUrl.trim().length === 0) {
    throw new BackendApiError('Backend resolve response does not include mediaUrl.');
  }

  const mediaUrl = record.mediaUrl.trim();
  const format = normalizeFormat(record.format, mediaUrl);
  const sourceType = normalizeSourceType(record.sourceType, mediaUrl, format);
  const detected = detectVideoFormat({
    format,
    sourceType,
    uri: mediaUrl,
  });

  return {
    format: format ?? detected.format,
    mediaUrl,
    reachable: record.reachable,
    sourceType: normalizeSourceType(sourceType, mediaUrl, format ?? detected.format),
  };
};
