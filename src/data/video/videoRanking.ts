import { DEFAULT_CONTENT_PREFERENCE_POLICY } from '@/domain/recommendation/contentPreferencePolicy';
import { explainVideoRanking, rankVideos } from '@/domain/recommendation/rankVideos';
import type { VideoItem } from '@/types/video';

export const toTimestamp = (value?: string) => {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getRecencyScore = (value?: string) => {
  const timestamp = toTimestamp(value);

  if (timestamp <= 0) {
    return 0;
  }

  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);

  return Math.max(0, 80 - Math.min(ageDays, 80));
};

export const getEngagementScore = (video: VideoItem) =>
  (video.playCount ?? 0) + (video.danmakuCount ?? 0) * 2;

const getStableVideoKey = (video: VideoItem) =>
  [video.id, video.source, video.title].filter(Boolean).join('|').toLowerCase();

export const compareStableVideoKey = (first: VideoItem, second: VideoItem) =>
  getStableVideoKey(first).localeCompare(getStableVideoKey(second));

type RankingScoreGetter = (video: VideoItem) => number;

const getDefaultRankingScore = (video: VideoItem) =>
  explainVideoRanking(video, DEFAULT_CONTENT_PREFERENCE_POLICY).score.total;

const compareByDefaultOrderWithScore = (
  first: VideoItem,
  second: VideoItem,
  getScore: RankingScoreGetter,
) => {
  const priorityDelta = getScore(second) - getScore(first);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const playableDelta = Number(second.playableInApp) - Number(first.playableInApp);

  if (playableDelta !== 0) {
    return playableDelta;
  }

  const freshnessDelta = toTimestamp(second.createdAt) - toTimestamp(first.createdAt);

  if (freshnessDelta !== 0) {
    return freshnessDelta;
  }

  const engagementDelta = getEngagementScore(second) - getEngagementScore(first);

  if (engagementDelta !== 0) {
    return engagementDelta;
  }

  return compareStableVideoKey(first, second);
};

export const compareByDefaultOrder = (first: VideoItem, second: VideoItem) =>
  compareByDefaultOrderWithScore(first, second, getDefaultRankingScore);

export const sortDefaultVideos = (videos: VideoItem[]) => {
  const scoreByKey = new Map<string, number>();

  for (const video of videos) {
    scoreByKey.set(getStableVideoKey(video), getDefaultRankingScore(video));
  }

  return [...videos].sort((first, second) =>
    compareByDefaultOrderWithScore(
      first,
      second,
      (video) => scoreByKey.get(getStableVideoKey(video)) ?? 0,
    ),
  );
};

export const comparePlayableVideos = (first: VideoItem, second: VideoItem) => {
  const freshnessDelta = toTimestamp(second.createdAt) - toTimestamp(first.createdAt);

  if (freshnessDelta !== 0) {
    return freshnessDelta;
  }

  const engagementDelta = getEngagementScore(second) - getEngagementScore(first);

  if (engagementDelta !== 0) {
    return engagementDelta;
  }

  return compareStableVideoKey(first, second);
};

export const compareUnsupportedVideos = (first: VideoItem, second: VideoItem) => {
  const reasonDelta = (first.unsupportedReason ?? '').localeCompare(second.unsupportedReason ?? '');

  if (reasonDelta !== 0) {
    return reasonDelta;
  }

  const categoryDelta = String(first.category).localeCompare(String(second.category));

  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  return compareStableVideoKey(first, second);
};

export const getSearchRelevanceScore = (video: VideoItem, keyword: string) =>
  explainVideoRanking(video, DEFAULT_CONTENT_PREFERENCE_POLICY, {
    searchQuery: keyword,
  }).score.searchRelevanceBoost;

export const sortSearchResults = (videos: VideoItem[], keyword: string) =>
  [...videos].sort((first, second) => {
    const firstExplanation = explainVideoRanking(first, DEFAULT_CONTENT_PREFERENCE_POLICY, {
      searchQuery: keyword,
    });
    const secondExplanation = explainVideoRanking(second, DEFAULT_CONTENT_PREFERENCE_POLICY, {
      searchQuery: keyword,
    });
    const scoreDelta = secondExplanation.score.total - firstExplanation.score.total;

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return compareByDefaultOrder(first, second);
  });

export const rankRecommendedVideos = (
  videos: VideoItem[],
  baseScore: (video: VideoItem) => number,
) =>
  rankVideos(videos, DEFAULT_CONTENT_PREFERENCE_POLICY, {
    baseScore,
  });
