import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoCard } from '@/components/VideoCard';
import { VideoCardSkeletonGrid } from '@/components/VideoCardSkeleton';
import { getAllVideos } from '@/services/videoService';
import { useFavoritesStore } from '@/store/favoritesStore';
import { colors, fontSize, radius, shadow, spacing } from '@/theme';
import type { VideoItem } from '@/types/video';

const favoritesTitle = '\u6211\u7684\u6536\u85cf';
const favoritesSubtitle = '\u968f\u65f6\u56de\u5230 App \u5185\u64ad\u653e';
const savedUnit = '\u4e2a\u89c6\u9891';
const clearText = '\u6e05\u7a7a';
const cancelText = '\u53d6\u6d88';
const manageText = '\u7ba1\u7406';
const removeSelectedText = '\u79fb\u9664\u9009\u4e2d';
const selectAllText = '\u5168\u9009';
const emptyTitle = '\u8fd8\u6ca1\u6709\u6536\u85cf';
const emptyText =
  '\u5728\u9996\u9875\u6216\u64ad\u653e\u9875\u70b9\u4eae\u7231\u5fc3\uff0c\u559c\u6b22\u7684\u89c6\u9891\u5c31\u4f1a\u6536\u5728\u8fd9\u91cc\u3002';
const listBatchConfig = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 40,
  windowSize: 7,
};

