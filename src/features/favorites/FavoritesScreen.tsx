import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoCard } from '@/components/VideoCard';
import { VideoCardSkeletonGrid } from '@/components/VideoCardSkeleton';
import { getAllVideos } from '@/services/videoService';
import { useFavoritesStore } from '@/store/favoritesStore';
import { colors } from '@/theme';
import type { VideoItem } from '@/types/video';
import { styles } from './styles';

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
