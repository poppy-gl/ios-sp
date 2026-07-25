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
import { getVideoPage, hydrateFromPersistedCache } from '@/services/videoService';
import {
  getPlayHistoryItemKey,
  shouldShowContinueWatching,
  usePlayHistoryStore,
} from '@/store/playHistoryStore';
import { colors } from '@/theme';
import type { VideoCategory, VideoItem } from '@/types/video';
import { styles } from './styles';

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
  initialNumToRender: 6,
  maxToRenderPerBatch: 6,
  updateCellsBatchingPeriod: 60,
  windowSize: 5,
};
const HOME_INITIAL_VISIBLE_COUNT = 12;
const HOME_VISIBLE_INCREMENT = 48;
const HOME_BACKEND_PAGE_SIZE = 48;
const HOME_PREFETCH_VISIBLE_THRESHOLD = 72;
const HOME_PREFETCH_PAGE_TARGET = 2;
const HOME_COVER_PREFETCH_COUNT = 40;
const allBackendPagesKey = '__all__';

const appendUniqueVideos = (currentVideos: VideoItem[], incomingVideos: VideoItem[]) => {
  if (incomingVideos.length === 0) {
    return currentVideos;
  }

  const seenIds = new Set(currentVideos.map((video) => video.id));
  const nextVideos = [...currentVideos];

  for (const video of incomingVideos) {
    if (seenIds.has(video.id)) {
      continue;
    }

    seenIds.add(video.id);
    nextVideos.push(video);
  }

  return nextVideos.length === currentVideos.length ? currentVideos : nextVideos;
};

const matchesBackendCategory = (video: VideoItem, category?: string) =>
  !category || video.category === category || video.subCategory === category;

const getHomeCachedItems = (items: VideoItem[], category?: string) =>
  items.filter((video) => matchesBackendCategory(video, category)).slice(0, HOME_BACKEND_PAGE_SIZE);

const prefetchVideoCovers = (items: VideoItem[], limit = HOME_COVER_PREFETCH_COUNT) => {
  items
    .slice(0, limit)
    .map((video) => video.thumbnailUrl || video.cover)
    .filter((uri): uri is string => Boolean(uri))
    .forEach((uri) => {
      void Image.prefetch(uri).catch(() => undefined);
    });
};

