import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoCard } from '@/components/VideoCard';
import { searchVideos } from '@/services/videoService';
import { useSettingsStore } from '@/store/settingsStore';
import type { VideoItem } from '@/types/video';
import { SearchEmptyState } from './SearchEmptyState';
import { SearchHeader } from './SearchHeader';
import { styles } from './styles';

const HISTORY_KEY = 'video-search-history';
const MAX_HISTORY_ITEMS = 10;
const DEBOUNCE_DELAY = 300;
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
      <SearchHeader
        errorMessage={errorMessage}
        hasQuery={hasQuery}
        history={history}
        isLoading={isLoading}
        keyword={keyword}
        onChangeKeyword={setKeyword}
        onClear={handleClear}
        onClearHistory={handleClearHistory}
        onRunSearch={runSearch}
        onSubmit={handleSubmit}
        resultCount={results.length}
        trimmedKeywordLength={trimmedKeyword.length}
      />
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

  const emptyComponent = useMemo(
    () => <SearchEmptyState hasQuery={hasQuery} isLoading={isLoading} />,
    [hasQuery, isLoading],
  );

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
