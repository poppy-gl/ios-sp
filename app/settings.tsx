import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getBackendApiConfig } from '@/services/backendApiService';
import {
  clearVideoServiceCache,
  getVideoServiceState,
  type VideoServiceState,
} from '@/services/videoService';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useSettingsStore, type DefaultSort } from '@/store/settingsStore';
import { theme } from '@/theme';

const APP_NAME = '\u5c0f\u7c89\u89c6\u9891';
const VERSION_LABEL = '\u7248\u672c\u53f7';
const SEARCH_HISTORY_KEY = 'video-search-history';

type Option<T extends string> = {
  label: string;
  value: T;
};

const sortOptions: Option<DefaultSort>[] = [
  { label: '\u63a8\u8350', value: 'recommended' },
  { label: '\u6700\u65b0', value: 'latest' },
  { label: '\u6700\u70ed', value: 'mostPlayed' },
];

const formatDateTime = (value?: string) => {
  if (!value) {
    return '\u5c1a\u672a\u6267\u884c';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (unit: number) => String(unit).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

const statusLabels: Record<VideoServiceState['status'], string> = {
  idle: '\u672a\u5f00\u59cb',
  ok: '\u6b63\u5e38',
  empty: '\u65e0\u6570\u636e',
  crawl_failed: '\u722c\u53d6\u5931\u8d25',
  parse_failed: '\u89e3\u6790\u5931\u8d25',
  partial: '\u90e8\u5206\u53ef\u7528',
};

export default function SettingsScreen() {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const backendConfig = getBackendApiConfig();
  const autoPlay = useSettingsStore((state) => state.autoPlay);
  const defaultSort = useSettingsStore((state) => state.defaultSort);
  const favoritesClearedAt = useSettingsStore((state) => state.favoritesClearedAt);
  const localCacheClearedAt = useSettingsStore((state) => state.localCacheClearedAt);
  const rememberProgress = useSettingsStore((state) => state.rememberProgress);
  const searchHistoryClearedAt = useSettingsStore((state) => state.searchHistoryClearedAt);
  const markFavoritesCleared = useSettingsStore((state) => state.clearFavorites);
  const markLocalCacheCleared = useSettingsStore((state) => state.clearLocalCache);
  const markSearchHistoryCleared = useSettingsStore((state) => state.clearSearchHistory);
  const setAutoPlay = useSettingsStore((state) => state.setAutoPlay);
  const setDefaultSort = useSettingsStore((state) => state.setDefaultSort);
  const setRememberProgress = useSettingsStore((state) => state.setRememberProgress);
  const clearFavoriteItems = useFavoritesStore((state) => state.clearFavorites);
  const [pipelineState, setPipelineState] = useState(() => getVideoServiceState());

  const refreshPipelineState = useCallback(() => {
    setPipelineState(getVideoServiceState());
  }, []);

  const handleClearFavorites = useCallback(() => {
    clearFavoriteItems();
    markFavoritesCleared();
  }, [clearFavoriteItems, markFavoritesCleared]);

  const handleClearLocalCache = useCallback(() => {
    clearVideoServiceCache();
    markLocalCacheCleared();
    setPipelineState(getVideoServiceState());
  }, [markLocalCacheCleared]);

  const handleClearSearchHistory = useCallback(() => {
    void AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify([]));
    markSearchHistoryCleared();
  }, [markSearchHistoryCleared]);

  const renderSegmentedControl = <T extends string>(
    value: T,
    options: Option<T>[],
    onChange: (nextValue: T) => void,
  ) => (
    <View style={styles.segmentedControl}>
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segmentedItem,
              isSelected && styles.segmentedItemSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.segmentedText, isSelected && styles.segmentedTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.appCard}>
          <View style={styles.logo}>
            <Ionicons name="play" size={24} color={theme.colors.white} />
          </View>
          <View style={styles.appMeta}>
            <Text style={styles.appName}>{APP_NAME}</Text>
            <Text style={styles.versionText}>
              {VERSION_LABEL} {version}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'\u64ad\u653e\u504f\u597d'}</Text>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{'\u81ea\u52a8\u64ad\u653e'}</Text>
              <Text style={styles.rowMeta}>
                {autoPlay ? '\u5df2\u5f00\u542f' : '\u5df2\u5173\u95ed'}
              </Text>
            </View>
            <Switch
              value={autoPlay}
              onValueChange={setAutoPlay}
              trackColor={{
                false: theme.colors.primarySubtle,
                true: theme.colors.primarySoft,
              }}
              thumbColor={autoPlay ? theme.colors.primary : theme.colors.textSoft}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{'\u8bb0\u4f4f\u64ad\u653e\u8fdb\u5ea6'}</Text>
              <Text style={styles.rowMeta}>
                {rememberProgress
                  ? '\u7ee7\u7eed\u89c2\u770b\u5df2\u542f\u7528'
                  : '\u4e0d\u4fdd\u5b58\u8fdb\u5ea6'}
              </Text>
            </View>
            <Switch
              value={rememberProgress}
              onValueChange={setRememberProgress}
              trackColor={{
                false: theme.colors.primarySubtle,
                true: theme.colors.primarySoft,
              }}
              thumbColor={rememberProgress ? theme.colors.primary : theme.colors.textSoft}
            />
          </View>
          <View style={styles.optionBlock}>
            <Text style={styles.optionLabel}>{'\u63a8\u8350\u6392\u5e8f'}</Text>
            {renderSegmentedControl(defaultSort, sortOptions, setDefaultSort)}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{'\u6570\u636e\u7ba1\u7ebf'}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={refreshPipelineState}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="refresh" size={17} color={theme.colors.primaryDark} />
            </Pressable>
          </View>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{statusLabels[pipelineState.status]}</Text>
              <Text style={styles.statLabel}>{'\u72b6\u6001'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{pipelineState.stats.total}</Text>
              <Text style={styles.statLabel}>{'\u89c6\u9891'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{pipelineState.stats.playable}</Text>
              <Text style={styles.statLabel}>{'\u53ef\u64ad'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{pipelineState.stats.unsupported}</Text>
              <Text style={styles.statLabel}>{'\u4e0d\u53ef\u64ad'}</Text>
            </View>
          </View>
          <Text style={styles.rowMeta}>
            {'\u7b56\u7565\u62d2\u7edd'} {pipelineState.stats.policyRejected} · {'\u5931\u8d25'}
            {pipelineState.errors.length} · {'\u7f13\u5b58'}
            {pipelineState.cache.hasCache ? '\u5df2\u5efa\u7acb' : '\u672a\u5efa\u7acb'}
          </Text>
          <View style={styles.backendInfo}>
            <Text style={styles.rowTitle}>{'\u540e\u7aef API'}</Text>
            <Text style={styles.rowMeta}>
              {backendConfig.configured
                ? (backendConfig.baseUrl ?? '\u672a\u914d\u7f6e')
                : '\u672a\u914d\u7f6e\uff0c\u5c06\u4f7f\u7528 App \u672c\u5730\u722c\u53d6\u515c\u5e95'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'\u672c\u5730\u6570\u636e'}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleClearFavorites}
            style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
          >
            <View>
              <Text style={styles.rowTitle}>{'\u6e05\u7a7a\u6536\u85cf'}</Text>
              <Text style={styles.rowMeta}>{formatDateTime(favoritesClearedAt)}</Text>
            </View>
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleClearSearchHistory}
            style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
          >
            <View>
              <Text style={styles.rowTitle}>{'\u6e05\u7a7a\u641c\u7d22\u5386\u53f2'}</Text>
              <Text style={styles.rowMeta}>{formatDateTime(searchHistoryClearedAt)}</Text>
            </View>
            <Ionicons name="close-circle-outline" size={18} color={theme.colors.primaryDark} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={handleClearLocalCache}
            style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
          >
            <View>
              <Text style={styles.rowTitle}>
                {'\u6e05\u7406\u89c6\u9891\u670d\u52a1\u7f13\u5b58'}
              </Text>
              <Text style={styles.rowMeta}>{formatDateTime(localCacheClearedAt)}</Text>
            </View>
            <Ionicons name="file-tray-outline" size={18} color={theme.colors.primaryDark} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
  },
  appCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    ...theme.shadow.card,
  },
  logo: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  appMeta: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  appName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontWeight: '900',
  },
  versionText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  section: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    ...theme.shadow.card,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '900',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    minHeight: theme.touch.minHeight,
  },
  rowText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  rowTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '800',
  },
  rowMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    lineHeight: 18,
  },
  optionBlock: {
    gap: theme.spacing.sm,
  },
  optionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '900',
  },
  segmentedControl: {
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.radius.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  segmentedItem: {
    alignItems: 'center',
    borderRadius: theme.radius.xs,
    flexGrow: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  segmentedItemSelected: {
    backgroundColor: theme.colors.card,
  },
  segmentedText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
  },
  segmentedTextSelected: {
    color: theme.colors.primaryDark,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  statItem: {
    backgroundColor: theme.colors.cardMuted,
    borderRadius: theme.radius.sm,
    flexBasis: '48%',
    flexGrow: 1,
    gap: theme.spacing.xs,
    minHeight: 64,
    justifyContent: 'center',
    padding: theme.spacing.md,
  },
  statValue: {
    color: theme.colors.primaryDark,
    fontSize: theme.fontSize.lg,
    fontWeight: '900',
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
  },
  backendInfo: {
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.radius.sm,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  actionRow: {
    alignItems: 'center',
    borderTopColor: theme.colors.primarySubtle,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    minHeight: 56,
    paddingTop: theme.spacing.md,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.radius.pill,
    height: theme.touch.iconSmall,
    justifyContent: 'center',
    width: theme.touch.iconSmall,
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
});
