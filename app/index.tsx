import { Ionicons } from '@expo/vector-icons';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from '@/shims/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoCard } from '@/components/VideoCard';
import { VideoCardSkeletonGrid } from '@/components/VideoCardSkeleton';
import {
  SUB_CATEGORIES_BY_CATEGORY,
  type UserVideoSubCategory,
} from '@/services/categoryMappingService';
import { APP_VIDEO_CATEGORIES, mapCategoryToAppCategory } from '@/services/categoryService';
import {
  getAllVideos,
  getVideoCacheVersion,
  hydrateFromPersistedCache,
  subscribeVideos,
} from '@/services/videoService';
import {
  getPlayHistoryItemKey,
  shouldShowContinueWatching,
  usePlayHistoryStore,
} from '@/store/playHistoryStore';
import { colors, fontSize, radius, shadow, spacing } from '@/theme';
import type { VideoCategory, VideoItem } from '@/types/video';

const appName = '\u5c0f\u7c89\u89c6\u9891';
const searchPlaceholder = '\u641c\u7d22\u89c6\u9891\u3001\u4f5c\u8005\u6216\u5206\u533a';
const loadingText = '\u6b63\u5728\u52a0\u8f7d\u63a8\u8350\u5185\u5bb9...';
const loadFailedText = '\u52a0\u8f7d\u5931\u8d25';
const emptyTitle = '\u6682\u65e0\u89c6\u9891';
const emptyText =
  '\u8fd9\u4e2a\u5206\u533a\u8fd8\u6ca1\u6709\u4e0a\u65b0\uff0c\u5148\u770b\u770b\u63a8\u8350\u5427';
const recommendCategory = '\u63a8\u8350';
const continueWatchingText = '\u7ee7\u7eed\u89c2\u770b';
const historyText = '\u5386\u53f2\u8bb0\u5f55';
const historyRoute = '/history' as Href;
const favoritesRoute = '/favorites' as Href;
const settingsRoute = '/settings' as Href;
const searchRoute = '/search' as Href;
type HomeCategory = VideoCategory;
const visibleCategories: HomeCategory[] = APP_VIDEO_CATEGORIES;
const listBatchConfig = {
  initialNumToRender: 4,
  maxToRenderPerBatch: 4,
  updateCellsBatchingPeriod: 80,
  windowSize: 5,
};
const HOME_INITIAL_VISIBLE_COUNT = 40;
const HOME_VISIBLE_INCREMENT = 40;

type ContinueWatchingItem = {
  historyItem: ReturnType<typeof usePlayHistoryStore.getState>['history'][number];
  video: VideoItem;
};

