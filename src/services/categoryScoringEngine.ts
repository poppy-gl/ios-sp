import type { RawVideoSource, VideoCategory, VideoItem } from '@/types/video';

export type UserVideoSubCategory =
  | '\u52a8\u4f5c\u7247'
  | '\u559c\u5267\u7247'
  | '\u7231\u60c5\u7247'
  | '\u6050\u6016\u7247'
  | '\u5267\u60c5\u7247'
  | '\u6218\u4e89\u7247'
  | '\u52a8\u753b\u7535\u5f71'
  | '\u56fd\u4ea7\u5267'
  | '\u97e9\u5267'
  | '\u65e5\u5267'
  | '\u6e2f\u53f0\u5267'
  | '\u6b27\u7f8e\u5267'
  | '\u6cf0\u5267'
  | '\u6d77\u5916\u5267'
  | '\u5185\u5730\u7efc\u827a'
  | '\u6e2f\u53f0\u7efc\u827a'
  | '\u65e5\u97e9\u7efc\u827a'
  | '\u6b27\u7f8e\u7efc\u827a'
  | '\u56fd\u6f2b'
  | '\u65e5\u6f2b'
  | '\u6e2f\u53f0\u52a8\u6f2b'
  | '\u7f8e\u6f2b'
  | '\u6d77\u5916\u52a8\u6f2b'
  | '\u7eaa\u5f55\u7247'
  | '\u5176\u4ed6';

// '纪录片' and '其他' are intentionally excluded from the home tab list per
// user preference; the types still exist in VideoCategory for backward
// compatibility with persisted data, but no UI surface displays them.
export const APP_VIDEO_CATEGORIES: VideoCategory[] = [
  '\u63a8\u8350',
  '\u7535\u5f71',
  '\u7535\u89c6\u5267',
  '\u7efc\u827a',
  '\u52a8\u6f2b',
];

export const SUB_CATEGORIES_BY_CATEGORY: Record<VideoCategory, UserVideoSubCategory[]> = {
  '\u63a8\u8350': [],
  '\u7535\u5f71': [
    '\u52a8\u4f5c\u7247',
    '\u559c\u5267\u7247',
    '\u7231\u60c5\u7247',
    '\u6050\u6016\u7247',
    '\u5267\u60c5\u7247',
    '\u6218\u4e89\u7247',
    '\u52a8\u753b\u7535\u5f71',
  ],
  '\u7535\u89c6\u5267': [
    '\u56fd\u4ea7\u5267',
    '\u97e9\u5267',
    '\u65e5\u5267',
    '\u6e2f\u53f0\u5267',
    '\u6b27\u7f8e\u5267',
    '\u6cf0\u5267',
    '\u6d77\u5916\u5267',
  ],
  '\u7efc\u827a': [
    '\u5185\u5730\u7efc\u827a',
    '\u6e2f\u53f0\u7efc\u827a',
    '\u65e5\u97e9\u7efc\u827a',
    '\u6b27\u7f8e\u7efc\u827a',
  ],
  '\u52a8\u6f2b': [
    '\u56fd\u6f2b',
    '\u65e5\u6f2b',
    '\u6e2f\u53f0\u52a8\u6f2b',
    '\u7f8e\u6f2b',
    '\u6d77\u5916\u52a8\u6f2b',
  ],
  '\u7eaa\u5f55\u7247': ['\u7eaa\u5f55\u7247'],
  '\u5176\u4ed6': ['\u5176\u4ed6'],
};

export type CategoryScoreResult = {
  category: VideoCategory;
  subCategory: UserVideoSubCategory;
  confidence: number;
  matches: string[];
  reason: string;
};

type CategoryRule = {
  category: VideoCategory;
  subCategory: UserVideoSubCategory;
  keywords: string[];
  priority?: number;
};

