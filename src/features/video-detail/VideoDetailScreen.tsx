import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getPublicProviderLabel } from '@/domain/video/providerDisplay';
import { getVideoById, subscribeVideos } from '@/services/videoService';
import { useFavoritesStore } from '@/store/favoritesStore';
import { colors } from '@/theme';
import type { VideoItem, VideoPlayLine } from '@/types/video';
import { styles } from './styles';

const text = {
  loading: '\u6b63\u5728\u52a0\u8f7d\u89c6\u9891\u8be6\u60c5...',
  notFoundTitle: '\u89c6\u9891\u4e0d\u5b58\u5728',
  notFoundText: '\u8fd4\u56de\u540e\u9009\u62e9\u53e6\u4e00\u4e2a\u89c6\u9891\u8bd5\u8bd5\u3002',
  favorite: '\u6536\u85cf',
  favorited: '\u5df2\u6536\u85cf',
  openPlayer: '\u6253\u5f00\u64ad\u653e\u5668',
  selectLine: '\u9009\u62e9\u7ebf\u8def',
  selectEpisode: '\u9009\u62e9\u96c6\u6570',
  noEpisodes: '\u672a\u83b7\u53d6\u5230\u96c6\u6570\u4fe1\u606f',
  loadingEpisodes: '\u6b63\u5728\u83b7\u53d6\u66f4\u591a\u7ebf\u8def...',
};

export default function VideoDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [video, setVideo] = useState<VideoItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds);
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const seriesIdRef = useRef<string | undefined>(undefined);
  const currentVideoIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!id) {
      setVideo(null);
      setIsLoading(false);
      return;
    }

    let mounted = true;
    seriesIdRef.current = undefined;
    currentVideoIdRef.current = id;

    setIsLoading(true);
    setIsLoadingEpisodes(false);

    const applyVideo = (nextVideo: VideoItem | undefined | null) => {
      setVideo(nextVideo ?? null);

      if (nextVideo?.seriesId) {
        seriesIdRef.current = nextVideo.seriesId;
      }

      if (nextVideo?.id) {
        currentVideoIdRef.current = nextVideo.id;
      }
    };

    getVideoById(id)
      .then((nextVideo) => {
        if (mounted) {
          applyVideo(nextVideo);

          if (nextVideo && (nextVideo.playLines?.length ?? 0) === 0) {
            setIsLoadingEpisodes(true);
            void getVideoById(id, { bypassCache: true })
              .then((freshVideo) => {
                if (mounted && freshVideo) {
                  applyVideo(freshVideo);
                }
              })
              .finally(() => {
                if (mounted) {
                  setIsLoadingEpisodes(false);
                }
              });
          }
        }
      })
      .catch(() => {
        if (mounted) {
          setVideo(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

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
        applyVideo(nextVideo);
        setIsLoading(false);
        setIsLoadingEpisodes(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [id]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: text.loading }} />
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.emptyText}>{text.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!video) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: text.notFoundTitle }} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{text.notFoundTitle}</Text>
          <Text style={styles.emptyText}>{text.notFoundText}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isFavorite = favoriteIdSet.has(video.id);
  const authorLabel = getPublicProviderLabel(video.author, '--');
  const playLines: VideoPlayLine[] = video.playLines ?? [];
  const hasPlayLines = playLines.length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <Stack.Screen options={{ title: video.title }} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.previewShell}>
          <Image
            source={
              video.thumbnailUrl || video.cover
                ? { uri: video.thumbnailUrl ?? video.cover }
                : undefined
            }
            style={styles.thumbnail}
            resizeMode="cover"
          />
          <View style={styles.previewOverlay}>
            <Ionicons name="play-circle" size={72} color="#ffffff" />
          </View>
        </View>

        <View style={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? text.favorited : text.favorite}
            onPress={() => toggleFavorite(video)}
            style={({ pressed }) => [
              styles.favoriteButton,
              isFavorite && styles.favoriteButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={isFavorite ? colors.white : colors.primaryDark}
            />
            <Text
              style={[styles.favoriteButtonText, isFavorite && styles.favoriteButtonTextActive]}
            >
              {isFavorite ? text.favorited : text.favorite}
            </Text>
          </Pressable>

          <Text style={styles.title}>{video.title}</Text>
          <Text style={styles.meta}>
            {authorLabel} / {video.duration ?? '--'}
          </Text>
          {video.description ? <Text style={styles.description}>{video.description}</Text> : null}

          <Pressable
            accessibilityLabel={text.openPlayer}
            accessibilityRole="button"
            onPress={() => router.push(`/player/${video.id}`)}
            style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
          >
            <Ionicons name="play" size={20} color={colors.white} />
            <Text style={styles.playButtonText}>{text.openPlayer}</Text>
          </Pressable>

          {hasPlayLines ? (
            <PlayLineSelector
              lines={playLines}
              onSelect={(line, episode) => {
                router.push(
                  `/player/${video.id}?line=${encodeURIComponent(line)}&episode=${encodeURIComponent(episode)}`,
                );
              }}
            />
          ) : isLoadingEpisodes ? (
            <Text style={styles.noEpisodes}>{text.loadingEpisodes}</Text>
          ) : (
            <Text style={styles.noEpisodes}>{text.noEpisodes}</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type PlayLineSelectorProps = {
  lines: VideoPlayLine[];
  onSelect: (line: number, episode: number) => void;
};

function PlayLineSelector({ lines, onSelect }: PlayLineSelectorProps) {
  const [selectedLine, setSelectedLine] = useState<number>(lines[0]?.line ?? 1);
  const currentLine = lines.find((line) => line.line === selectedLine) ?? lines[0];

  if (!currentLine) {
    return null;
  }

  return (
    <View style={styles.linesBlock}>
      <Text style={styles.sectionTitle}>{text.selectLine}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.lineTabs}
      >
        {lines.map((line) => {
          const active = line.line === currentLine.line;
          return (
            <Pressable
              key={line.line}
              onPress={() => setSelectedLine(line.line)}
              style={({ pressed }) => [
                styles.lineTab,
                active && styles.lineTabActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.lineTabText, active && styles.lineTabTextActive]}>
                {line.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.sectionTitle}>{text.selectEpisode}</Text>
      <View style={styles.episodeGrid}>
        {currentLine.episodes.map((episode) => (
          <Pressable
            key={`${currentLine.line}-${episode.episode}`}
            onPress={() => onSelect(currentLine.line, episode.episode)}
            style={({ pressed }) => [
              styles.episodeCell,
              !episode.mediaUrl && styles.episodeCellLazy,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.episodeCellText}>
              {episode.episodeLabel ?? `\u7b2c${episode.episode}\u96c6`}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
