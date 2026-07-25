import type { RankingPolicy } from './rankingTypes';

export const DEFAULT_CONTENT_PREFERENCE_POLICY = {
  preferredCategories: ['电视剧'],
  preferredSubCategories: ['国产剧', '韩剧'],
  preferredKeywords: [
    '国产剧',
    '大陆剧',
    '内地剧',
    '中国大陆',
    '国语',
    '普通话',
    '韩剧',
    '韩国剧',
    '韩国电视剧',
    '韩语',
  ],
  secondaryKeywords: ['电视剧', '连续剧', '剧集'],
  freshnessWindowDays: 80,
  healthPoorThreshold: 0.2,
  weights: {
    categoryBoost: 600,
    subCategoryBoost: 1000,
    keywordBoost: 700,
    secondaryKeywordBoost: 250,
    freshnessBoost: 80,
    sourceHealthBoost: 600,
    poorSourceHealthPenalty: 2600,
    playableBoost: 240,
    engagementBoost: 90,
    exactSearchBoost: 5000,
    titleSearchBoost: 2200,
    metadataSearchBoost: 500,
  },
  crawlerPathBoosts: {
    anime: 60,
    chineseDrama: 1200,
    gangtaiDrama: 260,
    koreanDrama: 900,
    movie: 120,
    tvDrama: 500,
    variety: 80,
    westernDrama: 280,
    japaneseDrama: 380,
  },
  seedPriority: {
    anime: 25,
    chineseDrama: 130,
    fallbackHome: 10,
    gangtaiDrama: 55,
    koreanDrama: 100,
    koreanDramaPage2: 95,
    movie: 35,
    tvDrama: 80,
    variety: 30,
    westernDrama: 60,
    japaneseDrama: 70,
  },
  legacyBoosts: {
    domesticDrama: 16_000_000,
    koreanDrama: 12_000_000,
    tvDrama: 6_000_000,
  },
  domesticDramaKeywords: ['国产剧', '大陆剧', '内地剧', '中国大陆', '大陆电视剧', '国语', '普通话'],
  koreanDramaKeywords: [
    '韩剧',
    '韩国剧',
    '韩国电视剧',
    '韩语',
    'korean drama',
    'k-drama',
    'kdrama',
    'korean series',
  ],
  recommendationBoostScale: 10_000,
  tvDramaCategory: '电视剧',
} as const satisfies RankingPolicy & {
  crawlerPathBoosts: Record<
    | 'anime'
    | 'chineseDrama'
    | 'gangtaiDrama'
    | 'japaneseDrama'
    | 'koreanDrama'
    | 'movie'
    | 'tvDrama'
    | 'variety'
    | 'westernDrama',
    number
  >;
  koreanDramaKeywords: readonly string[];
  domesticDramaKeywords: readonly string[];
  legacyBoosts: {
    domesticDrama: number;
    koreanDrama: number;
    tvDrama: number;
  };
  recommendationBoostScale: number;
  seedPriority: Record<
    | 'anime'
    | 'chineseDrama'
    | 'fallbackHome'
    | 'gangtaiDrama'
    | 'japaneseDrama'
    | 'koreanDrama'
    | 'koreanDramaPage2'
    | 'movie'
    | 'tvDrama'
    | 'variety'
    | 'westernDrama',
    number
  >;
  tvDramaCategory: string;
};

export const CONTENT_PREFERENCE_POLICY = DEFAULT_CONTENT_PREFERENCE_POLICY;
