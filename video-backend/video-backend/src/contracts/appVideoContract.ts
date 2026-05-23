export type AppCategory = '电影' | '电视剧' | '综艺' | '动漫';

export type AppSourceType = 'mp4' | 'm3u8' | 'hls' | 'mov' | 'm4v' | 'unsupported';

type DirectSourceType = Exclude<AppSourceType, 'unsupported'>;

export type AppVideoEpisode = {
  episode: number;
  episodeLabel?: string | undefined;
  format?: AppSourceType | undefined;
  mediaUrl?: string | undefined;
  playPageUrl: string;
  sourceType: AppSourceType;
};

export type AppVideoPlayLine = {
  line: number;
  label: string;
  episodes: AppVideoEpisode[];
};

export type AppVideoItem = {
  id: string;
  title: string;
  description?: string | undefined;
  cover?: string | undefined;
  thumbnailUrl?: string | undefined;
  source: string;
  sourceType: AppSourceType;
  category: AppCategory;
  subCategory?: string | undefined;
  categoryMappingConfidence?: number | undefined;
  categoryMappingReason?: string | undefined;
  provider?: string | undefined;
  seriesId?: string | undefined;
  rawCategory?: string | undefined;
  tags?: string[] | undefined;
  webViewUrl?: string | undefined;
  playableInApp: boolean;
  unsupportedReason?: string | undefined;
  playLines?: AppVideoPlayLine[] | undefined;
};

export type ResolveEpisodeResponse = {
  mediaUrl: string;
  format: DirectSourceType;
  sourceType: DirectSourceType;
  reachable: boolean;
};