type AnimatedCategoryTabProps = {
  category: HomeCategory;
  isActive: boolean;
  onPress: (category: HomeCategory) => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AnimatedCategoryTab = ({ category, isActive, onPress }: AnimatedCategoryTabProps) => {
  const activeProgress = useSharedValue(isActive ? 1 : 0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    activeProgress.value = withTiming(isActive ? 1 : 0, { duration: 180 });
  }, [activeProgress, isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value + activeProgress.value * 0.03 }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      onPress={() => onPress(category)}
      onPressIn={() => {
        pressScale.value = withTiming(0.96, { duration: 80 });
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
      style={[styles.tabButton, isActive && styles.activeTabButton, animatedStyle]}
    >
      <Text style={[styles.tabText, isActive && styles.activeTabText]}>{category}</Text>
      {isActive ? <Animated.View style={styles.tabIndicator} /> : null}
    </AnimatedPressable>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const { category: routeCategory } = useLocalSearchParams<{
    category?: string;
  }>();
  const normalizedRouteCategory = routeCategory
    ? mapCategoryToAppCategory(routeCategory)
    : recommendCategory;
  const routeActiveCategory = visibleCategories.includes(normalizedRouteCategory)
    ? normalizedRouteCategory
    : recommendCategory;
  const [activeCategory, setActiveCategory] = useState<HomeCategory>(routeActiveCategory);
  const [activeSubCategory, setActiveSubCategory] = useState<UserVideoSubCategory | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(HOME_INITIAL_VISIBLE_COUNT);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const history = usePlayHistoryStore((state) => state.history);
  const hasAppliedVideosRef = useRef(false);
  const lastAppliedVersionRef = useRef(0);
  const pendingApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingApplyDataRef = useRef<{
    items: VideoItem[];
    version: number;
  } | null>(null);

  const flushPendingApply = useCallback(() => {
    pendingApplyTimerRef.current = null;
    const pending = pendingApplyDataRef.current;
    pendingApplyDataRef.current = null;

    if (!pending) {
      return;
    }

    if (pending.version <= lastAppliedVersionRef.current) {
      return;
    }

    hasAppliedVideosRef.current = true;
    lastAppliedVersionRef.current = pending.version;
    setVideos(pending.items);
    setIsLoading(false);
  }, []);

  const applyVideos = useCallback(
    (items: VideoItem[], meta?: { version?: number }, options?: { immediate?: boolean }) => {
      const nextVersion = meta?.version ?? getVideoCacheVersion();

      if (hasAppliedVideosRef.current && nextVersion <= lastAppliedVersionRef.current) {
        setIsLoading(false);
        return;
      }

      if (options?.immediate || !hasAppliedVideosRef.current) {
        if (pendingApplyTimerRef.current) {
          clearTimeout(pendingApplyTimerRef.current);
          pendingApplyTimerRef.current = null;
        }
        pendingApplyDataRef.current = null;
        hasAppliedVideosRef.current = true;
        lastAppliedVersionRef.current = Math.max(lastAppliedVersionRef.current, nextVersion);
        setVideos(items);
        setIsLoading(false);
        return;
      }

      pendingApplyDataRef.current = { items, version: nextVersion };

      if (!pendingApplyTimerRef.current) {
        pendingApplyTimerRef.current = setTimeout(flushPendingApply, 800);
      }
    },
    [flushPendingApply],
  );

  useEffect(
    () => () => {
      if (pendingApplyTimerRef.current) {
        clearTimeout(pendingApplyTimerRef.current);
        pendingApplyTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    setVisibleLimit(HOME_INITIAL_VISIBLE_COUNT);
    setActiveCategory(routeActiveCategory);
  }, [routeActiveCategory]);

  useEffect(() => {
    setVisibleLimit(HOME_INITIAL_VISIBLE_COUNT);
    setActiveSubCategory(null);
  }, [activeCategory]);

  useEffect(() => {
    let mounted = true;

    setErrorMessage('');

    const unsubscribe = subscribeVideos((items, meta) => {
      if (!mounted) {
        return;
      }

      applyVideos(items, meta);
    });

    void hydrateFromPersistedCache().then((items) => {
      if (mounted && items && items.length > 0) {
        applyVideos(items, undefined, { immediate: true });
      }
    });

    getAllVideos()
      .then((items) => {
        if (mounted) {
          applyVideos(items, undefined, { immediate: true });
        }
      })
      .catch((error: Error) => {
        if (mounted && error.name !== 'AbortError') {
          setErrorMessage(error.message || loadFailedText);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [applyVideos]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setErrorMessage('');

    getAllVideos({ bypassCache: true })
      .then((items) => {
        if (items.length > 0) {
          applyVideos(items, undefined, { immediate: true });
        }
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setErrorMessage(error.message || loadFailedText);
        }
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [applyVideos]);

  const videosById = useMemo(() => new Map(videos.map((video) => [video.id, video])), [videos]);

  const videosByCategory = useMemo(() => {
    const groupedVideos = new Map<VideoCategory, VideoItem[]>();

    for (const video of videos) {
      const category = video.category as VideoCategory;
      const currentVideos = groupedVideos.get(category);

      if (currentVideos) {
        currentVideos.push(video);
      } else {
        groupedVideos.set(category, [video]);
      }
    }

    return groupedVideos;
  }, [videos]);

  const subCategoryOptions = useMemo<UserVideoSubCategory[]>(() => {
    if (activeCategory === recommendCategory) {
      return [];
    }

    return SUB_CATEGORIES_BY_CATEGORY[activeCategory] ?? [];
  }, [activeCategory]);

  const visibleVideos = useMemo(() => {
    const baseList =
      activeCategory === recommendCategory ? videos : (videosByCategory.get(activeCategory) ?? []);

    if (!activeSubCategory) {
      return baseList;
    }

    return baseList.filter((video) => video.subCategory === activeSubCategory);
  }, [activeCategory, activeSubCategory, videos, videosByCategory]);

  useEffect(() => {
    setVisibleLimit(HOME_INITIAL_VISIBLE_COUNT);
  }, [activeCategory, activeSubCategory]);

  const visibleListVideos = useMemo(
    () => visibleVideos.slice(0, Math.min(visibleLimit, visibleVideos.length)),
    [visibleLimit, visibleVideos],
  );

  const continueWatchingItems = useMemo<ContinueWatchingItem[]>(() => {
    const nextItems: ContinueWatchingItem[] = [];

    for (const historyItem of history) {
      if (!shouldShowContinueWatching(historyItem)) {
        continue;
      }

      const video = videosById.get(historyItem.videoId);

      if (video) {
        nextItems.push({ historyItem, video });
      }

      if (nextItems.length >= 8) {
        break;
      }
    }

    return nextItems;
  }, [history, videosById]);

  const handlePressVideo = useCallback(
    (video: VideoItem) => {
      router.push(`/player/${video.id}`);
    },
    [router],
  );
  const handlePressHistoryVideo = useCallback(
    ({ historyItem, video }: ContinueWatchingItem) => {
      if (historyItem.line !== undefined && historyItem.episode !== undefined) {
        router.push(
          `/player/${video.id}?line=${encodeURIComponent(historyItem.line)}&episode=${encodeURIComponent(
            historyItem.episode,
          )}`,
        );
        return;
      }

      router.push(`/player/${video.id}`);
    },
    [router],
  );

  const handlePressCategory = useCallback(
    (category: HomeCategory) => {
      setVisibleLimit(HOME_INITIAL_VISIBLE_COUNT);
      setActiveCategory(category);
      router.setParams({ category });
    },
    [router],
  );

  const renderVideoItem = useCallback(
    ({ item }: { item: VideoItem }) => <VideoCard video={item} onPress={handlePressVideo} />,
    [handlePressVideo],
  );

  const keyExtractor = useCallback((item: VideoItem) => item.id, []);

  const handleLoadMoreVideos = useCallback(() => {
    setVisibleLimit((currentLimit) => {
      if (currentLimit >= visibleVideos.length) {
        return currentLimit;
      }

      return Math.min(currentLimit + HOME_VISIBLE_INCREMENT, visibleVideos.length);
    });
  }, [visibleVideos.length]);

  const renderContinueWatching = useCallback(() => {
    if (activeCategory !== recommendCategory || continueWatchingItems.length === 0) {
      return null;
    }

    return (
      <View style={styles.continueSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{continueWatchingText}</Text>
          <Pressable onPress={() => router.push(historyRoute)} style={styles.sectionAction}>
            <Text style={styles.sectionActionText}>{historyText}</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.primaryDark} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.continueList}
        >
          {continueWatchingItems.map(({ historyItem, video }) => {
            const progressRatio =
              historyItem.duration > 0
                ? Math.min(historyItem.progress / historyItem.duration, 1)
                : 0;

            return (
              <Pressable
                key={getPlayHistoryItemKey(historyItem)}
                onPress={() => handlePressHistoryVideo({ historyItem, video })}
                style={({ pressed }) => [styles.continueCard, pressed && styles.pressed]}
              >
                <Image
                  source={
                    video.thumbnailUrl || video.cover
                      ? { uri: video.thumbnailUrl ?? video.cover }
                      : undefined
                  }
                  style={styles.continueCover}
                  resizeMode="cover"
                />
                <View style={styles.continueProgressTrack}>
                  <View
                    style={[styles.continueProgressFill, { width: `${progressRatio * 100}%` }]}
                  />
                </View>
                <Text numberOfLines={2} style={styles.continueTitle}>
                  {video.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }, [activeCategory, continueWatchingItems, handlePressHistoryVideo, router]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.appName}>{appName}</Text>
            <Text style={styles.headerHint}>Fresh picks for you</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="\u6536\u85cf"
              onPress={() => router.push(favoritesRoute)}
              style={styles.iconButton}
            >
              <Ionicons name="heart-outline" size={21} color={colors.primaryDark} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="history"
              onPress={() => router.push(historyRoute)}
              style={styles.iconButton}
            >
              <Ionicons name="time-outline" size={22} color={colors.primaryDark} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="\u8bbe\u7f6e"
              onPress={() => router.push(settingsRoute)}
              style={styles.iconButton}
            >
              <Ionicons name="settings-outline" size={21} color={colors.primaryDark} />
            </Pressable>
          </View>
        </View>

        <Pressable
          accessibilityRole="search"
          accessibilityLabel={searchPlaceholder}
          onPress={() => router.push(searchRoute)}
          style={({ pressed }) => [styles.searchBox, pressed && styles.pressed]}
        >
          <View style={styles.searchIconBubble}>
            <Ionicons name="search-outline" size={17} color={colors.white} />
          </View>
          <Text style={styles.searchText}>{searchPlaceholder}</Text>
          <Ionicons name="options-outline" size={18} color={colors.textSoft} />
        </Pressable>
      </View>

      <View style={styles.tabsShell}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {visibleCategories.map((category) => (
            <AnimatedCategoryTab
              key={category}
              category={category}
              isActive={category === activeCategory}
              onPress={handlePressCategory}
            />
          ))}
        </ScrollView>
      </View>

      {subCategoryOptions.length > 0 ? (
        <View style={styles.subTabsShell}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subTabsContent}
          >
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeSubCategory === null }}
              onPress={() => {
                setVisibleLimit(HOME_INITIAL_VISIBLE_COUNT);
                setActiveSubCategory(null);
              }}
              style={({ pressed }) => [
                styles.subTabButton,
                activeSubCategory === null && styles.subTabButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[styles.subTabText, activeSubCategory === null && styles.subTabTextActive]}
              >
                {'\u5168\u90e8'}
              </Text>
            </Pressable>
            {subCategoryOptions.map((sub) => {
              const isActive = sub === activeSubCategory;
              return (
                <Pressable
                  key={sub}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => {
                    setVisibleLimit(HOME_INITIAL_VISIBLE_COUNT);
                    setActiveSubCategory(isActive ? null : sub);
                  }}
                  style={({ pressed }) => [
                    styles.subTabButton,
                    isActive && styles.subTabButtonActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.subTabText, isActive && styles.subTabTextActive]}>
                    {sub}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <View style={styles.loadingHeader}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>{loadingText}</Text>
          </View>
          <VideoCardSkeletonGrid count={6} />
        </View>
      ) : errorMessage ? (
        <View style={styles.stateContainer}>
          <Ionicons name="alert-circle-outline" size={36} color={colors.primary} />
          <Text style={styles.stateTitle}>{loadFailedText}</Text>
          <Text style={styles.stateText}>{errorMessage}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleListVideos}
          keyExtractor={keyExtractor}
          renderItem={renderVideoItem}
          numColumns={2}
          columnWrapperStyle={styles.videoRow}
          contentContainerStyle={[
            styles.listContent,
            visibleVideos.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={
            <View style={styles.stateContainer}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="sparkles-outline" size={34} color={colors.primary} />
              </View>
              <Text style={styles.stateTitle}>{emptyTitle}</Text>
              <Text style={styles.stateText}>{emptyText}</Text>
            </View>
          }
          ListHeaderComponent={renderContinueWatching}
          onEndReached={handleLoadMoreVideos}
          onEndReachedThreshold={0.7}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={listBatchConfig.initialNumToRender}
          maxToRenderPerBatch={listBatchConfig.maxToRenderPerBatch}
          updateCellsBatchingPeriod={listBatchConfig.updateCellsBatchingPeriod}
          windowSize={listBatchConfig.windowSize}
          removeClippedSubviews
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appName: {
    color: colors.primaryDark,
    fontSize: fontSize.xxl,
    fontWeight: '900',
  },
  headerHint: {
    color: colors.textSoft,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...shadow.soft,
  },
  searchBox: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  searchIconBubble: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  searchText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  tabsShell: {
    backgroundColor: colors.background,
    paddingBottom: spacing.sm,
  },
  tabsContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  subTabsShell: {
    backgroundColor: colors.background,
    paddingBottom: spacing.sm,
  },
  subTabsContent: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  subTabButton: {
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.primarySubtle,
  },
  subTabButtonActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  subTabText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  subTabTextActive: {
    color: colors.primaryDark,
  },
  tabButton: {
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.primarySubtle,
  },
  activeTabButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...shadow.card,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  activeTabText: {
    color: colors.white,
  },
  tabIndicator: {
    position: 'absolute',
    right: spacing.sm,
    bottom: 4,
    left: spacing.sm,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  continueSection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sectionActionText: {
    color: colors.primaryDark,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  continueList: {
    gap: spacing.md,
    paddingRight: spacing.md,
  },
  continueCard: {
    width: 156,
    borderRadius: radius.lg,
    padding: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primarySubtle,
    ...shadow.soft,
  },
  continueCover: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.primarySubtle,
  },
  continueProgressTrack: {
    overflow: 'hidden',
    height: 4,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
    backgroundColor: colors.primarySubtle,
  },
  continueProgressFill: {
    height: 4,
    backgroundColor: colors.primary,
  },
  continueTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  pressed: {
    opacity: 0.76,
  },
  videoRow: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  loadingWrap: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  stateTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginTop: spacing.md,
  },
  stateText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
