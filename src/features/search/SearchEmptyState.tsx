import { Text, View } from 'react-native';

import { VideoCardSkeletonGrid } from '@/components/VideoCardSkeleton';
import { styles } from './styles';

type SearchEmptyStateProps = {
  hasQuery: boolean;
  isLoading: boolean;
};

export function SearchEmptyState({ hasQuery, isLoading }: SearchEmptyStateProps) {
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
}
