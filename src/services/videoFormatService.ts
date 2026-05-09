import { inferVideoCategory, mapCategoryToAppCategory } from '@/services/categoryService';
import { evaluatePlayerSupport } from '@/services/playerSupportService';
import { parseVideoSource } from '@/services/sourceParser';
import type {
  RawVideoSource,
  VideoItem,
  VideoPlaybackOption,
  VideoSourceType,
} from '@/types/video';

export type Thread66VideoJson =
  | RawVideoSource[]
  | {
      data?: RawVideoSource[];
      items?: RawVideoSource[];
      videos?: RawVideoSource[];
    };

const DEFAULT_PROVIDER = 'User Source';
const UNSUPPORTED_IN_APP_REASON =
  '\u5f53\u524d\u683c\u5f0f\u6682\u4e0d\u652f\u6301 App \u5185\u64ad\u653e';
const WEB_PAGE_FALLBACK_REASON =
  '\u5f53\u524d\u4ec5\u83b7\u53d6\u5230\u7f51\u9875\u64ad\u653e\u9875\uff0c\u9700\u8981\u6253\u5f00\u5916\u90e8\u9875\u9762\u6216\u7b49\u5f85\u91cd\u65b0\u89e3\u6790';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseJsonPayload = (input: string | Thread66VideoJson): Thread66VideoJson => {
  if (typeof input !== 'string') {
    return input;
  }

  const parsed = JSON.parse(input) as unknown;

  if (!Array.isArray(parsed) && !isRecord(parsed)) {
    throw new Error('Thread 6.6 JSON must be an array or an object containing videos.');
  }

  return parsed as Thread66VideoJson;
};

export const extractRawVideoSources = (input: string | Thread66VideoJson): RawVideoSource[] => {
  const payload = parseJsonPayload(input);

  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.videos ?? payload.items ?? payload.data ?? [];
};

const resolveSourceType = (
  rawSourceType: VideoSourceType | undefined,
  parsedSourceType: VideoSourceType,
) => {
  if (rawSourceType && rawSourceType !== 'unsupported' && rawSourceType !== 'webview') {
    return rawSourceType;
  }

  return parsedSourceType;
};

const getParsedPlayableHint = (parsedSourceType: VideoSourceType, playableInApp: boolean) =>
  parsedSourceType === 'unsupported' ? undefined : playableInApp;

const getRawPlayableHint = (
  raw: RawVideoSource,
  parsedSourceType: VideoSourceType,
  parsedPlayableInApp: boolean,
) => {
  const rawPlayableInApp = (raw as { playableInApp?: boolean }).playableInApp;

  if (typeof rawPlayableInApp === 'boolean') {
    return rawPlayableInApp;
  }

  return getParsedPlayableHint(parsedSourceType, parsedPlayableInApp);
};

const getFallbackUnsupportedReason = (
  raw: RawVideoSource,
  sourceType: VideoSourceType,
  parsedUnsupportedReason?: string,
) => {
  if (sourceType === 'unsupported' && raw.webViewUrl && raw.source === raw.webViewUrl) {
    return WEB_PAGE_FALLBACK_REASON;
  }

  return parsedUnsupportedReason ?? UNSUPPORTED_IN_APP_REASON;
};

const getPlaybackLabel = (option: VideoPlaybackOption) =>
  option.label ??
  (option.format ? option.format.toUpperCase() : option.sourceType?.toUpperCase()) ??
  'DIRECT';

const normalizePlaybackOption = (option: VideoPlaybackOption): VideoPlaybackOption => {
  const parsedSource = parseVideoSource(option.uri);
  const sourceType = resolveSourceType(option.sourceType, parsedSource.sourceType);
  const support = evaluatePlayerSupport({
    codec: option.codec,
    format: option.format ?? parsedSource.format,
    mimeType: option.mimeType ?? parsedSource.mimeType,
    playableInApp:
      option.playableInApp ??
      getParsedPlayableHint(parsedSource.sourceType, parsedSource.playableInApp),
    sourceType,
    uri: option.uri,
  });

  return {
    codec: support.codec,
    format: support.format,
    label: getPlaybackLabel({ ...option, format: support.format, sourceType }),
    mimeType: option.mimeType ?? support.mimeType,
    playableInApp: support.playableInApp,
    sourceType,
    unsupportedReason:
      option.unsupportedReason ?? support.unsupportedReason ?? parsedSource.unsupportedReason,
    uri: option.uri,
  };
};

