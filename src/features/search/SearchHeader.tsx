import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';

import { colors } from '@/theme';
import { styles } from './styles';

type SearchHeaderProps = {
  errorMessage: string;
  hasQuery: boolean;
  history: string[];
  isLoading: boolean;
  keyword: string;
  onChangeKeyword: (value: string) => void;
  onClear: () => void;
  onClearHistory: () => void;
  onRunSearch: (value: string) => void;
  onSubmit: () => void;
  resultCount: number;
  trimmedKeywordLength: number;
};

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

export function SearchHeader({
  errorMessage,
  hasQuery,
  history,
  isLoading,
  keyword,
  onChangeKeyword,
  onClear,
  onClearHistory,
  onRunSearch,
  onSubmit,
  resultCount,
  trimmedKeywordLength,
}: SearchHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>搜索</Text>
      <View style={styles.searchBox}>
        <View style={styles.searchIconBubble}>
          <Ionicons name="search-outline" size={17} color={colors.white} />
        </View>
        <TextInput
          value={keyword}
          onChangeText={onChangeKeyword}
          onSubmitEditing={onSubmit}
          placeholder="搜索标题、作者、分区或简介"
          placeholderTextColor={colors.textSoft}
          returnKeyType="search"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {trimmedKeywordLength > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={onClear}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={18} color={colors.primaryDark} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Submit search"
          onPress={onSubmit}
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
              onPress={onClearHistory}
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
                onPress={() => onRunSearch(item)}
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
                onPress={() => onRunSearch(item)}
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
          {isLoading ? '正在搜索...' : `找到 ${resultCount} 个视频`}
        </Text>
      ) : (
        <Text style={styles.hint}>仅搜索 videoService 中已授权、已分类的视频源。</Text>
      )}
    </View>
  );
}
