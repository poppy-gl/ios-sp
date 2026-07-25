import type { AppCategory } from '../contracts/appVideoContract.js';

export type AppSubCategory =
  | '动作片'
  | '喜剧片'
  | '爱情片'
  | '恐怖片'
  | '剧情片'
  | '战争片'
  | '动画电影'
  | '国产剧'
  | '韩剧'
  | '日剧'
  | '港台剧'
  | '欧美剧'
  | '泰剧'
  | '海外剧'
  | '内地综艺'
  | '港台综艺'
  | '日韩综艺'
  | '欧美综艺'
  | '国漫'
  | '日漫'
  | '港台动漫'
  | '美漫'
  | '海外动漫';

type CategoryRule = {
  category: AppCategory;
  exactLabels: string[];
  signals: string[];
  subCategory: AppSubCategory;
};

export type VideoCategoryInput = {
  category?: string | null | undefined;
  description?: string | null | undefined;
  fallbackSubCategory?: string | null | undefined;
  rawCategory?: string | null | undefined;
  sourceUrl?: string | null | undefined;
  subCategory?: string | null | undefined;
  tags?: string[] | null | undefined;
  title?: string | null | undefined;
};

export type VideoCategoryResult = {
  category: AppCategory;
  confidence: number;
  reason: string;
  subCategory: AppSubCategory;
};

const APP_CATEGORIES = new Set<AppCategory>(['电影', '电视剧', '综艺', '动漫']);

const normalizeText = (value?: string | null) =>
  (value ?? '').toLowerCase().replace(/\s+/g, '').trim();

const createSearchText = (input: VideoCategoryInput) =>
  normalizeText([input.title, input.description, input.sourceUrl].filter(Boolean).join(' '));

const hasAny = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.includes(normalizeText(keyword)));

const getExplicitLabels = (input: VideoCategoryInput) =>
  [input.category, input.subCategory, input.rawCategory, ...(input.tags ?? [])]
    .map((value) => normalizeText(value))
    .filter(Boolean);

const movieRules: CategoryRule[] = [
  {
    category: '电影',
    subCategory: '动画电影',
    exactLabels: ['动画电影'],
    signals: ['动画电影', '动画片', '动漫电影'],
  },
  {
    category: '电影',
    subCategory: '动作片',
    exactLabels: ['动作片'],
    signals: ['动作', '武侠', '警匪', '犯罪', '枪战'],
  },
  {
    category: '电影',
    subCategory: '喜剧片',
    exactLabels: ['喜剧片'],
    signals: ['喜剧', '搞笑', '幽默'],
  },
  {
    category: '电影',
    subCategory: '爱情片',
    exactLabels: ['爱情片'],
    signals: ['爱情', '言情', '浪漫'],
  },
  {
    category: '电影',
    subCategory: '恐怖片',
    exactLabels: ['恐怖片'],
    signals: ['恐怖', '惊悚', '灵异', '鬼片'],
  },
  {
    category: '电影',
    subCategory: '战争片',
    exactLabels: ['战争片'],
    signals: ['战争', '抗战', '军事'],
  },
];

const tvRules: CategoryRule[] = [
  {
    category: '电视剧',
    subCategory: '韩剧',
    exactLabels: ['韩剧', '韩国剧', '韩国电视剧'],
    signals: ['韩国', '韩剧', '韩语', '韩国剧', '韩国电视剧', 'k-drama', 'kdrama', '/type/hanju'],
  },
  {
    category: '电视剧',
    subCategory: '日剧',
    exactLabels: ['日剧', '日本剧', '日本电视剧'],
    signals: ['日本', '日剧', '日语', '日本剧', '日本电视剧', 'j-drama', 'jdrama'],
  },
  {
    category: '电视剧',
    subCategory: '国产剧',
    exactLabels: ['国产剧', '大陆剧', '内地剧'],
    signals: [
      '中国大陆',
      '大陆',
      '内地',
      '国产剧',
      '大陆剧',
      '内地剧',
      '普通话',
      '国语',
      '/type/guoju',
    ],
  },
  {
    category: '电视剧',
    subCategory: '港台剧',
    exactLabels: ['港台剧', '港剧', '台剧'],
    signals: ['香港', '台湾', '港台', '港剧', '台剧', '粤语', '/type/gangju'],
  },
  {
    category: '电视剧',
    subCategory: '欧美剧',
    exactLabels: ['欧美剧', '美剧', '英剧'],
    signals: [
      '美国',
      '英国',
      '欧美',
      '美剧',
      '英剧',
      '英语',
      '法国',
      '德国',
      '意大利',
      '西班牙',
      '葡萄牙',
      '加拿大',
      '澳大利亚',
      '新西兰',
      '瑞典',
      '丹麦',
      '挪威',
      '芬兰',
      '冰岛',
      '爱尔兰',
      '荷兰',
      '比利时',
      '奥地利',
      '瑞士',
      '波兰',
      '捷克',
      '俄罗斯',
      '乌克兰',
      '欧洲',
      '北欧',
      '/type/meiju',
    ],
  },
  {
    category: '电视剧',
    subCategory: '泰剧',
    exactLabels: ['泰剧', '泰国剧'],
    signals: ['泰国', '泰剧', '泰语', '泰国剧', '/type/taiju'],
  },
  {
    category: '电视剧',
    subCategory: '海外剧',
    exactLabels: [],
    signals: [
      '印度',
      '土耳其',
      '巴西',
      '墨西哥',
      '阿根廷',
      '菲律宾',
      '越南',
      '印尼',
      '马来西亚',
      '新加坡',
      '以色列',
      '南非',
      '阿拉伯',
      '印地语',
      '土耳其语',
    ],
  },
];

