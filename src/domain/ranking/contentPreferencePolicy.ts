import { CONTENT_PREFERENCE_POLICY } from '@/domain/recommendation/contentPreferencePolicy';
import type { RankingInput } from '@/domain/recommendation/rankingTypes';

export { CONTENT_PREFERENCE_POLICY };

type PreferenceVideo = Pick<
  RankingInput,
  'category' | 'rawCategory' | 'subCategory' | 'tags' | 'title'
>;

const normalize = (value?: string) => value?.trim().toLowerCase() ?? '';

export const isPreferredKoreanDrama = (video: PreferenceVideo): boolean => {
  const haystack = [
    video.category,
    video.subCategory,
    video.rawCategory,
    video.title,
    ...(video.tags ?? []),
  ]
    .map((value) => normalize(String(value ?? '')))
    .filter(Boolean)
    .join(' ');

  return CONTENT_PREFERENCE_POLICY.koreanDramaKeywords.some((keyword: string) =>
    haystack.includes(keyword.toLowerCase()),
  );
};

export const getContentPreferencePriority = (video: PreferenceVideo): number => {
  if (isPreferredKoreanDrama(video)) {
    return CONTENT_PREFERENCE_POLICY.legacyBoosts.koreanDrama;
  }

  if (video.category === CONTENT_PREFERENCE_POLICY.tvDramaCategory) {
    return CONTENT_PREFERENCE_POLICY.legacyBoosts.tvDrama;
  }

  return 0;
};

export const getRelatedContentPreferenceBoost = (video: PreferenceVideo): number =>
  getContentPreferencePriority(video) / CONTENT_PREFERENCE_POLICY.recommendationBoostScale;
