import { Ionicons } from '@expo/vector-icons';
import { Stack, router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listVideoItems } from '@/services/videoService';
import {
  getPlayHistoryItemKey,
  shouldShowContinueWatching,
  usePlayHistoryStore,
  type PlayHistoryItem,
} from '@/store/playHistoryStore';
import { AppButton } from '@/components/AppButton';
import { ListItem } from '@/components/ListItem';
import { colors } from '@/theme';
import type { VideoItem } from '@/types/video';
import { styles } from './styles';

type HistoryVideoItem = {
  historyItem: PlayHistoryItem;
  video?: VideoItem;
};

const text = {
  clear: '\u6e05\u7a7a',
  clearCancel: '\u53d6\u6d88',
  clearConfirm: '\u786e\u8ba4\u6e05\u7a7a',
  clearMessage: '\u6e05\u7a7a\u540e\u5c06\u65e0\u6cd5\u6062\u590d\u64ad\u653e\u5386\u53f2\u3002',
  clearTitle: '\u6e05\u7a7a\u5386\u53f2\u8bb0\u5f55\uff1f',
  continueWatching: '\u53ef\u7ee7\u7eed\u89c2\u770b',
  emptyText: '\u64ad\u653e\u8fc7\u7684\u89c6\u9891\u4f1a\u51fa\u73b0\u5728\u8fd9\u91cc',
  emptyTitle: '\u6682\u65e0\u5386\u53f2\u8bb0\u5f55',
  history: '\u64ad\u653e\u5386\u53f2',
  loading: '\u6b63\u5728\u52a0\u8f7d\u5386\u53f2...',
  missingVideo: '\u89c6\u9891\u4fe1\u606f\u5df2\u5931\u6548',
  watched: '\u5df2\u89c2\u770b',
};

const formatDateTime = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(
    2,
    '0',
  )} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const formatPercent = (item: PlayHistoryItem) => {
  if (item.duration <= 0) {
    return '0%';
  }

  return `${Math.min(Math.round((item.progress / item.duration) * 100), 100)}%`;
};
const formatEpisodeMeta = (item: PlayHistoryItem) =>
  item.line !== undefined && item.episode !== undefined
    ? `线路 ${item.line} / 第${item.episode}集`
    : undefined;

const getHistoryPlayerRoute = (item: HistoryVideoItem): Href | undefined => {
  if (!item.video) {
    return undefined;
  }

  if (item.historyItem.line !== undefined && item.historyItem.episode !== undefined) {
    return {
      pathname: '/player/[id]',
      params: {
        episode: String(item.historyItem.episode),
        id: item.video.id,
        line: String(item.historyItem.line),
      },
    };
  }

  return {
    pathname: '/player/[id]',
    params: {
      id: item.video.id,
    },
  };
};
const listBatchConfig = {
  initialNumToRender: 10,
  maxToRenderPerBatch: 10,
  updateCellsBatchingPeriod: 40,
  windowSize: 7,
};

export default function HistoryScreen() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const history = usePlayHistoryStore((state) => state.history);
  const clearHistory = usePlayHistoryStore((state) => state.clearHistory);

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);
    listVideoItems({ signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) {
          setVideos(items);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  const videosById = useMemo(() => new Map(videos.map((video) => [video.id, video])), [videos]);

  const historyItems = useMemo<HistoryVideoItem[]>(
    () =>
      history.map((historyItem) => ({
        historyItem,
        video: videosById.get(historyItem.videoId),
      })),
    [history, videosById],
  );

  const handleClearHistory = () => {
    Alert.alert(text.clearTitle, text.clearMessage, [
      { style: 'cancel', text: text.clearCancel },
      {
        onPress: clearHistory,
        style: 'destructive',
        text: text.clearConfirm,
      },
    ]);
  };

  const renderItem = ({ item }: { item: HistoryVideoItem }) => {
    const progressRatio =
      item.historyItem.duration > 0
        ? Math.min(item.historyItem.progress / item.historyItem.duration, 1)
        : 0;
    const canContinue = shouldShowContinueWatching(item.historyItem);
    const episodeMeta = formatEpisodeMeta(item.historyItem);
    const route = getHistoryPlayerRoute(item);

    return (
      <ListItem
        disabled={!item.video}
        onPress={() => route && router.push(route)}
        style={styles.historyItem}
        leading={
          <Image
            source={
              item.video?.thumbnailUrl || item.video?.cover
                ? { uri: item.video.thumbnailUrl ?? item.video.cover }
                : undefined
            }
            style={styles.cover}
            resizeMode="cover"
          />
        }
        title={item.video?.title ?? text.missingVideo}
        badge={canContinue ? text.continueWatching : undefined}
        meta={`${episodeMeta ? `${episodeMeta} / ` : ''}${item.video?.author ?? '--'} / ${formatDateTime(
          item.historyItem.lastPlayedAt,
        )}`}
      >
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {text.watched} {formatPercent(item.historyItem)}
        </Text>
      </ListItem>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <AppButton
          accessibilityLabel="返回"
          icon="chevron-back"
          label=""
          onPress={() => router.back()}
          style={styles.iconButton}
          variant="ghost"
        />
        <Text style={styles.headerTitle}>{text.history}</Text>
        <AppButton
          accessibilityLabel={text.clear}
          disabled={history.length === 0}
          icon="trash-outline"
          label={text.clear}
          onPress={handleClearHistory}
          style={styles.clearButton}
          variant="soft"
        />
      </View>

      {isLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>{text.loading}</Text>
        </View>
      ) : (
        <FlatList
          data={historyItems}
          keyExtractor={(item) => getPlayHistoryItemKey(item.historyItem)}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            historyItems.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={
            <View style={styles.stateContainer}>
              <Ionicons name="time-outline" size={42} color={colors.primary} />
              <Text style={styles.stateTitle}>{text.emptyTitle}</Text>
              <Text style={styles.stateText}>{text.emptyText}</Text>
            </View>
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
