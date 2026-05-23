import type {
  VideoEntity,
  VideoPreferenceHints,
  VideoSource,
  EpisodeSource,
  PlayLine,
} from '@/domain/video/types';
import type {
  VideoFormat,
  VideoItem,
  VideoPlaybackOption,
  VideoPlayEpisode,
  VideoPlayLine,
  VideoSourceType,
} from '@/types/video';

const DEFAULT_PROVIDER_ID = 'legacy';
const DEFAULT_PROVIDER_NAME = 'Legacy Source';
const KOREAN_DRAMA_SIGNALS = ['韩剧', '韩国剧', '韩国电视剧', 'k-drama', 'kdrama'];

const compact = <T>(items: (T | undefined | null | false)[]): T[] =>
  items.filter((item): item is T => Boolean(item));

const unique = (items: string[]) =>
  items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);

const normalizeProviderId = (provider?: string) =>
  provider
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '') || DEFAULT_PROVIDER_ID;

const hasDirectMedia = (sourceType?: VideoSourceType, mediaUrl?: string) =>
  Boolean(mediaUrl) && sourceType !== 'unsupported' && sourceType !== 'webview';

const getResolveState = (episode: VideoPlayEpisode, video: VideoItem) => {
  if (video.isDrm || video.drm) {
    return 'blocked' as const;
  }

  if (hasDirectMedia(episode.sourceType, episode.mediaUrl)) {
    return 'resolved' as const;
  }

  if (episode.playPageUrl) {
    return 'unresolved' as const;
  }

  return 'failed' as const;
};

const toEpisodeSource = (episode: VideoPlayEpisode, video: VideoItem): EpisodeSource => {
  const resolveState = getResolveState(episode, video);

  return {
    episode: episode.episode,
    label: episode.episodeLabel,
    playPageUrl: episode.playPageUrl,
    mediaUrl: episode.mediaUrl,
    format: episode.format,
    sourceType: episode.sourceType,
    resolveState,
    failureReason:
      resolveState === 'failed' || resolveState === 'blocked' ? video.unsupportedReason : undefined,
  };
};

const buildFallbackEpisode = (video: VideoItem): EpisodeSource => {
  const playableOption = video.playbackOptions?.find((option) => option.playableInApp);
  const mediaUrl = playableOption?.uri || (video.playableInApp ? video.source : undefined);
  const format = playableOption?.format ?? video.format;
  const sourceType = playableOption?.sourceType ?? video.sourceType;
  const playPageUrl = mediaUrl ? undefined : video.webViewUrl || video.source;

  return {
    episode: 1,
    label: '第1集',
    playPageUrl,
    mediaUrl,
    format,
    sourceType,
    resolveState: mediaUrl ? 'resolved' : 'unresolved',
    failureReason: mediaUrl ? undefined : video.unsupportedReason,
    playbackOptions: video.playbackOptions,
  };
};

const toPlayLine = (line: VideoPlayLine, video: VideoItem): PlayLine => {
  const episodes = line.episodes.map((episode) => toEpisodeSource(episode, video));
  const resolvedCount = episodes.filter((episode) => episode.resolveState === 'resolved').length;

  return {
    line: line.line,
    label: line.label,
    episodes,
    qualityScore: resolvedCount > 0 ? 80 : 45,
    healthScore: episodes.some((episode) => episode.resolveState === 'failed') ? 45 : 70,
  };
};

const buildPlayLines = (video: VideoItem): PlayLine[] => {
  if (video.playLines?.length) {
    return video.playLines.map((line) => toPlayLine(line, video));
  }

  return [
    {
      line: 1,
      label: '默认线路',
      episodes: [buildFallbackEpisode(video)],
      qualityScore: video.playableInApp ? 75 : 35,
      healthScore: video.playableInApp ? 70 : 45,
    },
  ];
};