export const normalizeVideoFormatSource = (raw: RawVideoSource): VideoItem => {
  if (!raw.id || !raw.title || !raw.source) {
    throw new Error('Video source must include id, title, and source.');
  }

  const parsedSource = parseVideoSource(raw.source);
  const sourceType = resolveSourceType(raw.sourceType, parsedSource.sourceType);
  const support = evaluatePlayerSupport({
    codec: raw.codec,
    format: raw.format ?? parsedSource.format,
    isDrm: raw.isDrm || raw.drm,
    mimeType: raw.mimeType ?? parsedSource.mimeType,
    playableInApp: getRawPlayableHint(raw, parsedSource.sourceType, parsedSource.playableInApp),
    sourceType,
    uri: raw.source,
  });
  const category = raw.category ? mapCategoryToAppCategory(raw.category) : inferVideoCategory(raw);
  const fallbackUnsupportedReason = getFallbackUnsupportedReason(
    raw,
    sourceType,
    parsedSource.unsupportedReason,
  );
  const unsupportedReason =
    raw.source === raw.webViewUrl
      ? fallbackUnsupportedReason
      : (support.unsupportedReason ?? fallbackUnsupportedReason);
  const primaryPlaybackOption = normalizePlaybackOption({
    codec: raw.codec,
    format: raw.format ?? parsedSource.format,
    label: 'AUTO',
    mimeType: raw.mimeType ?? parsedSource.mimeType,
    playableInApp: support.playableInApp,
    sourceType,
    unsupportedReason,
    uri: raw.source,
  });
  const playbackOptions = [
    primaryPlaybackOption,
    ...(raw.playbackOptions ?? raw.sources ?? []).map(normalizePlaybackOption),
  ].filter((option, index, options) => {
    const key = option.uri.trim().toLowerCase();

    return key && options.findIndex((item) => item.uri.trim().toLowerCase() === key) === index;
  });
  const playableOptions = playbackOptions.filter((option) => option.playableInApp);
  const selectedPlaybackOption = playableOptions[0] ?? primaryPlaybackOption;
  const hasPlayableEpisode = (raw.playLines ?? []).some((line) =>
    line.episodes.some((episode) => Boolean(episode.mediaUrl)),
  );
  const hasLazyLoadableEpisode = (raw.playLines ?? []).some((line) =>
    line.episodes.some((episode) => Boolean(episode.playPageUrl)),
  );
  const playableInApp = playableOptions.length > 0 || hasPlayableEpisode || hasLazyLoadableEpisode;
  const selectedUnsupportedReason = selectedPlaybackOption.unsupportedReason ?? unsupportedReason;

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    cover: raw.cover,
    source: raw.source,
    sourceType: selectedPlaybackOption.sourceType ?? sourceType,
    category,
    rawCategory: raw.category ?? raw.rawCategory,
    author: raw.author,
    provider: raw.provider ?? DEFAULT_PROVIDER,
    playCount: raw.playCount,
    danmakuCount: raw.danmakuCount,
    duration: raw.duration,
    createdAt: raw.createdAt,
    tags: raw.tags,
    format: selectedPlaybackOption.format ?? support.format,
    codec: selectedPlaybackOption.codec ?? support.codec,
    drm: raw.drm,
    isDrm: raw.isDrm,
    mimeType: selectedPlaybackOption.mimeType ?? raw.mimeType ?? support.mimeType,
    playableInApp,
    unsupportedReason: playableInApp ? undefined : selectedUnsupportedReason,
    thumbnailUrl: raw.thumbnailUrl ?? raw.cover,
    webViewUrl: raw.webViewUrl,
    playback: playableInApp
      ? {
          type: 'direct',
          uri: selectedPlaybackOption.uri,
          format: selectedPlaybackOption.format,
        }
      : {
          type: 'unplayable',
          reason: selectedUnsupportedReason,
        },
    playbackOptions,
    playLines: raw.playLines,
    seriesId: raw.seriesId,
  };
};

export const normalizeThread66VideoJson = (input: string | Thread66VideoJson): VideoItem[] =>
  extractRawVideoSources(input).map(normalizeVideoFormatSource);

export const normalizeVideoFormats = normalizeThread66VideoJson;
