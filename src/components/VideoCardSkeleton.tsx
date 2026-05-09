import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from '@/shims/reanimated';
import { theme } from '@/theme';

export const VIDEO_COVER_ASPECT_RATIO = theme.size.videoCoverAspectRatio;

type VideoCardSkeletonProps = {
  count?: number;
};

const skeletonItems = [0, 1, 2, 3, 4, 5];

function VideoCardSkeletonGridComponent({ count = 4 }: VideoCardSkeletonProps) {
  const pulse = useSharedValue(1);
  pulse.value = withSequence(
    withTiming(0.62, { duration: theme.animation.skeletonPulseDuration }),
    withTiming(1, { duration: theme.animation.skeletonPulseDuration }),
  );
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <View style={styles.grid}>
      {skeletonItems.slice(0, count).map((item) => (
        <View key={item} style={styles.card}>
          <Animated.View style={[styles.cover, pulseStyle]} />
          <Animated.View style={[styles.lineWide, pulseStyle]} />
          <Animated.View style={[styles.lineShort, pulseStyle]} />
        </View>
      ))}
    </View>
  );
}

export const VideoCardSkeletonGrid = memo(VideoCardSkeletonGridComponent);

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  card: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.primarySubtle,
    ...theme.shadow.card,
  },
  cover: {
    width: '100%',
    aspectRatio: VIDEO_COVER_ASPECT_RATIO,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySubtle,
  },
  lineWide: {
    height: theme.size.skeletonLine,
    borderRadius: theme.radius.pill,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.primarySubtle,
  },
  lineShort: {
    width: '62%',
    height: theme.size.skeletonLineSmall,
    borderRadius: theme.radius.pill,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundSoft,
  },
});