const TV_SUB_CATEGORIES = new Set(['韩剧', '国产剧', '日剧', '港台剧', '欧美剧', '泰剧', '海外剧']);
const VARIETY_SUB_CATEGORIES = new Set(['内地综艺', '港台综艺', '日韩综艺', '欧美综艺']);
const ANIME_SUB_CATEGORIES = new Set(['国漫', '日漫', '港台动漫', '美漫', '海外动漫']);
const DIRECT_SOURCE_TYPES = new Set<AppSourceType>(['mp4', 'm3u8', 'hls', 'mov', 'm4v']);
const VALID_SOURCE_TYPES = new Set<AppSourceType>([
  'mp4',
  'm3u8',
  'hls',
  'mov',
  'm4v',
  'unsupported',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const asStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter(Boolean)
        .filter((item, index, items) => items.indexOf(item) === index)
    : undefined;

export const detectSourceTypeFromUrl = (url?: string): AppSourceType => {
  const clean = asString(url).split('?')[0]?.toLowerCase() ?? '';

  if (clean.endsWith('.m3u8')) return 'm3u8';
  if (clean.endsWith('.mp4')) return 'mp4';
  if (clean.endsWith('.mov')) return 'mov';
  if (clean.endsWith('.m4v')) return 'm4v';

  return 'unsupported';
};

const normalizeSourceType = (value: unknown, fallbackUrl?: string): AppSourceType => {
  const normalized = asString(value).toLowerCase();

  if (VALID_SOURCE_TYPES.has(normalized as AppSourceType)) {
    return normalized as AppSourceType;
  }

  return detectSourceTypeFromUrl(fallbackUrl);
};

const isDirectSourceType = (sourceType: AppSourceType): sourceType is DirectSourceType =>
  DIRECT_SOURCE_TYPES.has(sourceType);

export const mapCategoryForApp = (category?: string, subCategory?: string): AppCategory => {
  if (category === '电影' || category === '综艺' || category === '动漫') return category;

  if (category === '电视剧' || category === '韩剧' || TV_SUB_CATEGORIES.has(subCategory ?? '')) {
    return '电视剧';
  }

  if (VARIETY_SUB_CATEGORIES.has(subCategory ?? '')) return '综艺';
  if (ANIME_SUB_CATEGORIES.has(subCategory ?? '')) return '动漫';

  return '电影';
};

const normalizePlayLines = (value: unknown): AppVideoPlayLine[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const playLines = value.flatMap((line, lineIndex): AppVideoPlayLine[] => {
    if (!isRecord(line) || !Array.isArray(line.episodes)) {
      return [];
    }

    const lineNumber = Number(line.line ?? lineIndex + 1);

    if (!Number.isFinite(lineNumber) || lineNumber <= 0) {
      return [];
    }

    const episodes = line.episodes.flatMap((episode, episodeIndex): AppVideoEpisode[] => {
      if (!isRecord(episode)) {
        return [];
      }

      const episodeNumber = Number(episode.episode ?? episodeIndex + 1);
      const mediaUrl = asString(episode.mediaUrl) || undefined;
      const playPageUrl = asString(episode.playPageUrl) || mediaUrl;

      if (!Number.isFinite(episodeNumber) || episodeNumber <= 0 || !playPageUrl) {
        return [];
      }

      const detectedSourceType = detectSourceTypeFromUrl(mediaUrl);
      const sourceType = mediaUrl
        ? normalizeSourceType(episode.sourceType, mediaUrl)
        : normalizeSourceType(episode.sourceType, playPageUrl);
      const directSourceType = isDirectSourceType(sourceType) ? sourceType : detectedSourceType;
      const hasDirectMedia = Boolean(mediaUrl) && isDirectSourceType(directSourceType);

      return [
        {
          episode: episodeNumber,
          episodeLabel: asString(episode.episodeLabel) || `第${episodeNumber}集`,
          format: hasDirectMedia ? directSourceType : undefined,
          mediaUrl,
          playPageUrl,
          sourceType: hasDirectMedia ? directSourceType : 'unsupported',
        },
      ];
    });

    return episodes.length > 0
      ? [
          {
            line: lineNumber,
            label: asString(line.label) || `线路 ${lineNumber}`,
            episodes: episodes.sort((first, second) => first.episode - second.episode),
          },
        ]
      : [];
  });

  return playLines.length > 0
    ? playLines.sort((first, second) => first.line - second.line)
    : undefined;
};

const firstResolvedEpisode = (playLines?: AppVideoPlayLine[]) =>
  playLines
    ?.flatMap((line) => line.episodes)
    .find((episode) => Boolean(episode.mediaUrl) && isDirectSourceType(episode.sourceType));

const firstLazyEpisode = (playLines?: AppVideoPlayLine[]) =>
  playLines?.flatMap((line) => line.episodes).find((episode) => Boolean(episode.playPageUrl));

export const toAppVideoItem = (raw: unknown): AppVideoItem => {
  if (!isRecord(raw)) {
    throw new Error('Invalid video item');
  }

  const id = asString(raw.id);
  const title = asString(raw.title);

  if (!id || !title) {
    throw new Error('Video item requires id and title');
  }

  const rawCategory = asString(raw.rawCategory) || asString(raw.category) || undefined;
  const subCategory =
    asString(raw.subCategory) ||
    (rawCategory && rawCategory !== '电影' && rawCategory !== '电视剧' ? rawCategory : undefined);
  const category = mapCategoryForApp(asString(raw.category), subCategory);
  const playLines = normalizePlayLines(raw.playLines);
  const resolvedEpisode = firstResolvedEpisode(playLines);
  const lazyEpisode = firstLazyEpisode(playLines);
  const inputSource = resolvedEpisode?.mediaUrl || asString(raw.source) || lazyEpisode?.playPageUrl;
  const detectedSourceType = detectSourceTypeFromUrl(inputSource);
  const hasDirectSource = Boolean(inputSource) && isDirectSourceType(detectedSourceType);
  const sourceType = hasDirectSource ? detectedSourceType : 'unsupported';
  const source = inputSource || asString(raw.webViewUrl);
  const webViewUrl =
    lazyEpisode?.playPageUrl ||
    asString(raw.webViewUrl) ||
    (!hasDirectSource && /^https?:\/\//i.test(source) ? source : undefined);
  const playableInApp = hasDirectSource || Boolean(resolvedEpisode);
  const unsupportedReason = playableInApp
    ? undefined
    : asString(raw.unsupportedReason) || '需要通过 /api/resolve 懒解析出直链后播放，不打开网页';

  return {
    id,
    title,
    description: asString(raw.description) || undefined,
    cover: asString(raw.cover) || undefined,
    thumbnailUrl: asString(raw.thumbnailUrl) || asString(raw.cover) || undefined,
    source,
    sourceType: resolvedEpisode?.sourceType ?? sourceType,
    category,
    subCategory,
    categoryMappingConfidence:
      typeof raw.categoryMappingConfidence === 'number' ? raw.categoryMappingConfidence : undefined,
    categoryMappingReason: asString(raw.categoryMappingReason) || undefined,
    provider: asString(raw.provider) || undefined,
    seriesId: asString(raw.seriesId) || id,
    rawCategory,
    tags: asStringArray(raw.tags),
    webViewUrl,
    playableInApp,
    unsupportedReason,
    playLines,
  };
};

export const toResolveResponse = (mediaUrl: string): ResolveEpisodeResponse => {
  const normalizedMediaUrl = asString(mediaUrl).replace(/\\\//g, '/');
  const sourceType = detectSourceTypeFromUrl(normalizedMediaUrl);

  if (!normalizedMediaUrl || !isDirectSourceType(sourceType)) {
    throw new Error('resolve result is not a supported direct media URL');
  }

  return {
    mediaUrl: normalizedMediaUrl,
    format: sourceType,
    sourceType,
    reachable: true,
  };
};