type SecondaryRule = CategoryRule & {
  requiredSignals: string[];
  optionalSignals?: string[];
  reason: string;
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: '\u7535\u5f71',
    subCategory: '\u52a8\u4f5c\u7247',
    keywords: [
      '\u52a8\u4f5c',
      '\u52a8\u4f5c\u7247',
      '\u52a8\u4f5c\u7535\u5f71',
      'action',
      'action movie',
      '\u6b66\u6253',
      '\u529f\u592b',
      '\u67aa\u6218',
      '\u8b66\u532a',
      '\u5192\u9669',
      '\u7206\u7834',
      '\u8ffd\u8f66',
      'martial arts',
      'kung fu',
      'crime action',
      'adventure',
    ],
  },
  {
    category: '\u7535\u5f71',
    subCategory: '\u559c\u5267\u7247',
    keywords: [
      '\u559c\u5267',
      '\u559c\u5267\u7247',
      '\u559c\u5267\u7535\u5f71',
      '\u641e\u7b11',
      '\u5e7d\u9ed8',
      '\u7206\u7b11',
      '\u8f7b\u559c',
      'comedy',
      'sitcom',
      'funny',
    ],
  },
  {
    category: '\u7535\u5f71',
    subCategory: '\u7231\u60c5\u7247',
    keywords: [
      '\u7231\u60c5',
      '\u7231\u60c5\u7247',
      '\u7231\u60c5\u7535\u5f71',
      '\u604b\u7231',
      '\u8a00\u60c5',
      'romance',
      'romantic',
      'love story',
      'relationship',
      'sweet romance',
    ],
  },
  {
    category: '\u7535\u5f71',
    subCategory: '\u6050\u6016\u7247',
    keywords: [
      '\u6050\u6016',
      '\u6050\u6016\u7247',
      '\u6050\u6016\u7535\u5f71',
      '\u60ca\u609a',
      '\u60ac\u7591',
      '\u7075\u5f02',
      'horror',
      'thriller',
      'suspense',
      'ghost',
      'mystery',
    ],
  },
  {
    category: '\u7535\u5f71',
    subCategory: '\u6218\u4e89\u7247',
    keywords: [
      '\u6218\u4e89',
      '\u6218\u4e89\u7247',
      '\u6218\u4e89\u7535\u5f71',
      '\u519b\u4e8b',
      '\u519b\u65c5',
      '\u6297\u6218',
      '\u6218\u573a',
      'war',
      'military',
      'battlefield',
    ],
  },
  {
    category: '\u7535\u5f71',
    subCategory: '\u52a8\u753b\u7535\u5f71',
    keywords: [
      '\u52a8\u753b\u7535\u5f71',
      '\u52a8\u6f2b\u7535\u5f71',
      '\u52a8\u753b\u957f\u7247',
      '\u5267\u573a\u7248',
      'animated movie',
      'animated film',
      'anime movie',
    ],
    priority: 2,
  },
  {
    category: '\u7535\u5f71',
    subCategory: '\u5267\u60c5\u7247',
    keywords: [
      '\u5267\u60c5',
      '\u5267\u60c5\u7247',
      '\u5267\u60c5\u7535\u5f71',
      '\u7535\u5f71',
      '\u5f71\u7247',
      '\u9662\u7ebf',
      'drama',
      'feature film',
      'film',
      'movie',
      'cinema',
      'feature',
    ],
  },
  {
    category: '\u7535\u89c6\u5267',
    subCategory: '\u56fd\u4ea7\u5267',
    keywords: [
      '\u56fd\u4ea7\u5267',
      '\u56fd\u4ea7\u7535\u89c6\u5267',
      '\u56fd\u5267',
      '\u5927\u9646\u5267',
      '\u5927\u9646\u7535\u89c6\u5267',
      '\u5185\u5730\u5267',
      '\u5185\u5730\u7535\u89c6\u5267',
      '\u534e\u8bed\u5267',
      'cn drama',
      'mainland drama',
      'c-drama',
      'cdrama',
    ],
  },
  {
    category: '\u7535\u89c6\u5267',
    subCategory: '\u97e9\u5267',
    keywords: [
      '\u97e9\u5267',
      '\u97e9\u56fd\u5267',
      '\u97e9\u56fd\u7535\u89c6\u5267',
      'korean drama',
      'k-drama',
      'kdrama',
      'korean series',
    ],
  },
  {
    category: '\u7535\u89c6\u5267',
    subCategory: '\u65e5\u5267',
    keywords: [
      '\u65e5\u5267',
      '\u65e5\u672c\u5267',
      '\u65e5\u672c\u7535\u89c6\u5267',
      'japanese drama',
      'j-drama',
      'jdrama',
    ],
  },
  {
    category: '\u7535\u89c6\u5267',
    subCategory: '\u6e2f\u53f0\u5267',
    keywords: [
      '\u6e2f\u53f0\u5267',
      '\u6e2f\u5267',
      '\u9999\u6e2f\u5267',
      '\u53f0\u5267',
      '\u53f0\u6e7e\u5267',
      'hk drama',
      'tw drama',
      'hong kong drama',
      'taiwan drama',
    ],
  },
  {
    category: '\u7535\u89c6\u5267',
    subCategory: '\u6b27\u7f8e\u5267',
    keywords: [
      '\u6b27\u7f8e\u5267',
      '\u7f8e\u5267',
      '\u7f8e\u56fd\u5267',
      '\u82f1\u5267',
      '\u82f1\u56fd\u5267',
      'american drama',
      'british drama',
      'us drama',
      'uk drama',
      'western drama',
      'european drama',
    ],
  },
  {
    category: '\u7535\u89c6\u5267',
    subCategory: '\u6cf0\u5267',
    keywords: [
      '\u6cf0\u5267',
      '\u6cf0\u56fd\u5267',
      '\u6cf0\u56fd\u7535\u89c6\u5267',
      'thai drama',
      'lakorn',
    ],
  },
  {
    category: '\u7535\u89c6\u5267',
    subCategory: '\u6d77\u5916\u5267',
    keywords: [
      '\u6d77\u5916\u5267',
      '\u5916\u5267',
      '\u7535\u89c6\u5267',
      '\u5267\u96c6',
      '\u8fde\u7eed\u5267',
      'overseas drama',
      'drama series',
      'tv series',
      'tvshow',
      'tv-show',
      'series',
    ],
  },
  {
    category: '\u7efc\u827a',
    subCategory: '\u5185\u5730\u7efc\u827a',
    keywords: [
      '\u5185\u5730\u7efc\u827a',
      '\u5927\u9646\u7efc\u827a',
      '\u56fd\u5185\u7efc\u827a',
      '\u4e2d\u56fd\u7efc\u827a',
      '\u7efc\u827a',
      '\u771f\u4eba\u79c0',
      '\u8282\u76ee',
      'variety',
      'variety show',
      'reality show',
      'talk show',
    ],
  },
  {
    category: '\u7efc\u827a',
    subCategory: '\u6e2f\u53f0\u7efc\u827a',
    keywords: [
      '\u6e2f\u53f0\u7efc\u827a',
      '\u6e2f\u7efc',
      '\u9999\u6e2f\u7efc\u827a',
      '\u53f0\u7efc',
      '\u53f0\u6e7e\u7efc\u827a',
      'hk variety',
      'tw variety',
    ],
  },
  {
    category: '\u7efc\u827a',
    subCategory: '\u65e5\u97e9\u7efc\u827a',
    keywords: [
      '\u65e5\u97e9\u7efc\u827a',
      '\u65e5\u672c\u7efc\u827a',
      '\u97e9\u56fd\u7efc\u827a',
      '\u65e5\u672c\u7efc',
      '\u97e9\u56fd\u7efc',
      'korean variety',
      'japanese variety',
      'jp variety',
      'kr variety',
    ],
  },
  {
    category: '\u7efc\u827a',
    subCategory: '\u6b27\u7f8e\u7efc\u827a',
    keywords: [
      '\u6b27\u7f8e\u7efc\u827a',
      '\u7f8e\u56fd\u7efc\u827a',
      'western variety',
      'us variety',
    ],
  },
  {
    category: '\u52a8\u6f2b',
    subCategory: '\u56fd\u6f2b',
    keywords: [
      '\u56fd\u6f2b',
      '\u56fd\u4ea7\u52a8\u6f2b',
      '\u56fd\u4ea7\u52a8\u753b',
      '\u4e2d\u56fd\u52a8\u6f2b',
      '\u4e2d\u56fd\u52a8\u753b',
      '\u52a8\u753b\u756a\u5267',
      'donghua',
      'chinese animation',
      'cn anime',
    ],
    priority: 2,
  },
  {
    category: '\u52a8\u6f2b',
    subCategory: '\u65e5\u6f2b',
    keywords: [
      '\u65e5\u6f2b',
      '\u756a\u5267',
      '\u65e5\u97e9\u52a8\u6f2b',
      '\u65e5\u672c\u52a8\u6f2b',
      '\u65e5\u672c\u52a8\u753b',
      '\u65b0\u756a',
      '\u756a\u7ec4',
      'anime',
      'japanese anime',
      'japanese animation',
    ],
    priority: 2,
  },
  {
    category: '\u52a8\u6f2b',
    subCategory: '\u6e2f\u53f0\u52a8\u6f2b',
    keywords: [
      '\u6e2f\u53f0\u52a8\u6f2b',
      '\u9999\u6e2f\u52a8\u6f2b',
      '\u53f0\u6e7e\u52a8\u6f2b',
      'hk animation',
      'tw animation',
    ],
  },
  {
    category: '\u52a8\u6f2b',
    subCategory: '\u7f8e\u6f2b',
    keywords: [
      '\u7f8e\u6f2b',
      '\u7f8e\u56fd\u52a8\u6f2b',
      '\u6b27\u7f8e\u52a8\u6f2b',
      '\u6b27\u7f8e\u52a8\u753b',
      'american animation',
      'cartoon',
      'dc animation',
      'marvel animation',
      'western cartoon',
    ],
  },
  {
    category: '\u52a8\u6f2b',
    subCategory: '\u6d77\u5916\u52a8\u6f2b',
    keywords: [
      '\u6d77\u5916\u52a8\u6f2b',
      '\u52a8\u753b',
      '\u52a8\u6f2b',
      'animation',
      'animated',
      'cartoon series',
    ],
  },
  {
    category: '\u7eaa\u5f55\u7247',
    subCategory: '\u7eaa\u5f55\u7247',
    keywords: [
      '\u7eaa\u5f55\u7247',
      '\u7eaa\u5b9e',
      '\u7eaa\u5b9e\u7247',
      '\u4eba\u6587',
      '\u81ea\u7136',
      '\u5386\u53f2',
      '\u5386\u53f2\u7eaa\u5f55',
      'documentary',
      'docuseries',
      'nature documentary',
      'history documentary',
    ],
    priority: 3,
  },
];

