import { Ionicons } from '@expo/vector-icons';
import {
  ResizeMode,
  Video,
  isNativeVideoAvailable,
  type AVPlaybackStatus,
  type VideoHandle,
} from '@/shims/expoAv';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from '@/shims/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { evaluatePlayerSupport, type SupportLevel } from '@/services/playerSupportService';
import {
  getAllVideos,
  getVideoById,
  resolveEpisodeMediaUrl,
  subscribeVideos,
  updateEpisodeMediaUrl,
} from '@/services/videoService';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePlayHistoryStore } from '@/store/playHistoryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { colors, fontSize, radius, shadow, spacing } from '@/theme';
import type { VideoCodec, VideoFormat, VideoItem, VideoPlayLine } from '@/types/video';

type PlayerVideo = VideoItem & {
  codec?: VideoCodec;
  drm?: boolean;
  format?: VideoFormat;
  isDrm?: boolean;
};

type PlaybackDecision =
  | {
      canPlayInApp: true;
      codec: VideoCodec;
      engine: 'expo-av' | 'expo-video';
      format: VideoFormat;
      label: string;
      mimeType?: string;
      needsFallback: boolean;
      supportLevel: SupportLevel;
      uri: string;
    }
  | {
      canPlayInApp: false;
      label: string;
      reasonCode?: string;
      reason: string;
      supportLevel: SupportLevel;
    };

const text = {
  actions: '\u4e92\u52a8',
  authorFallback: '\u672a\u77e5\u4f5c\u8005',
  back: '\u8fd4\u56de',
  cancelFavorite: '\u53d6\u6d88\u6536\u85cf',
  cannotOpen: '\u65e0\u6cd5\u6253\u5f00\u89c6\u9891',
  categoryFallback: '\u672a\u5206\u7c7b',
  collapse: '\u6536\u8d77',
  danmaku: '\u5f39\u5e55',
  descriptionFallback: '\u6682\u65e0\u7b80\u4ecb\u3002',
  expand: '\u5c55\u5f00\u66f4\u591a',
  favorite: '\u6536\u85cf',
  favorited: '\u5df2\u6536\u85cf',
  completed: '\u64ad\u653e\u5b8c\u6210',
  formatUnsupported:
    '\u5f53\u524d\u89c6\u9891\u683c\u5f0f\u6682\u4e0d\u652f\u6301 App \u5185\u64ad\u653e',
  fullscreenReserved: '\u5168\u5c4f\u6a21\u5f0f\u9884\u7559',
  gestureReserved: '\u624b\u52bf\u63a7\u5236\u9884\u7559',
  like: '\u70b9\u8d5e',
  liked: '\u5df2\u70b9\u8d5e',
  loading: '\u6b63\u5728\u52a0\u8f7d\u89c6\u9891...',
  noRelated: '\u6682\u65e0\u76f8\u5173\u63a8\u8350',
  play: '\u64ad\u653e',
  playFailed: '\u64ad\u653e\u5931\u8d25',
  publishedAt: '\u53d1\u5e03\u4e8e',
  related: '\u76f8\u5173\u63a8\u8350',
  replay: '\u91cd\u64ad',
  share: '\u5206\u4eab',
  shareFailed: '\u5206\u4eab\u5931\u8d25',
  sourceEmpty: '\u89c6\u9891\u5730\u5740\u4e3a\u7a7a',
  unsupportedPlaybackHint:
    '\u8be5\u6765\u6e90\u6682\u65e0 App \u53ef\u76f4\u63a5\u64ad\u653e\u7684\u5a92\u4f53\u5730\u5740\u6216\u683c\u5f0f\u4e0d\u517c\u5bb9\u3002',
  openInBrowser: '\u7528\u5916\u90e8\u64ad\u653e\u5668\u6253\u5f00',
  openExternalUnavailable: '\u672a\u63d0\u4f9b\u53ef\u6253\u5f00\u7684\u7f51\u9875\u5730\u5740',
  tags: '\u6807\u7b7e',
  videoDetail: '\u89c6\u9891\u8be6\u60c5',
  videoLoadFailed: '\u89c6\u9891\u52a0\u8f7d\u5931\u8d25',
  videoNotFound: '\u89c6\u9891\u4e0d\u5b58\u5728',
  views: '\u64ad\u653e',
  playbackModeNative: '\u539f\u751f\u64ad\u653e',
  playbackModeFallback: 'Shim Fallback',
  selectLine: '\u9009\u62e9\u7ebf\u8def',
  selectEpisode: '\u9009\u62e9\u96c6\u6570',
  currentEpisode: '\u5f53\u524d\u64ad\u653e',
  episodeReady: '\u5df2\u89e3\u6790',
  episodeLazy: '\u70b9\u51fb\u89e3\u6790',
  noEpisodes: '\u672a\u83b7\u53d6\u5230\u96c6\u6570\u548c\u7ebf\u8def\u4fe1\u606f',
  supportEngine: '\u64ad\u653e\u5f15\u64ce',
  supportLevel: '\u652f\u6301\u7b49\u7ea7',
  supportFallback: '\u9700\u8981\u964d\u7ea7',
  supportReason: '\u4e0d\u53ef\u64ad\u539f\u56e0',
  yes: '\u662f',
  no: '\u5426',
};

const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;
const SEEK_STEP_MILLIS = 10000;
const DOUBLE_TAP_INTERVAL = 280;
const SWIPE_THRESHOLD = 42;

const formatLabels: Partial<Record<VideoFormat, string>> = {
  hls: 'HLS',
  m3u8: 'HLS',
  m4v: 'M4V',
  mkv: 'MKV',
  mov: 'MOV',
  mp4: 'MP4',
  webm: 'WEBM',
};