const buildPreferenceHints = (video: VideoItem): VideoPreferenceHints => {
  const haystack = [
    video.title,
    video.category,
    video.subCategory,
    video.rawCategory,
    ...(video.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();
  const signals = compact([
    video.category === '电视剧' && 'tv-drama',
    KOREAN_DRAMA_SIGNALS.some((signal) => haystack.includes(signal.toLowerCase())) &&
      'korean-drama',
  ]);

  return {
    rankingPolicyId: 'default-content-preference',
    signals,
    keywords: unique(
      compact([video.category, video.subCategory, video.rawCategory, ...(video.tags ?? [])]),
    ),
    reasons: signals.length > 0 ? ['legacy-video-item-metadata'] : undefined,
  };
};

const buildVideoSource = (video: VideoItem): VideoSource => {
  const playLines = buildPlayLines(video);
  const resolvedEpisodes = playLines
    .flatMap((line) => line.episodes)
    .filter((episode) => episode.resolveState === 'resolved');
  const providerId = normalizeProviderId(video.provider);

  return {
    providerId,
    providerVideoId: video.id,
    title: video.title,
    sourcePageUrl: video.webViewUrl || video.source,
    playLines,
    qualityScore: video.playableInApp || resolvedEpisodes.length > 0 ? 80 : 40,
    healthScore: video.playableInApp || resolvedEpisodes.length > 0 ? 75 : 45,
    lastResolvedAt: resolvedEpisodes.length > 0 ? video.createdAt : undefined,
    health: {
      status: video.playableInApp || resolvedEpisodes.length > 0 ? 'healthy' : 'unknown',
      score: video.playableInApp || resolvedEpisodes.length > 0 ? 75 : 45,
      failureReason: video.playableInApp ? undefined : video.unsupportedReason,
    },
  };
};

export const fromLegacyVideoItem = (video: VideoItem): VideoEntity => {
  const aliases = unique(
    compact([video.title, video.rawCategory && `${video.title} ${video.rawCategory}`]),
  );

  return {
    canonicalId: video.seriesId || video.id,
    title: video.title,
    aliases,
    category: video.category,
    subCategory: video.subCategory,
    cover: video.cover ?? video.thumbnailUrl,
    description: video.description,
    tags: unique(video.tags ?? []),
    sources: [buildVideoSource(video)],
    preferenceHints: buildPreferenceHints(video),
  };
};

const findBestSource = (entity: VideoEntity) =>
  [...entity.sources].sort(
    (first, second) =>
      second.healthScore - first.healthScore ||
      second.qualityScore - first.qualityScore ||
      first.providerId.localeCompare(second.providerId),
  )[0];

const firstEpisode = (source?: VideoSource) =>
  source?.playLines
    .flatMap((line) => line.episodes)
    .sort((first, second) => first.episode - second.episode)[0];

const firstResolvedEpisode = (source?: VideoSource) =>
  source?.playLines
    .flatMap((line) => line.episodes)
    .find((episode) => episode.resolveState === 'resolved' && episode.mediaUrl);

const toLegacyEpisode = (episode: EpisodeSource): VideoPlayEpisode => ({
  episode: episode.episode,
  episodeLabel: episode.label,
  format: episode.format,
  mediaUrl: episode.mediaUrl,
  playPageUrl: episode.playPageUrl || episode.mediaUrl || '',
  sourceType: episode.sourceType,
});

const toLegacyPlayLine = (line: PlayLine): VideoPlayLine => ({
  episodes: line.episodes.map(toLegacyEpisode),
  label: line.label,
  line: line.line,
});

const collectPlaybackOptions = (source?: VideoSource): VideoPlaybackOption[] | undefined => {
  const options = source?.playLines.flatMap((line) =>
    line.episodes.flatMap((episode) => episode.playbackOptions ?? []),
  );

  return options && options.length > 0 ? options : undefined;
};

export const toLegacyVideoItem = (entity: VideoEntity): VideoItem => {
  const source = findBestSource(entity);
  const resolvedEpisode = firstResolvedEpisode(source);
  const fallbackEpisode = firstEpisode(source);
  const mediaUrl = resolvedEpisode?.mediaUrl;
  const sourceUrl = mediaUrl || fallbackEpisode?.playPageUrl || source?.sourcePageUrl || '';
  const sourceType: VideoSourceType =
    resolvedEpisode?.sourceType ?? fallbackEpisode?.sourceType ?? 'unsupported';
  const format: VideoFormat | undefined = resolvedEpisode?.format ?? fallbackEpisode?.format;
  const playableInApp = Boolean(mediaUrl);
  const playback: VideoItem['playback'] = mediaUrl
    ? {
        type: 'direct',
        uri: mediaUrl,
        format,
      }
    : {
        type: 'unplayable',
        reason: fallbackEpisode?.failureReason ?? '需要先解析出直链',
      };

  return {
    id: source?.providerVideoId || entity.canonicalId,
    title: entity.title,
    description: entity.description,
    cover: entity.cover,
    source: sourceUrl,
    sourceType,
    category: entity.category,
    subCategory: entity.subCategory,
    rawCategory: entity.subCategory,
    provider: source?.providerId || DEFAULT_PROVIDER_NAME,
    tags: unique([...entity.tags, ...(entity.preferenceHints.keywords ?? [])]),
    format,
    playableInApp,
    unsupportedReason: playableInApp ? undefined : fallbackEpisode?.failureReason,
    thumbnailUrl: entity.cover,
    webViewUrl: source?.sourcePageUrl || fallbackEpisode?.playPageUrl,
    playback,
    playbackOptions: collectPlaybackOptions(source),
    playLines: source?.playLines.map(toLegacyPlayLine),
    seriesId: entity.canonicalId,
  };
};