const SECONDARY_RULES: SecondaryRule[] = [
  {
    category: '\u52a8\u6f2b',
    subCategory: '\u65e5\u6f2b',
    keywords: [],
    requiredSignals: ['anime', 'bangumi', 'jp-anime', '\u756a'],
    optionalSignals: ['episode', 'season', 'ova', 'op', 'ed'],
    reason: 'url/title/tags \u547d\u4e2d\u65e5\u6f2b\u5f31\u7279\u5f81',
    priority: 2,
  },
  {
    category: '\u52a8\u6f2b',
    subCategory: '\u56fd\u6f2b',
    keywords: [],
    requiredSignals: ['donghua', 'guoman', 'cn-anime', '\u56fd\u6f2b'],
    optionalSignals: ['season', 'episode', '\u7b2c'],
    reason: 'url/title/tags \u547d\u4e2d\u56fd\u6f2b\u5f31\u7279\u5f81',
    priority: 2,
  },
  {
    category: '\u7535\u5f71',
    subCategory: '\u5267\u60c5\u7247',
    keywords: [],
    requiredSignals: ['movie', 'film', 'cinema', '\u7535\u5f71'],
    optionalSignals: ['1080p', '4k', 'trailer', '\u9884\u544a', '\u6b63\u7247'],
    reason: 'url/title/tags \u547d\u4e2d\u7535\u5f71\u5f31\u7279\u5f81',
  },
  {
    category: '\u7535\u89c6\u5267',
    subCategory: '\u6d77\u5916\u5267',
    keywords: [],
    requiredSignals: ['series', 'tvshow', 'tv-show', 'episode', '\u5267\u96c6'],
    optionalSignals: ['season', 's01', 'ep', '\u7b2c', '\u96c6'],
    reason: 'url/title/tags \u547d\u4e2d\u5267\u96c6\u5f31\u7279\u5f81',
  },
  {
    category: '\u7efc\u827a',
    subCategory: '\u5185\u5730\u7efc\u827a',
    keywords: [],
    requiredSignals: ['variety', 'show', 'reality', '\u7efc\u827a'],
    optionalSignals: ['talk', 'live', '\u821e\u53f0', '\u8282\u76ee'],
    reason: 'url/title/tags \u547d\u4e2d\u7efc\u827a\u5f31\u7279\u5f81',
  },
  {
    category: '\u7eaa\u5f55\u7247',
    subCategory: '\u7eaa\u5f55\u7247',
    keywords: [],
    requiredSignals: ['doc', 'documentary', 'nature', 'history', '\u7eaa\u5f55'],
    optionalSignals: ['bbc', 'wildlife', '\u4eba\u6587', '\u81ea\u7136'],
    reason: 'url/title/tags \u547d\u4e2d\u7eaa\u5f55\u7247\u5f31\u7279\u5f81',
    priority: 3,
  },
];

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

type ScoringInput = Partial<
  Pick<
    VideoItem,
    | 'category'
    | 'rawCategory'
    | 'title'
    | 'description'
    | 'tags'
    | 'source'
    | 'cover'
    | 'thumbnailUrl'
  >
>;

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

type RuleScore = {
  rule: CategoryRule;
  score: number;
  matches: string[];
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