const formatCount = (value?: number) => {
  const count = value ?? 0;

  if (count >= 10000) {
    return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}w`;
  }

  return count.toString();
};

const formatTime = (millis = 0) => {
  const totalSeconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatDate = (value?: string) => {
  if (!value) {
    return '--';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
};

const normalize = (value?: string) => value?.trim().toLowerCase() ?? '';

type RecommendationContext = {
  author: string;
  category?: string;
  provider: string;
  tags: Set<string>;
};

const getPlaybackUri = (video: PlayerVideo | null) => {
  const playableOption = video?.playbackOptions?.find((option) => option.playableInApp);

  if (playableOption?.uri) {
    return playableOption.uri;
  }

  if (video?.playback?.type === 'direct') {
    return video.playback.uri;
  }

  return video?.source ?? '';
};

const getExternalUrl = (video: PlayerVideo | null) => {
  if (!video) {
    return '';
  }

  const playbackUri = getPlaybackUri(video);

  if (playbackUri && /^https?:\/\//i.test(playbackUri)) {
    return playbackUri;
  }

  if (video.source && /^https?:\/\//i.test(video.source)) {
    return video.source;
  }

  if (video.webViewUrl && /^https?:\/\//i.test(video.webViewUrl)) {
    return video.webViewUrl;
  }

  return '';
};

const getPlaybackDecision = (video: PlayerVideo | null): PlaybackDecision => {
  const uri = getPlaybackUri(video);

  if (!uri) {
    return {
      canPlayInApp: false,
      label: 'Unsupported',
      reason: text.sourceEmpty,
      supportLevel: 'unsupported',
    };
  }

  const support = evaluatePlayerSupport({
    codec: video?.codec,
    format: video?.format,
    isDrm: video?.isDrm || video?.drm,
    mimeType: video?.mimeType,
    playableInApp: video?.playableInApp,
    sourceType: video?.sourceType,
    uri,
  });

  if (!support.canPlayInApp) {
    return {
      canPlayInApp: false,
      label: formatLabels[support.format] ?? 'Unsupported',
      reason: support.unsupportedReason ?? text.formatUnsupported,
      reasonCode: support.unsupportedReasonCode,
      supportLevel: support.supportLevel,
    };
  }

  if (!isNativeVideoAvailable) {
    return {
      canPlayInApp: false,
      label: formatLabels[support.format] ?? support.format.toUpperCase(),
      reason:
        'Expo Go 当前缺少可用的原生视频组件，请用外部播放器打开，或使用 EAS development build 测试 App 内播放。',
      reasonCode: 'native-video-unavailable',
      supportLevel: 'unsupported',
    };
  }

  return {
    canPlayInApp: true,
    codec: support.codec,
    engine: support.engine,
    format: support.format,
    label: formatLabels[support.format] ?? support.format.toUpperCase(),
    mimeType: support.mimeType,
    needsFallback: support.needsFallback,
    supportLevel: support.supportLevel,
    uri,
  };
};

const createRecommendationContext = (current: PlayerVideo): RecommendationContext => ({
  author: normalize(current.author),
  category: current.category,
  provider: normalize(current.provider),
  tags: new Set((current.tags ?? []).map(normalize)),
});

const getRecommendationScore = (current: RecommendationContext, candidate: VideoItem) => {
  let score = 0;

  if (candidate.category && candidate.category === current.category) {
    score += 40;
  }

  const sharedTags = (candidate.tags ?? []).filter((tag) =>
    current.tags.has(normalize(tag)),
  ).length;
  score += sharedTags * 14;

  if (normalize(candidate.author) && normalize(candidate.author) === current.author) {
    score += 18;
  }

  if (normalize(candidate.provider) && normalize(candidate.provider) === current.provider) {
    score += 16;
  }

  score += Math.min((candidate.playCount ?? 0) / 100000, 4);
  score += Math.min((candidate.danmakuCount ?? 0) / 20000, 3);

  return score;
};

const getRelatedVideos = (current: PlayerVideo, videos: VideoItem[]) => {
  const context = createRecommendationContext(current);
  const scoredVideos: { item: VideoItem; score: number }[] = [];

  for (const item of videos) {
    if (item.id === current.id) {
      continue;
    }

    const score = getRecommendationScore(context, item);

    if (score > 0) {
      scoredVideos.push({ item, score });
    }
  }

  return scoredVideos
    .sort((first, second) => second.score - first.score)
    .slice(0, 6)
    .map(({ item }) => item as PlayerVideo);
};

type EpisodeSelection = {
  episode: number;
  line: number;
};

const getEpisodeLabel = (episode?: VideoPlayLine['episodes'][number]) =>
  episode ? (episode.episodeLabel ?? `\u7b2c${episode.episode}\u96c6`) : '';

const patchEpisodeMedia = (
  current: PlayerVideo | null,
  selection: EpisodeSelection,
  result: {
    format?: VideoFormat;
    mediaUrl?: string;
    sourceType?: VideoItem['sourceType'];
  },
): PlayerVideo | null => {
  if (!current?.playLines || !result.mediaUrl) {
    return current;
  }

  return {
    ...current,
    playLines: current.playLines.map((line) =>
      line.line !== selection.line
        ? line
        : {
            ...line,
            episodes: line.episodes.map((episode) =>
              episode.episode !== selection.episode
                ? episode
                : {
                    ...episode,
                    format: result.format ?? episode.format,
                    mediaUrl: result.mediaUrl,
                    sourceType: result.sourceType ?? episode.sourceType,
                  },
            ),
          },
    ),
  };
};

export default function PlayerScreen() {
  const videoRef = useRef<VideoHandle>(null);
  const hasRestoredProgressRef = useRef(false);
  const lastTapRef = useRef(0);
  const lastHistorySaveRef = useRef({ progress: 0, videoId: '' });
  const gestureStartRef = useRef({ x: 0, y: 0 });
  const gestureHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seriesIdRef = useRef<string | undefined>(undefined);
  const currentVideoIdRef = useRef<string | undefined>(undefined);
  const controlsOpacity = useSharedValue(0);
  const controlsTranslateY = useSharedValue(14);
  const favoriteScale = useSharedValue(1);
  const gestureOpacity = useSharedValue(0);
  const progressWidthRatio = useSharedValue(0);
  const { id, line, episode } = useLocalSearchParams<{
    id: string;
    line?: string;
    episode?: string;
  }>();
  const parsedRequestedLine = Number.parseInt(line ?? '', 10);
  const parsedRequestedEpisode = Number.parseInt(episode ?? '', 10);
  const requestedLine = Number.isFinite(parsedRequestedLine) ? parsedRequestedLine : undefined;
  const requestedEpisode = Number.isFinite(parsedRequestedEpisode)
    ? parsedRequestedEpisode
    : undefined;
  const { width, height } = useWindowDimensions();
  const [video, setVideo] = useState<PlayerVideo | null>(null);
  const [recommendedVideos, setRecommendedVideos] = useState<PlayerVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [playbackError, setPlaybackError] = useState('');
  const [episodeOverride, setEpisodeOverride] = useState<{
    format?: VideoFormat;
    line?: number;
    episode?: number;
    uri?: string;
    sourceType?: VideoItem['sourceType'];
  }>({});
  const [manualEpisodeSelection, setManualEpisodeSelection] = useState<EpisodeSelection | null>(
    null,
  );
  const [isResolvingEpisode, setIsResolvingEpisode] = useState(false);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [progressWidth, setProgressWidth] = useState(1);
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1);
  const [gestureHint, setGestureHint] = useState('');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds);
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
  const getHistoryItem = usePlayHistoryStore((state) => state.getHistoryItem);
  const recordProgress = usePlayHistoryStore((state) => state.recordProgress);
  const autoPlay = useSettingsStore((state) => state.autoPlay);
  const rememberProgress = useSettingsStore((state) => state.rememberProgress);

  const isLandscape = width > height;
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const isFavorite = video ? favoriteIdSet.has(video.id) : false;
  const isLiked = video ? likedIds.includes(video.id) : false;
  const effectiveVideo = useMemo<PlayerVideo | null>(() => {
    if (!video) {
      return null;
    }

    if (!episodeOverride.uri) {
      return video;
    }

    return {
      ...video,
      source: episodeOverride.uri,
      format: episodeOverride.format ?? video.format,
      sourceType: episodeOverride.sourceType ?? video.sourceType,
      playableInApp: true,
      playback: {
        type: 'direct',
        uri: episodeOverride.uri,
        format: episodeOverride.format ?? video.format,
      },
      playbackOptions: [
        {
          uri: episodeOverride.uri,
          format: episodeOverride.format ?? video.format,
          sourceType: episodeOverride.sourceType ?? video.sourceType,
          playableInApp: true,
          label: 'EPISODE',
        },
      ],
    };
  }, [video, episodeOverride]);
  const playbackDecision = useMemo(() => getPlaybackDecision(effectiveVideo), [effectiveVideo]);
  const externalUrl = useMemo(() => getExternalUrl(effectiveVideo), [effectiveVideo]);
  const openExternalUrl = useCallback(() => {
    if (!externalUrl) {
      return;
    }

    Linking.openURL(externalUrl).catch(() => {
      setPlaybackError(text.cannotOpen);
    });
  }, [externalUrl]);
  const tags = video?.tags?.filter(Boolean) ?? [];
  const selectedEpisodeRequest = manualEpisodeSelection ?? {
    episode: requestedEpisode,
    line: requestedLine,
  };
  const activeLineNumber =
    episodeOverride.line ?? selectedEpisodeRequest.line ?? video?.playLines?.[0]?.line;
  const activeLine =
    video?.playLines?.find((entry) => entry.line === activeLineNumber) ?? video?.playLines?.[0];
  const activeEpisodeNumber =
    episodeOverride.episode ?? selectedEpisodeRequest.episode ?? activeLine?.episodes[0]?.episode;

  const playbackState = useMemo(() => {
    if (!status?.isLoaded) {
      return {
        durationMillis: 0,
        isBuffering: playbackDecision.canPlayInApp,
        isPlaying: false,
        positionMillis: 0,
        progress: 0,
        didJustFinish: false,
      };
    }

    const durationMillis = status.durationMillis ?? 0;
    const positionMillis = status.positionMillis ?? 0;

    return {
      durationMillis,
      isBuffering: status.isBuffering,
      isPlaying: status.isPlaying,
      positionMillis,
      progress: durationMillis > 0 ? Math.min(positionMillis / durationMillis, 1) : 0,
      didJustFinish: Boolean(status.didJustFinish),
    };
  }, [playbackDecision.canPlayInApp, status]);

  useEffect(() => {
    controlsOpacity.value = withTiming(playbackDecision.canPlayInApp ? 1 : 0, { duration: 220 });
    controlsTranslateY.value = withSpring(playbackDecision.canPlayInApp ? 0 : 14, {
      damping: 16,
      stiffness: 180,
    });
  }, [controlsOpacity, controlsTranslateY, playbackDecision.canPlayInApp]);

  useEffect(() => {
    progressWidthRatio.value = withTiming(playbackState.progress, { duration: 180 });
  }, [playbackState.progress, progressWidthRatio]);

  useEffect(() => {
    gestureOpacity.value = withTiming(gestureHint ? 1 : 0, { duration: gestureHint ? 120 : 180 });
  }, [gestureHint, gestureOpacity]);

  useEffect(() => {
    if (isFavorite) {
      favoriteScale.value = withSequence(
        withSpring(1.16, { damping: 10, stiffness: 220 }),
        withSpring(1, { damping: 12, stiffness: 180 }),
      );
    }
  }, [favoriteScale, isFavorite]);

  const controlBarAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: controlsTranslateY.value }],
  }));

  const speedBarAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: -controlsTranslateY.value * 0.5 }],
  }));

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${Math.min(Math.max(progressWidthRatio.value, 0), 1) * 100}%`,
  }));

  const gestureHintAnimatedStyle = useAnimatedStyle(() => ({
    opacity: gestureOpacity.value,
    transform: [{ scale: 0.96 + gestureOpacity.value * 0.04 }],
  }));

  const favoriteAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: favoriteScale.value }],
  }));

  useEffect(
    () => () => {
      if (gestureHintTimerRef.current) {
        clearTimeout(gestureHintTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    setManualEpisodeSelection(null);
  }, [id, line, episode]);

  useEffect(() => {
    if (status?.isLoaded && playbackDecision.canPlayInApp) {
      void videoRef.current?.setRateAsync(playbackRate, true);
    }
  }, [playbackDecision.canPlayInApp, playbackRate, status?.isLoaded]);

  useEffect(() => {
    if (!id) {
      setPageError(text.videoNotFound);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    seriesIdRef.current = undefined;
    currentVideoIdRef.current = id;

    setIsLoading(true);
    setPageError('');
    setPlaybackError('');
    setStatus(null);
    hasRestoredProgressRef.current = false;
    lastHistorySaveRef.current = { progress: 0, videoId: '' };
    setIsDescriptionExpanded(false);

    const loadVideo = async () => {
      try {
        const [nextVideo, allVideos] = await Promise.all([getVideoById(id), getAllVideos()]);

        if (!mounted) {
          return;
        }

        if (!nextVideo) {
          setVideo(null);
          setPageError(text.videoNotFound);
          return;
        }

        const currentVideo = nextVideo as PlayerVideo;
        setVideo(currentVideo);

        if (currentVideo.seriesId) {
          seriesIdRef.current = currentVideo.seriesId;
        }

        if (currentVideo.id) {
          currentVideoIdRef.current = currentVideo.id;
        }

        setRecommendedVideos(getRelatedVideos(currentVideo, allVideos));

        if ((currentVideo.playLines?.length ?? 0) === 0) {
          void getVideoById(id, { bypassCache: true }).then((freshVideo) => {
            if (!mounted || !freshVideo) {
              return;
            }

            const refreshedVideo = freshVideo as PlayerVideo;
            setVideo(refreshedVideo);
            setRecommendedVideos(getRelatedVideos(refreshedVideo, allVideos));

            if (refreshedVideo.seriesId) {
              seriesIdRef.current = refreshedVideo.seriesId;
            }

            if (refreshedVideo.id) {
              currentVideoIdRef.current = refreshedVideo.id;
            }
          });
        }
      } catch (error) {
        if (mounted) {
          setPageError(error instanceof Error ? error.message : text.videoLoadFailed);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void loadVideo();

    const unsubscribe = subscribeVideos((videos) => {
      if (!mounted) {
        return;
      }

      const targetId = currentVideoIdRef.current ?? id;
      const seriesId = seriesIdRef.current;
      const nextVideo =
        videos.find((candidate) => candidate.id === targetId) ??
        (seriesId ? videos.find((candidate) => candidate.seriesId === seriesId) : undefined);

      if (nextVideo) {
        const currentVideo = nextVideo as PlayerVideo;
        setVideo(currentVideo);
        setRecommendedVideos(getRelatedVideos(currentVideo, videos));
        setIsLoading(false);
        setPageError('');

        if (currentVideo.seriesId) {
          seriesIdRef.current = currentVideo.seriesId;
        }

        if (currentVideo.id) {
          currentVideoIdRef.current = currentVideo.id;
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [id]);

  useEffect(() => {
    if (!video) {
      setEpisodeOverride({});
      setIsResolvingEpisode(false);
      return;
    }

    let resolvedLine: number | undefined;
    let resolvedEpisode: number | undefined;
    let targetEpisode:
      | NonNullable<PlayerVideo['playLines']>[number]['episodes'][number]
      | undefined;

    if (selectedEpisodeRequest.line !== undefined && selectedEpisodeRequest.episode !== undefined) {
      const targetLine = video.playLines?.find(
        (entry) => entry.line === selectedEpisodeRequest.line,
      );
      const matchedEpisode = targetLine?.episodes.find(
        (entry) => entry.episode === selectedEpisodeRequest.episode,
      );

      if (targetLine && matchedEpisode) {
        resolvedLine = targetLine.line;
        resolvedEpisode = matchedEpisode.episode;
        targetEpisode = matchedEpisode;
      }
    }

    if (!targetEpisode) {
      const fallbackLine = video.playLines?.[0];
      const fallbackEpisode = fallbackLine?.episodes[0];

      if (fallbackLine && fallbackEpisode) {
        resolvedLine = fallbackLine.line;
        resolvedEpisode = fallbackEpisode.episode;
        targetEpisode = fallbackEpisode;
      }
    }

    if (!targetEpisode || resolvedLine === undefined || resolvedEpisode === undefined) {
      setEpisodeOverride({});
      setIsResolvingEpisode(false);
      return;
    }

    if (targetEpisode.mediaUrl) {
      setPlaybackError('');
      setIsResolvingEpisode(false);
      setEpisodeOverride({
        episode: resolvedEpisode,
        format: targetEpisode.format,
        line: resolvedLine,
        sourceType: targetEpisode.sourceType,
        uri: targetEpisode.mediaUrl,
      });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const playPageUrl = targetEpisode.playPageUrl;
    const lineForOverride = resolvedLine;
    const episodeForOverride = resolvedEpisode;

    setIsResolvingEpisode(true);
    setEpisodeOverride({});
    setPlaybackError('');

    resolveEpisodeMediaUrl(
      {
        episode: episodeForOverride,
        line: lineForOverride,
        playPageUrl,
        videoId: video.id,
      },
      { signal: controller.signal, timeoutMs: 12_000 },
    )
      .then((result) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        if (!result.mediaUrl) {
          setPlaybackError(text.playFailed);
          return;
        }

        const persistedItem = updateEpisodeMediaUrl({
          episode: episodeForOverride,
          format: result.format,
          line: lineForOverride,
          mediaUrl: result.mediaUrl,
          sourceType: result.sourceType,
          videoId: video.id,
        });

        if (persistedItem) {
          setVideo(persistedItem as PlayerVideo);
        } else {
          setVideo((current) =>
            patchEpisodeMedia(
              current,
              { episode: episodeForOverride, line: lineForOverride },
              result,
            ),
          );
        }

        setEpisodeOverride({
          episode: episodeForOverride,
          format: result.format,
          line: lineForOverride,
          sourceType: result.sourceType,
          uri: result.mediaUrl,
        });
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
          setPlaybackError(text.playFailed);
        }
      })
      .finally(() => {
        if (!cancelled && !controller.signal.aborted) {
          setIsResolvingEpisode(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [video, selectedEpisodeRequest.line, selectedEpisodeRequest.episode]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  }, []);

  const goToVideo = useCallback((videoId: string) => {
    router.push(`/player/${videoId}`);
  }, []);

  const selectEpisode = useCallback(
    (selection: EpisodeSelection) => {
      if (
        activeLineNumber === selection.line &&
        activeEpisodeNumber === selection.episode &&
        !playbackError
      ) {
        return;
      }

      setManualEpisodeSelection(selection);
      setStatus(null);
      setPlaybackError('');
      hasRestoredProgressRef.current = false;
      lastHistorySaveRef.current = { progress: 0, videoId: '' };
    },
    [activeEpisodeNumber, activeLineNumber, playbackError],
  );

  const handleStatusUpdate = useCallback(
    (nextStatus: AVPlaybackStatus) => {
      setStatus(nextStatus);

      if (!nextStatus.isLoaded) {
        if (nextStatus.error) {
          setPlaybackError(nextStatus.error);
        }
        return;
      }

      if (!video) {
        return;
      }

      const duration = nextStatus.durationMillis ?? 0;
      const progress = nextStatus.didJustFinish ? duration : (nextStatus.positionMillis ?? 0);

      if (rememberProgress && !hasRestoredProgressRef.current && duration > 0) {
        hasRestoredProgressRef.current = true;
        const historyItem = getHistoryItem(video.id, {
          episode: activeEpisodeNumber,
          line: activeLineNumber,
        });

        if (
          historyItem &&
          historyItem.progress > 5000 &&
          historyItem.progress < Math.max(duration - 5000, 0)
        ) {
          void videoRef.current?.setPositionAsync(historyItem.progress);
          return;
        }
      }

      const lastSave = lastHistorySaveRef.current;
      const shouldSave =
        lastSave.videoId !== video.id ||
        nextStatus.didJustFinish ||
        Math.abs(progress - lastSave.progress) >= 3000;

      if (rememberProgress && duration > 0 && shouldSave) {
        lastHistorySaveRef.current = { progress, videoId: video.id };
        recordProgress({
          duration,
          episode: activeEpisodeNumber,
          line: activeLineNumber,
          progress,
          videoId: video.id,
        });
      }
    },
    [
      activeEpisodeNumber,
      activeLineNumber,
      getHistoryItem,
      recordProgress,
      rememberProgress,
      video,
    ],
  );

  const togglePlayback = useCallback(async () => {
    if (!status?.isLoaded) {
      return;
    }

    if (status.didJustFinish) {
      await videoRef.current?.setPositionAsync(0);
      await videoRef.current?.playAsync();
      return;
    }

    if (status.isPlaying) {
      await videoRef.current?.pauseAsync();
      return;
    }

    await videoRef.current?.playAsync();
  }, [status]);

  const replayVideo = useCallback(async () => {
    if (!status?.isLoaded) {
      return;
    }

    await videoRef.current?.setPositionAsync(0);
    await videoRef.current?.playAsync();
  }, [status]);

  const changePlaybackRate = useCallback(
    async (rate: (typeof PLAYBACK_RATES)[number]) => {
      setPlaybackRate(rate);

      if (status?.isLoaded) {
        await videoRef.current?.setRateAsync(rate, true);
      }
    },
    [status],
  );

  const showGestureHint = useCallback((message: string) => {
    setGestureHint(message);

    if (gestureHintTimerRef.current) {
      clearTimeout(gestureHintTimerRef.current);
    }

    gestureHintTimerRef.current = setTimeout(() => setGestureHint(''), 900);
  }, []);

  const seekByOffset = useCallback(
    async (offsetMillis: number) => {
      if (!status?.isLoaded || playbackState.durationMillis <= 0) {
        return;
      }

      const nextPosition = Math.max(
        0,
        Math.min(playbackState.positionMillis + offsetMillis, playbackState.durationMillis),
      );

      await videoRef.current?.setPositionAsync(nextPosition);
    },
    [playbackState.durationMillis, playbackState.positionMillis, status],
  );

  const seekFromPress = useCallback(
    async (event: GestureResponderEvent) => {
      if (!status?.isLoaded || playbackState.durationMillis <= 0) {
        return;
      }

      const targetRatio = Math.max(0, Math.min(event.nativeEvent.locationX / progressWidth, 1));
      await videoRef.current?.setPositionAsync(targetRatio * playbackState.durationMillis);
    },
    [playbackState.durationMillis, progressWidth, status],
  );

  const handleProgressLayout = useCallback((event: LayoutChangeEvent) => {
    setProgressWidth(Math.max(event.nativeEvent.layout.width, 1));
  }, []);

  const openFullscreen = useCallback(async () => {
    showGestureHint(text.fullscreenReserved);

    try {
      await videoRef.current?.presentFullscreenPlayer();
    } catch {
      setPlaybackError(text.playFailed);
    }
  }, [showGestureHint]);

  const handlePlayerTouchStart = useCallback((event: GestureResponderEvent) => {
    gestureStartRef.current = {
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY,
    };
  }, []);

  const handlePlayerTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      const now = Date.now();
      const start = gestureStartRef.current;
      const deltaX = event.nativeEvent.locationX - start.x;
      const deltaY = event.nativeEvent.locationY - start.y;
      const isTap = Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12;

      if (isTap && now - lastTapRef.current < DOUBLE_TAP_INTERVAL) {
        void togglePlayback();
        showGestureHint(text.gestureReserved);
        lastTapRef.current = 0;
        return;
      }

      lastTapRef.current = now;

      if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
        void seekByOffset(deltaX > 0 ? SEEK_STEP_MILLIS : -SEEK_STEP_MILLIS);
        showGestureHint(deltaX > 0 ? '+10s' : '-10s');
        return;
      }

      if (Math.abs(deltaY) > SWIPE_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX)) {
        showGestureHint(text.gestureReserved);
      }
    },
    [seekByOffset, showGestureHint, togglePlayback],
  );

  const toggleLike = useCallback(() => {
    if (!video) {
      return;
    }

    setLikedIds((current) =>
      current.includes(video.id)
        ? current.filter((item) => item !== video.id)
        : [...current, video.id],
    );
  }, [video]);

  const shareVideo = useCallback(() => {
    if (!video) {
      return;
    }

    const shareUrl = externalUrl || video.webViewUrl || video.source;
    const message = shareUrl ? `${video.title}\n${shareUrl}` : video.title;

    Share.share({
      message,
      title: video.title,
    }).catch(() => {
      setPlaybackError(text.shareFailed);
    });
  }, [externalUrl, video]);

  const renderTopBar = () => (
    <View style={styles.topBar}>
      <Pressable accessibilityLabel={text.back} onPress={goBack} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={colors.white} />
      </Pressable>

      <Text numberOfLines={1} style={styles.topTitle}>
        {video?.title ?? text.play}
      </Text>
    </View>
  );

  const renderErrorPage = (title: string, message: string) => (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      {renderTopBar()}
      <View style={styles.emptyState}>
        <Ionicons name="alert-circle" size={48} color={colors.primary} />
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>{message}</Text>
      </View>
    </SafeAreaView>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ headerShown: false }} />
        {renderTopBar()}
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>{text.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (pageError || !video) {
    return renderErrorPage(text.cannotOpen, pageError || text.videoNotFound);
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={isLandscape ? ['left', 'right'] : ['top', 'bottom']}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {!isLandscape && renderTopBar()}

      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.scrollContent, isLandscape && styles.scrollContentLandscape]}
      >
        <View
          onResponderGrant={handlePlayerTouchStart}
          onResponderRelease={handlePlayerTouchEnd}
          onStartShouldSetResponder={() => true}
          style={[styles.playerShell, isLandscape && styles.playerShellLandscape]}
        >
          {playbackDecision.canPlayInApp ? (
            <>
              <Video
                key={playbackDecision.uri}
                ref={videoRef}
                source={{ uri: playbackDecision.uri }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={autoPlay}
                useNativeControls={false}
                onPlaybackStatusUpdate={handleStatusUpdate}
                onError={(message) => setPlaybackError(message || text.playFailed)}
                progressUpdateIntervalMillis={1000}
              />

              {(playbackState.isBuffering || isResolvingEpisode) && (
                <View style={styles.playerLoading}>
                  <ActivityIndicator color={colors.white} />
                </View>
              )}

              {!!playbackError && (
                <View style={styles.playerErrorOverlay}>
                  <Ionicons name="alert-circle" size={28} color={colors.white} />
                  <Text style={styles.playerOverlayTitle}>{text.playFailed}</Text>
                  <Text style={styles.playerOverlayText} numberOfLines={2}>
                    {playbackError}
                  </Text>
                </View>
              )}

              {playbackState.didJustFinish && !playbackError ? (
                <View style={styles.completedOverlay}>
                  <Ionicons name="checkmark-circle" size={38} color={colors.white} />
                  <Text style={styles.playerOverlayTitle}>{text.completed}</Text>
                  <Pressable onPress={replayVideo} style={styles.replayButton}>
                    <Ionicons name="refresh" size={18} color={colors.primaryDark} />
                    <Text style={styles.replayText}>{text.replay}</Text>
                  </Pressable>
                </View>
              ) : null}

              {!!gestureHint && (
                <Animated.View style={[styles.gestureHint, gestureHintAnimatedStyle]}>
                  <Text style={styles.gestureHintText}>{gestureHint}</Text>
                </Animated.View>
              )}

              <Animated.View style={[styles.controlBar, controlBarAnimatedStyle]}>
                <Pressable onPress={togglePlayback} style={styles.controlButton}>
                  <Ionicons
                    name={
                      playbackState.isPlaying
                        ? 'pause'
                        : playbackState.didJustFinish
                          ? 'refresh'
                          : 'play'
                    }
                    size={20}
                    color={colors.white}
                  />
                </Pressable>
                <Text style={styles.timeText}>{formatTime(playbackState.positionMillis)}</Text>
                <Pressable
                  onLayout={handleProgressLayout}
                  onPress={seekFromPress}
                  style={styles.progressTrack}
                >
                  <View style={styles.progressRail}>
                    <Animated.View style={[styles.progressFill, progressAnimatedStyle]} />
                  </View>
                </Pressable>
                <Text style={styles.timeText}>{formatTime(playbackState.durationMillis)}</Text>
                <Pressable onPress={openFullscreen} style={styles.controlButton}>
                  <Ionicons name="expand" size={19} color={colors.white} />
                </Pressable>
              </Animated.View>

              <Animated.View style={[styles.speedBar, speedBarAnimatedStyle]}>
                {PLAYBACK_RATES.map((rate) => {
                  const isActive = rate === playbackRate;

                  return (
                    <Pressable
                      key={rate}
                      onPress={() => changePlaybackRate(rate)}
                      style={[styles.speedButton, isActive && styles.speedButtonActive]}
                    >
                      <Text style={[styles.speedText, isActive && styles.speedTextActive]}>
                        {rate}x
                      </Text>
                    </Pressable>
                  );
                })}
              </Animated.View>
            </>
          ) : isResolvingEpisode ? (
            <View style={styles.unsupportedPlayer}>
              <ActivityIndicator color={colors.white} size="large" />
              <Text style={styles.unsupportedTitle}>{text.loading}</Text>
            </View>
          ) : (
            <View style={styles.unsupportedPlayer}>
              <Ionicons name="alert-circle-outline" size={38} color={colors.primary} />
              <Text style={styles.unsupportedTitle}>{playbackDecision.reason}</Text>
              <Text style={styles.unsupportedText}>
                {playbackDecision.reasonCode
                  ? `${text.supportReason}: ${playbackDecision.reasonCode}`
                  : text.unsupportedPlaybackHint}
              </Text>
              {externalUrl ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={text.openInBrowser}
                  onPress={openExternalUrl}
                  style={styles.unsupportedActionButton}
                >
                  <Ionicons name="open-outline" size={18} color={colors.white} />
                  <Text style={styles.unsupportedActionText}>{text.openInBrowser}</Text>
                </Pressable>
              ) : (
                <Text style={styles.unsupportedHintMuted}>{text.openExternalUnavailable}</Text>
              )}
            </View>
          )}
        </View>

        {!isLandscape && (
          <View style={styles.body}>
            <View style={styles.detailCard}>
              <View style={styles.titleRow}>
                <View
                  style={[
                    styles.modeBadge,
                    isNativeVideoAvailable ? styles.modeBadgeNative : styles.modeBadgeFallback,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeBadgeText,
                      isNativeVideoAvailable
                        ? styles.modeBadgeTextNative
                        : styles.modeBadgeTextFallback,
                    ]}
                  >
                    {isNativeVideoAvailable ? text.playbackModeNative : text.playbackModeFallback}
                  </Text>
                </View>
                <Text style={styles.title}>{video.title}</Text>
                <Text style={[styles.badge, !playbackDecision.canPlayInApp && styles.badgeMuted]}>
                  {playbackDecision.label}
                </Text>
              </View>

              <View style={styles.authorBlock}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(video.author || text.authorFallback).slice(0, 1)}
                  </Text>
                </View>
                <View style={styles.authorContent}>
                  <Text style={styles.authorName} numberOfLines={1}>
                    {video.author || text.authorFallback}
                  </Text>
                  <Text style={styles.providerText} numberOfLines={1}>
                    {video.provider ?? 'Community'} / {video.category ?? text.categoryFallback}
                  </Text>
                </View>
              </View>

              {video.playLines && video.playLines.length > 0 ? (
                <PlayerEpisodeSelector
                  activeEpisode={activeEpisodeNumber}
                  activeLine={activeLineNumber}
                  lines={video.playLines}
                  onSelect={selectEpisode}
                />
              ) : (
                <Text style={styles.noEpisodesText}>{text.noEpisodes}</Text>
              )}

              <View style={styles.metaGrid}>
                <View style={styles.metaPill}>
                  <Ionicons name="hardware-chip-outline" size={16} color={colors.primaryDark} />
                  <Text style={styles.metaText}>
                    {text.supportEngine}{' '}
                    {playbackDecision.canPlayInApp ? playbackDecision.engine : 'n/a'}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.primaryDark} />
                  <Text style={styles.metaText}>
                    {text.supportLevel} {playbackDecision.supportLevel}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="swap-horizontal-outline" size={16} color={colors.primaryDark} />
                  <Text style={styles.metaText}>
                    {text.supportFallback}{' '}
                    {playbackDecision.canPlayInApp && playbackDecision.needsFallback
                      ? text.yes
                      : text.no}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="calendar-outline" size={16} color={colors.primaryDark} />
                  <Text style={styles.metaText}>
                    {text.publishedAt} {formatDate(video.createdAt)}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="play-circle-outline" size={16} color={colors.primaryDark} />
                  <Text style={styles.metaText}>
                    {formatCount(video.playCount)} {text.views}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={16}
                    color={colors.primaryDark}
                  />
                  <Text style={styles.metaText}>
                    {formatCount(video.danmakuCount)} {text.danmaku}
                  </Text>
                </View>
              </View>

              {tags.length > 0 ? (
                <View style={styles.tagsSection}>
                  <Text style={styles.sectionLabel}>{text.tags}</Text>
                  <View style={styles.tagsWrap}>
                    {tags.map((tag) => (
                      <View key={tag} style={styles.tagPill}>
                        <Text style={styles.tagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.actionRow}>
                <Pressable
                  onPress={toggleLike}
                  style={[styles.actionButton, isLiked && styles.actionButtonActive]}
                >
                  <Ionicons
                    name={isLiked ? 'thumbs-up' : 'thumbs-up-outline'}
                    size={19}
                    color={isLiked ? colors.white : colors.primaryDark}
                  />
                  <Text style={[styles.actionText, isLiked && styles.actionTextActive]}>
                    {isLiked ? text.liked : text.like}
                  </Text>
                </Pressable>
                <Animated.View style={[styles.favoriteActionWrap, favoriteAnimatedStyle]}>
                  <Pressable
                    onPress={() => {
                      favoriteScale.value = withTiming(0.9, { duration: 70 }, () => {
                        favoriteScale.value = withSpring(1, { damping: 11, stiffness: 230 });
                      });
                      toggleFavorite(video);
                    }}
                    style={[styles.actionButton, isFavorite && styles.actionButtonActive]}
                  >
                    <Ionicons
                      name={isFavorite ? 'heart' : 'heart-outline'}
                      size={20}
                      color={isFavorite ? colors.white : colors.primaryDark}
                    />
                    <Text style={[styles.actionText, isFavorite && styles.actionTextActive]}>
                      {isFavorite ? text.favorited : text.favorite}
                    </Text>
                  </Pressable>
                </Animated.View>
                <Pressable onPress={shareVideo} style={styles.actionButton}>
                  <Ionicons name="share-social-outline" size={19} color={colors.primaryDark} />
                  <Text style={styles.actionText}>{text.share}</Text>
                </Pressable>
              </View>

              <View style={styles.descriptionBox}>
                <Text style={styles.sectionLabel}>{text.videoDetail}</Text>
                <Text
                  style={styles.description}
                  numberOfLines={isDescriptionExpanded ? undefined : 3}
                >
                  {video.description || text.descriptionFallback}
                </Text>
                <Pressable
                  onPress={() => setIsDescriptionExpanded((current) => !current)}
                  style={styles.expandButton}
                >
                  <Text style={styles.expandText}>
                    {isDescriptionExpanded ? text.collapse : text.expand}
                  </Text>
                  <Ionicons
                    name={isDescriptionExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.primaryDark}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.relatedCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{text.related}</Text>
                <Text style={styles.sectionHint}>category / tags / author / provider</Text>
              </View>

              {recommendedVideos.length > 0 ? (
                recommendedVideos.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => goToVideo(item.id)}
                    style={({ pressed }) => [styles.relatedItem, pressed && styles.pressed]}
                  >
                    <Image
                      source={
                        item.thumbnailUrl || item.cover
                          ? { uri: item.thumbnailUrl ?? item.cover }
                          : undefined
                      }
                      style={styles.relatedCover}
                      resizeMode="cover"
                    />
                    <View style={styles.relatedContent}>
                      <Text numberOfLines={2} style={styles.relatedTitle}>
                        {item.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.relatedMeta}>
                        {item.author || text.authorFallback} /{' '}
                        {item.category ?? text.categoryFallback}
                      </Text>
                      <View style={styles.relatedStats}>
                        <Text style={styles.relatedStatText}>
                          {formatCount(item.playCount)} {text.views}
                        </Text>
                        <Text style={styles.relatedStatText}>
                          {formatCount(item.danmakuCount)} {text.danmaku}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
                  </Pressable>
                ))
              ) : (
                <Text style={styles.noRelatedText}>{text.noRelated}</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {!!playbackError && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={colors.primarySoft} />
          <Text style={styles.errorText} numberOfLines={2}>
            {playbackError}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

type PlayerEpisodeSelectorProps = {
  activeEpisode?: number;
  activeLine?: number;
  lines: VideoPlayLine[];
  onSelect: (selection: EpisodeSelection) => void;
};

function PlayerEpisodeSelector({
  activeEpisode,
  activeLine,
  lines,
  onSelect,
}: PlayerEpisodeSelectorProps) {
  const [selectedLine, setSelectedLine] = useState<number>(activeLine ?? lines[0]?.line ?? 1);

  useEffect(() => {
    if (activeLine !== undefined) {
      setSelectedLine(activeLine);
    }
  }, [activeLine]);

  const currentLine = lines.find((line) => line.line === selectedLine) ?? lines[0];
  const currentEpisode = currentLine?.episodes.find((episode) => episode.episode === activeEpisode);

  if (!currentLine) {
    return null;
  }

  return (
    <View style={styles.episodePanel}>
      <View style={styles.episodePanelHeader}>
        <Text style={styles.sectionLabel}>{text.currentEpisode}</Text>
        <Text style={styles.currentEpisodeText} numberOfLines={1}>
          {currentLine.label} {getEpisodeLabel(currentEpisode)}
        </Text>
      </View>

      <Text style={styles.selectorLabel}>{text.selectLine}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.lineTabs}
      >
        {lines.map((line) => {
          const isActive = line.line === currentLine.line;

          return (
            <Pressable
              key={line.line}
              accessibilityRole="button"
              onPress={() => setSelectedLine(line.line)}
              style={({ pressed }) => [
                styles.lineTab,
                isActive && styles.lineTabActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.lineTabText, isActive && styles.lineTabTextActive]}>
                {line.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.selectorLabel}>{text.selectEpisode}</Text>
      <View style={styles.episodeGrid}>
        {currentLine.episodes.map((episode) => {
          const isActive = currentLine.line === activeLine && episode.episode === activeEpisode;
          const isReady = Boolean(episode.mediaUrl);

          return (
            <Pressable
              key={`${currentLine.line}-${episode.episode}`}
              accessibilityRole="button"
              onPress={() => onSelect({ episode: episode.episode, line: currentLine.line })}
              style={({ pressed }) => [
                styles.episodeCell,
                !isReady && styles.episodeCellLazy,
                isActive && styles.episodeCellActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.episodeCellText, isActive && styles.episodeCellTextActive]}
              >
                {getEpisodeLabel(episode)}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.episodeCellHint, isActive && styles.episodeCellHintActive]}
              >
                {isReady ? text.episodeReady : text.episodeLazy}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primary,
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  topTitle: {
    flex: 1,
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  scrollContentLandscape: {
    flexGrow: 1,
  },
  playerShell: {
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  playerShellLandscape: {
    flex: 1,
    aspectRatio: undefined,
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  playerLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  playerErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  completedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
  },
  playerOverlayTitle: {
    color: colors.white,
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  playerOverlayText: {
    color: colors.primarySoft,
    fontSize: fontSize.md,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  replayButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
  },
  replayText: {
    color: colors.primaryDark,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  gestureHint: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  gestureHintText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  controlBar: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  controlButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  progressTrack: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  progressRail: {
    overflow: 'hidden',
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.primary,
  },
  timeText: {
    minWidth: 42,
    color: colors.white,
    fontSize: fontSize.sm,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  speedBar: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xs,
    borderRadius: radius.pill,
    padding: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  speedButton: {
    minWidth: 40,
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  speedButtonActive: {
    backgroundColor: colors.white,
  },
  speedText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  speedTextActive: {
    color: colors.primaryDark,
  },
  unsupportedPlayer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: '#000000',
  },
  unsupportedTitle: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '900',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  unsupportedActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    ...shadow.card,
  },
  unsupportedActionText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  unsupportedHintMuted: {
    marginTop: spacing.lg,
    color: '#a98497',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  unsupportedText: {
    maxWidth: 310,
    color: '#d8a9bc',
    fontSize: fontSize.md,
    lineHeight: 21,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  body: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  detailCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 30,
  },
  badge: {
    overflow: 'hidden',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '900',
    backgroundColor: colors.primary,
  },
  badgeMuted: {
    backgroundColor: colors.textMuted,
  },
  authorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  avatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  avatarText: {
    color: colors.primaryDark,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  authorContent: {
    flex: 1,
  },
  authorName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  providerText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: 3,
  },
  episodePanel: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.primarySubtle,
    paddingTop: spacing.lg,
  },
  episodePanelHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  currentEpisodeText: {
    flex: 1,
    color: colors.primaryDark,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textAlign: 'right',
  },
  selectorLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '900',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  lineTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  lineTab: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.primarySoft,
  },
  lineTabActive: {
    backgroundColor: colors.primary,
  },
  lineTabText: {
    color: colors.primaryDark,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  lineTabTextActive: {
    color: colors.white,
  },
  episodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  episodeCell: {
    width: 74,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primarySoft,
  },
  episodeCellLazy: {
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  episodeCellActive: {
    backgroundColor: colors.primary,
    borderWidth: 0,
  },
  episodeCellText: {
    color: colors.primaryDark,
    fontSize: fontSize.sm,
    fontWeight: '900',
    textAlign: 'center',
  },
  episodeCellTextActive: {
    color: colors.white,
  },
  episodeCellHint: {
    color: colors.textSoft,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
    textAlign: 'center',
  },
  episodeCellHintActive: {
    color: colors.white,
  },
  noEpisodesText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  metaPill: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primarySoft,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  tagsSection: {
    marginTop: spacing.lg,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
    marginBottom: spacing.sm,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.primarySubtle,
  },
  tagText: {
    color: colors.primaryDark,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  actionButtonActive: {
    backgroundColor: colors.primary,
  },
  favoriteActionWrap: {
    flex: 1,
  },
  actionText: {
    color: colors.primaryDark,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  actionTextActive: {
    color: colors.white,
  },
  descriptionBox: {
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.primarySubtle,
    paddingTop: spacing.lg,
  },
  description: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  expandButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.sm,
  },
  expandText: {
    color: colors.primaryDark,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  modeBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  modeBadgeNative: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  modeBadgeFallback: {
    backgroundColor: '#ffe4e6',
    borderColor: '#f43f5e',
  },
  modeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  modeBadgeTextNative: {
    color: '#166534',
  },
  modeBadgeTextFallback: {
    color: '#9f1239',
  },
  relatedCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  sectionHint: {
    color: colors.textSoft,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  relatedItem: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.primarySubtle,
  },
  relatedCover: {
    width: 104,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: '#1a1116',
  },
  relatedContent: {
    flex: 1,
    gap: 5,
  },
  relatedTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
    lineHeight: 19,
  },
  relatedMeta: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  relatedStats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  relatedStatText: {
    color: colors.textSoft,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  noRelatedText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.74,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorBanner: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    padding: spacing.md,
    backgroundColor: colors.danger,
  },
  errorText: {
    flex: 1,
    color: colors.white,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
});