const varietyRules: CategoryRule[] = [
  {
    category: '综艺',
    subCategory: '日韩综艺',
    exactLabels: ['日韩综艺', '韩综', '日综'],
    signals: ['韩国', '日本', '日韩', '韩综', '日综', '韩语', '日语'],
  },
  {
    category: '综艺',
    subCategory: '港台综艺',
    exactLabels: ['港台综艺'],
    signals: ['香港', '台湾', '港台', '粤语'],
  },
  {
    category: '综艺',
    subCategory: '欧美综艺',
    exactLabels: ['欧美综艺'],
    signals: ['美国', '英国', '欧美', '英语'],
  },
];

const animeRules: CategoryRule[] = [
  {
    category: '动漫',
    subCategory: '国漫',
    exactLabels: ['国漫', '国产动漫'],
    signals: ['国产', '中国大陆', '大陆', '国漫', '普通话'],
  },
  {
    category: '动漫',
    subCategory: '日漫',
    exactLabels: ['日漫', '日本动漫'],
    signals: ['日本', '日漫', '番剧', '日语'],
  },
  {
    category: '动漫',
    subCategory: '港台动漫',
    exactLabels: ['港台动漫'],
    signals: ['香港', '台湾', '港台', '粤语'],
  },
  {
    category: '动漫',
    subCategory: '美漫',
    exactLabels: ['美漫', '欧美动漫'],
    signals: ['美国', '欧美', '美漫', '英语'],
  },
];

const rulesByCategory: Record<AppCategory, CategoryRule[]> = {
  电影: movieRules,
  电视剧: tvRules,
  综艺: varietyRules,
  动漫: animeRules,
};

const fallbackByCategory: Record<AppCategory, AppSubCategory> = {
  电影: '剧情片',
  电视剧: '海外剧',
  综艺: '内地综艺',
  动漫: '海外动漫',
};

const subCategoryToCategory = new Map<AppSubCategory, AppCategory>(
  [...movieRules, ...tvRules, ...varietyRules, ...animeRules].map((rule) => [
    rule.subCategory,
    rule.category,
  ]),
);

const isAppCategory = (value?: string | null): value is AppCategory =>
  APP_CATEGORIES.has(value as AppCategory);

const isAppSubCategory = (value?: string | null): value is AppSubCategory =>
  subCategoryToCategory.has(value as AppSubCategory);

const inferTopCategory = (input: VideoCategoryInput): AppCategory => {
  const candidates = [
    input.subCategory,
    input.rawCategory,
    input.fallbackSubCategory,
    input.category,
  ];
  const matchedSubCategory = candidates.find(isAppSubCategory);

  if (matchedSubCategory) {
    return subCategoryToCategory.get(matchedSubCategory) ?? '电影';
  }

  if (isAppCategory(input.category)) {
    return input.category;
  }

  return '电影';
};

const getRuleScore = (rule: CategoryRule, input: VideoCategoryInput, searchText: string) => {
  const explicitLabels = getExplicitLabels(input);
  const exactScore = rule.exactLabels.some((label) => explicitLabels.includes(normalizeText(label)))
    ? 22
    : 0;
  const signalScore = rule.signals.reduce(
    (score, signal) => score + (searchText.includes(normalizeText(signal)) ? 30 : 0),
    0,
  );
  const fallbackScore =
    normalizeText(input.fallbackSubCategory) === normalizeText(rule.subCategory) ? 8 : 0;

  return exactScore + signalScore + fallbackScore;
};

const pickRule = (
  category: AppCategory,
  input: VideoCategoryInput,
): { rule?: CategoryRule; score: number } => {
  const searchText = createSearchText(input);

  return (
    rulesByCategory[category]
      .map((rule) => ({ rule, score: getRuleScore(rule, input, searchText) }))
      .sort((first, second) => second.score - first.score)[0] ?? { score: 0 }
  );
};

export const classifyVideoCategory = (input: VideoCategoryInput): VideoCategoryResult => {
  const category = inferTopCategory(input);
  const picked = pickRule(category, input);

  if (picked.rule && picked.score > 0) {
    return {
      category,
      subCategory: picked.rule.subCategory,
      confidence: picked.score >= 100 ? 0.94 : 0.82,
      reason: `后端按标题、简介、地区、语言、标签和来源路径识别为${category}/${picked.rule.subCategory}`,
    };
  }

  const fallback = isAppSubCategory(input.fallbackSubCategory)
    ? input.fallbackSubCategory
    : isAppSubCategory(input.subCategory)
      ? input.subCategory
      : fallbackByCategory[category];

  return {
    category,
    subCategory: fallback,
    confidence: fallback === fallbackByCategory[category] ? 0.52 : 0.7,
    reason: `后端未命中更具体地区/类型信号，保留${category}/${fallback}作为兜底分类`,
  };
};

export const normalizeVideoCategoryFields = <T extends VideoCategoryInput>(video: T) => {
  const mapped = classifyVideoCategory(video);

  return {
    ...video,
    category: mapped.category,
    subCategory: mapped.subCategory,
    rawCategory: mapped.subCategory,
    categoryMappingConfidence: mapped.confidence,
    categoryMappingReason: mapped.reason,
  };
};