export default function FavoritesScreen() {
  const router = useRouter();
  const favorites = useFavoritesStore((state) => state.favorites);
  const favoriteIds = useFavoritesStore((state) => state.favoriteIds);
  const isSelectionMode = useFavoritesStore((state) => state.isSelectionMode);
  const selectedFavoriteIds = useFavoritesStore((state) => state.selectedFavoriteIds);
  const clearFavoriteSelection = useFavoritesStore((state) => state.clearFavoriteSelection);
  const removeFavorite = useFavoritesStore((state) => state.removeFavorite);
  const removeSelectedFavorites = useFavoritesStore((state) => state.removeSelectedFavorites);
  const selectAllFavorites = useFavoritesStore((state) => state.selectAllFavorites);
  const setSelectionMode = useFavoritesStore((state) => state.setSelectionMode);
  const toggleFavoriteSelection = useFavoritesStore((state) => state.toggleFavoriteSelection);
  const clearFavorites = useFavoritesStore((state) => state.clearFavorites);
  const hasHydrated = useFavoritesStore((state) => state.hasHydrated);
  const [currentVideos, setCurrentVideos] = useState<VideoItem[]>([]);
  const favoriteIdSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const videosById = useMemo(
    () => new Map(currentVideos.map((video) => [video.id, video])),
    [currentVideos],
  );
  const visibleFavorites = useMemo(
    () => favorites.map((video) => videosById.get(video.id) ?? video),
    [favorites, videosById],
  );
  const selectedFavoriteSet = useMemo(() => new Set(selectedFavoriteIds), [selectedFavoriteIds]);

  useEffect(() => {
    const controller = new AbortController();

    getAllVideos({ signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) {
          setCurrentVideos(items);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCurrentVideos([]);
        }
      });

    return () => controller.abort();
  }, []);

  const handlePressVideo = useCallback(
    (video: VideoItem) => {
      if (isSelectionMode) {
        toggleFavoriteSelection(video.id);
        return;
      }

      router.push(`/player/${video.id}`);
    },
    [isSelectionMode, router, toggleFavoriteSelection],
  );

  const handleToggleFavorite = useCallback(
    (video: VideoItem) => {
      removeFavorite(video.id);
    },
    [removeFavorite],
  );

  const renderFavoriteItem = useCallback(
    ({ item }: { item: VideoItem }) => (
      <VideoCard
        video={item}
        onPress={handlePressVideo}
        isFavorite={isSelectionMode ? selectedFavoriteSet.has(item.id) : favoriteIdSet.has(item.id)}
        onToggleFavorite={handleToggleFavorite}
      />
    ),
    [favoriteIdSet, handlePressVideo, handleToggleFavorite, isSelectionMode, selectedFavoriteSet],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{favoritesTitle}</Text>
          <Text style={styles.subtitle}>{favoritesSubtitle}</Text>
        </View>
        {favorites.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSelectionMode ? 'Cancel selection' : 'Manage favorites'}
            onPress={() => {
              if (isSelectionMode) {
                clearFavoriteSelection();
                return;
              }

              setSelectionMode(true);
            }}
            style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
          >
            <Ionicons
              name={isSelectionMode ? 'close-outline' : 'checkmark-circle-outline'}
              size={16}
              color={colors.primaryDark}
            />
            <Text style={styles.clearButtonText}>{isSelectionMode ? cancelText : manageText}</Text>
          </Pressable>
        ) : null}
      </View>

      {isSelectionMode ? (
        <View style={styles.selectionBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select all favorites"
            onPress={selectAllFavorites}
            style={({ pressed }) => [styles.selectionButton, pressed && styles.pressed]}
          >
            <Text style={styles.selectionButtonText}>{selectAllText}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove selected favorites"
            disabled={selectedFavoriteIds.length === 0}
            onPress={removeSelectedFavorites}
            style={({ pressed }) => [
              styles.selectionButton,
              styles.dangerButton,
              selectedFavoriteIds.length === 0 && styles.disabledButton,
              pressed && selectedFavoriteIds.length > 0 && styles.pressed,
            ]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.white} />
            <Text style={[styles.selectionButtonText, styles.dangerButtonText]}>
              {removeSelectedText} ({selectedFavoriteIds.length})
            </Text>
          </Pressable>
        </View>
      ) : favorites.length > 0 ? (
        <View style={styles.selectionBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear favorites"
            onPress={clearFavorites}
            style={({ pressed }) => [styles.selectionButton, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.primaryDark} />
            <Text style={styles.selectionButtonText}>{clearText}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          <Ionicons name="heart" size={20} color={colors.white} />
        </View>
        <View style={styles.summaryTextBlock}>
          <Text style={styles.summaryCount}>{favorites.length}</Text>
          <Text style={styles.summaryText}>{savedUnit}</Text>
        </View>
      </View>

      <FlatList
        data={visibleFavorites}
        keyExtractor={(item) => item.id}
        renderItem={renderFavoriteItem}
        numColumns={2}
        columnWrapperStyle={styles.videoRow}
        contentContainerStyle={[
          styles.listContent,
          visibleFavorites.length === 0 && styles.emptyListContent,
        ]}
        ListEmptyComponent={
          hasHydrated ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="heart-outline" size={36} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyText}>{emptyText}</Text>
            </View>
          ) : (
            <View style={styles.skeletonWrap}>
              <VideoCardSkeletonGrid count={4} />
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={listBatchConfig.initialNumToRender}
        maxToRenderPerBatch={listBatchConfig.maxToRenderPerBatch}
        updateCellsBatchingPeriod={listBatchConfig.updateCellsBatchingPeriod}
        windowSize={listBatchConfig.windowSize}
        removeClippedSubviews
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    color: colors.primaryDark,
    fontSize: fontSize.xxl,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: 2,
  },
  clearButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.soft,
  },
  clearButtonText: {
    color: colors.primaryDark,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  summaryCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  summaryIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  summaryTextBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  summaryCount: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '900',
  },
  summaryText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  selectionButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectionButtonText: {
    color: colors.primaryDark,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  dangerButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dangerButtonText: {
    color: colors.white,
  },
  disabledButton: {
    opacity: 0.52,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  videoRow: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  skeletonWrap: {
    paddingTop: spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  emptyIconWrap: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginTop: spacing.lg,
  },
  emptyText: {
    maxWidth: 280,
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 21,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
