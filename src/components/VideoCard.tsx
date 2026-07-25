import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from '@/shims/reanimated';
import { VIDEO_COVER_ASPECT_RATIO } from '@/components/VideoCardSkeleton';
import { getPlaybackAvailability } from '@/domain/video/playability';
import { getPublicProviderLabel } from '@/domain/video/providerDisplay';
import { theme } from '@/theme';
import type { VideoItem } from '@/types/video';

type VideoCardProps = {
  video: VideoItem;
  onPress?: (video: VideoItem) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (video: VideoItem) => void;
};

const playableText = '\u0041\u0070\u0070\u5185\u64ad\u653e';
const lazyPlayableText = '\u5f85\u89e3\u6790';
const unplayableText = '\u4e0d\u53ef\u64ad\u653e';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const compactNumber = (value = 0) => {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}w`;
  }

  return value.toString();
};

const getFallbackStats = (id: string) => {
  const seed = id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return {
    danmakuCount: 80 + ((seed * 17) % 8200),
    playCount: 1200 + ((seed * 97) % 168000),
  };
};

function VideoCardComponent({
  video,
  onPress,
  isFavorite = false,
  onToggleFavorite,
}: VideoCardProps) {
  const fallbackStats = useMemo(() => getFallbackStats(video.id), [video.id]);
  const coverUri = video.thumbnailUrl || video.cover || undefined;
  const coverSource = useMemo(() => (coverUri ? { uri: coverUri } : undefined), [coverUri]);
  const playCount = useMemo(
    () => compactNumber(video.playCount ?? fallbackStats.playCount),
    [fallbackStats.playCount, video.playCount],
  );
  const danmakuCount = useMemo(
    () => compactNumber(video.danmakuCount ?? fallbackStats.danmakuCount),
    [fallbackStats.danmakuCount, video.danmakuCount],
  );
  const authorName = getPublicProviderLabel(video.author || video.provider);
  const playbackAvailability = getPlaybackAvailability(video);
  const isUnavailable = playbackAvailability === 'unplayable';
  const playPillText =
    playbackAvailability === 'direct'
      ? playableText
      : playbackAvailability === 'lazy'
        ? lazyPlayableText
        : unplayableText;
  const playPillIcon =
    playbackAvailability === 'direct'
      ? 'play'
      : playbackAvailability === 'lazy'
        ? 'play-circle'
        : 'alert-circle';
  const cardScale = useSharedValue(1);
  const favoriteScale = useSharedValue(1);

  useEffect(() => {
    if (isFavorite) {
      favoriteScale.value = withSequence(
        withSpring(1.2, { damping: 10, stiffness: 220 }),
        withSpring(1, { damping: 12, stiffness: 180 }),
      );
    }
  }, [favoriteScale, isFavorite]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const favoriteAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: favoriteScale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${video.title}`}
      onPress={() => onPress?.(video)}
      onPressIn={() => {
        cardScale.value = withTiming(theme.animation.cardPressScale, {
          duration: theme.animation.cardPressDuration,
        });
      }}
      onPressOut={() => {
        cardScale.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
      style={[styles.card, isUnavailable && styles.cardMuted, cardAnimatedStyle]}
    >
      <View style={styles.thumbnailShell}>
        <Image
          source={coverSource}
          style={styles.thumbnail}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          recyclingKey={`${video.id}:${coverUri ?? 'no-cover'}`}
        />
        <View style={styles.topGradient} />
        <View style={styles.coverShade}>
          <View style={styles.statsOverlay}>
            <View style={styles.statItem}>
              <Ionicons name="play" size={12} color={theme.colors.white} />
              <Text style={styles.overlayText}>{playCount}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="chatbubble-ellipses" size={12} color={theme.colors.white} />
              <Text style={styles.overlayText}>{danmakuCount}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.playPill, isUnavailable && styles.unplayablePill]}>
          <Ionicons
            name={playPillIcon}
            size={12}
            color={isUnavailable ? theme.colors.white : theme.colors.primaryDark}
          />
          <Text style={[styles.playPillText, isUnavailable && styles.unplayablePillText]}>
            {playPillText}
          </Text>
        </View>
        {onToggleFavorite ? (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Remove favorite' : 'Add favorite'}
            onPress={(event: { stopPropagation: () => void }) => {
              event.stopPropagation();
              favoriteScale.value = withTiming(
                0.88,
                { duration: theme.animation.favoriteTapDuration },
                () => {
                  favoriteScale.value = withSpring(1, { damping: 11, stiffness: 230 });
                },
              );
              onToggleFavorite(video);
            }}
            style={[styles.favoriteButton, favoriteAnimatedStyle]}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={18}
              color={isFavorite ? theme.colors.primary : theme.colors.white}
            />
          </AnimatedPressable>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {video.title}
        </Text>

        <View style={styles.infoRow}>
          <View style={styles.authorWrap}>
            <Ionicons name="person-circle-outline" size={15} color={theme.colors.textSoft} />
            <Text style={styles.authorText} numberOfLines={1}>
              {authorName}
            </Text>
          </View>
          <Text style={styles.sourceBadge}>{video.sourceType.toUpperCase()}</Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

export const VideoCard = memo(VideoCardComponent, (previous, next) => {
  if (previous.onPress !== next.onPress) {
    return false;
  }

  if (previous.isFavorite !== next.isFavorite) {
    return false;
  }

  if (previous.onToggleFavorite !== next.onToggleFavorite) {
    return false;
  }

  const previousVideo = previous.video;
  const nextVideo = next.video;

  if (previousVideo === nextVideo) {
    return true;
  }

  return (
    previousVideo.id === nextVideo.id &&
    previousVideo.title === nextVideo.title &&
    previousVideo.thumbnailUrl === nextVideo.thumbnailUrl &&
    previousVideo.cover === nextVideo.cover &&
    previousVideo.author === nextVideo.author &&
    previousVideo.category === nextVideo.category &&
    previousVideo.subCategory === nextVideo.subCategory &&
    previousVideo.duration === nextVideo.duration &&
    previousVideo.playCount === nextVideo.playCount &&
    previousVideo.danmakuCount === nextVideo.danmakuCount &&
    previousVideo.playableInApp === nextVideo.playableInApp &&
    getPlaybackAvailability(previousVideo) === getPlaybackAvailability(nextVideo) &&
    previousVideo.unsupportedReason === nextVideo.unsupportedReason
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.primarySubtle,
    ...theme.shadow.card,
  },
  cardMuted: {
    opacity: theme.opacity.muted,
  },
  thumbnailShell: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: theme.colors.primarySubtle,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: VIDEO_COVER_ASPECT_RATIO,
    backgroundColor: theme.colors.primarySubtle,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: theme.size.coverOverlayHeight,
    backgroundColor: theme.colors.overlay,
  },
  coverShade: {
    position: 'absolute',
    right: theme.spacing.sm,
    bottom: theme.spacing.xs,
    left: theme.spacing.sm,
    minHeight: theme.size.badgeHeight,
    justifyContent: 'center',
  },
  statsOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statItem: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs / 2,
  },
  overlayText: {
    color: theme.colors.white,
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
  },
  favoriteButton: {
    position: 'absolute',
    right: theme.spacing.sm,
    top: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    width: theme.touch.icon,
    height: theme.touch.icon,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.overlayStrong,
  },
  playPill: {
    position: 'absolute',
    left: theme.spacing.sm,
    top: theme.spacing.sm,
    minHeight: theme.size.badgeHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs / 2,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.primarySoft,
  },
  unplayablePill: {
    backgroundColor: theme.colors.overlayStrong,
  },
  playPillText: {
    color: theme.colors.primaryDark,
    fontSize: theme.fontSize.xs,
    fontWeight: '900',
  },
  unplayablePillText: {
    color: theme.colors.white,
  },
  body: {
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  title: {
    minHeight: theme.size.cardTitleMinHeight,
    color: theme.colors.text,
    ...theme.typography.title,
  },
  infoRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  authorWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs / 2,
  },
  authorText: {
    flex: 1,
    color: theme.colors.textMuted,
    ...theme.typography.meta,
  },
  sourceBadge: {
    overflow: 'hidden',
    borderRadius: theme.radius.xs,
    paddingHorizontal: theme.spacing.xs + 1,
    paddingVertical: 2,
    backgroundColor: theme.colors.primarySoft,
    color: theme.colors.primaryDark,
    fontSize: theme.fontSize.xs,
    fontWeight: '900',
  },
});
