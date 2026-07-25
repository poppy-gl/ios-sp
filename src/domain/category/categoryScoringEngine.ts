import type { RawVideoSource, VideoCategory } from '@/types/video';
import { APP_VIDEO_CATEGORIES } from './categoryTypes';
import { CATEGORY_RULES, SECONDARY_RULES } from './categoryRules';
import type {
  CategoryRule,
  CategoryScoreResult,
  RuleScore,
  ScoringInput,
  SecondaryRule,
} from './categoryTypes';

export { APP_VIDEO_CATEGORIES, SUB_CATEGORIES_BY_CATEGORY } from './categoryTypes';
export type { CategoryScoreResult, UserVideoSubCategory } from './categoryTypes';
const SOURCE_WEIGHTS = {
  rawCategory: 16,
  tags: 10,
  title: 6,
  description: 3,
  url: 2,
} as const;

type SourceName = keyof typeof SOURCE_WEIGHTS;

type TextSource = {
  name: SourceName;
  text: string;
};

const normalizeText = (value?: string) => value?.trim().toLowerCase() ?? '';

const getTextSources = (input: ScoringInput): TextSource[] => [
  {
    name: 'rawCategory',
    text: [input.rawCategory, input.category].filter(Boolean).join(' '),
  },
  {
    name: 'tags',
    text: (input.tags ?? []).join(' '),
  },
  {
    name: 'title',
    text: input.title ?? '',
  },
  {
    name: 'description',
    text: input.description ?? '',
  },
  {
    name: 'url',
    text: [input.source, input.cover, input.thumbnailUrl].filter(Boolean).join(' '),
  },
];

const getKeywordScore = (keyword: string) => {
  const normalized = normalizeText(keyword);

  if (normalized.length >= 8) {
    return 4;
  }

  if (normalized.length >= 4) {
    return 2;
  }

  return 1;
};

const scoreRule = (rule: CategoryRule, sources: TextSource[]): RuleScore => {
  const result: RuleScore = {
    rule,
    score: rule.priority ?? 0,
    matches: [],
  };

  for (const source of sources) {
    const normalizedSource = normalizeText(source.text);

    if (!normalizedSource) {
      continue;
    }

    for (const keyword of rule.keywords) {
      if (normalizedSource.includes(normalizeText(keyword))) {
        const score = SOURCE_WEIGHTS[source.name] + getKeywordScore(keyword);
        result.score += score;
        result.matches.push(`${source.name}:${keyword}`);
      }
    }
  }

  return result;
};

const compareScore = (first: RuleScore, second: RuleScore) => {
  if (second.score !== first.score) {
    return second.score - first.score;
  }

  const secondPriority = second.rule.priority ?? 0;
  const firstPriority = first.rule.priority ?? 0;

  if (secondPriority !== firstPriority) {
    return secondPriority - firstPriority;
  }

  return CATEGORY_RULES.indexOf(first.rule) - CATEGORY_RULES.indexOf(second.rule);
};

const findSecondaryMatch = (input: ScoringInput): RuleScore | undefined => {
  const aggregatedText = normalizeText(
    getTextSources(input)
      .map((source) => source.text)
      .filter(Boolean)
      .join(' '),
  );

  if (!aggregatedText) {
    return undefined;
  }

  const scored = SECONDARY_RULES.map((rule) => {
    const requiredMatches = rule.requiredSignals.filter((signal) =>
      aggregatedText.includes(normalizeText(signal)),
    );
    const optionalMatches = (rule.optionalSignals ?? []).filter((signal) =>
      aggregatedText.includes(normalizeText(signal)),
    );
    const score = (rule.priority ?? 0) + requiredMatches.length * 3 + optionalMatches.length;

    return {
      rule,
      score,
      matches: [...requiredMatches, ...optionalMatches],
      requiredMatches,
    };
  })
    .filter((item) => item.requiredMatches.length > 0)
    .sort(compareScore);

  return scored[0];
};

export const scoreVideoCategory = (input: ScoringInput): CategoryScoreResult => {
  const sources = getTextSources(input);
  const primary = CATEGORY_RULES.map((rule) => scoreRule(rule, sources))
    .filter((item) => item.matches.length > 0)
    .sort(compareScore);
  const winner = primary[0];

  if (winner) {
    return {
      category: winner.rule.category,
      subCategory: winner.rule.subCategory,
      confidence: winner.score,
      matches: winner.matches,
      reason: winner.matches.join(', '),
    };
  }

  const secondary = findSecondaryMatch(input);

  if (secondary) {
    return {
      category: secondary.rule.category,
      subCategory: secondary.rule.subCategory,
      confidence: secondary.score,
      matches: secondary.matches,
      reason: `${(secondary.rule as SecondaryRule).reason}: ${secondary.matches.join(', ')}`,
    };
  }

  return {
    category: '\u5176\u4ed6',
    subCategory: '\u5176\u4ed6',
    confidence: 0,
    matches: [],
    reason: '\u672a\u547d\u4e2d rawCategory/tags/title/description/url \u5206\u7c7b\u89c4\u5219',
  };
};

export const mapCategoryLabelToAppCategory = (category?: string): VideoCategory => {
  if (!category) {
    return '\u5176\u4ed6';
  }

  const normalized = normalizeText(category);
  const direct = APP_VIDEO_CATEGORIES.find((item) => normalizeText(item) === normalized);

  if (direct) {
    return direct;
  }

  // Treat a free-form label as a rawCategory-only scoring input so the same
  // engine is reused for e.g. route params like `韩剧`.
  return scoreVideoCategory({ rawCategory: category }).category;
};

export const inferVideoBaseCategory = (
  raw: Pick<RawVideoSource, 'category' | 'rawCategory' | 'title' | 'description' | 'tags'>,
): VideoCategory => {
  if (raw.category) {
    const mapped = mapCategoryLabelToAppCategory(raw.category);

    if (
      mapped !== '\u5176\u4ed6' ||
      normalizeText(raw.category) === normalizeText('\u5176\u4ed6')
    ) {
      return mapped;
    }
  }

  if (raw.rawCategory) {
    const mapped = mapCategoryLabelToAppCategory(raw.rawCategory);

    if (
      mapped !== '\u5176\u4ed6' ||
      normalizeText(raw.rawCategory) === normalizeText('\u5176\u4ed6')
    ) {
      return mapped;
    }
  }

  return scoreVideoCategory({
    category: raw.category,
    rawCategory: raw.rawCategory,
    title: raw.title,
    description: raw.description,
    tags: raw.tags,
  }).category;
};
