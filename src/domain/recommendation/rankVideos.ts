import { DEFAULT_CONTENT_PREFERENCE_POLICY } from './contentPreferencePolicy';
import type {
  RankingContext,
  RankingExplanation,
  RankingInput,
  RankingPolicy,
  RankingReason,
  RankingScoreBreakdown,
} from './rankingTypes';

const normalize = (value?: string) => value?.trim().toLowerCase() ?? '';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toTimestamp = (value?: string) => {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getStableKey = (video: RankingInput) =>
  [video.id, video.title, video.source].filter(Boolean).join('|').toLowerCase();

const getTextFields = (video: RankingInput) => [
  video.category,
  video.subCategory,
  video.rawCategory,
  video.title,
  video.description,
  video.author,
  video.provider,
  video.source,
  ...(video.tags ?? []),
];

const includesAny = (fields: (string | undefined)[], keywords: readonly string[]) => {
  const normalizedFields = fields.map(normalize).filter(Boolean);

  for (const keyword of keywords) {
    const normalizedKeyword = normalize(keyword);
    const matchedField = normalizedFields.find((field) => field.includes(normalizedKeyword));

    if (normalizedKeyword && matchedField) {
      return keyword;
    }
  }

  return undefined;
};

const getFreshnessBoost = (video: RankingInput, policy: RankingPolicy, now: number) => {
  const timestamp = toTimestamp(video.createdAt ?? video.updatedAt);

  if (timestamp <= 0) {
    return 0;
  }

  const ageDays = Math.max(0, (now - timestamp) / 86_400_000);
  const ratio = 1 - clamp(ageDays / policy.freshnessWindowDays, 0, 1);

  return ratio * policy.weights.freshnessBoost;
};

const normalizeHealthScore = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return clamp(value > 1 ? value / 100 : value, 0, 1);
};

const getSourceHealth = (video: RankingInput) => {
  const explicit = normalizeHealthScore(video.sourceHealthScore ?? video.healthScore);

  if (explicit !== undefined) {
    return explicit;
  }

  if (video.playableInApp) {
    return 0.85;
  }

  if (video.unsupportedReason) {
    return 0.25;
  }

  return 0.55;
};

const getEngagementBoost = (video: RankingInput, policy: RankingPolicy) => {
  const engagement = (video.playCount ?? 0) + (video.danmakuCount ?? 0) * 2;
  const normalized = clamp(engagement / 200_000, 0, 1);

  return normalized * policy.weights.engagementBoost;
};

const getSearchRelevanceBoost = (
  video: RankingInput,
  policy: RankingPolicy,
  searchQuery?: string,
) => {
  const query = normalize(searchQuery);

  if (!query) {
    return 0;
  }

  let score = 0;
  const title = normalize(video.title);

  if (title === query) {
    score += policy.weights.exactSearchBoost;
  } else if (title.startsWith(query)) {
    score += policy.weights.titleSearchBoost;
  } else if (title.includes(query)) {
    score += policy.weights.titleSearchBoost * 0.75;
  }

  const tagMatch = (video.tags ?? []).some((tag) => normalize(tag) === query);
  const tagPartialMatch = (video.tags ?? []).some((tag) => normalize(tag).includes(query));

  if (tagMatch) {
    score += policy.weights.metadataSearchBoost * 1.4;
  } else if (tagPartialMatch) {
    score += policy.weights.metadataSearchBoost;
  }

  const metadataFields = [
    video.category,
    video.subCategory,
    video.rawCategory,
    video.description,
    video.author,
    video.provider,
  ];

  if (metadataFields.some((field) => normalize(field) === query)) {
    score += policy.weights.metadataSearchBoost;
  } else if (metadataFields.some((field) => normalize(field).includes(query))) {
    score += policy.weights.metadataSearchBoost * 0.55;
  }

  return score;
};

const createBreakdown = (): RankingScoreBreakdown => ({
  baseScore: 0,
  categoryBoost: 0,
  engagementBoost: 0,
  freshnessBoost: 0,
  keywordBoost: 0,
  playableBoost: 0,
  searchRelevanceBoost: 0,
  secondaryKeywordBoost: 0,
  sourceHealthBoost: 0,
  sourceHealthPenalty: 0,
  subCategoryBoost: 0,
  total: 0,
});

const addReason = (
  reasons: RankingReason[],
  code: string,
  message: string,
  score: number,
  matched?: string,
) => {
  if (score === 0) {
    return;
  }

  reasons.push({ code, matched, message, score });
};

