export type RankingInput = {
  author?: string;
  category?: string;
  createdAt?: string;
  danmakuCount?: number;
  description?: string;
  healthScore?: number;
  id?: string;
  playCount?: number;
  playableInApp?: boolean;
  provider?: string;
  rawCategory?: string;
  source?: string;
  sourceHealthScore?: number;
  subCategory?: string;
  tags?: string[];
  title?: string;
  unsupportedReason?: string;
  updatedAt?: string;
};

export type RankingWeights = {
  categoryBoost: number;
  exactSearchBoost: number;
  engagementBoost: number;
  freshnessBoost: number;
  keywordBoost: number;
  metadataSearchBoost: number;
  playableBoost: number;
  poorSourceHealthPenalty: number;
  secondaryKeywordBoost: number;
  sourceHealthBoost: number;
  subCategoryBoost: number;
  titleSearchBoost: number;
};

export type RankingPolicy = {
  freshnessWindowDays: number;
  healthPoorThreshold: number;
  preferredCategories: readonly string[];
  preferredKeywords: readonly string[];
  preferredSubCategories: readonly string[];
  secondaryKeywords: readonly string[];
  weights: RankingWeights;
};

export type RankingContext<TVideo extends RankingInput = RankingInput> = {
  baseScore?: (video: TVideo) => number;
  now?: number;
  searchQuery?: string;
};

export type RankingReason = {
  code: string;
  matched?: string;
  message: string;
  score: number;
};

export type RankingScoreBreakdown = {
  baseScore: number;
  categoryBoost: number;
  engagementBoost: number;
  freshnessBoost: number;
  keywordBoost: number;
  playableBoost: number;
  searchRelevanceBoost: number;
  secondaryKeywordBoost: number;
  sourceHealthBoost: number;
  sourceHealthPenalty: number;
  subCategoryBoost: number;
  total: number;
};

export type RankingExplanation = {
  reasons: RankingReason[];
  score: RankingScoreBreakdown;
};
