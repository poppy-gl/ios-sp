import type { VideoCategory, VideoItem } from '@/types/video';

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

export type CategoryRule = {
  category: VideoCategory;
  subCategory: UserVideoSubCategory;
  keywords: string[];
  priority?: number;
};

export type SecondaryRule = CategoryRule & {
  requiredSignals: string[];
  optionalSignals?: string[];
  reason: string;
};

export type ScoringInput = Partial<
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

export type RuleScore = {
  rule: CategoryRule;
  score: number;
  matches: string[];
};