export const explainVideoRanking = <TVideo extends RankingInput>(
  video: TVideo,
  policy: RankingPolicy = DEFAULT_CONTENT_PREFERENCE_POLICY,
  context: RankingContext<TVideo> = {},
): RankingExplanation => {
  const score = createBreakdown();
  const reasons: RankingReason[] = [];
  const textFields = getTextFields(video);

  score.baseScore = context.baseScore?.(video) ?? 0;
  addReason(reasons, 'base-score', '外部上下文基础分', score.baseScore);

  const category = normalize(video.category);
  const preferredCategory = policy.preferredCategories.find(
    (candidate) => normalize(candidate) === category,
  );

  if (preferredCategory) {
    score.categoryBoost = policy.weights.categoryBoost;
    addReason(
      reasons,
      'preferred-category',
      '命中内容偏好的一级分类',
      score.categoryBoost,
      preferredCategory,
    );
  }

  const preferredSubCategory = includesAny(
    [video.subCategory, video.rawCategory, video.category, ...(video.tags ?? [])],
    policy.preferredSubCategories,
  );

  if (preferredSubCategory) {
    score.subCategoryBoost = policy.weights.subCategoryBoost;
    addReason(
      reasons,
      'preferred-sub-category',
      '命中内容偏好的子分类',
      score.subCategoryBoost,
      preferredSubCategory,
    );
  }

  const preferredKeyword = includesAny(textFields, policy.preferredKeywords);

  if (preferredKeyword) {
    score.keywordBoost = policy.weights.keywordBoost;
    addReason(
      reasons,
      'preferred-keyword',
      '命中内容偏好关键词',
      score.keywordBoost,
      preferredKeyword,
    );
  }

  const secondaryKeyword = includesAny(textFields, policy.secondaryKeywords);

  if (secondaryKeyword) {
    score.secondaryKeywordBoost = policy.weights.secondaryKeywordBoost;
    addReason(
      reasons,
      'secondary-keyword',
      '命中电视剧相关次级关键词',
      score.secondaryKeywordBoost,
      secondaryKeyword,
    );
  }

  score.searchRelevanceBoost = getSearchRelevanceBoost(video, policy, context.searchQuery);
  addReason(
    reasons,
    'search-relevance',
    '命中用户搜索词',
    score.searchRelevanceBoost,
    context.searchQuery,
  );

  score.freshnessBoost = getFreshnessBoost(video, policy, context.now ?? Date.now());
  addReason(reasons, 'freshness', '内容发布时间较新', score.freshnessBoost);

  const sourceHealth = getSourceHealth(video);
  score.sourceHealthBoost = (sourceHealth - 0.5) * 2 * policy.weights.sourceHealthBoost;
  addReason(
    reasons,
    'source-health',
    '来源健康度参与排序',
    score.sourceHealthBoost,
    sourceHealth.toFixed(2),
  );

  if (sourceHealth < policy.healthPoorThreshold) {
    const penaltyRatio = (policy.healthPoorThreshold - sourceHealth) / policy.healthPoorThreshold;
    score.sourceHealthPenalty = -policy.weights.poorSourceHealthPenalty * penaltyRatio;
    addReason(
      reasons,
      'poor-source-health',
      '来源健康度过低，降低推荐权重',
      score.sourceHealthPenalty,
      sourceHealth.toFixed(2),
    );
  }

  if (video.playableInApp) {
    score.playableBoost = policy.weights.playableBoost;
    addReason(reasons, 'playable-in-app', 'App 内可直接播放', score.playableBoost);
  }

  score.engagementBoost = getEngagementBoost(video, policy);
  addReason(reasons, 'engagement', '播放和互动数据较高', score.engagementBoost);

  score.total =
    score.baseScore +
    score.categoryBoost +
    score.subCategoryBoost +
    score.keywordBoost +
    score.secondaryKeywordBoost +
    score.searchRelevanceBoost +
    score.freshnessBoost +
    score.sourceHealthBoost +
    score.sourceHealthPenalty +
    score.playableBoost +
    score.engagementBoost;

  return { reasons, score };
};

export const rankVideos = <TVideo extends RankingInput>(
  videos: readonly TVideo[],
  policy: RankingPolicy = DEFAULT_CONTENT_PREFERENCE_POLICY,
  context: RankingContext<TVideo> = {},
): TVideo[] =>
  [...videos]
    .map((video, index) => ({
      explanation: explainVideoRanking(video, policy, context),
      index,
      video,
    }))
    .sort((first, second) => {
      const scoreDelta = second.explanation.score.total - first.explanation.score.total;

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const stableDelta = getStableKey(first.video).localeCompare(getStableKey(second.video));

      if (stableDelta !== 0) {
        return stableDelta;
      }

      return first.index - second.index;
    })
    .map((item) => item.video);
