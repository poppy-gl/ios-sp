import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoCard } from '@/components/VideoCard';
import { VideoCardSkeletonGrid } from '@/components/VideoCardSkeleton';
import { searchVideos } from '@/services/videoService';
import { useSettingsStore } from '@/store/settingsStore';
import { colors, fontSize, radius, shadow, spacing } from '@/theme';
import type { VideoItem } from '@/types/video';

const HISTORY_KEY = 'video-search-history';
const MAX_HISTORY_ITEMS = 10;
const DEBOUNCE_DELAY = 300;
const HOT_SEARCHES = [
  '电影',
  '电视剧',
  '综艺',
  '动漫',
  '动作片',
  '国产剧',
  '韩剧',
  '日韩综艺',
  '国漫',
];
const listBatchConfig = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 40,
  windowSize: 7,
};

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase();
}

function uniqueHistory(items: string[]) {
  const seen = new Set<string>();
  const nextHistory: string[] = [];

  for (const item of items) {
    const keyword = item.trim();
    const key = keyword.toLowerCase();

    if (!keyword || seen.has(key)) {
      continue;
    }

    seen.add(key);
    nextHistory.push(keyword);
  }

  return nextHistory.slice(0, MAX_HISTORY_ITEMS);
}

export default function SearchScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [searchableVideos, setSearchableVideos] = useState<VideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const historyRef = useRef<string[]>([]);
  const searchHistoryClearedAt = useSettingsStore((state) => state.searchHistoryClearedAt);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY)
      .then((storedHistory) => {
        if (!storedHistory) {
          return;
        }

        const parsedHistory = JSON.parse(storedHistory);
        if (Array.isArray(parsedHistory)) {
          const nextHistory = uniqueHistory(
            parsedHistory.filter((item) => typeof item === 'string'),
          );
          historyRef.current = nextHistory;
          setHistory(nextHistory);
        }
      })
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (!searchHistoryClearedAt) {
      return;
    }

    historyRef.current = [];
    setHistory([]);
  }, [searchHistoryClearedAt]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), DEBOUNCE_DELAY);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    setIsLoading(true);
    if (!normalizeKeyword(debouncedKeyword)) {
      setSearchableVideos([]);
      setIsLoading(false);
      setErrorMessage('');
      return () => {
        isActive = false;
        controller.abort();
      };
    }

    searchVideos(debouncedKeyword, { signal: controller.signal })
      .then((items) => {
        if (isActive) {
          setSearchableVideos(items);
          setErrorMessage('');
        }
      })
      .catch((error: Error) => {
        if (isActive && error.name !== 'AbortError') {
          setSearchableVideos([]);
          setErrorMessage(error.message);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [debouncedKeyword]);

  const trimmedKeyword = keyword.trim();
  const normalizedDebouncedKeyword = normalizeKeyword(debouncedKeyword);
  const hasQuery = normalizedDebouncedKeyword.length > 0;

  const results = useMemo(() => {
    if (!hasQuery) {
      return [];
    }

    return searchableVideos;
  }, [hasQuery, searchableVideos]);

  const saveHistory = useCallback(async (value: string) => {
    const nextKeyword = value.trim();

    if (!nextKeyword) {
      return;
    }

    const nextHistory = uniqueHistory([
      nextKeyword,
      ...historyRef.current.filter((item) => item.toLowerCase() !== nextKeyword.toLowerCase()),
    ]);

    historyRef.current = nextHistory;
    setHistory(nextHistory);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
  }, []);

  const runSearch = useCallback(
    (value: string) => {
      const nextKeyword = value.trim();

      if (!nextKeyword) {
        return;
      }

      setKeyword(nextKeyword);
      setDebouncedKeyword(nextKeyword);
      void saveHistory(nextKeyword);
    },
    [saveHistory],
  );

  const handleSubmit = useCallback(() => runSearch(keyword), [keyword, runSearch]);

  const handleClear = useCallback(() => {
    setKeyword('');
    setDebouncedKeyword('');
  }, []);

  const handleClearHistory = useCallback(async () => {
    historyRef.current = [];
    setHistory([]);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([]));
  }, []);

  const handlePressVideo = useCallback(
    (video: VideoItem) => {
      void saveHistory(keyword);
      router.push(`/player/${video.id}`);
    },
    [keyword, router, saveHistory],
  );

  const renderVideoItem = useCallback(
    ({ item }: { item: VideoItem }) => <VideoCard video={item} onPress={handlePressVideo} />,
    [handlePressVideo],
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.header}>
        <Text style={styles.title}>搜索</Text>
        <View style={styles.searchBox}>
          <View style={styles.searchIconBubble}>
            <Ionicons name="search-outline" size={17} color={colors.white} />
          </View>
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            onSubmitEditing={handleSubmit}
            placeholder="搜索标题、作者、分区或简介"
            placeholderTextColor={colors.textSoft}
            returnKeyType="search"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {trimmedKeyword.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={handleClear}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={18} color={colors.primaryDark} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Submit search"
            onPress={handleSubmit}
            style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
          >
            <Text style={styles.searchText}>搜索</Text>
          </Pressable>
        </View>

        {!hasQuery && history.length > 0 ? (
          <View style={styles.historySection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>搜索历史</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search history"
                onPress={handleClearHistory}
                style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
              >
                <Text style={styles.textButtonText}>清空</Text>
              </Pressable>
            </View>
            <View style={styles.historyList}>
              {history.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  onPress={() => runSearch(item)}
                  style={({ pressed }) => [styles.historyChip, pressed && styles.pressed]}
                >
                  <Text style={styles.historyText} numberOfLines={1}>
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {!hasQuery ? (
          <View style={styles.hotSection}>
            <Text style={styles.sectionTitle}>热门搜索</Text>
            <View style={styles.hotGrid}>
              {HOT_SEARCHES.map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  onPress={() => runSearch(item)}
                  style={({ pressed }) => [styles.hotItem, pressed && styles.pressed]}
                >
                  <Ionicons name="flame-outline" size={15} color={colors.primary} />
                  <Text style={styles.hotText} numberOfLines={1}>
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {hasQuery ? (
          <Text style={styles.resultSummary}>
            {isLoading ? '正在搜索...' : `找到 ${results.length} 个视频`}
          </Text>
        ) : (
          <Text style={styles.hint}>仅搜索 videoService 中已授权、已分类的视频源。</Text>
        )}
      </View>
    ),
    [
      errorMessage,
      handleClear,
      handleClearHistory,
      handleSubmit,
      hasQuery,
      history,
      isLoading,
      keyword,
      results.length,
      runSearch,
      trimmedKeyword.length,
    ],
  );

  const emptyComponent = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.skeletonWrap}>
          <Text style={styles.emptyText}>正在搜索...</Text>
          <VideoCardSkeletonGrid count={4} />
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>{hasQuery ? '暂无结果' : '开始搜索'}</Text>
        <Text style={styles.emptyText}>
          {hasQuery
            ? '换个标题、作者、分区、标签或简介关键词试试。'
            : '最近搜索和热门关键词会显示在这里。'}
        </Text>
      </View>
    );
  }, [hasQuery, isLoading]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderVideoItem}
        numColumns={2}
        columnWrapperStyle={styles.videoRow}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
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
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  title: {
    color: colors.primaryDark,
    fontSize: fontSize.xxl,
    fontWeight: '900',
  },
  searchBox: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
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
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    paddingVertical: spacing.sm,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  searchButton: {
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
  historySection: {
    gap: spacing.sm,
  },
  hotSection: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
  },
  textButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  textButtonText: {
    color: colors.primaryDark,
    fontSize: fontSize.md,
    fontWeight: '900',
  },
  historyList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  historyChip: {
    maxWidth: '100%',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  historyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  hotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hotItem: {
    minWidth: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primarySubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hotText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  resultSummary: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  hint: {
    color: colors.textSoft,
    fontSize: fontSize.md,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.md,
    lineHeight: 20,
  },
  videoRow: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: 54,
  },
  skeletonWrap: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
