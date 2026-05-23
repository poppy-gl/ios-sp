import type { ProviderKind } from '@/data/providers/providerTypes';
import type { VideoCategory, VideoItem } from '@/types/video';

export type VideoServiceContext = {
  bypassCache?: boolean;
  favoriteCategories?: (string | VideoCategory)[];
  favoriteVideoIds?: string[];
  preferredCategories?: (string | VideoCategory)[];
  signal?: AbortSignal;
};

export type VideoServiceStatus =
  | 'idle'
  | 'ok'
  | 'empty'
  | 'crawl_failed'
  | 'parse_failed'
  | 'partial';

export type VideoServiceErrorCode =
  | 'EMPTY_RESULT'
  | 'CRAWL_FAILED'
  | 'PARSE_FAILED'
  | 'POLICY_REJECTED';

export type VideoPipelineIssue = {
  code: VideoServiceErrorCode;
  message: string;
  sourceId?: string;
  status?: number;
  url?: string;
};

export type VideoPipelineStats = {
  categoryDistribution: Record<string, number>;
  crawlTotal: number;
  crawlFailed: number;
  durationMs: number;
  failureReasonDistribution: Record<string, number>;
  parseFailed: number;
  policyRejected: number;
  playable: number;
  rawTotal: number;
  total: number;
  unsupported: number;
  updatedAt?: string;
};

export type VideoServiceCacheState = {
  expiresAt?: string;
  hasCache: boolean;
  isStale: boolean;
  itemCount: number;
  ttlMs: number;
};

export type VideoServiceState = {
  cache: VideoServiceCacheState;
  errors: VideoPipelineIssue[];
  isRefreshing: boolean;
  lastUpdatedAt?: string;
  stats: VideoPipelineStats;
  status: VideoServiceStatus;
};

export type VideoPipelineResult = {
  errors: VideoPipelineIssue[];
  items: VideoItem[];
  source?: ProviderKind;
  stats: VideoPipelineStats;
  status: VideoServiceStatus;
};

export type VideoCache = VideoPipelineResult & {
  expiresAt: number;
};

export type VideoSubscriber = (videos: VideoItem[], meta?: { version: number }) => void;

export class VideoServiceError extends Error {
  code: VideoServiceErrorCode;
  issues: VideoPipelineIssue[];
  stats: VideoPipelineStats;

  constructor(code: VideoServiceErrorCode, message: string, result: VideoPipelineResult) {
    super(message);
    this.name = 'VideoServiceError';
    this.code = code;
    this.issues = result.errors;
    this.stats = result.stats;
  }
}