type PrefetchedBackendPage = {
  cursor?: string;
  hasMore: boolean;
  items: VideoItem[];
  key: string;
  nextCursor?: string;
  page: number;
};

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
  const [catalogVideos, setCatalogVideos] = useState<VideoItem[]>([]);
  const [visibleLimit, setVisibleLimit] = useState(HOME_INITIAL_VISIBLE_COUNT);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPrefetchingMore, setIsPrefetchingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const history = usePlayHistoryStore((state) => state.history);
  const backendPageCategory = undefined;
  const backendPageKey = allBackendPagesKey;
  const hasMoreBackendPagesRef = useRef(true);
  const isLoadingMoreBackendPageRef = useRef(false);
  const isPrefetchingBackendPageRef = useRef(false);
  const nextBackendPageRef = useRef(2);
  const nextBackendCursorRef = useRef<string | undefined>(undefined);
  const prefetchBackendPageRef = useRef(2);
  const prefetchBackendCursorRef = useRef<string | undefined>(undefined);
  const canTriggerEndReachedRef = useRef(true);
  const backendPageCategoryRef = useRef(backendPageCategory);
  const backendPageKeyRef = useRef(backendPageKey);
  const catalogVideosRef = useRef<VideoItem[]>([]);
  const prefetchedBackendPagesRef = useRef<PrefetchedBackendPage[]>([]);
  const prefetchBackendPageRequestRef = useRef<Promise<void> | undefined>(undefined);

  const loadFirstBackendPage = useCallback(async () => {
    const result = await getVideoPage({
      category: backendPageCategory,
      commitToCache: false,
      page: 1,
      pageSize: HOME_BACKEND_PAGE_SIZE,
    });
    nextBackendPageRef.current = 2;
    nextBackendCursorRef.current = result.nextCursor;
    prefetchBackendPageRef.current = 2;
    prefetchBackendCursorRef.current = result.nextCursor;
    hasMoreBackendPagesRef.current = result.hasMore;

    return result.items;
  }, [backendPageCategory]);

  useEffect(() => {
    setVisibleLimit(HOME_INITIAL_VISIBLE_COUNT);
    canTriggerEndReachedRef.current = true;
    setActiveCategory(routeActiveCategory);
  }, [routeActiveCategory]);

  useEffect(() => {
    setVisibleLimit(HOME_INITIAL_VISIBLE_COUNT);
    canTriggerEndReachedRef.current = true;
    setActiveSubCategory(null);
  }, [activeCategory]);

  useEffect(() => {
    catalogVideosRef.current = catalogVideos;
  }, [catalogVideos]);

  useEffect(() => {
    backendPageCategoryRef.current = backendPageCategory;
    backendPageKeyRef.current = backendPageKey;
    hasMoreBackendPagesRef.current = true;
    nextBackendPageRef.current = 2;
    nextBackendCursorRef.current = undefined;
    prefetchBackendPageRef.current = 2;
    prefetchBackendCursorRef.current = undefined;
    canTriggerEndReachedRef.current = true;
    prefetchedBackendPagesRef.current = [];
    prefetchBackendPageRequestRef.current = undefined;
    isPrefetchingBackendPageRef.current = false;
    setIsPrefetchingMore(false);
  }, [backendPageCategory, backendPageKey]);

  useEffect(() => {
    let mounted = true;
    const inMemoryHomeItems = getHomeCachedItems(catalogVideosRef.current, backendPageCategory);

    setErrorMessage('');
    setIsLoading(inMemoryHomeItems.length === 0);
    setVideos(inMemoryHomeItems);

    void hydrateFromPersistedCache().then((items) => {
      if (mounted && items && items.length > 0) {
        const cachedHomeItems = getHomeCachedItems(items, backendPageCategory);
        setCatalogVideos(items);

        if (cachedHomeItems.length > 0) {
          setVideos(cachedHomeItems);
          setIsLoading(false);
          prefetchVideoCovers(cachedHomeItems);
        }
      }
    });

    loadFirstBackendPage()
      .then((items) => {
        if (mounted) {
          console.info('[HomeScreen] applying videos', {
            count: items.length,
            mode: 'page-reset',
            pageKey: backendPageKey,
          });
          setVideos(items);
          setCatalogVideos((currentVideos) => appendUniqueVideos(currentVideos, items));
          prefetchVideoCovers(items);
        }
      })
      .catch((error: Error) => {
        if (mounted && error.name !== 'AbortError') {
          const fallbackItems = getHomeCachedItems(catalogVideosRef.current, backendPageCategory);

          if (fallbackItems.length > 0) {
            setVideos(fallbackItems);
            setErrorMessage('');
            return;
          }

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
    };
  }, [backendPageCategory, backendPageKey, loadFirstBackendPage]);

  const handleRefresh = useCallback(() => {
    const requestPageKey = backendPageKey;
    hasMoreBackendPagesRef.current = true;
    nextBackendPageRef.current = 2;
    nextBackendCursorRef.current = undefined;
    prefetchBackendPageRef.current = 2;
    prefetchBackendCursorRef.current = undefined;
    prefetchedBackendPagesRef.current = [];
    prefetchBackendPageRequestRef.current = undefined;
    isPrefetchingBackendPageRef.current = false;
    setIsPrefetchingMore(false);
    canTriggerEndReachedRef.current = true;
    setIsRefreshing(true);
    setErrorMessage('');

    loadFirstBackendPage()
      .then((items) => {
        if (requestPageKey !== backendPageKeyRef.current) {
          return;
        }

        console.info('[HomeScreen] applying videos', {
          count: items.length,
          mode: 'refresh-reset',
          pageKey: requestPageKey,
        });
        setVideos(items);
        setCatalogVideos((currentVideos) => appendUniqueVideos(currentVideos, items));
        prefetchVideoCovers(items);
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') {
          setErrorMessage(error.message || loadFailedText);
        }
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [backendPageKey, loadFirstBackendPage]);

  const videosById = useMemo(() => {
    const indexedVideos = new Map<string, VideoItem>();

    for (const video of catalogVideos) {
      indexedVideos.set(video.id, video);
    }

    for (const video of videos) {
      indexedVideos.set(video.id, video);
    }

    return indexedVideos;
  }, [catalogVideos, videos]);

  const subCategoryOptions = useMemo<UserVideoSubCategory[]>(() => {
    if (activeCategory === recommendCategory) {
      return [];
    }

    return SUB_CATEGORIES_BY_CATEGORY[activeCategory] ?? [];
  }, [activeCategory]);

  const visibleVideos = useMemo(() => {
    if (activeCategory === recommendCategory) {
      return videos;
    }

    const categorySourceVideos = catalogVideos.length > 0 ? catalogVideos : videos;

    return categorySourceVideos.filter((video) =>
      activeSubCategory
        ? video.subCategory === activeSubCategory
        : video.category === activeCategory,
    );
  }, [activeCategory, activeSubCategory, catalogVideos, videos]);

  useEffect(() => {
    setVisibleLimit(HOME_INITIAL_VISIBLE_COUNT);
  }, [activeCategory, activeSubCategory]);

  const visibleListVideos = useMemo(
    () => visibleVideos.slice(0, Math.min(visibleLimit, visibleVideos.length)),
    [visibleLimit, visibleVideos],
  );
  const shouldShowErrorState = Boolean(errorMessage && videos.length === 0);

  useEffect(() => {
    console.info('[HomeScreen] visible videos', {
      activeCategory,
      activeSubCategory,
      backendPageKey,
      total: videos.length,
      visible: visibleVideos.length,
      visibleList: visibleListVideos.length,
    });
  }, [
    activeCategory,
    activeSubCategory,
    backendPageKey,
    videos.length,
    visibleListVideos.length,
    visibleVideos.length,
  ]);

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

  const getCurrentPrefetchQueue = useCallback(() => {
    const currentKey = backendPageKeyRef.current;
    const currentPages = prefetchedBackendPagesRef.current.filter(
      (page) => page.key === currentKey,
    );

    if (currentPages.length !== prefetchedBackendPagesRef.current.length) {
      prefetchedBackendPagesRef.current = currentPages;
    }

    return currentPages;
  }, []);

  const getMatchingPrefetchedPage = useCallback(() => {
    const queue = getCurrentPrefetchQueue();
    const exactIndex = queue.findIndex(
      (page) =>
        page.page === nextBackendPageRef.current && page.cursor === nextBackendCursorRef.current,
    );
    const index =
      exactIndex >= 0
        ? exactIndex
        : queue.findIndex((page) => page.page === nextBackendPageRef.current);

    if (index < 0) {
      return undefined;
    }

    const [prefetched] = queue.splice(index, 1);
    if (prefetched.cursor !== nextBackendCursorRef.current) {
      console.info('[HomeScreen] applying prefetched page with cursor fallback', {
        expectedCursor: nextBackendCursorRef.current,
        page: prefetched.page,
        pageKey: prefetched.key,
        prefetchedCursor: prefetched.cursor,
      });
    }

    prefetchedBackendPagesRef.current = queue;
    return prefetched;
  }, [getCurrentPrefetchQueue]);

  const prefetchNextBackendPage = useCallback(() => {
    const queue = getCurrentPrefetchQueue();

    if (
      isPrefetchingBackendPageRef.current ||
      !hasMoreBackendPagesRef.current ||
      queue.length >= HOME_PREFETCH_PAGE_TARGET
    ) {
      return prefetchBackendPageRequestRef.current;
    }

    const page = prefetchBackendPageRef.current;
    const cursor = prefetchBackendCursorRef.current;
    const requestPageKey = backendPageKeyRef.current;
    const category = backendPageCategoryRef.current;
    let didFail = false;
    isPrefetchingBackendPageRef.current = true;
    setIsPrefetchingMore(true);

    let request: Promise<void>;
    request = getVideoPage({
      category,
      commitToCache: false,
      cursor,
      page,
      pageSize: HOME_BACKEND_PAGE_SIZE,
    })
      .then((result) => {
        if (requestPageKey !== backendPageKeyRef.current) {
          return;
        }

        if (result.items.length === 0) {
          hasMoreBackendPagesRef.current = false;
          return;
        }

        const prefetched: PrefetchedBackendPage = {
          cursor,
          hasMore: result.hasMore,
          items: result.items,
          key: requestPageKey,
          nextCursor: result.nextCursor,
          page,
        };

        const currentQueue = getCurrentPrefetchQueue();
        const alreadyQueued = currentQueue.some((item) => item.page === prefetched.page);

        if (!alreadyQueued) {
          prefetchedBackendPagesRef.current = [...currentQueue, prefetched];
        }

        prefetchBackendPageRef.current = page + 1;
        prefetchBackendCursorRef.current = result.nextCursor;
        hasMoreBackendPagesRef.current = result.hasMore;
        prefetchVideoCovers(result.items);
      })
      .catch((error: Error) => {
        didFail = true;

        if (error.name !== 'AbortError') {
          console.warn('[HomeScreen] backend page prefetch failed', error.message || String(error));
        }
      })
      .finally(() => {
        isPrefetchingBackendPageRef.current = false;
        setIsPrefetchingMore(false);

        if (prefetchBackendPageRequestRef.current === request) {
          prefetchBackendPageRequestRef.current = undefined;
        }

        if (
          !didFail &&
          hasMoreBackendPagesRef.current &&
          getCurrentPrefetchQueue().length < HOME_PREFETCH_PAGE_TARGET
        ) {
          void prefetchNextBackendPage();
        }
      });

    prefetchBackendPageRequestRef.current = request;
    return request;
  }, [getCurrentPrefetchQueue]);

  const applyBackendPage = useCallback((result: PrefetchedBackendPage) => {
    if (result.key !== backendPageKeyRef.current) {
      return;
    }

    if (result.items.length === 0) {
      hasMoreBackendPagesRef.current = false;
      return;
    }

    nextBackendPageRef.current = result.page + 1;
    nextBackendCursorRef.current = result.nextCursor;
    hasMoreBackendPagesRef.current = result.hasMore;
    console.info('[HomeScreen] appending videos', {
      count: result.items.length,
      mode: result.cursor ? 'cursor' : 'page',
      page: result.page,
      pageKey: result.key,
    });
    setVideos((currentVideos) => appendUniqueVideos(currentVideos, result.items));
    setCatalogVideos((currentVideos) => appendUniqueVideos(currentVideos, result.items));
    setVisibleLimit((currentLimit) => currentLimit + HOME_VISIBLE_INCREMENT);
    prefetchVideoCovers(result.items);
  }, []);

  const loadNextBackendPage = useCallback(() => {
    if (
      isLoadingMoreBackendPageRef.current ||
      (!hasMoreBackendPagesRef.current && getCurrentPrefetchQueue().length === 0)
    ) {
      return;
    }

    const prefetched = getMatchingPrefetchedPage();

    if (prefetched) {
      applyBackendPage(prefetched);
      void prefetchNextBackendPage();
      return;
    }

    const request = prefetchBackendPageRequestRef.current ?? prefetchNextBackendPage();

    if (!request) {
      return;
    }

    isLoadingMoreBackendPageRef.current = true;
    setIsLoadingMore(true);

    request
      .then(() => {
        const readyPage = getMatchingPrefetchedPage();

        if (readyPage) {
          applyBackendPage(readyPage);
          void prefetchNextBackendPage();
        }
      })
      .finally(() => {
        isLoadingMoreBackendPageRef.current = false;
        setIsLoadingMore(false);
      });
  }, [
    applyBackendPage,
    getCurrentPrefetchQueue,
    getMatchingPrefetchedPage,
    prefetchNextBackendPage,
  ]);

  useEffect(() => {
    if (
      isLoading ||
      isRefreshing ||
      isLoadingMore ||
      videos.length === 0 ||
      visibleVideos.length > 0
    ) {
      return;
    }

    loadNextBackendPage();
  }, [
    isLoading,
    isLoadingMore,
    isRefreshing,
    loadNextBackendPage,
    videos.length,
    visibleVideos.length,
  ]);

  useEffect(() => {
    if (
      isLoading ||
      isRefreshing ||
      isLoadingMore ||
      videos.length === 0 ||
      (!hasMoreBackendPagesRef.current && getCurrentPrefetchQueue().length === 0)
    ) {
      return;
    }

    const remainingBufferedItems = visibleVideos.length - visibleLimit;

    if (remainingBufferedItems <= HOME_PREFETCH_VISIBLE_THRESHOLD) {
      const readyPage = getMatchingPrefetchedPage();

      if (readyPage) {
        applyBackendPage(readyPage);
        void prefetchNextBackendPage();
        return;
      }
    }

    if (
      hasMoreBackendPagesRef.current &&
      getCurrentPrefetchQueue().length < HOME_PREFETCH_PAGE_TARGET
    ) {
      void prefetchNextBackendPage();
    }
  }, [
    applyBackendPage,
    getCurrentPrefetchQueue,
    getMatchingPrefetchedPage,
    isLoading,
    isLoadingMore,
    isPrefetchingMore,
    isRefreshing,
    prefetchNextBackendPage,
    videos.length,
    visibleLimit,
    visibleVideos.length,
  ]);

  useEffect(() => {
    const nextLikelyItems = visibleVideos.slice(
      visibleLimit,
      visibleLimit + HOME_COVER_PREFETCH_COUNT,
    );

    prefetchVideoCovers(nextLikelyItems);
  }, [visibleLimit, visibleVideos]);

  const handleLoadMoreVideos = useCallback(() => {
    if (isLoading || isLoadingMore || isRefreshing || !canTriggerEndReachedRef.current) {
      return;
    }

    canTriggerEndReachedRef.current = false;

    if (visibleLimit < visibleVideos.length) {
      const nextVisibleLimit = Math.min(
        visibleLimit + HOME_VISIBLE_INCREMENT,
        visibleVideos.length,
      );
      setVisibleLimit((currentLimit) =>
        Math.min(currentLimit + HOME_VISIBLE_INCREMENT, visibleVideos.length),
      );

      if (visibleVideos.length - nextVisibleLimit <= HOME_PREFETCH_VISIBLE_THRESHOLD) {
        const readyPage = getMatchingPrefetchedPage();

        if (readyPage) {
          applyBackendPage(readyPage);
        }

        void prefetchNextBackendPage();
      }
      return;
    }

    loadNextBackendPage();
  }, [
    isLoading,
    isLoadingMore,
    isRefreshing,
    applyBackendPage,
    getMatchingPrefetchedPage,
    loadNextBackendPage,
    prefetchNextBackendPage,
    visibleLimit,
    visibleVideos.length,
  ]);

  const resetEndReachedTrigger = useCallback(() => {
    canTriggerEndReachedRef.current = true;
  }, []);

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
      ) : shouldShowErrorState ? (
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
          ListFooterComponent={
            isLoadingMore || isPrefetchingMore ? (
              <View style={styles.loadingMoreFooter}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
          onEndReached={handleLoadMoreVideos}
          onEndReachedThreshold={0.8}
          onMomentumScrollBegin={resetEndReachedTrigger}
          onScrollBeginDrag={resetEndReachedTrigger}
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
